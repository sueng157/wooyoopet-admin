// ============================================================
// Edge Function: send-alimtalk (카카오 알림톡 — Supabase Auth SMS 훅)
// ============================================================
// 용도: Supabase Auth Phone OTP 인증번호를 카카오 알림톡으로 발송
// 호출 주체: Supabase Auth SMS 훅 (앱에서 직접 호출하지 않음)
// 트리거: supabase.auth.signInWithOtp({ phone }) 호출 시 자동 호출
//
// Supabase Auth SMS Hook 규격:
//   입력 (Supabase Auth가 전달):
//     { user: { phone: "+821012345678" }, sms: { otp: "123456" } }
//   출력:
//     성공 시: HTTP 200 (빈 body 또는 JSON)
//     실패 시: HTTP 4xx/5xx + { error: { http_code, message } }
//
// 루나소프트 API (카카오 알림톡 발송):
//   - API 문서: 루나소프트 알림톡 HTTP API
//   - 엔드포인트: https://alimtalk-api.lunasoft.co.kr/v2/send
//   - 인증: API Key + User ID (Supabase Secrets)
//
// 참조:
//   - MIGRATION_PLAN.md §7-2-5 (send-alimtalk 설계)
//   - MIGRATION_PLAN.md §9-5 (Secrets: KAKAO_ALIMTALK_API_KEY, KAKAO_ALIMTALK_USER_ID)
//   - APP_MIGRATION_GUIDE.md §1-2, §16-6 (SMS 훅 설명)
//   - APP_MIGRATION_CODE.md #1 (앱 측 호출 — signInWithOtp)
//
// Secrets:
//   - KAKAO_ALIMTALK_API_KEY: 루나소프트 API 키
//   - KAKAO_ALIMTALK_USER_ID: 루나소프트 사용자 ID
//
// 배포 주의:
//   - JWT 검증 비활성화 필요: supabase functions deploy send-alimtalk --no-verify-jwt
//   - Supabase Dashboard > Auth > Hooks > Send SMS Hook 에서 HTTPS 훅 설정
//   - Webhook Secret 생성 및 등록 필요
// ============================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0'
import { corsHeaders } from '../_shared/response.ts'

// ─── 타입 정의 ────────────────────────────────────────────

/** Supabase Auth SMS Hook 페이로드 */
interface SmsHookPayload {
  user?: {
    phone?: string  // '+821012345678' 국제 형식
  }
  sms?: {
    otp?: string    // 6자리 OTP 코드
  }
}

// ─── 루나소프트 알림톡 API ────────────────────────────────

/** 루나소프트 알림톡 발송 API 엔드포인트 */
const LUNASOFT_API_URL = 'https://alimtalk-api.lunasoft.co.kr/v2/send'

/**
 * 국제번호 형식 → 한국 국내번호 형식 변환
 * '+821012345678' → '01012345678'
 * '01012345678' → '01012345678' (이미 국내번호면 그대로)
 */
function toLocalPhone(phone: string): string {
  // +82 국가코드 제거
  if (phone.startsWith('+82')) {
    return '0' + phone.slice(3)
  }
  // 이미 0으로 시작하면 그대로
  if (phone.startsWith('0')) {
    return phone
  }
  // 그 외 (예: 1012345678) → 0 추가
  return '0' + phone
}

/**
 * 루나소프트 API를 통해 카카오 알림톡 발송
 *
 * @param phone - 수신 전화번호 (국내번호 형식: 01012345678)
 * @param otp - 인증번호 (6자리)
 * @param apiKey - 루나소프트 API 키
 * @param userId - 루나소프트 사용자 ID
 */
async function sendAlimtalk(
  phone: string,
  otp: string,
  apiKey: string,
  userId: string,
): Promise<{ success: boolean; message: string }> {
  // 루나소프트 알림톡 발송 요청
  // 템플릿 코드는 루나소프트 대시보드에서 등록한 인증번호 발송 템플릿 사용
  const requestBody = {
    api_key: apiKey,
    user_id: userId,
    sender_key: userId,  // 발신 프로필 키 (루나소프트 대시보드에서 확인)
    template_code: 'AUTH_CODE',  // 인증번호 발송 템플릿 코드
    receiver: phone,
    message: `[우유펫] 인증번호는 [${otp}]입니다. 정확히 입력해 주세요.`,
    // 알림톡 실패 시 SMS 대체 발송
    replace_yn: 'Y',
    sms_message: `[우유펫] 인증번호는 [${otp}]입니다. 정확히 입력해 주세요.`,
  }

  try {
    const response = await fetch(LUNASOFT_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })

    const result = await response.json()

    if (response.ok && result.code === '0000') {
      return { success: true, message: '알림톡 발송 성공' }
    }

    // 루나소프트 API 에러
    console.error('[send-alimtalk] 루나소프트 API 에러:', {
      status: response.status,
      code: result.code,
      message: result.message,
    })
    return {
      success: false,
      message: result.message || `루나소프트 API 에러 (code: ${result.code})`,
    }
  } catch (error) {
    console.error('[send-alimtalk] 네트워크 오류:', error)
    return {
      success: false,
      message: `알림톡 발송 중 네트워크 오류: ${(error as Error).message}`,
    }
  }
}

// ─── Edge Function 핸들러 ─────────────────────────────────

serve(async (req: Request) => {
  // ── CORS preflight ──────────────────────────────────────
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // ── 1. Webhook 서명 검증 ──────────────────────────────
    //    Supabase Auth SMS Hook은 standardwebhooks 서명으로 보호됨
    //    AUTH_WEBHOOK_SECRET 환경변수에 Webhook Secret 저장
    //    (Supabase CLI가 SUPABASE_ 접두사 Secret 등록을 차단하므로 AUTH_ 접두사 사용)
    const webhookSecret = Deno.env.get('AUTH_WEBHOOK_SECRET')

    let payload: SmsHookPayload

    if (webhookSecret) {
      // Webhook 서명 검증 (프로덕션)
      const rawBody = await req.text()
      const headers = Object.fromEntries(req.headers)

      const wh = new Webhook(webhookSecret)
      payload = wh.verify(rawBody, headers) as SmsHookPayload
    } else {
      // Webhook Secret 미설정 시 (개발 환경) — 서명 검증 스킵
      console.warn('[send-alimtalk] AUTH_WEBHOOK_SECRET 미설정 — 서명 검증 스킵')
      payload = await req.json()
    }

    // ── 2. 페이로드에서 phone, otp 추출 ───────────────────
    const phone = payload.user?.phone
    const otp = payload.sms?.otp

    if (!phone || !otp) {
      console.error('[send-alimtalk] 필수 필드 누락:', { phone, otp: otp ? '***' : undefined })
      return new Response(
        JSON.stringify({
          error: {
            http_code: 400,
            message: 'phone과 otp가 필요합니다',
          },
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // ── 3. 전화번호 형식 변환 ──────────────────────────────
    const localPhone = toLocalPhone(phone)
    console.log(`[send-alimtalk] OTP 발송 요청: phone=${localPhone}`)

    // ── 4. Secrets에서 API 키 조회 ─────────────────────────
    const apiKey = Deno.env.get('KAKAO_ALIMTALK_API_KEY')
    const userId = Deno.env.get('KAKAO_ALIMTALK_USER_ID')

    if (!apiKey || !userId) {
      console.error('[send-alimtalk] 알림톡 API 키 미설정')
      return new Response(
        JSON.stringify({
          error: {
            http_code: 500,
            message: '알림톡 API 설정이 완료되지 않았습니다',
          },
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // ── 5. 루나소프트 API 호출 (카카오 알림톡 발송) ────────
    const result = await sendAlimtalk(localPhone, otp, apiKey, userId)

    if (!result.success) {
      console.error('[send-alimtalk] 발송 실패:', result.message)
      return new Response(
        JSON.stringify({
          error: {
            http_code: 500,
            message: result.message,
          },
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // ── 6. 성공 응답 ──────────────────────────────────────
    console.log(`[send-alimtalk] 발송 성공: phone=${localPhone}`)
    return new Response(
      JSON.stringify({ message: result.message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    console.error('[send-alimtalk] Error:', error)

    // Webhook 서명 검증 실패
    if ((error as Error).message?.includes('verification failed') ||
        (error as Error).message?.includes('signature')) {
      return new Response(
        JSON.stringify({
          error: {
            http_code: 401,
            message: 'Webhook 서명 검증 실패',
          },
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    return new Response(
      JSON.stringify({
        error: {
          http_code: 500,
          message: (error as Error).message ?? '알림톡 발송 중 서버 오류',
        },
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
