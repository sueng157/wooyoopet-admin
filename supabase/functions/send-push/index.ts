// ============================================================
// Edge Function: send-push (FCM 푸시 알림 발송)
// ============================================================
// 용도: 다른 Edge Function에서 내부 호출하여 FCM 푸시 알림 발송
// 호출 주체: send-chat-message, create-reservation, complete-care, scheduler
// 앱 직접 호출: 없음 (내부 호출 전용)
//
// 입력 스펙 (GUIDE.md §16-7):
//   member_id  (UUID, 조건부) — 단건 발송 대상
//   member_ids (UUID[], 조건부) — 다건 발송 대상
//   title      (string, 필수) — 푸시 알림 제목
//   body       (string, 필수) — 푸시 알림 본문
//   data       (object, 선택) — 추가 데이터 (screen, reservation_id 등)
//   notification_type (string, 선택) — notifications 테이블 type 컬럼
//
// 출력 스펙 (STEP4_WORK_PLAN.md §4-1):
//   { success: true,  data: { sent_count, failed_count, cleaned_tokens } }
//   { success: false, error: "에러 메시지" }
//
// 처리 흐름:
//   1. fcm_tokens에서 대상 회원의 FCM 토큰 조회 (복수 기기 가능)
//   2. FCM v1 HTTP API로 멀티캐스트 발송
//   3. 만료/무효 토큰 → fcm_tokens에서 자동 삭제
//   4. notifications 테이블에 알림 기록 INSERT
//   5. 발송 결과 반환
//
// 보안: SUPABASE_SERVICE_ROLE_KEY 사용 (서버 내부 전용)
// Secrets: FIREBASE_SERVICE_ACCOUNT_JSON
// ============================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { corsHeaders, jsonResponse, errorResponse } from '../_shared/response.ts'
import { createAdminClient } from '../_shared/supabase.ts'
import {
  getServiceAccount,
  sendToTokens,
  type FcmMessageData,
} from '../_shared/fcm.ts'

// ─── 입력 타입 ────────────────────────────────────────────

interface SendPushRequest {
  member_id?: string        // 단건 발송 대상 UUID
  member_ids?: string[]     // 다건 발송 대상 UUID[]
  title: string             // 푸시 알림 제목
  body: string              // 푸시 알림 본문
  data?: FcmMessageData     // 추가 데이터 (딥링크용)
  notification_type?: string // notifications.type (chat, reservation, review, system)
}

serve(async (req: Request) => {
  // ── CORS preflight ──────────────────────────────────────
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // ── 1. 요청 파싱 및 검증 ──────────────────────────────
    const {
      member_id,
      member_ids,
      title,
      body: pushBody,
      data,
      notification_type,
    } = (await req.json()) as SendPushRequest

    // member_id 또는 member_ids 중 하나 필수
    const targetIds: string[] = []
    if (member_ids && member_ids.length > 0) {
      targetIds.push(...member_ids)
    }
    if (member_id) {
      // 중복 방지
      if (!targetIds.includes(member_id)) {
        targetIds.push(member_id)
      }
    }

    if (targetIds.length === 0) {
      return errorResponse('member_id 또는 member_ids가 필요합니다', 400)
    }

    if (!title || !pushBody) {
      return errorResponse('title과 body는 필수입니다', 400)
    }

    // ── 2. Supabase Admin 클라이언트 ──────────────────────
    const supabaseAdmin = createAdminClient()

    // ── 3. fcm_tokens에서 대상 회원의 토큰 조회 ───────────
    const { data: tokenRows, error: tokenError } = await supabaseAdmin
      .from('fcm_tokens')
      .select('id, member_id, token')
      .in('member_id', targetIds)

    if (tokenError) {
      console.error('[send-push] fcm_tokens 조회 실패:', tokenError)
      return errorResponse('FCM 토큰 조회에 실패했습니다', 500)
    }

    if (!tokenRows || tokenRows.length === 0) {
      console.log('[send-push] 발송 대상 토큰 없음:', targetIds)
      return jsonResponse({
        success: true,
        data: { sent_count: 0, failed_count: 0, cleaned_tokens: 0 },
      })
    }

    // 토큰 문자열 배열 추출 (중복 제거)
    const uniqueTokens = [...new Set(tokenRows.map((r) => r.token))]
    console.log(
      `[send-push] 발송 대상: ${targetIds.length}명, 토큰 ${uniqueTokens.length}개`,
    )

    // ── 4. FCM v1 HTTP API 멀티캐스트 발송 ────────────────
    const serviceAccount = getServiceAccount()
    const { sentCount, failedCount, invalidTokens } = await sendToTokens(
      serviceAccount,
      uniqueTokens,
      title,
      pushBody,
      data,
    )

    console.log(
      `[send-push] 발송 결과: 성공=${sentCount}, 실패=${failedCount}, 무효토큰=${invalidTokens.length}`,
    )

    // ── 5. 만료/무효 토큰 정리 ────────────────────────────
    let cleanedTokens = 0
    if (invalidTokens.length > 0) {
      const { error: deleteError, count } = await supabaseAdmin
        .from('fcm_tokens')
        .delete()
        .in('token', invalidTokens)

      if (deleteError) {
        console.error('[send-push] 무효 토큰 삭제 실패:', deleteError)
      } else {
        cleanedTokens = count ?? invalidTokens.length
        console.log(`[send-push] 무효 토큰 ${cleanedTokens}개 삭제 완료`)
      }
    }

    // ── 6. notifications 테이블에 알림 기록 INSERT ─────────
    //    대상 회원별로 1건씩 INSERT (푸시 발송 성공/실패 무관하게 기록)
    const notificationRows = targetIds.map((mid) => ({
      member_id: mid,
      title,
      content: pushBody,
      type: notification_type || 'system',
      data: data ? data : {},
    }))

    const { error: notifError } = await supabaseAdmin
      .from('notifications')
      .insert(notificationRows)

    if (notifError) {
      // 알림 기록 실패는 FCM 발송과 무관하므로 경고만 출력
      console.error('[send-push] notifications INSERT 실패:', notifError)
    }

    // ── 7. 성공 응답 ──────────────────────────────────────
    return jsonResponse({
      success: true,
      data: {
        sent_count: sentCount,
        failed_count: failedCount,
        cleaned_tokens: cleanedTokens,
      },
    })
  } catch (error) {
    console.error('[send-push] Error:', error)
    return errorResponse(
      (error as Error).message ?? '푸시 알림 발송 중 서버 오류가 발생했습니다',
      500,
    )
  }
})
