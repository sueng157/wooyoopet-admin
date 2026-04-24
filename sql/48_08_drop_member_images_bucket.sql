-- ============================================================
-- 48_08: member-images 버킷 삭제에 따른 잔여 정책 제거
-- 실행일: 2026-04-24
-- 목적: 외주개발자가 생성한 member-images 버킷이 기존 profile-images 버킷과
--       동일 용도(보호자 프로필 사진)로 중복 생성된 것이 확인되어 삭제.
--       버킷은 Supabase Dashboard에서 직접 삭제 완료.
--       (SQL로 storage.buckets DELETE 시 protect_delete() 제약으로 불가)
--       버킷 삭제 후에도 storage.objects에 걸린 정책은 자동 삭제되지 않으므로
--       아래 SQL로 잔여 정책을 수동 제거.
--       프로필 사진 업로드는 기존 profile-images 버킷 사용.
--       경로: profile-images/{auth.uid()}/파일명
-- ============================================================

-- member-images 관련 정책 4개 삭제 (48_03에서 생성한 정책)
DROP POLICY IF EXISTS "member_images_insert_app" ON storage.objects;
DROP POLICY IF EXISTS "member_images_select_app" ON storage.objects;
DROP POLICY IF EXISTS "member_images_update_app" ON storage.objects;
DROP POLICY IF EXISTS "member_images_delete_app" ON storage.objects;
