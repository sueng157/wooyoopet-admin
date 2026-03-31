-- ============================================================
-- SQL 20: 결제 타입 구분 및 위약금 결제 통합 마이그레이션
-- ============================================================
-- 실행 방법: Supabase SQL Editor에 전체 복사하여 실행
-- 목적:
--   1) payments 테이블에 payment_type 컬럼 추가 ('돌봄' / '위약금')
--   2) refunds 테이블에 penalty_payment_id FK 추가 (위약금 결제 건 참조)
--   3) 위약금 결제 테스트 데이터 1건 추가 (예약 #4, 50% 위약금)
--   4) 기존 refund #4 데이터 보정 + penalty_payment_id 연결
--      + 예약 #4 상태 변경 + 원 결제 상태 변경
--   5) payments.payment_type 인덱스 추가
--   6) settlements.transaction_type 값 통일 ('돌봄결제' → '돌봄')
--   7) 검증 쿼리
-- 
-- 배경:
--   실제 서비스 로직: 보호자가 예약 취소 시 위약금을 PG사를 통해 별도 결제
--   → 기존 돌봄비 결제 건은 전액 환불
--   기존 DB: payments에는 돌봄비만 존재, 위약금은 refunds의 속성으로만 기록
--   변경 후: 위약금 결제도 payments 테이블에 독립 건으로 저장
--
-- 참고: payment_refactoring_plan.md 섹션 6 (테스트 데이터 시나리오) 참조
--
-- 의존: 기존 payments, refunds 테이블이 존재해야 함
-- 주의: 기존 컬럼(penalty_tx_id, penalty_payment_method 등)은 삭제하지 않음
--        (모바일 앱 참조 가능성, 전체 작업 완료 후 별도 정리 예정)
--
-- 최종 기대 데이터: payments 12건 (돌봄 11 + 위약금 1), refunds 5건
-- ============================================================


-- ============================================================
-- STEP 1: payments 테이블에 payment_type 컬럼 추가
-- ============================================================
-- '돌봄': 돌봄 서비스 이용료 결제 (기존 모든 결제 건)
-- '위약금': 예약 취소 시 위약금 별도 결제
-- DEFAULT '돌봄'으로 기존 데이터 자동 분류

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS payment_type text NOT NULL DEFAULT '돌봄';

ALTER TABLE payments
  ADD CONSTRAINT payments_payment_type_check
  CHECK (payment_type IN ('돌봄', '위약금'));

COMMENT ON COLUMN payments.payment_type IS '결제 타입: 돌봄(서비스 이용료), 위약금(예약 취소 위약금). 향후 훈련, 구독 등 확장 가능';

-- fee 컬럼 NOT NULL 제약 제거 (위약금 결제 시 fee = NULL "해당 없음")
-- 기존 돌봄 결제 데이터는 fee가 0 이상이므로 영향 없음
ALTER TABLE payments ALTER COLUMN care_fee DROP NOT NULL;
ALTER TABLE payments ALTER COLUMN walk_fee DROP NOT NULL;
ALTER TABLE payments ALTER COLUMN pickup_fee DROP NOT NULL;

-- 돌봄 결제일 때만 fee NOT NULL 강제 (조건부 CHECK)
-- 위약금 결제는 fee = NULL 허용, 돌봄 결제는 fee 필수
ALTER TABLE payments ADD CONSTRAINT payments_care_fee_required
  CHECK (payment_type = '위약금' OR care_fee IS NOT NULL);
ALTER TABLE payments ADD CONSTRAINT payments_walk_fee_required
  CHECK (payment_type = '위약금' OR walk_fee IS NOT NULL);
ALTER TABLE payments ADD CONSTRAINT payments_pickup_fee_required
  CHECK (payment_type = '위약금' OR pickup_fee IS NOT NULL);


-- ============================================================
-- STEP 2: refunds 테이블에 penalty_payment_id FK 추가
-- ============================================================
-- 위약금 결제가 발생한 경우 해당 결제 건(payments.id)을 참조
-- 위약금 0원(전액 환불)인 경우 NULL

ALTER TABLE refunds
  ADD COLUMN IF NOT EXISTS penalty_payment_id uuid REFERENCES payments(id);

COMMENT ON COLUMN refunds.penalty_payment_id IS '위약금 결제 건 FK → payments.id. 위약금 0원이면 NULL';


-- ============================================================
-- STEP 3: 위약금 결제 테스트 데이터 추가 (payments 1건)
-- ============================================================
-- 시나리오: 보호자(박준혁)가 예약 #4를 등원 48시간 전 취소
--   → 규정 2 적용: 50% 위약금 = 72,500원
--   → 위약금을 PG사를 통해 별도 결제
--   → 기존 돌봄비 145,000원 전액 환불
-- (참고: payment_refactoring_plan.md 섹션 6 위약금 발생 시나리오)

-- 위약금 결제 건: refund #4에 대한 위약금 (72,500원)
INSERT INTO payments (
  id, member_id, kindergarten_id, pet_id, reservation_id,
  pg_transaction_id, approval_number, submall_id,
  amount, care_fee, walk_fee, pickup_fee,
  payment_method, card_company, card_number,
  status, paid_at, created_at, payment_type
) VALUES (
  'f0f0f0f0-0012-4000-a000-000000000012',
  'd0d0d0d0-0003-4000-a000-000000000003',  -- 동일 회원 (박준혁)
  'b0b0b0b0-0002-4000-a000-000000000002',  -- 동일 유치원 (해피독)
  'c0c0c0c0-0004-4000-a000-000000000004',  -- 동일 반려동물 (초코)
  'e0e0e0e0-0004-4000-a000-000000000004',  -- 동일 예약
  'PG20260326100501', 'AP012001', 'wooyoo2',
  72500, NULL, NULL, NULL,                   -- 위약금: fee 필드는 NULL (absent)
  '신용카드', '신한카드', '1234-****-****-3456',
  '결제완료',
  '2026-03-26 10:05:00+09',                 -- 위약금 결제 시각 (환불 요청 5분 후)
  '2026-03-26 10:05:00+09',
  '위약금'                                   -- payment_type
);


-- ============================================================
-- STEP 4: refund #4 데이터 보정 + 예약/결제 상태 변경
-- ============================================================
-- 기존 refund #4는 옛 로직(관리자 직권, 50% 환불) 기준이었음
-- 새 로직: 보호자 취소, 위약금 별도 결제, 돌봄비 전액 환불
-- (참고: payment_refactoring_plan.md 섹션 6)

-- 4-1. refund #4 데이터 보정 및 penalty_payment_id 연결
-- UPDATE 먼저 시도 → 해당 건이 없으면 INSERT (기존 DB에 refund #4가 없는 경우 대비)
DO $$
BEGIN
  UPDATE refunds
  SET
    requester = '보호자',
    cancel_reason = '개인 사정으로 취소합니다',
    applied_rule = '24~72시간 전 취소 – 위약금 50%',
    refund_rate = 100,
    refund_amount = 145000,
    status = '환불완료',
    completed_at = '2026-03-26 10:10:00+09',
    pg_refund_tx_id = 'RF20260326100001',
    penalty_payment_status = '결제완료',
    penalty_payment_id = 'f0f0f0f0-0012-4000-a000-000000000012'
  WHERE id = '11111111-0004-4000-a000-000000000004';

  IF NOT FOUND THEN
    INSERT INTO refunds (
      id, payment_id, reservation_id, member_id, kindergarten_id,
      requester, cancel_reason, requested_at, hours_before_checkin,
      applied_rule, original_amount, refund_rate, refund_amount,
      penalty_rate, penalty_amount, status, completed_at,
      pg_refund_tx_id, refund_method, penalty_payment_status,
      penalty_payment_id, created_at
    ) VALUES (
      '11111111-0004-4000-a000-000000000004',
      'f0f0f0f0-0004-4000-a000-000000000004',
      'e0e0e0e0-0004-4000-a000-000000000004',
      'd0d0d0d0-0003-4000-a000-000000000003',
      'b0b0b0b0-0002-4000-a000-000000000002',
      '보호자', '개인 사정으로 취소합니다',
      '2026-03-26 10:00:00+09', 48.0,
      '24~72시간 전 취소 – 위약금 50%',
      145000, 100, 145000, 50, 72500,
      '환불완료', '2026-03-26 10:10:00+09',
      'RF20260326100001', '신한카드', '결제완료',
      'f0f0f0f0-0012-4000-a000-000000000012',
      '2026-03-26 10:00:00+09'
    );
    RAISE NOTICE 'refund #4 not found — INSERT executed';
  END IF;
END $$;

-- 4-2. 원 결제 f0f0f0f0-0004 상태 변경: '결제완료' → '결제취소'
UPDATE payments
SET status = '결제취소'
WHERE id = 'f0f0f0f0-0004-4000-a000-000000000004';

-- 4-3. 예약 e0e0e0e0-0004 상태 변경: '수락대기' → '보호자취소'
-- (실제 흐름: 수락대기 → 예약확정 → 보호자취소이나, 최종 상태만 반영)
UPDATE reservations
SET status = '보호자취소'
WHERE id = 'e0e0e0e0-0004-4000-a000-000000000004';

-- 4-4. 예약 #4의 reservation_status_logs 추가 (2건)
INSERT INTO reservation_status_logs (reservation_id, prev_status, new_status, changed_by, note, created_at) VALUES
('e0e0e0e0-0004-4000-a000-000000000004', '수락대기', '예약확정', '해피독', '유치원 수락', '2026-03-25 20:00:00+09'),
('e0e0e0e0-0004-4000-a000-000000000004', '예약확정', '보호자취소', '박준혁', '보호자 취소 (위약금 50%)', '2026-03-26 10:00:00+09');


-- ============================================================
-- STEP 5: payments.payment_type 인덱스 추가
-- ============================================================
-- search_payments, get_dashboard_monthly_sales 등에서 payment_type 필터 사용

CREATE INDEX IF NOT EXISTS idx_payments_payment_type
  ON payments (payment_type);

CREATE INDEX IF NOT EXISTS idx_payments_type_status_paid
  ON payments (payment_type, status, paid_at);

CREATE INDEX IF NOT EXISTS idx_refunds_penalty_payment_id
  ON refunds (penalty_payment_id)
  WHERE penalty_payment_id IS NOT NULL;


-- ============================================================
-- STEP 6: settlements.transaction_type 값 통일
-- ============================================================
-- 기존 '돌봄결제' → '돌봄'으로 변경 (payment_type과 동일한 명명 체계)
-- '위약금'은 이미 동일하므로 변경 불필요
-- 주의: CHECK 제약이 있으면 먼저 수정 필요

-- 기존 CHECK 제약 삭제 (존재할 경우)
DO $$
BEGIN
  ALTER TABLE settlements DROP CONSTRAINT IF EXISTS settlements_transaction_type_check;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

-- 데이터 변경
UPDATE settlements SET transaction_type = '돌봄' WHERE transaction_type = '돌봄결제';

-- 새 CHECK 제약 추가
ALTER TABLE settlements ADD CONSTRAINT settlements_transaction_type_check
  CHECK (transaction_type IN ('돌봄', '위약금'));

COMMENT ON COLUMN settlements.transaction_type IS '거래 유형: 돌봄(서비스 이용료), 위약금(예약 취소 위약금)';


-- ============================================================
-- STEP 7: 검증 쿼리
-- ============================================================
-- 실행 후 아래 쿼리로 결과 확인

-- 7-1. payment_type별 건수 확인
-- SELECT payment_type, COUNT(*), SUM(amount) 
-- FROM payments GROUP BY payment_type;
-- 예상: 돌봄 11건, 위약금 1건

-- 7-2. 위약금 결제와 refund 연결 확인
-- SELECT r.id AS refund_id, r.penalty_amount, r.penalty_payment_id, 
--        pp.id AS penalty_pay_id, pp.amount AS penalty_pay_amount, pp.payment_type
-- FROM refunds r
-- LEFT JOIN payments pp ON pp.id = r.penalty_payment_id
-- WHERE r.penalty_amount > 0;
-- 예상: 1건 (refund #4) penalty_payment_id로 payments JOIN 가능

-- 7-3. 동일 예약에 돌봄비+위약금 2건 존재 확인
-- SELECT reservation_id, payment_type, amount, status
-- FROM payments
-- WHERE reservation_id = 'e0e0e0e0-0004-4000-a000-000000000004'
-- ORDER BY payment_type;
-- 예상: 돌봄 1건 (결제취소) + 위약금 1건 (결제완료) = 총 2건

-- 7-4. settlements.transaction_type 변경 확인
-- SELECT transaction_type, COUNT(*)
-- FROM settlements GROUP BY transaction_type;
-- 예상: '돌봄' 4건 (기존 '돌봄결제' → '돌봄')

-- 7-5. 인덱스 생성 확인
-- SELECT indexname FROM pg_indexes WHERE tablename = 'payments' AND indexname LIKE 'idx_payments%';
-- 예상: idx_payments_payment_type, idx_payments_type_status_paid

-- 7-6. 노쇼 건 확인 (위약금/환불 없음, 결제완료 유지)
-- SELECT p.id, p.amount, p.status, p.payment_type, r.status AS reservation_status
-- FROM payments p
-- JOIN reservations r ON r.id = p.reservation_id
-- WHERE p.reservation_id = 'e0e0e0e0-0007-4000-a000-000000000007';
-- 예상: 돌봄 1건, 결제완료, 예약 상태 = '노쇼'
