-- ============================================================
-- SQL 54-1: Storage SELECT 정책 추가 (pet-images, kindergarten-images)
-- ============================================================
-- 실행 방법: Supabase SQL Editor에 전체 복사하여 실행
-- 목적: 앱에서 이미지 업로드 시 Supabase Storage 내부적으로
--        SELECT 권한이 필요하나 해당 정책이 누락되어 업로드 실패 (400/403)
-- 원인: INSERT/UPDATE/DELETE 정책만 존재하고 SELECT 정책이 없음
--        → upload 시 Supabase가 중복 확인 등을 위해 SELECT를 수행하나
--          RLS에 의해 차단되어 "new row violates row-level security policy" 발생
-- 영향 버킷: pet-images, kindergarten-images
-- 날짜: 2026-05-08
-- ============================================================
-- 기존 정책 현황 (pg_policy 조회 결과):
--   pet_images_insert_app  — INSERT ✅
--   pet_images_update_app  — UPDATE ✅
--   pet_images_delete_app  — DELETE ✅
--   pet_images_select_app  — SELECT ❌ (누락)
--   kindergarten_images_insert_app  — INSERT ✅
--   kindergarten_images_update_app  — UPDATE ✅
--   kindergarten_images_delete_app  — DELETE ✅
--   kindergarten_images_select_app  — SELECT ❌ (누락)
-- ============================================================
-- 조건: auth.uid()::text = (storage.foldername(name))[1]
--   → 본인 폴더(uid)의 파일만 조회 가능 (기존 INSERT/UPDATE/DELETE와 동일 패턴)
-- ============================================================


-- ============================================================
-- STEP 1: pet-images SELECT 정책 추가
-- ============================================================
CREATE POLICY "pet_images_select_app" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'pet-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );


-- ============================================================
-- STEP 2: kindergarten-images SELECT 정책 추가
-- ============================================================
CREATE POLICY "kindergarten_images_select_app" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'kindergarten-images'
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
--   pol.polpermissive AS is_permissive,
--   pg_get_expr(pol.polqual, pol.polrelid) AS using_expr,
--   pg_get_expr(pol.polwithcheck, pol.polrelid) AS with_check_expr
-- FROM pg_policy pol
-- JOIN pg_class cls ON pol.polrelid = cls.oid
-- JOIN pg_namespace nsp ON cls.relnamespace = nsp.oid
-- WHERE nsp.nspname = 'storage'
--   AND cls.relname = 'objects'
--   AND (
--     pg_get_expr(pol.polqual, pol.polrelid) LIKE '%pet-images%'
--     OR pg_get_expr(pol.polwithcheck, pol.polrelid) LIKE '%pet-images%'
--     OR pg_get_expr(pol.polqual, pol.polrelid) LIKE '%kindergarten-images%'
--     OR pg_get_expr(pol.polwithcheck, pol.polrelid) LIKE '%kindergarten-images%'
--   )
-- ORDER BY pol.polname;
