-- ============================================
-- 48_03: member-images Storage 정책 정리
-- 일시: 2026-04-24
-- 설명: 외주개발자가 추가한 member-images 정책을 삭제하고
--   기존 컨벤션({버킷}_insert_app 등)에 맞는 정책으로 교체
--   - INSERT에 본인 폴더 제한 없었음 → uid = foldername(name)[1] 추가
--   - DELETE 정책 누락 → 추가
-- 참고: 업로드 경로는 member-images/{auth.uid()}/파일명 형태여야 함
-- ============================================

-- ============================================
-- 1단계: 외주개발자가 추가한 정책 삭제
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can upload member images" ON storage.objects;
DROP POLICY IF EXISTS "Member images are publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "Members can update their own images" ON storage.objects;

-- ============================================
-- 2단계: 기존 컨벤션에 맞는 정책 생성
-- ============================================

-- INSERT: 본인 폴더에만 업로드 가능
CREATE POLICY "member_images_insert_app"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'member-images'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

-- SELECT: 공개 조회 (public 버킷)
CREATE POLICY "member_images_select_app"
ON storage.objects FOR SELECT
USING (bucket_id = 'member-images');

-- UPDATE: 본인 폴더만 수정 가능
CREATE POLICY "member_images_update_app"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'member-images'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

-- DELETE: 본인 폴더만 삭제 가능
CREATE POLICY "member_images_delete_app"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'member-images'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);
