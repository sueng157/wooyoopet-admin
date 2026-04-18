// ============================================================
// _shared/supabase.ts — Supabase 클라이언트 팩토리
// ============================================================
// 용도: Edge Function 내부에서 사용하는 Supabase 클라이언트 생성
// 규칙: STEP4_WORK_PLAN.md §3-2
//
// 두 종류:
//   1. Admin 클라이언트: SUPABASE_SERVICE_ROLE_KEY 사용, RLS 무시
//      → send-push, send-alimtalk 등 서버 내부 처리용
//   2. User 클라이언트: SUPABASE_ANON_KEY + Authorization 헤더, RLS 적용
//      → 사용자 권한으로 데이터 접근 시 (현재 미사용, 향후 필요 시)
// ============================================================

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * 서비스 역할 클라이언트 (RLS 무시)
 *
 * 서버 내부 처리 전용:
 * - fcm_tokens 조회/삭제 (send-push)
 * - notifications INSERT (send-push)
 * - chat_messages INSERT (send-chat-message)
 * - reservations/payments UPDATE (inicis-callback, create-reservation)
 *
 * 주의: 앱에 SUPABASE_SERVICE_ROLE_KEY를 노출해서는 안 됨
 */
export function createAdminClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}

/**
 * 사용자 역할 클라이언트 (RLS 적용)
 *
 * 사용자 JWT를 포함하여 RLS 정책이 적용된 상태로 DB에 접근.
 * 사용자가 본인 데이터만 접근해야 하는 경우 사용.
 *
 * @param authHeader - 요청의 Authorization 헤더 값 ('Bearer xxx')
 */
export function createUserClient(authHeader: string): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
}
