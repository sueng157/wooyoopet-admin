-- ============================================================
-- SQL 22: Phase A-1 검증 쿼리
-- ============================================================
-- 실행 방법: Supabase SQL Editor에서 각 블록을 선택하여 실행
-- 실행 순서: SQL 20 → SQL 21 실행 후 이 파일로 검증
--            (신규 환경: SQL 10 → SQL 21 실행 후 이 파일)
-- 목적: payment_type 마이그레이션 및 RPC 업데이트 결과 확인
--
-- 최종 기대값 기준:
--   payments: 12건 (돌봄 11 + 위약금 1)
--   refunds: 5건 (위약금 없음 3 + 위약금50% 1 + 전액환불 1)
--   settlements: 4건 (모두 '돌봄')
-- ============================================================


-- ============================================================
-- 1. 스키마 검증 — payments 테이블 컬럼 확인
-- ============================================================
-- 기대: payment_type 컬럼이 NOT NULL, DEFAULT '돌봄'으로 존재
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'payments' AND column_name = 'payment_type';


-- ============================================================
-- 2. 스키마 검증 — refunds 테이블 penalty_payment_id 확인
-- ============================================================
-- 기대: penalty_payment_id 컬럼이 uuid 타입으로 존재 (nullable)
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'refunds' AND column_name = 'penalty_payment_id';


-- ============================================================
-- 3. CHECK 제약 확인 — payments.payment_type
-- ============================================================
-- 기대: payments_payment_type_check 제약이 존재
SELECT conname, pg_get_constraintdef(oid) AS constraint_def
FROM pg_constraint
WHERE conrelid = 'payments'::regclass
  AND conname LIKE '%payment_type%';


-- ============================================================
-- 4. CHECK 제약 확인 — settlements.transaction_type
-- ============================================================
-- 기대: settlements_transaction_type_check 제약이 존재, ('돌봄', '위약금')
SELECT conname, pg_get_constraintdef(oid) AS constraint_def
FROM pg_constraint
WHERE conrelid = 'settlements'::regclass
  AND conname LIKE '%transaction_type%';


-- ============================================================
-- 5. FK 확인 — refunds.penalty_payment_id → payments.id
-- ============================================================
SELECT tc.constraint_name, kcu.column_name,
       ccu.table_name AS foreign_table_name,
       ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.table_name = 'refunds'
  AND tc.constraint_type = 'FOREIGN KEY'
  AND kcu.column_name = 'penalty_payment_id';


-- ============================================================
-- 6. 인덱스 확인
-- ============================================================
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'payments' AND indexname LIKE 'idx_payments%'
UNION ALL
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'refunds' AND indexname LIKE 'idx_refunds%';


-- ============================================================
-- 7. 데이터 검증 — payment_type별 건수 및 금액 합계
-- ============================================================
-- 기대: 돌봄 11건, 위약금 1건 (총 12건)
SELECT payment_type, COUNT(*) AS cnt, SUM(amount) AS total_amount
FROM payments
GROUP BY payment_type
ORDER BY payment_type;


-- ============================================================
-- 8. 데이터 검증 — 위약금 결제 건의 fee 필드 NULL 확인
-- ============================================================
-- 기대: 위약금 1건, care_fee/walk_fee/pickup_fee 모두 NULL
SELECT id, payment_type, amount, care_fee, walk_fee, pickup_fee
FROM payments
WHERE payment_type = '위약금';


-- ============================================================
-- 9. 데이터 검증 — refunds와 위약금 결제 JOIN 확인
-- ============================================================
-- 기대: penalty_amount > 0인 1건(refund #4)에 penalty_payment_id가 연결됨
SELECT
  r.id AS refund_id,
  r.penalty_amount,
  r.penalty_payment_id,
  pp.id AS penalty_pay_id,
  pp.amount AS penalty_pay_amount,
  pp.payment_type,
  pp.status AS penalty_status
FROM refunds r
LEFT JOIN payments pp ON pp.id = r.penalty_payment_id
WHERE r.penalty_amount > 0;


-- ============================================================
-- 10. 데이터 검증 — 동일 예약에 돌봄+위약금 2건 확인
-- ============================================================
-- 기대: 예약 e0e0e0e0-0004만 돌봄 1건(결제취소) + 위약금 1건(결제완료) = 총 2건
-- e0e0e0e0-0007은 돌봄 1건만 존재 (결제완료, 노쇼 — 위약금 결제 없음)
SELECT reservation_id, payment_type, amount, status
FROM payments
WHERE reservation_id IN (
  'e0e0e0e0-0004-4000-a000-000000000004',
  'e0e0e0e0-0007-4000-a000-000000000007'
)
ORDER BY reservation_id, payment_type;


-- ============================================================
-- 11. 데이터 검증 — settlements.transaction_type 확인
-- ============================================================
-- 기대: '돌봄' 4건 (기존 '돌봄결제' → '돌봄'), '위약금' 0건
SELECT transaction_type, COUNT(*) AS cnt
FROM settlements
GROUP BY transaction_type
ORDER BY transaction_type;


-- ============================================================
-- 12. 데이터 검증 — search_payments 로직 검증 (돌봄만 반환 확인)
-- ============================================================
-- RPC 함수는 is_admin() 권한이 필요하므로 SQL Editor에서는 직접 호출 불가
-- search_payments의 핵심 로직(payment_type='돌봄' 필터)을 직접 쿼리로 검증
-- 기대: payment_count = 11 (돌봄 결제 11건), 위약금 결제 건은 포함되지 않음
SELECT COUNT(*) AS payment_count
FROM payments
WHERE payment_type = '돌봄';


-- ============================================================
-- 13. 데이터 검증 — search_refunds 로직 검증 (환불 전체 + 위약금 결제 정보)
-- ============================================================
-- 기대: refund_count = 5 (전체 refund 5건)
--       penalty_linked_count = 1 (penalty_payment_id가 연결된 건 1건)
SELECT COUNT(*) AS refund_count FROM refunds;
SELECT COUNT(*) AS penalty_linked_count
FROM refunds WHERE penalty_payment_id IS NOT NULL;


-- ============================================================
-- 14. 데이터 검증 — get_dashboard_monthly_sales 로직 검증
-- ============================================================
-- 기대: care_payment는 돌봄 결제금만, penalty_payment는 위약금 결제금만
SELECT
  SUM(CASE WHEN payment_type = '돌봄'  AND status = '결제완료' THEN amount ELSE 0 END) AS care_payment,
  SUM(CASE WHEN payment_type = '위약금' AND status = '결제완료' THEN amount ELSE 0 END) AS penalty_payment
FROM payments
WHERE paid_at >= date_trunc('month', CURRENT_DATE);


-- ============================================================
-- 15. 데이터 검증 — get_dashboard_today_stats 로직 검증
-- ============================================================
-- 기대: today_care_payments에 돌봄 결제만 포함 (위약금 제외)
SELECT COALESCE(SUM(amount), 0) AS today_care_payments
FROM payments
WHERE paid_at::date = CURRENT_DATE
  AND status = '결제완료'
  AND payment_type = '돌봄';


-- ============================================================
-- 16. 데이터 검증 — get_settlement_summary 로직 검증 (기간 필터 포함)
-- ============================================================
-- 16-a. 전체 기간 — 결제 유형별 집계
SELECT
  SUM(CASE WHEN payment_type = '돌봄'  AND status = '결제완료' THEN amount ELSE 0 END) AS care_payment,
  SUM(CASE WHEN payment_type = '위약금' AND status = '결제완료' THEN amount ELSE 0 END) AS penalty_payment,
  SUM(CASE WHEN status = '결제완료' THEN amount ELSE 0 END) AS total_valid
FROM payments;

-- 16-b. 전체 기간 — 정산 상태별 건수/금액
SELECT status, COUNT(*) AS cnt, COALESCE(SUM(settlement_amount), 0) AS total_amount
FROM settlements
GROUP BY status
ORDER BY status;

-- 16-c. 기간 필터 (2026년 3월) — 결제
SELECT
  SUM(CASE WHEN payment_type = '돌봄'  AND status = '결제완료' THEN amount ELSE 0 END) AS care_payment,
  SUM(CASE WHEN payment_type = '위약금' AND status = '결제완료' THEN amount ELSE 0 END) AS penalty_payment
FROM payments
WHERE paid_at >= '2026-03-01'::timestamptz
  AND paid_at <= '2026-03-31'::timestamptz;

-- 16-d. 기간 필터 (2026년 3월) — 정산
SELECT status, COUNT(*) AS cnt, COALESCE(SUM(settlement_amount), 0) AS total_amount
FROM settlements
WHERE scheduled_date >= '2026-03-01'::date
  AND scheduled_date <= '2026-03-31'::date
GROUP BY status
ORDER BY status;


-- ============================================================
-- 17. 전체 데이터 정합성 — payment + refund 관계 검증
-- ============================================================
-- 모든 refund의 payment_id가 유효한 payments.id를 참조하는지 확인
-- 기대: orphan_count = 0
SELECT COUNT(*) AS orphan_count
FROM refunds r
LEFT JOIN payments p ON p.id = r.payment_id
WHERE p.id IS NULL;


-- ============================================================
-- 18. 전체 데이터 정합성 — penalty_payment_id 참조 검증
-- ============================================================
-- 모든 penalty_payment_id가 유효한 payments.id를 참조하는지 확인
-- 기대: orphan_count = 0
SELECT COUNT(*) AS orphan_count
FROM refunds r
LEFT JOIN payments p ON p.id = r.penalty_payment_id
WHERE r.penalty_payment_id IS NOT NULL AND p.id IS NULL;


-- ============================================================
-- 19. 전체 데이터 정합성 — penalty_payment_id가 가리키는 건이 '위약금' 타입인지
-- ============================================================
-- 기대: mismatch_count = 0
SELECT COUNT(*) AS mismatch_count
FROM refunds r
JOIN payments p ON p.id = r.penalty_payment_id
WHERE p.payment_type != '위약금';


-- ============================================================
-- 20. 데이터 검증 — refund #4 상세 값 확인
-- ============================================================
-- 기대: 보호자 취소, 돌봄비 전액 환불, 위약금 50%
-- requester='보호자', cancel_reason='개인 사정으로 취소합니다'
-- applied_rule='24~72시간 전 취소 – 위약금 50%'
-- refund_rate=100, refund_amount=145000, penalty_rate=50, penalty_amount=72500
-- penalty_payment_id=f0f0f0f0-0012
SELECT
  id, requester, cancel_reason, applied_rule,
  original_amount, refund_rate, refund_amount,
  penalty_rate, penalty_amount, penalty_payment_id,
  status
FROM refunds
WHERE id = '11111111-0004-4000-a000-000000000004';


-- ============================================================
-- 21. 데이터 검증 — 예약 #4 상태 및 상태 변경 로그 확인
-- ============================================================
-- 기대: 예약 상태 '보호자취소', 상태 로그 2건
-- (수락대기→예약확정, 예약확정→보호자취소)
SELECT id, status FROM reservations
WHERE id = 'e0e0e0e0-0004-4000-a000-000000000004';

SELECT reservation_id, prev_status, new_status, changed_by, note
FROM reservation_status_logs
WHERE reservation_id = 'e0e0e0e0-0004-4000-a000-000000000004'
ORDER BY created_at;


-- ============================================================
-- 22. 데이터 검증 — 노쇼 건 확인 (위약금/환불 없음, 결제완료 유지)
-- ============================================================
-- 기대: 돌봄 1건, 결제완료, 위약금 결제 없음, 환불 없음, 정산 보류
SELECT
  p.id AS payment_id, p.amount, p.status AS payment_status,
  p.payment_type,
  r.status AS reservation_status
FROM payments p
JOIN reservations r ON r.id = p.reservation_id
WHERE p.reservation_id = 'e0e0e0e0-0007-4000-a000-000000000007';

-- 노쇼 건: refund 없음 확인
SELECT COUNT(*) AS refund_count
FROM refunds
WHERE reservation_id = 'e0e0e0e0-0007-4000-a000-000000000007';
-- 기대: refund_count = 0

-- 노쇼 건: 위약금 결제 없음 확인
SELECT COUNT(*) AS penalty_payment_count
FROM payments
WHERE reservation_id = 'e0e0e0e0-0007-4000-a000-000000000007'
  AND payment_type = '위약금';
-- 기대: penalty_payment_count = 0

-- 노쇼 건: 정산 건 확인
SELECT id, status, payment_amount, hold_reason
FROM settlements
WHERE reservation_id = 'e0e0e0e0-0007-4000-a000-000000000007';
-- 기대: 33333333-0004, 정산보류, 110000, '유치원 정산정보 미등록'


-- ============================================================
-- 23. 데이터 검증 — 전체 건수 요약
-- ============================================================
-- 기대값: payments 12, refunds 5, settlements 4
SELECT 'payments' AS tbl, COUNT(*) AS cnt FROM payments
UNION ALL
SELECT 'refunds', COUNT(*) FROM refunds
UNION ALL
SELECT 'settlements', COUNT(*) FROM settlements
ORDER BY tbl;


-- ============================================================
-- 검증 완료 메시지
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Phase A-1 검증 쿼리 실행 완료!';
  RAISE NOTICE '========================================';
  RAISE NOTICE '검증 항목 (총 23개):';
  RAISE NOTICE '  1-6.   스키마/제약/FK/인덱스 확인';
  RAISE NOTICE '  7-11.  데이터 정합성 확인 (건수, fee NULL, JOIN, 예약별, settlements)';
  RAISE NOTICE '  12-16. RPC 로직 검증 — 직접 쿼리 (search_payments, search_refunds, dashboard, settlement_summary)';
  RAISE NOTICE '  17-19. 참조 무결성 확인 (orphan, penalty type mismatch)';
  RAISE NOTICE '  20-22. 상세 데이터 확인 (refund #4, 예약 #4 로그, 노쇼 건)';
  RAISE NOTICE '  23.    전체 건수 요약 (payments 12, refunds 5, settlements 4)';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE '기대값 요약:';
  RAISE NOTICE '  - payments: 12건 (돌봄 11 + 위약금 1)';
  RAISE NOTICE '  - refunds: 5건 (위약금 없음 3 + 위약금50%% 1 + 전액환불 1)';
  RAISE NOTICE '  - settlements: 4건 (모두 돌봄)';
  RAISE NOTICE '  - 노쇼 건: 위약금/환불 없음, 결제완료 유지';
  RAISE NOTICE '========================================';
END $$;
