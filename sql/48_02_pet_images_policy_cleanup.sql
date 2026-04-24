-- ============================================
-- 48_02: pet-images Storage 정책 정리
-- 일시: 2026-04-24
-- 설명: 외주개발자가 추가한 pet-images 중복 정책 삭제
--   - 기존 pet_images_insert_app (본인 폴더 제한 O) 이 이미 존재하는데
--   - "Authenticated users can upload pet images" (본인 폴더 제한 X) 를 중복 추가하여
--   - RLS OR 조건으로 인해 기존 보안 정책이 무력화된 상태
--   - "Pet images are publicly readable" 도 기존 정책과 중복
-- 조치: 외주개발자 추가 정책 삭제 (기존 정책 유지)
-- 참고: 기존 정책 (43_02_app_storage_policies.sql)
--   - pet_images_insert_app: uid = foldername(name)[1]
--   - pet_images_update_app: uid = foldername(name)[1]
--   - pet_images_delete_app: uid = foldername(name)[1]
-- ============================================

-- 외주개발자가 추가한 중복 정책 삭제
DROP POLICY IF EXISTS "Authenticated users can upload pet images" ON storage.objects;
DROP POLICY IF EXISTS "Pet images are publicly readable" ON storage.objects;
