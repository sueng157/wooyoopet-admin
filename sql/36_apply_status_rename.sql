-- ============================================================
-- SQL 36: 체크리스트/서약서 apply_status 값 변경
--         '이전 버전' → '미적용'
-- 실행 방법: Supabase SQL Editor에 전체 복사하여 실행
-- 실행 시점: SQL 35 실행 후, 코드 배포 전
-- ============================================================

-- STEP 1: 기존 CHECK 제약조건 제거
ALTER TABLE checklists DROP CONSTRAINT checklists_apply_status_check;
ALTER TABLE pledges DROP CONSTRAINT pledges_apply_status_check;

-- STEP 2: 데이터 업데이트
UPDATE checklists SET apply_status = '미적용' WHERE apply_status = '이전 버전';
UPDATE pledges SET apply_status = '미적용' WHERE apply_status = '이전 버전';

-- STEP 3: 새 CHECK 제약조건 추가
ALTER TABLE checklists ADD CONSTRAINT checklists_apply_status_check
  CHECK (apply_status = ANY (ARRAY['현재 적용중'::text, '미적용'::text]));
ALTER TABLE pledges ADD CONSTRAINT pledges_apply_status_check
  CHECK (apply_status = ANY (ARRAY['현재 적용중'::text, '미적용'::text]));

-- ============================================================
-- 검증 쿼리 (실행 후 확인)
-- ============================================================
-- SELECT id, version_number, apply_status FROM checklists ORDER BY version_number;
-- SELECT id, version_number, apply_status FROM pledges ORDER BY version_number;
-- 결과에 '이전 버전'이 없고, '미적용' 또는 '현재 적용중'만 있으면 성공

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'SQL 36: apply_status 값 변경 완료!';
  RAISE NOTICE '  이전 버전 → 미적용 (checklists, pledges)';
  RAISE NOTICE '========================================';
END $$;
