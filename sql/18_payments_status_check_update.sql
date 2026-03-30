-- ============================================================
-- SQL 18: 결제 상태 CHECK 제약 변경
-- ============================================================
-- 실행 방법: Supabase SQL Editor에 전체 복사하여 실행
-- 목적: payments.status 허용 값을 결제완료/결제취소 2개로 정리
-- 사유: 부분취소는 현재 환불/위약금 로직상 발생하지 않는 구조
--       (위약금은 별도 결제 건으로 처리, 기존 결제 건은 전액 취소)
-- ============================================================

-- 기존 CHECK 제약 삭제
ALTER TABLE payments DROP CONSTRAINT payments_status_check;

-- 기존 '취소완료' 데이터를 '결제취소'로 일괄 변경
UPDATE payments SET status = '결제취소' WHERE status = '취소완료';

-- 새 CHECK 제약 추가 (결제완료, 결제취소 2개만 허용)
ALTER TABLE payments ADD CONSTRAINT payments_status_check
  CHECK (status IN ('결제완료', '결제취소'));
