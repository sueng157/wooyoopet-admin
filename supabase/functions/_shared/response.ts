// ============================================================
// _shared/response.ts — Edge Function 공통 응답 포맷
// ============================================================
// 용도: 모든 Edge Function에서 사용하는 CORS 헤더 및 JSON 응답 헬퍼
// 규칙: STEP4_WORK_PLAN.md §3-2, §3-5 (응답 형식 통일)
//
// 성공 응답: { success: true, data: { ... } }
// 에러 응답: { success: false, error: "메시지" }
// ============================================================

/**
 * CORS 헤더 — 모든 응답에 포함
 * Supabase Edge Functions는 브라우저에서 직접 호출될 수 있으므로 CORS 필요
 */
export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

/**
 * 성공 JSON 응답
 * @param data - 응답 데이터 (success: true가 자동 추가됨)
 * @param status - HTTP 상태 코드 (기본 200)
 *
 * @example
 * return jsonResponse({ success: true, data: { sent_count: 3 } })
 */
export function jsonResponse(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

/**
 * 에러 JSON 응답
 * @param message - 에러 메시지 (한글)
 * @param status - HTTP 상태 코드 (기본 400)
 *
 * @example
 * return errorResponse('인증이 필요합니다', 401)
 */
export function errorResponse(message: string, status = 400): Response {
  return new Response(
    JSON.stringify({ success: false, error: message }),
    {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    },
  )
}
