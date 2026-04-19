// ============================================================
// Edge Function: scheduler (자동 상태 변경 + 알림)
// ============================================================
// 용도: 예약 상태 자동 변경, 등하원 알림, 돌봄 시작/종료 처리
// 호출 주체: pg_cron 또는 외부 cron (5분 간격)
//   - 앱에서 직접 호출하지 않음
//   - Authorization: Bearer <service_role_key> 로 호출
//
// 처리 항목 (GUIDE.md §16-8):
//   1. 등원 30분 전 알림  — status='예약확정', reminder_start_sent_at IS NULL
//   2. 하원 30분 전 알림  — status='돌봄진행중', reminder_end_sent_at IS NULL
//   3. 돌봄 시작 자동 처리 — status='예약확정' → '돌봄진행중', care_start_sent_at IS NULL
//   4. 돌봄 종료 자동 처리 — status='돌봄진행중', care_end_sent_at IS NULL
//      → 시스템 메시지(care_end + review) + FCM + care_end_sent_at=NOW()
//   5. 자동 완료           — auto_complete_scheduled_at ≤ NOW(), status='돌봄진행중'
//      → status='돌봄완료' + checkout_actual=NOW()
//
// 중복 방지: 각 처리 항목에 *_sent_at 컬럼으로 1회만 실행
// 이력 기록: scheduler_history 테이블에 시작/완료/결과 기록
//
// 출력: scheduler_history 기록 (내부 처리 — JSON 응답은 cron 디버깅용)
//
// 보안: --no-verify-jwt 배포 (pg_cron이 service_role_key로 호출)
// Secrets: FIREBASE_SERVICE_ACCOUNT_JSON (send-push 경유)
//
// 참조:
//   - APP_MIGRATION_GUIDE.md §16-8
//   - APP_MIGRATION_GUIDE.md §15-5 (auto_complete_scheduled_at)
//   - STEP4_WORK_PLAN.md §2 R5
//   - legacy_php_api_all.txt L7751 (scheduler.php 원본)
//   - sql/42_03_reservations_add_scheduler_columns.sql
//   - sql/41_09_app_scheduler_history.sql
// ============================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { corsHeaders, jsonResponse, errorResponse } from '../_shared/response.ts'
import { createAdminClient } from '../_shared/supabase.ts'

// ─── 시스템 메시지 미리보기 매핑 (C12: complete-care, create-reservation과 동일) ───
const SYSTEM_MESSAGE_PREVIEW: Record<string, string> = {
  reservation_request: '돌봄 예약이 요청되었습니다.',
  reservation_confirmed: '예약이 확정되었습니다.',
  reservation_rejected: '예약이 거절되었습니다.',
  reservation_cancelled: '예약이 취소되었습니다.',
  care_start: '돌봄이 시작되었습니다.',
  care_end: '돌봄이 종료되었습니다.',
  review: '후기를 작성해주세요.',
}

// ─── 처리 결과 카운터 ──────────────────────────────────────────
interface TaskResult {
  processed: number
  errors: number
}

interface SchedulerResult {
  reminder_start: TaskResult
  reminder_end: TaskResult
  care_start: TaskResult
  care_end: TaskResult
  auto_complete: TaskResult
  total_processed: number
  total_errors: number
  duration_ms: number
}

// ─── 헬퍼: send-push 내부 호출 ────────────────────────────────
// (complete-care, create-reservation과 동일 패턴)

async function callSendPush(
  memberIds: string[],
  title: string,
  body: string,
  data: Record<string, string>,
  notificationType: string,
): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/send-push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        member_ids: memberIds,
        title,
        body,
        data,
        notification_type: notificationType,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[scheduler] send-push failed:', response.status, errorText)
    }
  } catch (e) {
    console.error('[scheduler] send-push error (non-fatal):', e)
  }
}

// ─── 헬퍼: 시스템 메시지 INSERT ─────────────────────────────────
// (complete-care와 동일 패턴 — C11 total_message_count 증분 + C12 미리보기)

async function insertSystemMessage(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
  chatRoomId: string,
  messageType: string,
  content: string,
): Promise<void> {
  const msgId = crypto.randomUUID()
  const { data: msg, error } = await supabaseAdmin
    .from('chat_messages')
    .insert({
      id: msgId,
      chat_room_id: chatRoomId,
      sender_type: '시스템',
      sender_id: null,
      message_type: messageType,
      content,
      is_read: false,
    })
    .select('id, created_at')
    .single()

  if (error) {
    console.error(`[scheduler] 시스템 메시지(${messageType}) INSERT 실패:`, error)
    return
  }

  // C12: 사용자 친화적 미리보기 텍스트
  const preview = SYSTEM_MESSAGE_PREVIEW[messageType] ?? content.substring(0, 100)

  // C11: chat_rooms last_message 업데이트 + total_message_count 증가
  const { data: room } = await supabaseAdmin
    .from('chat_rooms')
    .select('total_message_count')
    .eq('id', chatRoomId)
    .single()

  await supabaseAdmin
    .from('chat_rooms')
    .update({
      last_message: preview,
      last_message_at: msg.created_at,
      total_message_count: (room?.total_message_count ?? 0) + 1,
    })
    .eq('id', chatRoomId)
}

// ─── 헬퍼: 예약에 연결된 채팅방 ID 조회 ─────────────────────────

async function getChatRoomId(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
  reservationId: string,
): Promise<string | null> {
  const { data: crr } = await supabaseAdmin
    .from('chat_room_reservations')
    .select('chat_room_id')
    .eq('reservation_id', reservationId)
    .maybeSingle()

  return crr?.chat_room_id ?? null
}

// ─── 헬퍼: 유치원 운영자 member_id 조회 ─────────────────────────

async function getKgMemberId(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
  kindergartenId: string,
): Promise<string | null> {
  const { data: kg } = await supabaseAdmin
    .from('kindergartens')
    .select('member_id')
    .eq('id', kindergartenId)
    .single()

  return kg?.member_id ?? null
}

// ============================================================
// Task 1: 등원 30분 전 알림
// ============================================================
// 대상: status='예약확정', reminder_start_sent_at IS NULL
//       checkin_scheduled - 30min ≤ NOW() (= 등원까지 30분 이내)
// 동작: FCM (보호자 + 유치원) + reminder_start_sent_at=NOW()
// PHP 원본: scheduler.php L7780~L7798

async function processReminderStart(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
): Promise<TaskResult> {
  const result: TaskResult = { processed: 0, errors: 0 }
  const now = new Date().toISOString()

  // 등원 30분 전 ~ 등원시간 사이의 예약 조회 (아직 알림 미발송)
  const { data: rows, error } = await supabaseAdmin
    .from('reservations')
    .select('id, member_id, kindergarten_id, checkin_scheduled')
    .eq('status', '예약확정')
    .is('reminder_start_sent_at', null)
    .lte('checkin_scheduled', new Date(Date.now() + 30 * 60 * 1000).toISOString())
    .gte('checkin_scheduled', now)

  if (error) {
    console.error('[scheduler][reminder_start] 조회 실패:', error)
    result.errors++
    return result
  }

  if (!rows || rows.length === 0) return result

  for (const row of rows) {
    try {
      // CAS-style UPDATE: 중복 실행 방지 (다른 스케줄러 인스턴스와의 경합)
      const { data: updated, error: updateError } = await supabaseAdmin
        .from('reservations')
        .update({ reminder_start_sent_at: now })
        .eq('id', row.id)
        .is('reminder_start_sent_at', null)
        .select('id')

      if (updateError || !updated || updated.length === 0) {
        // 이미 다른 인스턴스가 처리했거나 UPDATE 실패 → 스킵
        continue
      }

      // 보호자 + 유치원 양쪽에 FCM 발송
      const kgMemberId = await getKgMemberId(supabaseAdmin, row.kindergarten_id)
      const targets = [row.member_id, kgMemberId].filter((id): id is string => !!id)

      if (targets.length > 0) {
        await callSendPush(
          targets,
          '등원 30분 전입니다.',
          '서로 간의 약속시간에 늦지 않게 준비해주세요.',
          {
            type: 'care_start_reminder',
            reservation_id: row.id,
          },
          'reservation',
        )
      }

      result.processed++
    } catch (e) {
      console.error(`[scheduler][reminder_start] 예약 ${row.id} 처리 실패:`, e)
      result.errors++
    }
  }

  return result
}

// ============================================================
// Task 2: 하원 30분 전 알림
// ============================================================
// 대상: status='돌봄진행중', reminder_end_sent_at IS NULL
//       checkout_scheduled - 30min ≤ NOW() (= 하원까지 30분 이내)
// 동작: FCM (보호자 + 유치원) + reminder_end_sent_at=NOW()
// PHP 원본: scheduler.php L7800~L7818

async function processReminderEnd(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
): Promise<TaskResult> {
  const result: TaskResult = { processed: 0, errors: 0 }
  const now = new Date().toISOString()

  const { data: rows, error } = await supabaseAdmin
    .from('reservations')
    .select('id, member_id, kindergarten_id, checkout_scheduled')
    .eq('status', '돌봄진행중')
    .is('reminder_end_sent_at', null)
    .lte('checkout_scheduled', new Date(Date.now() + 30 * 60 * 1000).toISOString())
    .gte('checkout_scheduled', now)

  if (error) {
    console.error('[scheduler][reminder_end] 조회 실패:', error)
    result.errors++
    return result
  }

  if (!rows || rows.length === 0) return result

  for (const row of rows) {
    try {
      const { data: updated, error: updateError } = await supabaseAdmin
        .from('reservations')
        .update({ reminder_end_sent_at: now })
        .eq('id', row.id)
        .is('reminder_end_sent_at', null)
        .select('id')

      if (updateError || !updated || updated.length === 0) continue

      const kgMemberId = await getKgMemberId(supabaseAdmin, row.kindergarten_id)
      const targets = [row.member_id, kgMemberId].filter((id): id is string => !!id)

      if (targets.length > 0) {
        await callSendPush(
          targets,
          '하원 30분 전입니다.',
          '서로 간의 약속시간에 늦지 않게 준비해주세요.',
          {
            type: 'care_end_reminder',
            reservation_id: row.id,
          },
          'reservation',
        )
      }

      result.processed++
    } catch (e) {
      console.error(`[scheduler][reminder_end] 예약 ${row.id} 처리 실패:`, e)
      result.errors++
    }
  }

  return result
}

// ============================================================
// Task 3: 돌봄 시작 자동 처리
// ============================================================
// 대상: status='예약확정', care_start_sent_at IS NULL
//       checkin_scheduled ≤ NOW() (= 등원시간 도래)
// 동작:
//   - status → '돌봄진행중' + care_start_sent_at=NOW()
//   - 시스템 메시지: care_start
//   - (PHP 원본에서는 FCM 미발송 — WebSocket만 발송)
// PHP 원본: scheduler.php L7820~L7875

async function processCareStart(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
): Promise<TaskResult> {
  const result: TaskResult = { processed: 0, errors: 0 }
  const now = new Date().toISOString()

  const { data: rows, error } = await supabaseAdmin
    .from('reservations')
    .select('id, member_id, kindergarten_id, checkin_scheduled')
    .eq('status', '예약확정')
    .is('care_start_sent_at', null)
    .lte('checkin_scheduled', now)

  if (error) {
    console.error('[scheduler][care_start] 조회 실패:', error)
    result.errors++
    return result
  }

  if (!rows || rows.length === 0) return result

  for (const row of rows) {
    try {
      // CAS-style UPDATE: status='예약확정' → '돌봄진행중' + care_start_sent_at
      const { data: updated, error: updateError } = await supabaseAdmin
        .from('reservations')
        .update({
          status: '돌봄진행중',
          care_start_sent_at: now,
          checkin_actual: now,
        })
        .eq('id', row.id)
        .eq('status', '예약확정')
        .is('care_start_sent_at', null)
        .select('id')

      if (updateError || !updated || updated.length === 0) continue

      // 채팅방에 시스템 메시지 INSERT (care_start)
      const chatRoomId = await getChatRoomId(supabaseAdmin, row.id)
      if (chatRoomId) {
        const content = JSON.stringify({ reservation_id: row.id })
        await insertSystemMessage(supabaseAdmin, chatRoomId, 'care_start', content)
      }

      // Supabase Realtime이 chat_messages INSERT를 자동 전파하므로
      // 별도 WebSocket 발송 불필요 (PHP 원본의 wss://wooyoopet.store/ws 대체)

      result.processed++
    } catch (e) {
      console.error(`[scheduler][care_start] 예약 ${row.id} 처리 실패:`, e)
      result.errors++
    }
  }

  return result
}

// ============================================================
// Task 4: 돌봄 종료 자동 처리
// ============================================================
// 대상: status='돌봄진행중', care_end_sent_at IS NULL
//       checkout_scheduled ≤ NOW() (= 하원시간 도래)
// 동작:
//   - care_end_sent_at=NOW()
//   - 시스템 메시지: care_end + review
//   - FCM: 보호자 + 유치원 (돌봄 종료 알림)
//   - ※ PHP 원본과 달리 status 변경은 하지 않음
//     → 양측 하원 확인 로직(complete-care EF)으로 위임
//     → auto_complete_scheduled_at이 이미 설정되어 있거나
//       Task 5에서 자동 완료 처리됨
// PHP 원본: scheduler.php L7877~L7965

async function processCareEnd(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
): Promise<TaskResult> {
  const result: TaskResult = { processed: 0, errors: 0 }
  const now = new Date().toISOString()

  const { data: rows, error } = await supabaseAdmin
    .from('reservations')
    .select('id, member_id, kindergarten_id, checkout_scheduled, auto_complete_scheduled_at')
    .eq('status', '돌봄진행중')
    .is('care_end_sent_at', null)
    .lte('checkout_scheduled', now)

  if (error) {
    console.error('[scheduler][care_end] 조회 실패:', error)
    result.errors++
    return result
  }

  if (!rows || rows.length === 0) return result

  for (const row of rows) {
    try {
      // CAS-style UPDATE: care_end_sent_at + auto_complete_scheduled_at 설정
      // 아직 auto_complete_scheduled_at이 없는 경우에만 24시간 후로 설정
      // (complete-care에서 한쪽 확인 시 이미 설정되어 있을 수 있음)
      const updateData: Record<string, unknown> = {
        care_end_sent_at: now,
      }

      // auto_complete_scheduled_at이 아직 설정되지 않은 경우에만 24시간 후 설정
      if (!row.auto_complete_scheduled_at) {
        const autoCompleteDate = new Date(Date.now() + 24 * 60 * 60 * 1000)
        updateData.auto_complete_scheduled_at = autoCompleteDate.toISOString()
      }

      const { data: updated, error: updateError } = await supabaseAdmin
        .from('reservations')
        .update(updateData)
        .eq('id', row.id)
        .eq('status', '돌봄진행중')
        .is('care_end_sent_at', null)
        .select('id')

      if (updateError || !updated || updated.length === 0) continue

      // 채팅방에 시스템 메시지 INSERT (care_end + review)
      const chatRoomId = await getChatRoomId(supabaseAdmin, row.id)
      if (chatRoomId) {
        const content = JSON.stringify({ reservation_id: row.id })

        // care_end 메시지
        await insertSystemMessage(supabaseAdmin, chatRoomId, 'care_end', content)

        // review 메시지 (후기 작성 유도)
        await insertSystemMessage(supabaseAdmin, chatRoomId, 'review', content)
      }

      // 보호자 + 유치원 양쪽에 FCM 발송
      const kgMemberId = await getKgMemberId(supabaseAdmin, row.kindergarten_id)
      const targets = [row.member_id, kgMemberId].filter((id): id is string => !!id)

      if (targets.length > 0) {
        await callSendPush(
          targets,
          '돌봄이 종료되었습니다.',
          '거래 후기를 작성해주세요.',
          {
            type: 'care_completed',
            reservation_id: row.id,
            chat_room_id: chatRoomId ?? '',
          },
          'reservation',
        )
      }

      result.processed++
    } catch (e) {
      console.error(`[scheduler][care_end] 예약 ${row.id} 처리 실패:`, e)
      result.errors++
    }
  }

  return result
}

// ============================================================
// Task 5: 자동 완료 처리
// ============================================================
// 대상: status='돌봄진행중', auto_complete_scheduled_at ≤ NOW()
// 동작:
//   - status → '돌봄완료' + checkout_actual=NOW()
//   - 양측 미확인 자동 완료 (GUIDE.md §15-5, §16-8 #5)
// 비고: complete-care EF의 양측 확인 로직과 별개 —
//       24시간 이내에 양측이 확인하지 않으면 자동 완료

async function processAutoComplete(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
): Promise<TaskResult> {
  const result: TaskResult = { processed: 0, errors: 0 }
  const now = new Date().toISOString()

  const { data: rows, error } = await supabaseAdmin
    .from('reservations')
    .select('id, member_id, kindergarten_id')
    .eq('status', '돌봄진행중')
    .not('auto_complete_scheduled_at', 'is', null)
    .lte('auto_complete_scheduled_at', now)

  if (error) {
    console.error('[scheduler][auto_complete] 조회 실패:', error)
    result.errors++
    return result
  }

  if (!rows || rows.length === 0) return result

  for (const row of rows) {
    try {
      // CAS-style UPDATE: status='돌봄진행중' → '돌봄완료'
      const { data: updated, error: updateError } = await supabaseAdmin
        .from('reservations')
        .update({
          status: '돌봄완료',
          checkout_actual: now,
        })
        .eq('id', row.id)
        .eq('status', '돌봄진행중')
        .select('id')

      if (updateError || !updated || updated.length === 0) continue

      // 양측에 자동 완료 FCM 알림
      const kgMemberId = await getKgMemberId(supabaseAdmin, row.kindergarten_id)
      const targets = [row.member_id, kgMemberId].filter((id): id is string => !!id)

      if (targets.length > 0) {
        const chatRoomId = await getChatRoomId(supabaseAdmin, row.id)
        await callSendPush(
          targets,
          '돌봄이 자동 완료되었습니다.',
          '하원 확인 기한이 지나 자동으로 돌봄이 완료 처리되었습니다.',
          {
            type: 'care_auto_completed',
            reservation_id: row.id,
            chat_room_id: chatRoomId ?? '',
          },
          'reservation',
        )
      }

      result.processed++
    } catch (e) {
      console.error(`[scheduler][auto_complete] 예약 ${row.id} 처리 실패:`, e)
      result.errors++
    }
  }

  return result
}

// ============================================================
// 메인 핸들러
// ============================================================

serve(async (req: Request) => {
  // ── CORS preflight ──────────────────────────────────────────
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const startTime = Date.now()

  try {
    const supabaseAdmin = createAdminClient()

    // ── 1. scheduler_history 시작 기록 ────────────────────────
    const historyId = crypto.randomUUID()
    const { error: historyInsertError } = await supabaseAdmin
      .from('scheduler_history')
      .insert({
        id: historyId,
        started_at: new Date().toISOString(),
      })

    if (historyInsertError) {
      console.error('[scheduler] scheduler_history INSERT 실패:', historyInsertError)
      // 이력 기록 실패해도 스케줄러는 계속 실행
    }

    console.log(`[scheduler] 실행 시작: history_id=${historyId}`)

    // ── 2. 5개 Task 순차 실행 ─────────────────────────────────
    // PHP 원본(scheduler.php)과 동일 순서:
    //   1. 등원 30분 전 알림
    //   2. 하원 30분 전 알림
    //   3. 돌봄 시작 (status 변경 + 시스템 메시지)
    //   4. 돌봄 종료 (시스템 메시지 + FCM)
    //   5. 자동 완료 (auto_complete_scheduled_at 기반)

    const reminderStartResult = await processReminderStart(supabaseAdmin)
    console.log('[scheduler] Task 1 (등원 알림):', reminderStartResult)

    const reminderEndResult = await processReminderEnd(supabaseAdmin)
    console.log('[scheduler] Task 2 (하원 알림):', reminderEndResult)

    const careStartResult = await processCareStart(supabaseAdmin)
    console.log('[scheduler] Task 3 (돌봄 시작):', careStartResult)

    const careEndResult = await processCareEnd(supabaseAdmin)
    console.log('[scheduler] Task 4 (돌봄 종료):', careEndResult)

    const autoCompleteResult = await processAutoComplete(supabaseAdmin)
    console.log('[scheduler] Task 5 (자동 완료):', autoCompleteResult)

    // ── 3. 결과 집계 ─────────────────────────────────────────
    const totalProcessed =
      reminderStartResult.processed +
      reminderEndResult.processed +
      careStartResult.processed +
      careEndResult.processed +
      autoCompleteResult.processed

    const totalErrors =
      reminderStartResult.errors +
      reminderEndResult.errors +
      careStartResult.errors +
      careEndResult.errors +
      autoCompleteResult.errors

    const durationMs = Date.now() - startTime

    const schedulerResult: SchedulerResult = {
      reminder_start: reminderStartResult,
      reminder_end: reminderEndResult,
      care_start: careStartResult,
      care_end: careEndResult,
      auto_complete: autoCompleteResult,
      total_processed: totalProcessed,
      total_errors: totalErrors,
      duration_ms: durationMs,
    }

    console.log(`[scheduler] 실행 완료: ${totalProcessed}건 처리, ${totalErrors}건 에러, ${durationMs}ms`)

    // ── 4. scheduler_history 완료 기록 ────────────────────────
    const { error: historyUpdateError } = await supabaseAdmin
      .from('scheduler_history')
      .update({
        finished_at: new Date().toISOString(),
        result: schedulerResult,
      })
      .eq('id', historyId)

    if (historyUpdateError) {
      console.error('[scheduler] scheduler_history UPDATE 실패:', historyUpdateError)
    }

    // ── 5. 성공 응답 (cron 디버깅용) ─────────────────────────
    return jsonResponse({
      success: true,
      data: schedulerResult,
    })
  } catch (error) {
    const durationMs = Date.now() - startTime
    console.error(`[scheduler] Error (${durationMs}ms):`, error)
    return errorResponse(
      (error as Error).message ?? '스케줄러 실행 중 서버 오류가 발생했습니다',
      500,
    )
  }
})
