-- ============================================================
-- SQL 41-2: notifications 테이블 생성
-- ============================================================
-- 실행 방법: Supabase SQL Editor에 전체 복사하여 실행
-- 목적: 모바일 앱 알림 내역 저장 (푸시 수신 이력)
-- 참조: useNotificationHandler.ts, get_notification.php, delete_notification.php
-- MariaDB 원본: notification (5컬럼)
-- 의존: public.members 테이블
-- ============================================================


-- ============================================================
-- 1. 테이블 생성
-- ============================================================

CREATE TABLE public.notifications (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id   uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  title       text NOT NULL,
  content     text,
  type        text,                           -- chat, reservation, review, system 등 (CHECK 없이 확장성 확보)
  data        jsonb DEFAULT '{}'::jsonb,      -- 라우팅 데이터 (room_id, reservation_id 등)
  created_at  timestamptz DEFAULT now()
);

COMMENT ON TABLE public.notifications IS '앱 알림 내역 — 푸시 알림 수신 이력';
COMMENT ON COLUMN public.notifications.type IS '알림 유형: chat, reservation, review, system 등';
COMMENT ON COLUMN public.notifications.data IS '알림 탭 시 이동할 화면 정보 (JSON)';


-- ============================================================
-- 2. 인덱스
-- ============================================================

-- 회원별 최근 알림 조회 (앱에서 get_notification 호출 시)
CREATE INDEX idx_notifications_member_created
  ON public.notifications (member_id, created_at DESC);


-- ============================================================
-- 3. RLS 활성화 (정책은 Step 2-C에서 추가)
-- ============================================================

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- 완료 알림
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE '[41-2] notifications 테이블 생성 완료';
END $$;
