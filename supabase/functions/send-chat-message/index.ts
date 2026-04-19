// ============================================================
// Edge Function: send-chat-message (채팅 메시지 전송)
// ============================================================
// 용도: 앱에서 채팅 메시지 전송 시 호출
// 호출 주체: 앱 — supabase.functions.invoke('send-chat-message', { body })
//
// 입력 스펙 (GUIDE.md §16-3, CODE.md #25):
//   room_id       (UUID, 필수) — 채팅방 ID
//   content       (string, 조건부) — 텍스트 내용 (이미지 전용이면 빈 문자열)
//   message_type  (string, 필수) — 'text', 'image', 'file'
//   image_files   (File[], 선택) — 이미지/파일 배열 (FormData 전송 시)
//
// 출력 스펙 (STEP4_WORK_PLAN.md §4-1):
//   { success: true,  data: { message_id: UUID, image_urls?: string[] } }
//   { success: false, error: "에러 메시지" }
//
// 처리 흐름 (GUIDE.md §14-5):
//   1. JWT에서 sender_id 추출
//   2. chat_room_members 검증 (참여자인지)
//   3. 파일 있으면 → chat-files Storage 업로드 → URL 획득
//   4. chat_messages INSERT
//   5. chat_rooms UPDATE (last_message, last_message_at, total_message_count +1)
//   6. 상대방 is_muted 체크
//   7. is_muted=false면 → send-push 내부 호출 (FCM 발송)
//   8. notifications INSERT
//
// DB message_type: 영문 8종 저장 (CHECK 제약)
//   사용자 전송: 'text', 'image', 'file'
//   시스템 전용: 'reservation_request', 'reservation_confirmed',
//               'care_start', 'care_end', 'review'
//
// 보안: SUPABASE_SERVICE_ROLE_KEY 사용 (서버 내부 처리)
// Secrets: FIREBASE_SERVICE_ACCOUNT_JSON (send-push 경유)
//
// 참조 DB 테이블:
//   chat_rooms          — guardian_id, kindergarten_id, status, last_message, ...
//   chat_messages       — chat_room_id, sender_type, sender_id, message_type, content, image_urls(jsonb), is_read
//   chat_room_members   — chat_room_id, member_id, role, is_muted, last_read_message_id
//   members             — id, name, nickname, current_mode
//   kindergartens       — id, member_id, name
//   notifications       — member_id, title, content, type, data
//
// Storage 버킷:
//   chat-files (private) — 경로: {chat_room_id}/{message_id}/{filename}
// ============================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { corsHeaders, jsonResponse, errorResponse } from '../_shared/response.ts'
import { createAdminClient } from '../_shared/supabase.ts'

// ─── 타입 정의 ────────────────────────────────────────────

interface SendChatRequest {
  room_id: string
  content?: string
  message_type: 'text' | 'image' | 'file'
  image_files?: string[] // base64 인코딩 이미지 (JSON 전송 시, 향후 확장)
}

// ─── 사용자 전송 허용 message_type ────────────────────────────
// DB에는 8종이 존재하지만 앱 사용자는 3종만 전송 가능
// 나머지 5종(reservation_request, reservation_confirmed, care_start, care_end, review)은
// create-reservation, complete-care, scheduler 등 서버 EF에서만 INSERT
const ALLOWED_USER_MESSAGE_TYPES = ['text', 'image', 'file'] as const

// ─── sender_type 매핑 (chat_messages.sender_type) ────────────
// DB CHECK: sender_type IN ('보호자', '유치원', '시스템')
// sender_type은 한글 유지 (chat_room_members.role에서 직접 가져옴)

// ─── 헬퍼: 파일 확장자 추출 ─────────────────────────────────

function extractExtension(filename: string, mimeType: string): string {
  const dotIdx = filename.lastIndexOf('.')
  if (dotIdx > 0) {
    return filename.substring(dotIdx + 1).toLowerCase()
  }
  const mimeMap: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'image/heif': 'heif',
    'application/pdf': 'pdf',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
  }
  return mimeMap[mimeType] || 'jpg'
}

// ─── 헬퍼: Storage 파일 업로드 ────────────────────────────

async function uploadFilesToStorage(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
  roomId: string,
  msgId: string,
  files: File[],
): Promise<string[]> {
  const uploadedUrls: string[] = []
  const timestamp = Date.now()

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const ext = extractExtension(file.name, file.type)
    const filePath = `${roomId}/${msgId}/${i}_${timestamp}.${ext}`

    const arrayBuffer = await file.arrayBuffer()
    const uint8Array = new Uint8Array(arrayBuffer)

    const { data, error } = await supabaseAdmin.storage
      .from('chat-files')
      .upload(filePath, uint8Array, {
        contentType: file.type || 'image/jpeg',
        upsert: false,
      })

    if (error) {
      console.error(`[send-chat-message] Storage upload failed [${i}]:`, error.message)
      continue
    }

    // chat-files는 private 버킷 → signed URL 생성
    const { data: signedData, error: signedError } = await supabaseAdmin.storage
      .from('chat-files')
      .createSignedUrl(data.path, 60 * 60 * 24 * 365) // 1년 유효

    if (signedError || !signedData?.signedUrl) {
      // fallback: 경로만 저장 (앱에서 signed URL 재생성)
      console.error(`[send-chat-message] Signed URL failed [${i}]:`, signedError?.message)
      uploadedUrls.push(data.path)
    } else {
      uploadedUrls.push(signedData.signedUrl)
    }
  }

  return uploadedUrls
}

// ─── 헬퍼: send-push 내부 호출 ──────────────────────────────

async function callSendPush(
  memberIds: string[],
  title: string,
  body: string,
  data: Record<string, string>,
  notificationType: string,
): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

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
    console.error('[send-chat-message] send-push failed:', response.status, errorText)
  } else {
    const result = await response.json()
    console.log('[send-chat-message] send-push result:', result)
  }
}

// ─── 헬퍼: 메시지 미리보기 생성 ────────────────────────────

function buildPreview(messageType: string, content?: string): string {
  switch (messageType) {
    case 'text':
      return (content?.trim() ?? '').substring(0, 100)
    case 'image':
      return '사진을 보냈습니다.'
    case 'file':
      return '동영상을 보냈습니다.'
    default:
      return ''
  }
}

// ─── 메인 핸들러 ────────────────────────────────────────────

serve(async (req: Request) => {
  // ── CORS preflight ──────────────────────────────────────
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // ── 1. JWT에서 sender_id 추출 ─────────────────────────
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

    const senderId = user.id

    // ── 요청 본문 파싱 (JSON 또는 FormData) ─────────────
    let roomId: string
    let content: string | undefined
    let messageType: string
    let files: File[] = []

    const contentType = req.headers.get('content-type') || ''

    if (contentType.includes('multipart/form-data')) {
      // FormData 모드 (이미지/파일 첨부 — CODE.md #25 After ②)
      const formData = await req.formData()

      roomId = formData.get('room_id') as string
      messageType = formData.get('message_type') as string
      content = (formData.get('content') as string) || undefined

      // image_files 키로 전송된 파일 수집
      for (const [key, value] of formData.entries()) {
        if (
          (key === 'image_files' || key === 'file' || key === 'files') &&
          value instanceof File
        ) {
          files.push(value)
        }
      }
    } else {
      // JSON 모드 (텍스트 메시지 — CODE.md #25 After ①)
      const body: SendChatRequest = await req.json()
      roomId = body.room_id
      messageType = body.message_type
      content = body.content
    }

    // ── 입력 검증 ────────────────────────────────────────
    if (!roomId) {
      return errorResponse('room_id는 필수입니다', 400)
    }
    if (!messageType || !(ALLOWED_USER_MESSAGE_TYPES as readonly string[]).includes(messageType)) {
      return errorResponse("message_type은 'text', 'image', 'file' 중 하나여야 합니다", 400)
    }
    if (messageType === 'text' && (!content || content.trim().length === 0)) {
      return errorResponse('텍스트 메시지의 content는 필수입니다', 400)
    }
    if ((messageType === 'image' || messageType === 'file') && files.length === 0) {
      return errorResponse('이미지/파일 메시지에는 최소 1개의 파일이 필요합니다', 400)
    }

    // ── 2. chat_room_members 참여 검증 ───────────────────
    const { data: membership, error: memberError } = await supabaseAdmin
      .from('chat_room_members')
      .select('id, role, is_muted')
      .eq('chat_room_id', roomId)
      .eq('member_id', senderId)
      .single()

    if (memberError || !membership) {
      return errorResponse('해당 채팅방의 참여자가 아닙니다', 403)
    }

    // 채팅방 상태 확인
    const { data: chatRoom, error: roomError } = await supabaseAdmin
      .from('chat_rooms')
      .select('id, guardian_id, kindergarten_id, status, total_message_count')
      .eq('id', roomId)
      .single()

    if (roomError || !chatRoom) {
      return errorResponse('채팅방을 찾을 수 없습니다', 404)
    }

    if (chatRoom.status !== '활성') {
      return errorResponse('비활성화된 채팅방에는 메시지를 보낼 수 없습니다', 403)
    }

    // sender_type: 보호자 또는 유치원 (chat_room_members.role에서 가져옴, 한글 유지)
    const senderType = membership.role // '보호자' | '유치원'

    // ── 3. 파일 → Storage 업로드 ─────────────────────────
    const msgId = crypto.randomUUID()
    let imageUrls: string[] = []

    if (files.length > 0) {
      imageUrls = await uploadFilesToStorage(supabaseAdmin, roomId, msgId, files)

      if (imageUrls.length === 0) {
        return errorResponse('파일 업로드에 실패했습니다', 500)
      }
    }

    // ── 4. chat_messages INSERT ──────────────────────────
    // message_type은 영문 그대로 DB에 저장 (text, image, file)
    const messageInsert: Record<string, unknown> = {
      id: msgId,
      chat_room_id: roomId,
      sender_type: senderType,
      sender_id: senderId,
      message_type: messageType,
      content: content?.trim() || null,
      image_urls: imageUrls.length > 0 ? imageUrls : null,
      is_read: false,
    }

    const { data: insertedMsg, error: insertError } = await supabaseAdmin
      .from('chat_messages')
      .insert(messageInsert)
      .select('id, created_at')
      .single()

    if (insertError) {
      console.error('[send-chat-message] chat_messages INSERT 실패:', insertError)
      return errorResponse('메시지 저장에 실패했습니다', 500)
    }

    // ── 5. chat_rooms UPDATE ─────────────────────────────
    const lastMessagePreview = buildPreview(messageType, content)

    const { error: updateError } = await supabaseAdmin
      .from('chat_rooms')
      .update({
        last_message: lastMessagePreview,
        last_message_at: insertedMsg.created_at,
        total_message_count: (chatRoom.total_message_count || 0) + 1,
      })
      .eq('id', roomId)

    if (updateError) {
      // 메시지 저장은 성공했으므로 경고만 출력 (치명적 아님)
      console.error('[send-chat-message] chat_rooms UPDATE 실패:', updateError)
    }

    // ── 6-7-8. 상대방 is_muted 체크 → send-push → notifications ─

    // 상대방 member_id 식별: chat_room_members에서 본인이 아닌 참여자
    const { data: otherMembers, error: otherError } = await supabaseAdmin
      .from('chat_room_members')
      .select('member_id, is_muted')
      .eq('chat_room_id', roomId)
      .neq('member_id', senderId)

    if (!otherError && otherMembers && otherMembers.length > 0) {
      // is_muted=false인 상대방에게만 푸시 전송
      const pushTargets = otherMembers
        .filter((m) => !m.is_muted)
        .map((m) => m.member_id)

      if (pushTargets.length > 0) {
        // 보내는 사람 표시 이름 조회
        let senderDisplayName = '알림'
        if (senderType === '보호자') {
          const { data: sender } = await supabaseAdmin
            .from('members')
            .select('nickname')
            .eq('id', senderId)
            .single()
          senderDisplayName = sender?.nickname ?? '보호자'
        } else {
          // 유치원 운영자 → 유치원 이름
          const { data: kg } = await supabaseAdmin
            .from('kindergartens')
            .select('name')
            .eq('id', chatRoom.kindergarten_id)
            .single()
          senderDisplayName = kg?.name ?? '유치원'
        }

        const pushBody = buildPreview(messageType, content)

        // send-push 내부 호출 (await + try/catch — 실패해도 메시지 전송은 성공)
        // send-push가 내부적으로 FCM 발송 + notifications INSERT 모두 처리
        try {
          await callSendPush(
            pushTargets,
            senderDisplayName,
            pushBody,
            {
              type: 'chat_message',
              chat_room_id: roomId,
              message_id: msgId,
            },
            'chat',
          )
        } catch (e) {
          console.error('[send-chat-message] push error (non-fatal):', e)
        }
      }
    }

    // ── 성공 응답 ────────────────────────────────────────
    console.log(
      `[send-chat-message] 메시지 전송 완료: room=${roomId}, msg=${msgId}, type=${messageType}`,
    )

    return jsonResponse({
      success: true,
      data: {
        message_id: insertedMsg.id,
        ...(imageUrls.length > 0 && { image_urls: imageUrls }),
      },
    })
  } catch (error) {
    console.error('[send-chat-message] Error:', error)
    return errorResponse(
      (error as Error).message ?? '채팅 메시지 전송 중 서버 오류가 발생했습니다',
      500,
    )
  }
})
