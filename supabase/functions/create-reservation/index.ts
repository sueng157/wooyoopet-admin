// ============================================================
// Edge Function: create-reservation (예약 생성/상태변경)
// ============================================================
// 용도: 돌봄 예약 생성 + 상태 변경 통합 Edge Function
// 호출 주체: 앱 — supabase.functions.invoke('create-reservation', { body })
//
// 모드 분기: reservation_id 유무로 판별
//   - reservation_id 없음 → 생성 모드 (새 예약 생성)
//   - reservation_id 있음 → 업데이트 모드 (상태 변경)
//
// 생성 모드 입력 (CODE.md #36):
//   kindergarten_id       (UUID, 필수) — 유치원 ID
//   pet_id                (UUID, 필수) — 반려동물 ID
//   checkin_scheduled     (timestamptz, 필수) — 등원 예정 일시
//   checkout_scheduled    (timestamptz, 필수) — 하원 예정 일시
//   walk_count            (integer, 필수) — 산책 횟수
//   pickup_requested      (boolean, 필수) — 픽드랍 요청 여부
//   payment_id            (UUID, 필수) — 결제 ID (inicis-callback에서 반환)
//   room_id               (UUID, 선택) — 기존 채팅방 (없으면 자동 생성)
//
// 업데이트 모드 입력:
//   reservation_id        (UUID, 필수) — 예약 ID
//   status                (string, 필수) — '예약확정', '거절', '취소'
//   reject_reason         (string, 선택) — 거절 사유
//   reject_detail         (string, 선택) — 거절 상세
//   cancel_reason         (string, 선택) — 취소 사유
//
// 출력 (STEP4_WORK_PLAN.md §4-1):
//   { success: true,  data: { reservation_id, room_id, status } }
//   { success: false, error: "에러 메시지" }
//
// 생성 모드 처리 흐름 (MIGRATION_PLAN.md §7-2-3):
//   1. JWT → member_id 추출
//   2. reservations INSERT (status='수락대기')
//   3. payments UPDATE (reservation_id 연결)
//   4. 채팅방 확인 → 없으면 app_create_chat_room RPC 호출
//   5. chat_room_reservations INSERT
//   6. chat_messages INSERT (message_type='reservation_request')
//   7. 상대방 FCM 푸시 (send-push 내부 호출)
//
// 업데이트 모드 처리 흐름:
//   1. JWT → caller_id 추출
//   2. reservations UPDATE (status, reject_reason 등)
//   3. 상태별 시스템 메시지 INSERT
//   4. 상대방 FCM 푸시
//
// 보안: JWT 인증 필수 (앱 호출)
// Secrets: FIREBASE_SERVICE_ACCOUNT_JSON (send-push 경유)
//
// 참조:
//   - APP_MIGRATION_CODE.md #36
//   - APP_MIGRATION_GUIDE.md §15-4
//   - MIGRATION_PLAN.md §7-2-3
//   - R2 산출물: app_create_chat_room RPC (채팅방 자동생성)
// ============================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { corsHeaders, jsonResponse, errorResponse } from '../_shared/response.ts'
import { createAdminClient } from '../_shared/supabase.ts'

// ─── C7: 허용된 상태 전이 맵 (DB 실제 상태값 기준) ─────────────────
// { 현재상태: [허용 전이 상태 목록] }
// DB CHECK 제약: 수락대기, 예약확정, 돌봄진행중, 돌봄완료,
//               보호자취소, 유치원취소, 유치원거절, 노쇼, 관리자취소
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  '수락대기': ['예약확정', '유치원거절', '보호자취소', '유치원취소'],
  '예약확정': ['보호자취소', '유치원취소'],
  '돌봄진행중': [],                 // 진행 중에는 이 EF로 변경 불가
  '돌봄완료': [],                   // 완료 후 변경 불가
  '보호자취소': [],                 // 취소 후 변경 불가
  '유치원취소': [],                 // 취소 후 변경 불가
  '유치원거절': [],                 // 거절 후 변경 불가
  '노쇼': [],                       // 노쇼 후 변경 불가
  '관리자취소': [],                 // 관리자 취소 후 변경 불가
}

// ─── 타입 정의 ────────────────────────────────────────────────

interface CreateReservationBody {
  // 생성 모드
  kindergarten_id?: string
  pet_id?: string
  checkin_scheduled?: string
  checkout_scheduled?: string
  walk_count?: number
  pickup_requested?: boolean
  payment_id?: string
  room_id?: string | null

  // 업데이트 모드
  reservation_id?: string
  status?: string
  reject_reason?: string
  reject_detail?: string
  cancel_reason?: string
}

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
      console.error('[create-reservation] send-push failed:', response.status, errorText)
    } else {
      const result = await response.json()
      console.log('[create-reservation] send-push result:', result)
    }
  } catch (e) {
    console.error('[create-reservation] send-push error (non-fatal):', e)
  }
}

// ─── 헬퍼: 시스템 메시지 INSERT ─────────────────────────────────

async function insertSystemMessage(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
  chatRoomId: string,
  messageType: string,
  content: string,
): Promise<string | null> {
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
    .select('id')
    .single()

  if (error) {
    console.error(`[create-reservation] 시스템 메시지(${messageType}) INSERT 실패:`, error)
    return null
  }

  // chat_rooms 갱신(last_message, last_message_at, total_message_count)은
  // DB 트리거 fn_update_chat_room_last_message 가 INSERT 시 자동 처리

  return msg.id
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
    const body: CreateReservationBody = await req.json()

    // ── 3. 모드 분기: reservation_id 유무 ────────────────────
    if (body.reservation_id) {
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // 업데이트 모드
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      return await handleUpdate(supabaseAdmin, callerId, body)
    } else {
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // 생성 모드
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      return await handleCreate(supabaseAdmin, callerId, body)
    }
  } catch (error) {
    console.error('[create-reservation] Error:', error)
    return errorResponse(
      (error as Error).message ?? '예약 처리 중 서버 오류가 발생했습니다',
      500,
    )
  }
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 생성 모드 핸들러
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function handleCreate(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
  callerId: string,
  body: CreateReservationBody,
): Promise<Response> {
  // ── 입력 검증 ─────────────────────────────────────────────
  const {
    kindergarten_id,
    pet_id,
    checkin_scheduled,
    checkout_scheduled,
    walk_count,
    pickup_requested,
    payment_id,
  } = body

  if (!kindergarten_id || !pet_id || !checkin_scheduled || !checkout_scheduled) {
    return errorResponse('kindergarten_id, pet_id, checkin_scheduled, checkout_scheduled는 필수입니다', 400)
  }
  if (walk_count === undefined || walk_count === null) {
    return errorResponse('walk_count는 필수입니다', 400)
  }
  if (pickup_requested === undefined || pickup_requested === null) {
    return errorResponse('pickup_requested는 필수입니다', 400)
  }
  if (!payment_id) {
    return errorResponse('payment_id는 필수입니다', 400)
  }

  // ── 유치원 존재 확인 + 운영자 member_id 조회 ──────────────
  const { data: kindergarten, error: kgError } = await supabaseAdmin
    .from('kindergartens')
    .select('id, member_id, name')
    .eq('id', kindergarten_id)
    .single()

  if (kgError || !kindergarten) {
    return errorResponse('유치원을 찾을 수 없습니다', 404)
  }

  // ── reservations INSERT ───────────────────────────────────
  const { data: reservation, error: reservError } = await supabaseAdmin
    .from('reservations')
    .insert({
      member_id: callerId,
      kindergarten_id,
      pet_id,
      checkin_scheduled,
      checkout_scheduled,
      walk_count,
      pickup_requested,
      status: '수락대기',
      requested_at: new Date().toISOString(),
    })
    .select('id, status')
    .single()

  if (reservError) {
    console.error('[create-reservation] reservations INSERT 실패:', reservError)
    return errorResponse('예약 생성에 실패했습니다', 500)
  }

  console.log(`[create-reservation] 예약 생성 완료: id=${reservation.id}`)

  // ── payments UPDATE (reservation_id 연결) ──────────────────
  const { error: payUpdateError } = await supabaseAdmin
    .from('payments')
    .update({ reservation_id: reservation.id })
    .eq('id', payment_id)

  if (payUpdateError) {
    console.error('[create-reservation] payments UPDATE 실패:', payUpdateError)
    // 결제 연결 실패는 경고만 (예약 자체는 성공)
  }

  // ── 채팅방 확인/생성 ──────────────────────────────────────
  let roomId = body.room_id || null

  if (!roomId) {
    // 채팅방 자동 생성: app_create_chat_room RPC 호출
    // 이 RPC는 SECURITY DEFINER이므로 service_role 키로 호출 시
    // auth.uid()가 설정되지 않음. 대신 직접 채팅방을 생성
    roomId = await findOrCreateChatRoom(
      supabaseAdmin,
      callerId,
      kindergarten.member_id,
      kindergarten_id,
    )
  }

  if (roomId) {
    // ── chat_room_reservations INSERT ──────────────────────
    const { error: crrError } = await supabaseAdmin
      .from('chat_room_reservations')
      .insert({
        chat_room_id: roomId,
        reservation_id: reservation.id,
      })

    if (crrError) {
      console.error('[create-reservation] chat_room_reservations INSERT 실패:', crrError)
    }

    // ── 시스템 메시지: reservation_request ──────────────────
    const content = JSON.stringify({
      reservation_id: reservation.id,
      pet_id,
      checkin_scheduled,
      checkout_scheduled,
    })

    await insertSystemMessage(supabaseAdmin, roomId, 'reservation_request', content)
  }

  // ── FCM 푸시 발송 (유치원 운영자에게) ───────────────────────
  // 보내는 사람 닉네임 조회
  const { data: caller } = await supabaseAdmin
    .from('members')
    .select('nickname')
    .eq('id', callerId)
    .single()

  const senderName = caller?.nickname ?? '보호자'

  try {
    await callSendPush(
      [kindergarten.member_id],
      '새 돌봄 예약',
      `${senderName}님이 돌봄 예약을 요청했습니다.`,
      {
        type: 'reservation',
        reservation_id: reservation.id,
        chat_room_id: roomId ?? '',
      },
      'reservation',
    )
  } catch (e) {
    console.error('[create-reservation] FCM 발송 실패 (non-fatal):', e)
  }

  // ── 성공 응답 ─────────────────────────────────────────────
  return jsonResponse({
    success: true,
    data: {
      reservation_id: reservation.id,
      room_id: roomId,
      status: reservation.status,
    },
  })
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 업데이트 모드 핸들러
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function handleUpdate(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
  callerId: string,
  body: CreateReservationBody,
): Promise<Response> {
  const { reservation_id, status, reject_reason, reject_detail, cancel_reason } = body

  if (!reservation_id || !status) {
    return errorResponse('reservation_id와 status는 필수입니다', 400)
  }

  // 허용된 상태값 검증
  const allowedStatuses = ['예약확정', '거절', '취소']
  if (!allowedStatuses.includes(status)) {
    return errorResponse(`status는 ${allowedStatuses.join(', ')} 중 하나여야 합니다`, 400)
  }

  // ── 기존 예약 조회 ────────────────────────────────────────
  const { data: reservation, error: fetchError } = await supabaseAdmin
    .from('reservations')
    .select('id, member_id, kindergarten_id, pet_id, status')
    .eq('id', reservation_id)
    .single()

  if (fetchError || !reservation) {
    return errorResponse('예약을 찾을 수 없습니다', 404)
  }

  // 호출자가 예약의 당사자인지 확인 (보호자 또는 유치원 운영자)
  const { data: kindergarten } = await supabaseAdmin
    .from('kindergartens')
    .select('id, member_id, name')
    .eq('id', reservation.kindergarten_id)
    .single()

  const isGuardian = callerId === reservation.member_id
  const isKgOwner = callerId === kindergarten?.member_id

  if (!isGuardian && !isKgOwner) {
    return errorResponse('해당 예약의 당사자만 상태를 변경할 수 있습니다', 403)
  }

  // ── C4: API 상태값 → DB 실제 값 동적 매핑 ─────────────────
  // '취소'는 호출자 역할에 따라 '보호자취소' 또는 '유치원취소'로 분기
  let dbStatus: string
  switch (status) {
    case '예약확정': dbStatus = '예약확정'; break
    case '거절':    dbStatus = '유치원거절'; break
    case '취소':    dbStatus = isGuardian ? '보호자취소' : '유치원취소'; break
    default: return errorResponse('유효하지 않은 상태값입니다', 400)
  }

  // ── C7: 상태 전이 유효성 검증 ─────────────────────────────
  const currentStatus = reservation.status
  const allowed = ALLOWED_TRANSITIONS[currentStatus] ?? []
  if (!allowed.includes(dbStatus)) {
    return errorResponse(
      `현재 상태(${currentStatus})에서 '${dbStatus}'(으)로 변경할 수 없습니다. 허용: [${allowed.join(', ')}]`,
      400,
    )
  }

  // ── 상태별 업데이트 처리 ──────────────────────────────────
  const updateData: Record<string, unknown> = { status: dbStatus }
  let systemMessageType: string | null = null
  let systemMessageContent: string | null = null
  let pushTitle = ''
  let pushBody = ''
  let pushTargetMemberId = ''

  switch (status) {
    case '예약확정': {
      // 유치원이 예약을 수락
      systemMessageType = 'reservation_confirmed'
      systemMessageContent = JSON.stringify({
        reservation_id: reservation.id,
      })
      pushTitle = '예약 확정'
      pushBody = `${kindergarten?.name ?? '유치원'}에서 돌봄 예약을 확정했습니다.`
      pushTargetMemberId = reservation.member_id // 보호자에게
      break
    }

    case '거절': {
      // 유치원이 예약을 거절
      updateData.reject_reason = reject_reason ?? null
      updateData.reject_detail = reject_detail ?? null
      updateData.rejected_at = new Date().toISOString()
      // C8: 거절 시스템 메시지 추가 (reservation_rejected)
      systemMessageType = 'reservation_rejected'
      systemMessageContent = JSON.stringify({
        reservation_id: reservation.id,
        reject_reason: reject_reason ?? null,
      })
      pushTitle = '예약 거절'
      pushBody = `${kindergarten?.name ?? '유치원'}에서 돌봄 예약을 거절했습니다.${reject_reason ? ` (사유: ${reject_reason})` : ''}`
      pushTargetMemberId = reservation.member_id // 보호자에게
      break
    }

    case '취소': {
      // 보호자가 예약을 취소
      // C5: cancel_reason은 reservations 테이블에 없으므로 제거
      // (취소 사유는 refunds 테이블에서 관리)

      // TODO(C6): 위약금 결제/환불 로직 추가 필요
      // - 체크인 예정 시간 기준 취소 시점에 따른 위약금 비율 계산
      // - refunds 테이블에 환불 레코드 INSERT
      // - 위약금 결제 건 생성 (payments INSERT, payment_type='위약금')
      // - 이니시스 결제 취소 API 연동 (별도 EF 또는 외부 API 호출)
      // - 참조: APP_MIGRATION_GUIDE.md §15-4, MIGRATION_PLAN.md §7-2-3

      // C8: 취소 시스템 메시지 추가 (reservation_cancelled)
      systemMessageType = 'reservation_cancelled'
      systemMessageContent = JSON.stringify({
        reservation_id: reservation.id,
        cancel_reason: cancel_reason ?? null,
      })

      // 보호자 닉네임 조회
      const { data: guardian } = await supabaseAdmin
        .from('members')
        .select('nickname')
        .eq('id', callerId)
        .single()
      pushTitle = '예약 취소'
      pushBody = `${guardian?.nickname ?? '보호자'}님이 돌봄 예약을 취소했습니다.${cancel_reason ? ` (사유: ${cancel_reason})` : ''}`
      pushTargetMemberId = kindergarten?.member_id ?? '' // 유치원에게
      break
    }
  }

  // ── reservations UPDATE ───────────────────────────────────
  const { data: updated, error: updateError } = await supabaseAdmin
    .from('reservations')
    .update(updateData)
    .eq('id', reservation_id)
    .select('id, status')
    .single()

  if (updateError) {
    console.error('[create-reservation] reservations UPDATE 실패:', updateError)
    return errorResponse('예약 상태 변경에 실패했습니다', 500)
  }

  console.log(`[create-reservation] 상태 변경 완료: id=${reservation_id}, status=${status}`)

  // ── 채팅방 시스템 메시지 ───────────────────────────────────
  if (systemMessageType && systemMessageContent) {
    // 해당 예약의 채팅방 조회
    const { data: crr } = await supabaseAdmin
      .from('chat_room_reservations')
      .select('chat_room_id')
      .eq('reservation_id', reservation_id)
      .maybeSingle()

    if (crr?.chat_room_id) {
      await insertSystemMessage(
        supabaseAdmin,
        crr.chat_room_id,
        systemMessageType,
        systemMessageContent,
      )
    }
  }

  // ── FCM 푸시 발송 ─────────────────────────────────────────
  if (pushTargetMemberId) {
    // 해당 예약의 채팅방 ID 조회
    const { data: crr } = await supabaseAdmin
      .from('chat_room_reservations')
      .select('chat_room_id')
      .eq('reservation_id', reservation_id)
      .maybeSingle()

    try {
      await callSendPush(
        [pushTargetMemberId],
        pushTitle,
        pushBody,
        {
          type: 'reservation',
          reservation_id: reservation_id,
          chat_room_id: crr?.chat_room_id ?? '',
        },
        'reservation',
      )
    } catch (e) {
      console.error('[create-reservation] FCM 발송 실패 (non-fatal):', e)
    }
  }

  // ── 성공 응답 ─────────────────────────────────────────────
  // 채팅방 ID 조회
  const { data: crrForResponse } = await supabaseAdmin
    .from('chat_room_reservations')
    .select('chat_room_id')
    .eq('reservation_id', reservation_id)
    .maybeSingle()

  return jsonResponse({
    success: true,
    data: {
      reservation_id: updated.id,
      room_id: crrForResponse?.chat_room_id ?? null,
      status: updated.status,
    },
  })
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 채팅방 찾기/생성 헬퍼
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function findOrCreateChatRoom(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
  guardianMemberId: string,
  kindergartenMemberId: string,
  kindergartenId: string,
): Promise<string | null> {
  try {
    // 기존 채팅방 확인: guardian_id + kindergarten_id 조합
    const { data: existingRoom } = await supabaseAdmin
      .from('chat_rooms')
      .select('id, status')
      .eq('guardian_id', guardianMemberId)
      .eq('kindergarten_id', kindergartenId)
      .maybeSingle()

    if (existingRoom) {
      // 비활성 방이면 활성으로 복원
      if (existingRoom.status !== '활성') {
        await supabaseAdmin
          .from('chat_rooms')
          .update({ status: '활성' })
          .eq('id', existingRoom.id)
      }
      return existingRoom.id
    }

    // 새 채팅방 생성
    const { data: newRoom, error: roomError } = await supabaseAdmin
      .from('chat_rooms')
      .insert({
        guardian_id: guardianMemberId,
        kindergarten_id: kindergartenId,
        status: '활성',
      })
      .select('id')
      .single()

    if (roomError) {
      // unique_violation (race condition) → 기존 방 재조회
      if (roomError.code === '23505') {
        const { data: retryRoom } = await supabaseAdmin
          .from('chat_rooms')
          .select('id')
          .eq('guardian_id', guardianMemberId)
          .eq('kindergarten_id', kindergartenId)
          .single()
        return retryRoom?.id ?? null
      }
      console.error('[create-reservation] chat_rooms INSERT 실패:', roomError)
      return null
    }

    // chat_room_members 2건 INSERT (보호자 + 유치원)
    const { error: membersError } = await supabaseAdmin
      .from('chat_room_members')
      .insert([
        {
          chat_room_id: newRoom.id,
          member_id: guardianMemberId,
          role: '보호자',
          is_muted: false,
        },
        {
          chat_room_id: newRoom.id,
          member_id: kindergartenMemberId,
          role: '유치원',
          is_muted: false,
        },
      ])

    if (membersError) {
      console.error('[create-reservation] chat_room_members INSERT 실패:', membersError)
    }

    console.log(`[create-reservation] 채팅방 자동 생성: id=${newRoom.id}`)
    return newRoom.id
  } catch (error) {
    console.error('[create-reservation] 채팅방 생성 중 오류:', error)
    return null
  }
}
