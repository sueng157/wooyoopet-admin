-- ============================================
-- 48_04: 외주개발자 추가 중복 컬럼 삭제
-- 일시: 2026-04-24
-- 설명: 외주개발자가 추가한 address_verified, address_verify_image 컬럼 삭제
--   기존에 동일 용도의 컬럼이 이미 존재함:
--     - address_verified (boolean)  → 기존: address_auth_status (text, '미인증'/'승인')
--     - address_verify_image (text) → 기존: address_doc_urls (text[], 배열)
--   기존 컬럼에는 members → kindergartens 트리거 동기화(trg_sync_address_doc_urls)가
--   연결되어 있으므로 기존 컬럼을 사용해야 함
-- 주의: 외주개발자가 앱 코드에서 이 컬럼 참조 제거한 후 실행할 것
-- ============================================

ALTER TABLE kindergartens DROP COLUMN IF EXISTS address_verified;
ALTER TABLE kindergartens DROP COLUMN IF EXISTS address_verify_image;
ALTER TABLE members DROP COLUMN IF EXISTS address_verified;
ALTER TABLE members DROP COLUMN IF EXISTS address_verify_image;
