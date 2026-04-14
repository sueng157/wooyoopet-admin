-- ============================================================
-- SQL 42-1: members 테이블 — 앱 전용 컬럼 10개 추가
-- ============================================================
-- 실행 방법: Supabase SQL Editor에 전체 복사하여 실행
-- 목적: 모바일 앱에서 필요한 회원 정보 컬럼 추가
-- 참조: MIGRATION_PLAN.md 섹션 6-2, DB_MAPPING_REFERENCE.md 2-1
-- 대상: public.members (기존 31개 + address_doc_urls)
-- 선행: 없음
-- ============================================================
-- 매니저 검토 반영:
--   알림 설정 5개 컬럼을 text('Y'/'N') → boolean DEFAULT true로 변경
--   이유: 기존 Supabase boolean 컬럼 패턴과 통일,
--         PHP→Supabase 전환 시 앱 코드 전면 재작성하므로 호환 불필요
-- ============================================================


-- ============================================================
-- 1. 위치 정보 (2개)
-- ============================================================

-- 위도 — 위치 기반 유치원 검색 (MariaDB: mb_9)
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS latitude numeric;
COMMENT ON COLUMN public.members.latitude IS '위도 — 위치 기반 유치원 검색';

-- 경도 (MariaDB: mb_10)
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS longitude numeric;
COMMENT ON COLUMN public.members.longitude IS '경도 — 위치 기반 유치원 검색';


-- ============================================================
-- 2. 앱 설정 (2개)
-- ============================================================

-- 앱 언어 설정 (MariaDB: mb_language)
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS language text DEFAULT '한국어';
COMMENT ON COLUMN public.members.language IS '앱 언어 설정 (기본값: 한국어)';

-- 앱 버전 — 강제 업데이트 체크용 (MariaDB: mb_app_version)
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS app_version text;
COMMENT ON COLUMN public.members.app_version IS '앱 버전 (강제 업데이트 체크)';


-- ============================================================
-- 3. 알림 설정 (5개) — boolean DEFAULT true
-- ============================================================

-- 채팅 알림 ON/OFF (MariaDB: chat_notify)
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS chat_notify boolean DEFAULT true;
COMMENT ON COLUMN public.members.chat_notify IS '채팅 알림 (true=ON, false=OFF)';

-- 예약 알림 ON/OFF (MariaDB: reserve_notify)
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS reservation_notify boolean DEFAULT true;
COMMENT ON COLUMN public.members.reservation_notify IS '예약 알림 (true=ON, false=OFF)';

-- 등하원 알림 ON/OFF (MariaDB: attendance_notify)
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS checkinout_notify boolean DEFAULT true;
COMMENT ON COLUMN public.members.checkinout_notify IS '등하원 알림 (true=ON, false=OFF)';

-- 후기 알림 ON/OFF (MariaDB: review_notify)
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS review_notify boolean DEFAULT true;
COMMENT ON COLUMN public.members.review_notify IS '후기 알림 (true=ON, false=OFF)';

-- 신규 유치원 알림 ON/OFF (MariaDB: new_kinder_notify)
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS new_kindergarten_notify boolean DEFAULT true;
COMMENT ON COLUMN public.members.new_kindergarten_notify IS '신규 유치원 알림 (true=ON, false=OFF)';


-- ============================================================
-- 4. 주소 (1개)
-- ============================================================

-- 직접입력 주소 (MariaDB: direct)
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS address_direct text;
COMMENT ON COLUMN public.members.address_direct IS '직접입력 주소 (아파트가 아닌 경우)';


-- ============================================================
-- 5. 인덱스
-- ============================================================

-- 위치 기반 검색용 복합 인덱스 (위도+경도 모두 있는 행만)
CREATE INDEX IF NOT EXISTS idx_members_location
  ON public.members (latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;


-- ============================================================
-- 완료 알림
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE '[42-1] members 테이블 앱 전용 컬럼 10개 추가 완료 (위치2 + 설정2 + 알림5 + 주소1)';
END $$;
