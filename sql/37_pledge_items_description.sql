-- ============================================================
-- SQL 37: pledge_items에 description 컬럼 추가
-- ============================================================
-- 실행 방법: Supabase SQL Editor에 전체 복사하여 실행
-- 실행 시점: SQL 36 실행 후, 코드 배포 전
-- 목적: 서약 항목 3depth 구조 지원
--   content     — 서약 제목 (Bold)
--   description — 서약 내용 (일반 텍스트)
--   sub_items   — 하위 항목 (jsonb, 글머리 기호)
-- ============================================================

ALTER TABLE pledge_items ADD COLUMN description text;

-- ============================================================
-- 검증 쿼리
-- ============================================================
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'pledge_items' ORDER BY ordinal_position;

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'SQL 37: pledge_items.description 컬럼 추가 완료!';
  RAISE NOTICE '========================================';
END $$;
