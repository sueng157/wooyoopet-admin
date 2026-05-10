-- ============================================================
-- SQL 54-4: Storage SELECT 정책 추가 (review-images)
-- ============================================================
-- 실행 방법: Supabase SQL Editor에 전체 복사하여 실행
-- 목적: review-images 버킷에 SELECT 정책이 누락되어
--        후기 이미지 업로드 시 400 에러 발생하는 문제 해결
-- 원인: pet-images, kindergarten-images와 동일한 문제
--        → Supabase Storage가 INSERT 시 내부적으로 SELECT를 수행하나
--          SELECT 정책이 없어 RLS 차단됨
-- 날짜: 2026-05-08
-- ============================================================
-- 기존 정책 현황:
--   review_images_insert_app  — INSERT ✅
--   review_images_update_app  — UPDATE ✅
--   review_images_delete_app  — DELETE ✅
--   review_images_select_app  — SELECT ❌ (누락)
-- ============================================================


-- ============================================================
-- STEP 1: review-images SELECT 정책 추가
-- ============================================================
CREATE POLICY "review_images_select_app" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'review-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
