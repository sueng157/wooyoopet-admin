-- ============================================
-- 48_06: 외주개발자 추가 신규 RLS 정책 네이밍 정리
-- 일시: 2026-04-24
-- 설명: 외주개발자가 추가한 정책 중 기존에 없던 것(=필요한 정책)을
--   기존 네이밍 컨벤션({테이블명}_{동작}_app)에 맞게 교체
--
-- [대상]
--   "users can insert own profile" (members INSERT)
--     → members_insert_app — WITH CHECK (id = auth.uid())
--     → 본인 회원 프로필 최초 등록용 (앱 회원가입 시 Supabase Auth 생성 후 members row INSERT)
--     → 기존 43_01에 members SELECT/UPDATE만 있고 INSERT가 없었음
--
--   "Users can delete own pets" (pets DELETE)
--     → pets_delete_app — USING (member_id = auth.uid())
--     → 본인 반려동물 삭제용
--     → 기존 43_01에 pets SELECT/INSERT/UPDATE만 있고 DELETE가 없었음
--
-- 참고: 기존 네이밍 컨벤션 (43_01_app_rls_policies.sql)
--   members_select_app, members_update_app
--   pets_select_app, pets_insert_app, pets_update_app
-- ============================================

-- 1. members INSERT: 네이밍 교체
DROP POLICY IF EXISTS "users can insert own profile" ON public.members;
CREATE POLICY "members_insert_app" ON public.members
  FOR INSERT
  WITH CHECK (id = auth.uid());

-- 2. pets DELETE: 네이밍 교체
DROP POLICY IF EXISTS "Users can delete own pets" ON public.pets;
CREATE POLICY "pets_delete_app" ON public.pets
  FOR DELETE
  USING (member_id = auth.uid());
