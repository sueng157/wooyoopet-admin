-- ============================================================
-- PART 2: 통계 갱신
-- 
-- 실행 순서: 2번째 (인덱스 생성 직후 실행)
-- 
-- 목적: PostgreSQL 쿼리 플래너가 새로 생성된 인덱스를 인식하고
--       실행 계획에 반영하도록 테이블 통계를 갱신
-- ============================================================

ANALYZE admin_accounts;
ANALYZE chat_room_members;
ANALYZE kindergartens;
ANALYZE reservations;
ANALYZE chat_rooms;
ANALYZE chat_messages;
ANALYZE payments;
ANALYZE settlements;
ANALYZE refunds;
ANALYZE education_completions;
ANALYZE pets;
