-- ============================================================
-- SQL 41-5: favorite_kindergartens 테이블 생성
-- ============================================================
-- 실행 방법: Supabase SQL Editor에 전체 복사하여 실행
-- 목적: 보호자가 유치원을 즐겨찾기(찜) 저장
-- 참조: useFavorite.ts → set_partner_favorite_add/remove.php,
--        get_favorite_partner_list.php
-- MariaDB 원본: g5_favorite_partner (7컬럼)
-- 의존: public.members, public.kindergartens 테이블
-- ============================================================
-- 매니저 검토 반영: is_favorite를 text('Y'/'N') → boolean으로 변경
--   이유: 기존 Supabase boolean 컬럼 패턴과 통일,
--         PHP→Supabase 전환 시 앱 코드 전면 재작성하므로 호환 불필요
-- ============================================================


-- ============================================================
-- 1. 테이블 생성
-- ============================================================

CREATE TABLE public.favorite_kindergartens (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id       uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  kindergarten_id uuid NOT NULL REFERENCES public.kindergartens(id) ON DELETE CASCADE,
  is_favorite     boolean DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

COMMENT ON TABLE public.favorite_kindergartens IS '유치원 즐겨찾기 — 보호자가 유치원을 찜';
COMMENT ON COLUMN public.favorite_kindergartens.member_id IS '찜한 보호자 (members FK)';
COMMENT ON COLUMN public.favorite_kindergartens.kindergarten_id IS '찜 대상 유치원 (kindergartens FK)';
COMMENT ON COLUMN public.favorite_kindergartens.is_favorite IS 'true=찜 상태, false=해제';


-- ============================================================
-- 2. 제약조건
-- ============================================================

-- 동일 보호자+유치원 중복 방지 (UPSERT 패턴 지원)
ALTER TABLE public.favorite_kindergartens
  ADD CONSTRAINT fav_kg_member_kindergarten_unique UNIQUE (member_id, kindergarten_id);


-- ============================================================
-- 3. 인덱스
-- ============================================================

-- 내 즐겨찾기 조회 (보호자별)
CREATE INDEX idx_fav_kg_member_id ON public.favorite_kindergartens (member_id);

-- 유치원별 찜한 수 집계
CREATE INDEX idx_fav_kg_kindergarten_id ON public.favorite_kindergartens (kindergarten_id);


-- ============================================================
-- 4. RLS 활성화 (정책은 Step 2-C에서 추가)
-- ============================================================

ALTER TABLE public.favorite_kindergartens ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- 완료 알림
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE '[41-5] favorite_kindergartens 테이블 생성 완료';
END $$;
