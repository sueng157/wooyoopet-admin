-- ============================================================
-- SQL 43-2: Storage 버킷 생성 + 앱/관리자 Storage RLS 정책
-- ============================================================
-- 실행 방법: Supabase SQL Editor에 전체 복사하여 실행
-- 목적: 모바일 앱에서 사용하는 이미지/파일 업로드용 Storage 버킷 생성
--        및 버킷별 접근 정책 설정
-- 참조: MIGRATION_PLAN.md 섹션 6-3, TECH_DECISION.md 2-1
-- 전제: members.id = auth.uid() (Supabase Auth uid)
-- ============================================================
-- 기존 Storage 현황 (이 파일에서 변경하지 않는 버킷):
--   education-images — 교육 이미지 (정책 교체만 수행)
--   banner-images    — 배너 이미지 (변경 없음)
--   notice-attachments — 공지 첨부 (변경 없음)
-- ============================================================
-- 매니저 검토 반영:
--   수정3: education-images 기존 public 정책 → is_admin() 정책으로 교체
-- ============================================================
-- 경로 규칙:
--   profile-images/{member_id}/avatar.jpg
--   pet-images/{member_id}/{pet_id}/1.jpg ~ 10.jpg
--   kindergarten-images/{member_id}/{kindergarten_id}/1.jpg ~ 10.jpg
--   chat-files/{chat_room_id}/{message_id}/file.jpg
--   review-images/{member_id}/{review_id}/1.jpg
--   address-docs/{member_id}/doc1.jpg
-- ============================================================


-- ============================================================
-- STEP 1: education-images 기존 정책 교체 (수정3)
-- ============================================================
-- sql/34_education_images_storage_rls.sql에서 설정된 public 정책이
-- 보안 취약 → 관리자(is_admin)만 업로드/삭제로 변경

DROP POLICY IF EXISTS "Allow public upload to education-images" ON storage.objects;
DROP POLICY IF EXISTS "Allow public delete from education-images" ON storage.objects;

CREATE POLICY "education_images_insert_admin" ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'education-images' AND public.is_admin());

CREATE POLICY "education_images_delete_admin" ON storage.objects
  FOR DELETE
  USING (bucket_id = 'education-images' AND public.is_admin());


-- ============================================================
-- STEP 2: 신규 버킷 생성 (6개)
-- ============================================================
-- INSERT INTO storage.buckets는 Supabase 내부 API로도 가능하지만,
-- SQL로 직접 생성하면 마이그레이션 재현성이 높음

-- 2-1. profile-images (public — URL 공개 필요)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('profile-images', 'profile-images', true, 5242880, -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- 2-2. pet-images (public)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('pet-images', 'pet-images', true, 5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- 2-3. kindergarten-images (public)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('kindergarten-images', 'kindergarten-images', true, 5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- 2-4. chat-files (private — 채팅방 참여자만 접근)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('chat-files', 'chat-files', false, 10485760, -- 10MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif',
        'application/pdf', 'video/mp4'])
ON CONFLICT (id) DO NOTHING;

-- 2-5. review-images (public)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('review-images', 'review-images', true, 5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- 2-6. address-docs (private — 본인+관리자만 접근)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('address-docs', 'address-docs', false, 10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- STEP 3: profile-images 정책 (public 버킷)
-- ============================================================
-- 경로: profile-images/{member_id}/avatar.jpg
-- SELECT: public 버킷이므로 URL로 직접 접근 (정책 불필요)
-- INSERT/UPDATE/DELETE: 자기 폴더만

DROP POLICY IF EXISTS "profile_images_insert_app" ON storage.objects;
DROP POLICY IF EXISTS "profile_images_update_app" ON storage.objects;
DROP POLICY IF EXISTS "profile_images_delete_app" ON storage.objects;

CREATE POLICY "profile_images_insert_app" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'profile-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "profile_images_update_app" ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'profile-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "profile_images_delete_app" ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'profile-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );


-- ============================================================
-- STEP 4: pet-images 정책 (public 버킷)
-- ============================================================
-- 경로: pet-images/{member_id}/{pet_id}/1.jpg

DROP POLICY IF EXISTS "pet_images_insert_app" ON storage.objects;
DROP POLICY IF EXISTS "pet_images_update_app" ON storage.objects;
DROP POLICY IF EXISTS "pet_images_delete_app" ON storage.objects;

CREATE POLICY "pet_images_insert_app" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'pet-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "pet_images_update_app" ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'pet-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "pet_images_delete_app" ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'pet-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );


-- ============================================================
-- STEP 5: kindergarten-images 정책 (public 버킷)
-- ============================================================
-- 경로: kindergarten-images/{member_id}/{kindergarten_id}/1.jpg

DROP POLICY IF EXISTS "kindergarten_images_insert_app" ON storage.objects;
DROP POLICY IF EXISTS "kindergarten_images_update_app" ON storage.objects;
DROP POLICY IF EXISTS "kindergarten_images_delete_app" ON storage.objects;

CREATE POLICY "kindergarten_images_insert_app" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'kindergarten-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "kindergarten_images_update_app" ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'kindergarten-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "kindergarten_images_delete_app" ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'kindergarten-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );


-- ============================================================
-- STEP 6: review-images 정책 (public 버킷)
-- ============================================================
-- 경로: review-images/{member_id}/{review_id}/1.jpg

DROP POLICY IF EXISTS "review_images_insert_app" ON storage.objects;
DROP POLICY IF EXISTS "review_images_update_app" ON storage.objects;
DROP POLICY IF EXISTS "review_images_delete_app" ON storage.objects;

CREATE POLICY "review_images_insert_app" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'review-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "review_images_update_app" ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'review-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "review_images_delete_app" ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'review-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );


-- ============================================================
-- STEP 7: chat-files 정책 (private 버킷)
-- ============================================================
-- 경로: chat-files/{chat_room_id}/{message_id}/file.jpg
-- SELECT: 채팅방 참여자만 다운로드
-- INSERT: 채팅방 참여자만 업로드
-- DELETE: 관리자만

DROP POLICY IF EXISTS "chat_files_select_app" ON storage.objects;
DROP POLICY IF EXISTS "chat_files_insert_app" ON storage.objects;
DROP POLICY IF EXISTS "chat_files_delete_admin" ON storage.objects;

CREATE POLICY "chat_files_select_app" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'chat-files'
    AND EXISTS (
      SELECT 1 FROM chat_room_members
      WHERE chat_room_id = (storage.foldername(name))[1]::uuid
        AND member_id = auth.uid()
    )
  );

CREATE POLICY "chat_files_insert_app" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'chat-files'
    AND EXISTS (
      SELECT 1 FROM chat_room_members
      WHERE chat_room_id = (storage.foldername(name))[1]::uuid
        AND member_id = auth.uid()
    )
  );

CREATE POLICY "chat_files_delete_admin" ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'chat-files'
    AND public.is_admin()
  );


-- ============================================================
-- STEP 8: address-docs 정책 (private 버킷)
-- ============================================================
-- 경로: address-docs/{member_id}/doc1.jpg
-- SELECT: 본인 + 관리자
-- INSERT: 본인만
-- DELETE: 본인 + 관리자

DROP POLICY IF EXISTS "address_docs_select_app" ON storage.objects;
DROP POLICY IF EXISTS "address_docs_insert_app" ON storage.objects;
DROP POLICY IF EXISTS "address_docs_delete_app" ON storage.objects;

CREATE POLICY "address_docs_select_app" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'address-docs'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR public.is_admin()
    )
  );

CREATE POLICY "address_docs_insert_app" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'address-docs'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "address_docs_delete_app" ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'address-docs'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR public.is_admin()
    )
  );


-- ============================================================
-- 완료 알림
-- ============================================================

DO $$
DECLARE
  v_bucket_count bigint;
  v_policy_count bigint;
BEGIN
  SELECT COUNT(*) INTO v_bucket_count
  FROM storage.buckets
  WHERE id IN ('profile-images', 'pet-images', 'kindergarten-images',
               'chat-files', 'review-images', 'address-docs');

  SELECT COUNT(*) INTO v_policy_count
  FROM pg_policies
  WHERE tablename = 'objects'
    AND schemaname = 'storage';

  RAISE NOTICE '[43-2] Storage 버킷 %개 생성 + Storage 정책 %개 활성 완료', v_bucket_count, v_policy_count;
END $$;
