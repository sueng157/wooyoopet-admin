// ============================================================
// Edge Function: complete-care (돌봄 완료)
// ============================================================
// 용도: 보호자 또는 유치원이 하원 확인 시 호출
// 호출 주체: 앱 — supabase.functions.invoke('complete-care', { body })
//
// 입력 스펙 (GUIDE.md §15-5, CODE.md #39):
//   reservation_id  (UUID, 필수) — 예약 ID
//
// 출력 스펙 (STEP4_WORK_PLAN.md §4-1):
//   {
//     success: true,
//     data: {
//       status: '돌봄완료' | '돌봄진행중',
//       both_confirmed: boolean,
//       guardian_checkout_confirmed: boolean,
//       kg_checkout_confirmed: boolean,
//     }
//   }
//   { success: false, error: "에러 메시지" }
//
// 양측 하원 확인 로직 (GUIDE.md §15-5):
//   - 보호자 호출 → guardian_checkout_confirmed=true
//   - 유치원 호출 → kg_checkout_confirmed=true
//   - 양측 모두 확인 시 → status='돌봄완료', checkout_actual=NOW()
//   - 한쪽만 확인 시 → 확인 플래그만 업데이트, 상대방 FCM
//   - 양측 미확인 + 시간 경과 → auto_complete_scheduled_at 설정
//
// 처리 흐름 (MIGRATION_PLAN.md §7-2-4):
//   1. JWT → auth.uid()로 호출자 역할 자동 판별
//   2. 예약 조회 + 당사자 검증
//   3. 해당 측 하원 확인 플래그 UPDATE
//   4. 양측 모두 확인 시:
//      a. status='돌봄완료', checkout_actual=NOW()
//      b. 시스템 메시지: care_end + review
//      c. 상대방 FCM
//   5. 한쪽만 확인 시:
//      a. auto_complete_scheduled_at 설정 (24시간 후)
//      b. 상대방 FCM (하원 확인 요청)
//
// 보안: JWT 인증 필수
// Secrets: FIREBASE_SERVICE_ACCOUNT_JSON (send-push 경유)
//
// 참조:
//   - APP_MIGRATION_CODE.md #39
//   - APP_MIGRATION_GUIDE.md §15-5
//   - MIGRATION_PLAN.md §7-2-4
//   - legacy_php_api_all.txt L5103 (set_care_complete.php)
// ============================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { corsHeaders, jsonResponse, errorResponse } from '../_shared/response.ts'
import { createAdminClient } from '../_shared/supabase.ts'

// ─── 헬퍼: send-push 내부 호출 ────────────────────────────────

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
      console.error('[complete-care] send-push failed:', response.status, errorText)
    } else {
      const result = await response.json()
      console.log('[complete-care] send-push result:', result)
    }
  } catch (e) {
    console.error('[complete-care] send-push error (non-fatal):', e)
  }
}

// ─── 헬퍼: 시스템 메시지 INSERT ─────────────────────────────────

async function insertSystemMessage(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
  chatRoomId: string,
  messageType: string,
  content: string,
): Promise<void> {
  const msgId = crypto.randomUUID()
  const { error } = await supabaseAdmin
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

  if (error) {
    console.error(`[complete-care] 시스템 메시지(${messageType}) INSERT 실패:`, error)
  }

  // chat_rooms 갱신(last_message, last_message_at, total_message_count)은
  // DB 트리거 fn_update_chat_room_last_message 가 INSERT 시 자동 처리
}

// ─── 메인 핸들러 ──────────────────────────────────────────────

serve(async (req: Request) => {
  // ── CORS preflight ──────────────────────────────────────────
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // ── 1. JWT에서 사용자 추출 ───────────────────────────────
    const supabaseAdmin = createAdminClient()

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return errorResponse('인증이 필요합니다', 401)
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)

    if (authError || !user) {
      return errorResponse('유효하지 않은 인증 토큰입니다', 401)
    }

    const callerId = user.id

    // ── 2. 요청 파싱 ────────────────────────────────────────
    const { reservation_id } = await req.json()

    if (!reservation_id) {
      return errorResponse('reservation_id는 필수입니다', 400)
    }

    // ── 3. 예약 조회 ────────────────────────────────────────
    const { data: reservation, error: fetchError } = await supabaseAdmin
      .from('reservations')
      .select(`
        id, member_id, kindergarten_id, pet_id, status,
        guardian_checkout_confirmed, kg_checkout_confirmed,
        guardian_checkout_confirmed_at, kg_checkout_confirmed_at,
        checkout_scheduled
      `)
      .eq('id', reservation_id)
      .single()

    if (fetchError || !reservation) {
      return errorResponse('예약을 찾을 수 없습니다', 404)
    }

    // 이미 돌봄완료인 경우
    if (reservation.status === '돌봄완료') {
      return errorResponse('이미 완료된 예약입니다', 400)
    }

    // 돌봄진행중 상태가 아닌 경우
    if (reservation.status !== '돌봄진행중') {
      return errorResponse(`현재 상태(${reservation.status})에서는 돌봄 완료를 처리할 수 없습니다`, 400)
    }

    // ── 4. 호출자 역할 판별 ─────────────────────────────────
    // 유치원 운영자의 member_id 조회
    const { data: kindergarten } = await supabaseAdmin
      .from('kindergartens')
      .select('id, member_id, name')
      .eq('id', reservation.kindergarten_id)
      .single()

    const isGuardian = callerId === reservation.member_id
    const isKgOwner = callerId === kindergarten?.member_id

    if (!isGuardian && !isKgOwner) {
      return errorResponse('해당 예약의 당사자만 돌봄 완료를 처리할 수 있습니다', 403)
    }

    // 이미 확인한 측이 다시 호출한 경우
    if (isGuardian && reservation.guardian_checkout_confirmed) {
      return errorResponse('이미 하원 확인을 완료했습니다', 400)
    }
    if (isKgOwner && reservation.kg_checkout_confirmed) {
      return errorResponse('이미 하원 확인을 완료했습니다', 400)
    }

    // ── 5. 하원 확인 플래그 UPDATE ──────────────────────────
    const now = new Date().toISOString()
    const updateData: Record<string, unknown> = {}

    if (isGuardian) {
      updateData.guardian_checkout_confirmed = true
      updateData.guardian_checkout_confirmed_at = now
    } else {
      updateData.kg_checkout_confirmed = true
      updateData.kg_checkout_confirmed_at = now
    }

    // 양측 모두 확인 여부 판별
    const guardianConfirmed = isGuardian ? true : reservation.guardian_checkout_confirmed
    const kgConfirmed = isKgOwner ? true : reservation.kg_checkout_confirmed
    const bothConfirmed = guardianConfirmed && kgConfirmed

    if (bothConfirmed) {
      // 양측 모두 확인 → 돌봄완료
      updateData.status = '돌봄완료'
      updateData.checkout_actual = now
    } else {
      // 한쪽만 확인 → auto_complete_scheduled_at 설정 (24시간 후 자동 완료)
      const autoCompleteDate = new Date(Date.now() + 24 * 60 * 60 * 1000)
      updateData.auto_complete_scheduled_at = autoCompleteDate.toISOString()
    }

    const { error: updateError } = await supabaseAdmin
      .from('reservations')
      .update(updateData)
      .eq('id', reservation_id)

    if (updateError) {
      console.error('[complete-care] reservations UPDATE 실패:', updateError)
      return errorResponse('하원 확인 처리에 실패했습니다', 500)
    }

    const confirmerRole = isGuardian ? '보호자' : '유치원'
    console.log(
      `[complete-care] 하원 확인: reservation=${reservation_id}, confirmer=${confirmerRole}, bothConfirmed=${bothConfirmed}`,
    )

    // ── 6. 채팅방 시스템 메시지 + FCM ────────────────────────
    // 해당 예약의 채팅방 조회
    const { data: crr } = await supabaseAdmin
      .from('chat_room_reservations')
      .select('chat_room_id')
      .eq('reservation_id', reservation_id)
      .maybeSingle()

    const chatRoomId = crr?.chat_room_id ?? null

    if (bothConfirmed) {
      // ── 양측 모두 확인 → 돌봄완료 처리 ─────────────────────

      // 시스템 메시지: care_end
      if (chatRoomId) {
        const careEndContent = JSON.stringify({
          reservation_id: reservation.id,
        })
        await insertSystemMessage(supabaseAdmin, chatRoomId, 'care_end', careEndContent)

        // 시스템 메시지: review (후기 작성 유도)
        // 1초 지연 효과를 위해 약간의 간격 (Supabase Realtime이 순서대로 전파하도록)
        const reviewContent = JSON.stringify({
          reservation_id: reservation.id,
        })
        await insertSystemMessage(supabaseAdmin, chatRoomId, 'review', reviewContent)
      }

      // 상대방에게 FCM 푸시 (양측 모두에게 돌봄완료 알림)
      const bothMembers = [reservation.member_id, kindergarten?.member_id].filter(
        (id): id is string => !!id && id !== callerId,
      )

      if (bothMembers.length > 0) {
        try {
          await callSendPush(
            bothMembers,
            '돌봄 완료',
            '양측 모두 하원을 확인했습니다. 돌봄이 완료되었습니다.',
            {
              type: 'care_complete',
              reservation_id: reservation.id,
              chat_room_id: chatRoomId ?? '',
            },
            'reservation',
          )
        } catch (e) {
          console.error('[complete-care] FCM 발송 실패 (non-fatal):', e)
        }
      }
    } else {
      // ── 한쪽만 확인 → 상대방에게 확인 요청 ─────────────────

      // 상대방 member_id 결정
      const targetMemberId = isGuardian
        ? kindergarten?.member_id
        : reservation.member_id

      if (targetMemberId) {
        // 확인한 측 표시 이름 조회
        let confirmerName = confirmerRole
        if (isGuardian) {
          const { data: guardian } = await supabaseAdmin
            .from('members')
            .select('nickname')
            .eq('id', callerId)
            .single()
          confirmerName = guardian?.nickname ?? '보호자'
        } else {
          confirmerName = kindergarten?.name ?? '유치원'
        }

        try {
          await callSendPush(
            [targetMemberId],
            '하원 확인 요청',
            `${confirmerName}님이 하원을 확인했습니다. 하원 확인을 완료해주세요.`,
            {
              type: 'checkout_confirm_request',
              reservation_id: reservation.id,
              chat_room_id: chatRoomId ?? '',
            },
            'reservation',
          )
        } catch (e) {
          console.error('[complete-care] FCM 발송 실패 (non-fatal):', e)
        }
      }
    }

    // ── 7. 성공 응답 ────────────────────────────────────────
    return jsonResponse({
      success: true,
      data: {
        status: bothConfirmed ? '돌봄완료' : '돌봄진행중',
        both_confirmed: bothConfirmed,
        guardian_checkout_confirmed: isGuardian ? true : !!reservation.guardian_checkout_confirmed,
        kg_checkout_confirmed: isKgOwner ? true : !!reservation.kg_checkout_confirmed,
      },
    })
  } catch (error) {
    console.error('[complete-care] Error:', error)
    return errorResponse(
      (error as Error).message ?? '돌봄 완료 처리 중 서버 오류가 발생했습니다',
      500,
    )
  }
})
