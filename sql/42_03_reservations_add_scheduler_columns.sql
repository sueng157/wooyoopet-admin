-- ============================================================
-- SQL 42-3: reservations 테이블 — 스케줄러 전용 컬럼 4개 추가
-- ============================================================
-- 실행 방법: Supabase SQL Editor에 전체 복사하여 실행
-- 목적: Edge Function 스케줄러의 알림 중복 발송 방지용 타임스탬프
-- 참조: MIGRATION_PLAN.md 섹션 6-2 + 7-2-4 (scheduler 설계)
--        DB_MAPPING_REFERENCE.md 2-4 (행 #22~#25)
-- 대상: public.reservations (기존 21개)
-- 선행: 없음
-- ============================================================


-- ============================================================
-- 1. 스케줄러 알림 발송 기록 (4개)
-- ============================================================

-- 등원 알림 발송 시각 (등원 30분 전 알림, 중복 방지)
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS reminder_start_sent_at timestamptz;
COMMENT ON COLUMN public.reservations.reminder_start_sent_at IS '등원 알림 발송 시각 (스케줄러 중복 방지)';

-- 하원 알림 발송 시각 (하원 30분 전 알림, 중복 방지)
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS reminder_end_sent_at timestamptz;
COMMENT ON COLUMN public.reservations.reminder_end_sent_at IS '하원 알림 발송 시각 (스케줄러 중복 방지)';

-- 돌봄시작 알림 발송 시각
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS care_start_sent_at timestamptz;
COMMENT ON COLUMN public.reservations.care_start_sent_at IS '돌봄시작 알림 발송 시각 (스케줄러 중복 방지)';

-- 돌봄종료 알림 발송 시각
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS care_end_sent_at timestamptz;
COMMENT ON COLUMN public.reservations.care_end_sent_at IS '돌봄종료 알림 발송 시각 (스케줄러 중복 방지)';


-- ============================================================
-- 2. 인덱스 — 스케줄러 쿼리 최적화용 부분 인덱스
-- ============================================================

-- 등원 알림 미발송 + 예약확정 상태인 예약 조회
-- 스케줄러: "등원 30분 전인데 아직 알림을 안 보낸 예약" 빠르게 찾기
CREATE INDEX IF NOT EXISTS idx_reservations_reminder_start_pending
  ON public.reservations (checkin_scheduled)
  WHERE reminder_start_sent_at IS NULL
    AND status = '예약확정';

-- 하원 알림 미발송 + 돌봄진행중 상태인 예약 조회
CREATE INDEX IF NOT EXISTS idx_reservations_reminder_end_pending
  ON public.reservations (checkout_scheduled)
  WHERE reminder_end_sent_at IS NULL
    AND status = '돌봄진행중';

-- 돌봄시작 알림 미발송 + 예약확정 상태인 예약 조회
CREATE INDEX IF NOT EXISTS idx_reservations_care_start_pending
  ON public.reservations (checkin_scheduled)
  WHERE care_start_sent_at IS NULL
    AND status = '예약확정';

-- 돌봄종료 알림 미발송 + 돌봄진행중 상태인 예약 조회
CREATE INDEX IF NOT EXISTS idx_reservations_care_end_pending
  ON public.reservations (checkout_scheduled)
  WHERE care_end_sent_at IS NULL
    AND status = '돌봄진행중';


-- ============================================================
-- 완료 알림
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE '[42-3] reservations 테이블 스케줄러 컬럼 4개 + 부분 인덱스 4개 추가 완료';
END $$;
