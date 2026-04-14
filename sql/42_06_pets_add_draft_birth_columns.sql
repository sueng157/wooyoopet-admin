-- ============================================================
-- SQL 42-6: pets 테이블 — 생일미상/임시저장 컬럼 2개 추가
-- ============================================================
-- 실행 방법: Supabase SQL Editor에 전체 복사하여 실행
-- 목적: 외주 개발자 확인 결과 누락된 2개 컬럼 추가
--        wr_6 (생일 체크 여부) → is_birth_date_unknown
--        wr_10 (임시저장 여부) → is_draft
-- 참조: MIGRATION_PLAN.md 섹션 6-2,
--        DB_MAPPING_REFERENCE.md 2-3 (wr_1~wr_11 교정)
-- 대상: public.pets (기존 14개 컬럼)
-- 선행: 없음
-- ============================================================
-- 개발자 확인 (2026-04-14):
--   wr_1=이름, wr_2=성별, wr_3=중성화, wr_4=품종,
--   wr_5=생년월일, wr_6=생일체크여부, wr_7=몸무게,
--   wr_8=백신, wr_9=미사용, wr_10=임시저장, wr_11=믹스체크
--   → wr_6, wr_10만 Supabase에 누락되어 추가
-- ============================================================


-- ============================================================
-- 1. 생일 미상 여부 (wr_6 → is_birth_date_unknown)
-- ============================================================

-- 생년월일을 모르는 경우 true. birth_date가 NULL이어도 정상으로 취급
ALTER TABLE public.pets
  ADD COLUMN IF NOT EXISTS is_birth_date_unknown boolean DEFAULT false;

COMMENT ON COLUMN public.pets.is_birth_date_unknown
  IS '생년월일 모름 여부 (true=모름, birth_date NULL 허용) — MariaDB wr_6';


-- ============================================================
-- 2. 임시저장 여부 (wr_10 → is_draft)
-- ============================================================

-- 반려동물 등록 임시저장 상태. 목록 조회 시 WHERE is_draft = false 필터
ALTER TABLE public.pets
  ADD COLUMN IF NOT EXISTS is_draft boolean DEFAULT false;

COMMENT ON COLUMN public.pets.is_draft
  IS '임시저장 상태 (true=임시, false=등록완료) — MariaDB wr_10';


-- ============================================================
-- 3. 인덱스 — 임시저장 목록 빠른 조회
-- ============================================================

-- 회원별 임시저장 반려동물 조회용 부분 인덱스
CREATE INDEX IF NOT EXISTS idx_pets_draft
  ON public.pets (member_id)
  WHERE is_draft = true;


-- ============================================================
-- 완료 알림
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE '[42-6] pets 테이블 컬럼 2개 추가 완료 (is_birth_date_unknown, is_draft) + 부분 인덱스 1개';
END $$;
