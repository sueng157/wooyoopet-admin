-- ============================================================
-- SQL 54-2: Storage RLS 정책 추가 (member-images 버킷)
-- ============================================================
-- 실행 방법: Supabase SQL Editor에 전체 복사하여 실행
-- 목적: member-images 버킷에 RLS 정책이 전혀 없어 프로필 이미지
--        업로드/수정/삭제가 불가능한 문제 해결
-- 배경: 2026-05-04 외주개발자가 버킷을 재생성하면서 정책이 누락됨
--        앱 코드(updateProfile.tsx)에서 member-images/{auth.uid}/profile_*.jpg
--        경로로 업로드 시도하나 RLS 차단됨
-- 정책 패턴: pet-images, kindergarten-images와 동일
--        → auth.uid()::text = (storage.foldername(name))[1]
-- 날짜: 2026-05-08
-- ============================================================
-- 버킷 현황:
--   member-images — public, 5MB, [image/jpeg, image/png, image/webp]
--   기존 정책: 없음 (0개)
-- ============================================================


-- ============================================================
-- STEP 1: SELECT 정책
-- ============================================================
CREATE POLICY "member_images_select_app" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'member-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );


-- ============================================================
-- STEP 2: INSERT 정책
-- ============================================================
CREATE POLICY "member_images_insert_app" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'member-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );


-- ============================================================
-- STEP 3: UPDATE 정책
-- ============================================================
CREATE POLICY "member_images_update_app" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'member-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );


-- ============================================================
-- STEP 4: DELETE 정책
-- ============================================================
CREATE POLICY "member_images_delete_app" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'member-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );


-- ============================================================
-- 검증 쿼리 (실행 후 확인용 — 별도 실행)
-- ============================================================
-- SELECT
--   pol.polname AS policy_name,
--   CASE pol.polcmd
--     WHEN 'r' THEN 'SELECT'
--     WHEN 'a' THEN 'INSERT'
--     WHEN 'w' THEN 'UPDATE'
--     WHEN 'd' THEN 'DELETE'
--     WHEN '*' THEN 'ALL'
--   END AS operation,
--   pol.polpermissive AS is_permissive
-- FROM pg_policy pol
-- JOIN pg_class cls ON pol.polrelid = cls.oid
-- JOIN pg_namespace nsp ON cls.relnamespace = nsp.oid
-- WHERE nsp.nspname = 'storage'
--   AND cls.relname = 'objects'
--   AND (
--     pg_get_expr(pol.polqual, pol.polrelid) LIKE '%member-images%'
--     OR pg_get_expr(pol.polwithcheck, pol.polrelid) LIKE '%member-images%'
--   )
-- ORDER BY pol.polname;
