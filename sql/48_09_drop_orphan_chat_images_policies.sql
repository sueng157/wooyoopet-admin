-- ============================================================
-- 48_09: 버킷 없는 chat-images 잔여 정책 제거
-- 실행일: 2026-05-08
-- 목적: chat-images 버킷이 존재하지 않는데 storage.objects에
--       정책만 남아있는 상태 (외주개발자가 생성한 것으로 추정).
--       버킷 삭제 시 정책은 자동 삭제되지 않으므로 수동 제거.
--       (48_08과 동일한 패턴)
-- 참고: 채팅 파일 업로드는 chat-files 버킷을 사용 (43_02 설계 기준)
-- ============================================================

-- chat-images 관련 잔여 정책 2개 삭제
DROP POLICY IF EXISTS "chat_images_select" ON storage.objects;
DROP POLICY IF EXISTS "chat_images_upload" ON storage.objects;
