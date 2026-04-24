-- ============================================
-- 48_01: 외주개발자 추가실행 SQL 원본
-- 일시: 2026-04-22 ~ 04-24 추정
-- 설명: 외주개발자가 모바일앱 백엔드 연결 작업 중 SQL Editor에서 실행한 스크립트
-- 비고: 아래 문제점이 확인되어 48_02, 48_03에서 정책 정리 진행
--   1. address_verified, address_verify_image 컬럼 → 기존 address_auth_status, address_doc_urls와 중복
--   2. pet-images INSERT 정책 → 기존 pet_images_insert_app과 중복 (본인 폴더 제한 없이 추가하여 보안 무력화)
--   3. member-images INSERT 정책 → 본인 폴더 제한 없음
--   4. members/pets RLS 정책 → 기존 43_01_app_rls_policies.sql과 중복 가능성
-- ============================================

-- kindergartens: 주소인증 컬럼 추가
ALTER TABLE kindergartens
  ADD COLUMN IF NOT EXISTS address_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS address_verify_image text;

-- members (보호자): 주소인증 컬럼 추가
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS address_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS address_verify_image text;

ALTER TABLE pets ADD COLUMN IF NOT EXISTS is_mix BOOLEAN NOT NULL DEFAULT false;

-- Storage 버킷 생성 (펫 사진 / 프로필 사진)
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('pet-images', 'pet-images', true),
  ('member-images', 'member-images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage 업로드 정책 (인증 사용자만)
CREATE POLICY "Authenticated users can upload pet images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'pet-images' AND auth.role() = 'authenticated');

CREATE POLICY "Pet images are publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'pet-images');

CREATE POLICY "Authenticated users can upload member images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'member-images' AND auth.role() = 'authenticated');

CREATE POLICY "Member images are publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'member-images');

CREATE POLICY "Members can update their own images"
ON storage.objects FOR UPDATE
USING (bucket_id = 'member-images' AND auth.uid()::text = (storage.foldername(name))[1]);

-- members 본인 프로필 조회
CREATE POLICY "Users can select own member"
ON public.members
FOR SELECT
USING (auth.uid() = id);

-- members 본인 프로필 수정
CREATE POLICY "Users can update own member"
ON public.members
FOR UPDATE
USING (auth.uid() = id);

-- pets 테이블 RLS SELECT 정책 (자기 펫만 조회)
CREATE POLICY "Users can select own pets"
ON public.pets
FOR SELECT
USING (auth.uid() = member_id);

-- pets 테이블 RLS UPDATE 정책 (자기 펫만 수정)
CREATE POLICY "Users can update own pets"
ON public.pets
FOR UPDATE
USING (auth.uid() = member_id);

-- pets 테이블 RLS DELETE 정책 (자기 펫만 삭제)
CREATE POLICY "Users can delete own pets"
ON public.pets
FOR DELETE
USING (auth.uid() = member_id);

CREATE POLICY "users can insert own profile"
ON public.members
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);
