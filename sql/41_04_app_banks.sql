-- ============================================================
-- SQL 41-4: banks 테이블 생성 + 한국 은행 초기 데이터
-- ============================================================
-- 실행 방법: Supabase SQL Editor에 전체 복사하여 실행
-- 목적: 은행 마스터 데이터 (정산 계좌 등록 시 은행 선택용)
-- 참조: useBankList.ts → GET /api/get_bank_list.php
-- MariaDB 원본: bank (6컬럼)
-- 의존: 없음
-- ============================================================


-- ============================================================
-- 1. 테이블 생성
-- ============================================================

CREATE TABLE public.banks (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code        text NOT NULL UNIQUE,
  name        text NOT NULL,
  use_yn      boolean DEFAULT true,
  sort_order  integer DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

COMMENT ON TABLE public.banks IS '은행 마스터 — 정산 계좌 등록 시 은행 선택';
COMMENT ON COLUMN public.banks.code IS '금융결제원 표준 은행코드';
COMMENT ON COLUMN public.banks.name IS '은행명';
COMMENT ON COLUMN public.banks.use_yn IS '사용 여부 (앱 노출)';
COMMENT ON COLUMN public.banks.sort_order IS '정렬 순서 (낮을수록 먼저)';


-- ============================================================
-- 2. 인덱스
-- ============================================================

-- 활성 은행 정렬 조회 (앱에서 SELECT WHERE use_yn=true ORDER BY sort_order, code)
CREATE INDEX idx_banks_use_sort ON public.banks (use_yn, sort_order, code);


-- ============================================================
-- 3. RLS 활성화 (정책은 Step 2-C에서 추가)
-- ============================================================

ALTER TABLE public.banks ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- 4. 초기 데이터 — 금융결제원 표준 은행코드 (23개)
-- ============================================================
-- 코드 기준: 금융결제원 참가기관 코드
-- sort_order: 시중은행 → 지방은행 → 특수은행 → 인터넷은행 순

INSERT INTO public.banks (code, name, use_yn, sort_order) VALUES
  ('004', 'KB국민은행',        true,  1),
  ('088', '신한은행',          true,  2),
  ('020', '우리은행',          true,  3),
  ('081', '하나은행',          true,  4),
  ('011', 'NH농협은행',        true,  5),
  ('003', 'IBK기업은행',       true,  6),
  ('023', 'SC제일은행',        true,  7),
  ('027', '씨티은행',          true,  8),
  ('031', '대구은행',          true,  9),
  ('032', '부산은행',          true, 10),
  ('034', '광주은행',          true, 11),
  ('035', '제주은행',          true, 12),
  ('037', '전북은행',          true, 13),
  ('039', '경남은행',          true, 14),
  ('002', 'KDB산업은행',       true, 15),
  ('007', '수협은행',          true, 16),
  ('012', '지역농축협',        true, 17),
  ('045', '새마을금고',        true, 18),
  ('048', '신협',             true, 19),
  ('050', '저축은행',          true, 20),
  ('071', '우체국',           true, 21),
  ('089', '케이뱅크',          true, 22),
  ('090', '카카오뱅크',        true, 23),
  ('092', '토스뱅크',          true, 24);


-- ============================================================
-- 완료 알림
-- ============================================================

DO $$
DECLARE
  v_count bigint;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.banks;
  RAISE NOTICE '[41-4] banks 테이블 생성 + 은행 %건 삽입 완료', v_count;
END $$;
