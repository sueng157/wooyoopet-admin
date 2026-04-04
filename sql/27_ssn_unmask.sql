-- ============================================================
-- SQL 27: operator_ssn_masked 원본값 복원
-- ============================================================
-- 실행 방법: Supabase SQL Editor에서 순서대로 실행
--
-- 변경 내용:
--   settlement_infos.operator_ssn_masked 컬럼의 마스킹된 값을
--   주민등록번호 원본값으로 변경 (PG사 비사업자 등록 시 뒷자리 필요)
--
-- ※ 서비스 런칭 전 암호화 저장 방식(pgcrypto)으로 전환 필요
-- ============================================================

-- STEP 1: 기존 마스킹 데이터를 원본으로 업데이트
UPDATE settlement_infos SET operator_ssn_masked = '830415-2345678' WHERE id = '22222222-0001-4000-a000-000000000001';
UPDATE settlement_infos SET operator_ssn_masked = '790922-1987654' WHERE id = '22222222-0002-4000-a000-000000000002';
UPDATE settlement_infos SET operator_ssn_masked = '910605-2876543' WHERE id = '22222222-0003-4000-a000-000000000003';

-- STEP 2: 검증
-- SELECT id, operator_name, operator_ssn_masked, business_type FROM settlement_infos;
