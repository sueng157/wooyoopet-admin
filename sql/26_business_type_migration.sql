-- ============================================================
-- SQL 26: business_type 마이그레이션 (사업자/개인 → 개인사업자/법인사업자/비사업자)
-- ============================================================
-- 실행 방법: Supabase SQL Editor에서 아래 순서대로 실행
--
-- 변경 내용:
--   settlement_infos.business_type 컬럼의 허용 값을
--   기존 '사업자'/'개인' → '개인사업자'/'법인사업자'/'비사업자' (3가지)로 변경
--
-- 실행 순서:
--   STEP 1: 기존 CHECK 제약 제거 (UPDATE 전에 먼저 제거해야 함)
--   STEP 2: 기존 데이터 마이그레이션 (값 변환)
--   STEP 3: 새 CHECK 제약 추가
-- ============================================================

-- STEP 1: 기존 CHECK 제약 제거
-- ※ 제약이 걸린 상태에서 UPDATE하면 위반 에러가 발생하므로 반드시 먼저 제거
-- 제약 이름이 다를 수 있으므로, 아래 쿼리로 먼저 확인:
--   SELECT tc.constraint_name, cc.check_clause
--   FROM information_schema.table_constraints tc
--   JOIN information_schema.check_constraints cc
--     ON cc.constraint_schema = tc.constraint_schema AND cc.constraint_name = tc.constraint_name
--   WHERE tc.table_name = 'settlement_infos' AND tc.constraint_type = 'CHECK'
--     AND tc.constraint_name NOT LIKE '%_not_null';
ALTER TABLE settlement_infos DROP CONSTRAINT IF EXISTS settlement_infos_business_type_check;

-- STEP 2: 기존 데이터 마이그레이션
-- '사업자' → '개인사업자', '개인' → '비사업자'
-- (법인사업자는 기존 데이터에 없으므로 신규 등록 시 사용)
UPDATE settlement_infos SET business_type = '개인사업자' WHERE business_type = '사업자';
UPDATE settlement_infos SET business_type = '비사업자'   WHERE business_type = '개인';

-- STEP 3: 새 CHECK 제약 추가
ALTER TABLE settlement_infos ADD CONSTRAINT settlement_infos_business_type_check
  CHECK (business_type IN ('개인사업자', '법인사업자', '비사업자'));
