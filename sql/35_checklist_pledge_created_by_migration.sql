-- ============================================================
-- SQL 35: 체크리스트/서약서 created_by — text → uuid FK 마이그레이션
-- ============================================================
-- 실행 방법: Supabase SQL Editor에 전체 복사하여 실행
-- 목적:
--   1. checklists.created_by: text → uuid (FK → admin_accounts.id)
--   2. pledges.created_by: text → uuid (FK → admin_accounts.id)
-- 참고: sql/31_report_detail_migration.sql (reports/report_logs.processed_by 동일 패턴)
-- 의존: admin_accounts 테이블
-- ============================================================


-- ============================================================
-- STEP 1: checklists.created_by — text → uuid FK
-- ============================================================
-- 1-1. 임시 컬럼 추가
ALTER TABLE checklists ADD COLUMN created_by_new uuid;

-- 1-2. 데이터 마이그레이션 (역할명 → admin_accounts.id 변환)
--      기존 데이터: '최고관리자' 등 역할명이 text로 저장되어 있음
--      안전 처리: 알려진 텍스트만 변환, 나머지 NULL
UPDATE checklists
SET created_by_new = CASE
  WHEN created_by = '최고관리자' THEN (
    SELECT id FROM admin_accounts WHERE name = '권승혁' LIMIT 1
  )
  ELSE NULL  -- 기타 텍스트 값도 안전하게 NULL 처리 (uuid 캐스팅 에러 방지)
END;

-- 1-3. 원래 컬럼 제거 → 임시 컬럼 이름 변경
ALTER TABLE checklists DROP COLUMN created_by;
ALTER TABLE checklists RENAME COLUMN created_by_new TO created_by;

-- 1-4. FK 제약조건 추가
ALTER TABLE checklists
  ADD CONSTRAINT checklists_created_by_fk
  FOREIGN KEY (created_by) REFERENCES admin_accounts(id);


-- ============================================================
-- STEP 2: pledges.created_by — text → uuid FK
-- ============================================================
-- 2-1. 임시 컬럼 추가
ALTER TABLE pledges ADD COLUMN created_by_new uuid;

-- 2-2. 데이터 마이그레이션
UPDATE pledges
SET created_by_new = CASE
  WHEN created_by = '최고관리자' THEN (
    SELECT id FROM admin_accounts WHERE name = '권승혁' LIMIT 1
  )
  ELSE NULL
END;

-- 2-3. 원래 컬럼 제거 → 임시 컬럼 이름 변경
ALTER TABLE pledges DROP COLUMN created_by;
ALTER TABLE pledges RENAME COLUMN created_by_new TO created_by;

-- 2-4. FK 제약조건 추가
ALTER TABLE pledges
  ADD CONSTRAINT pledges_created_by_fk
  FOREIGN KEY (created_by) REFERENCES admin_accounts(id);


-- ============================================================
-- 완료 메시지
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'SQL 35: 체크리스트/서약서 created_by 마이그레이션 완료!';
  RAISE NOTICE '========================================';
  RAISE NOTICE '변경사항:';
  RAISE NOTICE '  1. checklists.created_by: text → uuid FK (→ admin_accounts.id)';
  RAISE NOTICE '  2. pledges.created_by: text → uuid FK (→ admin_accounts.id)';
  RAISE NOTICE '========================================';
END $$;
