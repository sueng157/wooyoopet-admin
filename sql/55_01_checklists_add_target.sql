-- =====================================================================
-- 55_01: checklists 테이블에 target 컬럼 추가 (유치원/보호자 구분)
-- =====================================================================
-- 목적:
--   기존 checklists 테이블은 유치원용 체크리스트만 저장하고 있었음.
--   보호자용 체크리스트를 같은 테이블에 함께 저장하기 위해
--   대상 구분 컬럼(target)을 추가한다.
--
-- 변경 내용:
--   1) checklists.target 컬럼 추가 (text, NOT NULL, DEFAULT '유치원')
--   2) CHECK 제약: target IN ('유치원','보호자')
--   3) target 컬럼 인덱스 (목록 필터 성능)
--   4) 컬럼 코멘트
--
-- 기존 데이터:
--   모두 유치원용이므로 DEFAULT '유치원'으로 자동 채워짐. 별도 UPDATE 불필요.
--
-- 실행 방법 (Supabase SQL Editor):
--   아래 STEP 1 전체를 한 번에 실행한다 (BEGIN ~ COMMIT 한 세션 내 처리).
--   실행 후 STEP 2 검증 쿼리를 실행하여 결과 확인.
-- =====================================================================

-- =====================================================================
-- STEP 1: 마이그레이션 적용 (한 번에 실행)
-- =====================================================================

BEGIN;

ALTER TABLE public.checklists
  ADD COLUMN target text NOT NULL DEFAULT '유치원';

ALTER TABLE public.checklists
  ADD CONSTRAINT checklists_target_check
  CHECK (target IN ('유치원','보호자'));

CREATE INDEX IF NOT EXISTS idx_checklists_target
  ON public.checklists(target);

COMMENT ON COLUMN public.checklists.target IS
  '체크리스트 대상 구분: 유치원 또는 보호자';

COMMIT;

-- =====================================================================
-- STEP 2: 검증 쿼리 (STEP 1 실행 후 별도 실행 — 각 쿼리는 개별 실행 권장)
-- =====================================================================

-- (1) target 컬럼이 추가됐는지 확인
-- 예상: target / text / NO / '유치원'::text
SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name = 'checklists'
   AND column_name = 'target';

-- (2) CHECK 제약이 등록됐는지 확인
SELECT conname, pg_get_constraintdef(oid) AS definition
  FROM pg_constraint
 WHERE conrelid = 'public.checklists'::regclass
   AND conname = 'checklists_target_check';

-- (3) 기존 데이터가 모두 '유치원'으로 채워졌는지 확인
-- 예상: 유치원 | (기존 체크리스트 개수)
SELECT target, COUNT(*) AS row_count
  FROM public.checklists
 GROUP BY target;

-- (4) 인덱스 생성 확인
SELECT indexname, indexdef
  FROM pg_indexes
 WHERE schemaname = 'public'
   AND tablename = 'checklists'
   AND indexname = 'idx_checklists_target';

-- =====================================================================
-- 롤백 방법 (만약 문제가 생겨 되돌려야 한다면)
-- =====================================================================
-- ALTER TABLE public.checklists DROP CONSTRAINT IF EXISTS checklists_target_check;
-- DROP INDEX IF EXISTS public.idx_checklists_target;
-- ALTER TABLE public.checklists DROP COLUMN IF EXISTS target;
