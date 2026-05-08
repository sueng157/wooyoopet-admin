-- ============================================================
-- SQL 54-3: profile-images 버킷 RLS 정책 삭제
-- ============================================================
-- 실행 방법: Supabase SQL Editor에 전체 복사하여 실행
-- 목적: 앱이 member-images 버킷을 사용하도록 전환 완료되었으므로
--        더 이상 사용하지 않는 profile-images RLS 정책 제거
-- 배경: 기존 profile-images 버킷은 43_02에서 생성되었으나,
--        앱 소스코드가 member-images 버킷을 사용하도록 변경됨
--        54_02에서 member-images 정책 추가 완료 → profile-images 불필요
-- 날짜: 2026-05-08
-- ============================================================
-- 삭제 대상 정책 (43_02_app_storage_policies.sql에서 생성된 것):
--   profile_images_insert_app — INSERT
--   profile_images_update_app — UPDATE
--   profile_images_delete_app — DELETE
-- ============================================================
-- ⚠️ 버킷 삭제는 SQL로 불가 (storage.protect_delete() 트리거 차단)
--    → Supabase 대시보드 → Storage → profile-images → Delete bucket
--      (파일이 남아있으면 파일 먼저 수동 삭제 후 버킷 삭제)
-- ============================================================


-- ============================================================
-- STEP 1: RLS 정책 삭제
-- ============================================================
DROP POLICY IF EXISTS "profile_images_insert_app" ON storage.objects;
DROP POLICY IF EXISTS "profile_images_update_app" ON storage.objects;
DROP POLICY IF EXISTS "profile_images_delete_app" ON storage.objects;
