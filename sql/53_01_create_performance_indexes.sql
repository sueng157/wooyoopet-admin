-- ============================================================
-- PART 1: 핵심 인덱스 생성
-- 
-- 실행 순서: 1번째 (가장 먼저 실행)
-- 
-- 배경:
--   - is_admin() 함수가 admin_accounts.auth_user_id를 조회하지만 인덱스 없음 → Seq Scan 84,145회
--   - 예약/결제 RLS에서 kindergartens.member_id를 조회하지만 인덱스 없음 → Seq Scan 26,028회
--   - reservations, pets 테이블도 member_id 인덱스 없음
--
-- 참고:
--   - chat_room_members(chat_room_id, member_id)는 UNIQUE constraint가 이미 존재하여 별도 인덱스 불필요
--   - IF NOT EXISTS 사용으로 중복 실행해도 안전
-- ============================================================

-- [1] is_admin() / is_superadmin() 최적화
-- 30개+ 테이블 RLS에서 호출되며, 매번 admin_accounts 풀스캔 유발
CREATE INDEX IF NOT EXISTS idx_admin_accounts_auth_user_id 
ON admin_accounts(auth_user_id);

-- [2] 예약/결제/정산/환불 RLS 서브쿼리 최적화
-- IN(SELECT id FROM kindergartens WHERE member_id=auth.uid()) 패턴에서 사용
CREATE INDEX IF NOT EXISTS idx_kindergartens_member_id 
ON kindergartens(member_id);

-- [3] reservations RLS 및 앱 쿼리 최적화
-- member_id = auth.uid() 조건과 kindergarten_id IN (...) 조건 모두 사용
CREATE INDEX IF NOT EXISTS idx_reservations_member_id 
ON reservations(member_id);

CREATE INDEX IF NOT EXISTS idx_reservations_kindergarten_id 
ON reservations(kindergarten_id);

-- [4] pets RLS 최적화
-- pets_select_app, pets_update_app 등에서 member_id = auth.uid() 사용
CREATE INDEX IF NOT EXISTS idx_pets_member_id 
ON pets(member_id);
