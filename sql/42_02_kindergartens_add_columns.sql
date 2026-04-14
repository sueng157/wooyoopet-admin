-- ============================================================
-- SQL 42-2: kindergartens 테이블 — 앱 전용 컬럼 3개 추가
-- ============================================================
-- 실행 방법: Supabase SQL Editor에 전체 복사하여 실행
-- 목적: 유치원 위치 검색 및 등록 상태 관리
-- 참조: MIGRATION_PLAN.md 섹션 6-2, DB_MAPPING_REFERENCE.md 2-2
-- 대상: public.kindergartens (기존 35개)
-- 선행: 없음
-- ============================================================


-- ============================================================
-- 1. 위치 정보 (2개)
-- ============================================================

-- 유치원 위도 (MariaDB: mb_9)
ALTER TABLE public.kindergartens ADD COLUMN IF NOT EXISTS latitude numeric;
COMMENT ON COLUMN public.kindergartens.latitude IS '유치원 위도 — 지도 검색';

-- 유치원 경도 (MariaDB: mb_10)
ALTER TABLE public.kindergartens ADD COLUMN IF NOT EXISTS longitude numeric;
COMMENT ON COLUMN public.kindergartens.longitude IS '유치원 경도 — 지도 검색';


-- ============================================================
-- 2. 등록 상태 (1개)
-- ============================================================

-- 등록 상태 (MariaDB: wr_6)
ALTER TABLE public.kindergartens ADD COLUMN IF NOT EXISTS registration_status text DEFAULT 'registered';
COMMENT ON COLUMN public.kindergartens.registration_status IS '등록 상태 (registered=등록완료, temp=임시저장)';


-- ============================================================
-- 3. 제약조건
-- ============================================================

-- registration_status 값 제한
ALTER TABLE public.kindergartens
  ADD CONSTRAINT kindergartens_registration_status_check
  CHECK (registration_status IN ('registered', 'temp'));


-- ============================================================
-- 4. 인덱스
-- ============================================================

-- 위치 기반 지도 검색용 복합 인덱스
CREATE INDEX IF NOT EXISTS idx_kindergartens_location
  ON public.kindergartens (latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;


-- ============================================================
-- 완료 알림
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE '[42-2] kindergartens 테이블 앱 전용 컬럼 3개 추가 완료 (위치2 + 등록상태1)';
END $$;
