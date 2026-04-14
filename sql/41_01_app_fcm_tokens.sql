-- ============================================================
-- SQL 41-1: fcm_tokens 테이블 생성
-- ============================================================
-- 실행 방법: Supabase SQL Editor에 전체 복사하여 실행
-- 목적: 모바일 앱 FCM 푸시 토큰 저장
-- 참조: useFcmToken.ts → POST /api/fcm_token.php
-- MariaDB 원본: fcm_token (4컬럼)
-- 의존: public.members 테이블
-- ============================================================


-- ============================================================
-- 1. 테이블 생성
-- ============================================================

CREATE TABLE public.fcm_tokens (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id   uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  token       text NOT NULL,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

COMMENT ON TABLE public.fcm_tokens IS 'FCM 푸시 토큰 — 회원별 디바이스 토큰 저장';
COMMENT ON COLUMN public.fcm_tokens.member_id IS '회원 ID (members FK)';
COMMENT ON COLUMN public.fcm_tokens.token IS 'Firebase Cloud Messaging 토큰';


-- ============================================================
-- 2. 제약조건
-- ============================================================

-- 동일 회원+토큰 중복 방지 (UPSERT 패턴 지원)
ALTER TABLE public.fcm_tokens
  ADD CONSTRAINT fcm_tokens_member_token_unique UNIQUE (member_id, token);


-- ============================================================
-- 3. 인덱스
-- ============================================================

-- 회원별 토큰 조회
CREATE INDEX idx_fcm_tokens_member_id ON public.fcm_tokens (member_id);


-- ============================================================
-- 4. RLS 활성화 (정책은 Step 2-C에서 추가)
-- ============================================================

ALTER TABLE public.fcm_tokens ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- 완료 알림
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE '[41-1] fcm_tokens 테이블 생성 완료';
END $$;
