-- ============================================
-- 48_05: 외주개발자 추가 중복 RLS 정책 삭제
-- 일시: 2026-04-24
-- 설명: 외주개발자가 추가한 테이블 RLS 정책 중 기존 정책(43_01)과 중복되는 것 삭제
--   조건이 동일하여 보안 문제는 없으나, 중복 관리 방지를 위해 정리
--
-- [삭제 대상 → 기존 정책 매핑]
--
--   "Users can select own member" (members SELECT)
--     → 기존: members_select_app — USING (id = auth.uid())
--
--   "Users can update own member" (members UPDATE)
--     → 기존: members_update_app — USING (id = auth.uid()) WITH CHECK (id = auth.uid())
--
--   "Users can select own pets" (pets SELECT)
--     → 기존: pets_select_app — USING (member_id = auth.uid())
--
--   "Users can update own pets" (pets UPDATE)
--     → 기존: pets_update_app — USING (member_id = auth.uid()) WITH CHECK (member_id = auth.uid())
--
-- 참고: 기존 정책은 43_01_app_rls_policies.sql 에서 생성됨
-- ============================================

DROP POLICY IF EXISTS "Users can select own member" ON public.members;
DROP POLICY IF EXISTS "Users can update own member" ON public.members;
DROP POLICY IF EXISTS "Users can select own pets" ON public.pets;
DROP POLICY IF EXISTS "Users can update own pets" ON public.pets;
