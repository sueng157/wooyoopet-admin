-- ============================================================
-- SQL 41-7: chat_templates 테이블 생성
-- ============================================================
-- 실행 방법: Supabase SQL Editor에 전체 복사하여 실행
-- 목적: 채팅 상용문구(사용자 등록) + 가이드 문구(관리자 등록) 통합 테이블
-- 참조: commonPhrase.tsx → set_message_template.php,
--        update_message_template.php, delete_message_template.php,
--        get_message_template.php, get_chat_partner_guide.php,
--        get_chat_user_guide.php
-- MariaDB 원본: message_template + g5_write_chat_partner_guide +
--               g5_write_chat_user_guide → type 컬럼으로 통합
-- 의존: public.members 테이블
-- ============================================================


-- ============================================================
-- 1. 테이블 생성
-- ============================================================

CREATE TABLE public.chat_templates (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  type        text NOT NULL,                    -- 'custom', 'guide_guardian', 'guide_kindergarten'
  member_id   uuid REFERENCES public.members(id) ON DELETE CASCADE,  -- custom일 때 필수, guide일 때 NULL
  title       text,                             -- 가이드용 제목
  content     text NOT NULL,                    -- 문구 내용
  sort_order  integer DEFAULT 0,                -- 정렬 순서
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

COMMENT ON TABLE public.chat_templates IS '채팅 문구 — 상용문구(custom) + 가이드(guide_guardian/guide_kindergarten)';
COMMENT ON COLUMN public.chat_templates.type IS 'custom=개인 상용문구, guide_guardian=보호자 가이드, guide_kindergarten=유치원 가이드';
COMMENT ON COLUMN public.chat_templates.member_id IS 'custom일 때 소유자 (members FK), guide일 때 NULL';
COMMENT ON COLUMN public.chat_templates.title IS '가이드 문구 제목 (custom에서는 미사용 가능)';
COMMENT ON COLUMN public.chat_templates.sort_order IS '정렬 순서 (낮을수록 먼저)';


-- ============================================================
-- 2. 제약조건
-- ============================================================

-- type은 3가지만 허용
ALTER TABLE public.chat_templates
  ADD CONSTRAINT chat_templates_type_check
  CHECK (type IN ('custom', 'guide_guardian', 'guide_kindergarten'));


-- ============================================================
-- 3. 인덱스
-- ============================================================

-- 회원별 상용문구 조회 (앱에서 get_message_template 호출 시)
CREATE INDEX idx_chat_templates_member_type
  ON public.chat_templates (member_id, type);

-- 가이드 문구 목록 조회 (type + sort_order)
CREATE INDEX idx_chat_templates_type_sort
  ON public.chat_templates (type, sort_order);


-- ============================================================
-- 4. RLS 활성화 (정책은 Step 2-C에서 추가)
-- ============================================================

ALTER TABLE public.chat_templates ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- 완료 알림
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE '[41-7] chat_templates 테이블 생성 완료';
END $$;
