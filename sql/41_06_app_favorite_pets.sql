-- ============================================================
-- SQL 41-6: favorite_pets 테이블 생성
-- ============================================================
-- 실행 방법: Supabase SQL Editor에 전체 복사하여 실행
-- 목적: 회원(보호자 또는 유치원 운영자)이 반려동물을 즐겨찾기(찜)
-- 참조: useFavorite.ts → set_user_favorite_add/remove.php,
--        set_animal_favorite_add/remove.php, get_favorite_animal_list.php
-- MariaDB 원본: g5_favorite_animal (7컬럼)
-- 의존: public.members, public.pets 테이블
-- ============================================================
-- 매니저 검토 반영: is_favorite를 text('Y'/'N') → boolean으로 변경
--   이유: 기존 Supabase boolean 컬럼 패턴과 통일,
--         PHP→Supabase 전환 시 앱 코드 전면 재작성하므로 호환 불필요
-- ============================================================


-- ============================================================
-- 1. 테이블 생성
-- ============================================================

CREATE TABLE public.favorite_pets (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id   uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  pet_id      uuid NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
  is_favorite boolean DEFAULT true,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

COMMENT ON TABLE public.favorite_pets IS '반려동물 즐겨찾기 — 보호자 또는 유치원 운영자가 반려동물을 찜';
COMMENT ON COLUMN public.favorite_pets.member_id IS '찜한 주체 (보호자 또는 유치원 운영자, members FK)';
COMMENT ON COLUMN public.favorite_pets.pet_id IS '찜 대상 반려동물 (pets FK)';
COMMENT ON COLUMN public.favorite_pets.is_favorite IS 'true=찜 상태, false=해제';


-- ============================================================
-- 2. 제약조건
-- ============================================================

-- 동일 회원+반려동물 중복 방지 (UPSERT 패턴 지원)
ALTER TABLE public.favorite_pets
  ADD CONSTRAINT fav_pets_member_pet_unique UNIQUE (member_id, pet_id);


-- ============================================================
-- 3. 인덱스
-- ============================================================

-- 내 즐겨찾기 조회 (회원별)
CREATE INDEX idx_fav_pets_member_id ON public.favorite_pets (member_id);

-- 반려동물별 찜한 수 집계
CREATE INDEX idx_fav_pets_pet_id ON public.favorite_pets (pet_id);


-- ============================================================
-- 4. RLS 활성화 (정책은 Step 2-C에서 추가)
-- ============================================================

ALTER TABLE public.favorite_pets ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- 완료 알림
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE '[41-6] favorite_pets 테이블 생성 완료';
END $$;
