-- ============================================================
-- SQL 41-8: chat_room_members 테이블 생성
-- ============================================================
-- 실행 방법: Supabase SQL Editor에 전체 복사하여 실행
-- 목적: 채팅방 참여자 관리 (읽음 위치 추적, 알림 차단)
-- 참조: useChat.ts, useChatRoom.ts, chat.php (핵심), read_chat.php
-- MariaDB 원본: room_members (5컬럼)
-- 의존: public.chat_rooms, public.members, public.chat_messages 테이블
-- ============================================================
-- 매니저 검토 반영:
--   1) room_id → chat_room_id (기존 chat_messages 테이블 FK 네이밍과 통일)
--   2) last_read_message_id에 ON DELETE SET NULL 추가
--      (메시지 물리 삭제 시 FK violation 방지)
--   3) moddatetime 트리거 미적용
--      (updated_at 갱신은 앱/RPC에서 수동 설정)
-- ============================================================


-- ============================================================
-- 1. 테이블 생성
-- ============================================================

CREATE TABLE public.chat_room_members (
  id                      uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_room_id            uuid NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  member_id               uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  role                    text NOT NULL,
  last_read_message_id    uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  is_muted                boolean DEFAULT false,
  joined_at               timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now()
);

COMMENT ON TABLE public.chat_room_members IS '채팅방 참여자 — 읽음 위치 추적, 알림 차단';
COMMENT ON COLUMN public.chat_room_members.chat_room_id IS '채팅방 (chat_rooms FK)';
COMMENT ON COLUMN public.chat_room_members.member_id IS '참여 회원 (members FK)';
COMMENT ON COLUMN public.chat_room_members.role IS '역할: 보호자 또는 유치원';
COMMENT ON COLUMN public.chat_room_members.last_read_message_id IS '마지막 읽은 메시지 ID — 안 읽은 메시지 수 계산용';
COMMENT ON COLUMN public.chat_room_members.is_muted IS '알림 차단 여부 (true=음소거)';


-- ============================================================
-- 2. 제약조건
-- ============================================================

-- 채팅방당 회원 1명 (UPSERT 패턴 지원)
ALTER TABLE public.chat_room_members
  ADD CONSTRAINT chat_room_members_room_member_unique UNIQUE (chat_room_id, member_id);

-- role은 보호자 또는 유치원만 허용
ALTER TABLE public.chat_room_members
  ADD CONSTRAINT chat_room_members_role_check CHECK (role IN ('보호자', '유치원'));


-- ============================================================
-- 3. 인덱스
-- ============================================================

-- 채팅방 멤버 조회
CREATE INDEX idx_chat_room_members_room
  ON public.chat_room_members (chat_room_id);

-- 내 채팅방 목록 (회원별)
CREATE INDEX idx_chat_room_members_member
  ON public.chat_room_members (member_id);


-- ============================================================
-- 4. RLS 활성화 (정책은 Step 2-C에서 추가)
-- ============================================================

ALTER TABLE public.chat_room_members ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- 완료 알림
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE '[41-8] chat_room_members 테이블 생성 완료';
END $$;
