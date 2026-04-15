-- ============================================================
-- SQL 41-9: scheduler_history 테이블 생성
-- ============================================================
-- 실행 방법: Supabase SQL Editor에 전체 복사하여 실행
-- 목적: Edge Function 스케줄러 실행 이력 기록
-- 참조: scheduler.php → Edge Function scheduler로 대체 예정
-- MariaDB 원본: scheduler_history (3컬럼)
-- 의존: 없음
-- ============================================================


-- ============================================================
-- 1. 테이블 생성
-- ============================================================

CREATE TABLE public.scheduler_history (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz,
  result       jsonb DEFAULT '{}'::jsonb,
  created_at   timestamptz DEFAULT now()
);

COMMENT ON TABLE public.scheduler_history IS '스케줄러 실행 이력 — Edge Function 실행 기록';
COMMENT ON COLUMN public.scheduler_history.started_at IS '실행 시작 시각';
COMMENT ON COLUMN public.scheduler_history.finished_at IS '실행 완료 시각 (실행 중이면 NULL)';
COMMENT ON COLUMN public.scheduler_history.result IS '실행 결과 요약 (처리 건수, 에러 등 JSON)';


-- ============================================================
-- 2. 인덱스
-- ============================================================

-- 최근 실행 이력 조회
CREATE INDEX idx_scheduler_history_started
  ON public.scheduler_history (started_at DESC);


-- ============================================================
-- 3. RLS 활성화 (정책은 Step 2-C에서 추가)
-- ============================================================

ALTER TABLE public.scheduler_history ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- 완료 알림
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE '[41-9] scheduler_history 테이블 생성 완료';
END $$;
