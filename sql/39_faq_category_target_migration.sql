-- ============================================================
-- FAQ 테이블 CHECK 제약 변경 + 데이터 마이그레이션
-- 실행 환경: Supabase SQL Editor
-- ============================================================

-- ① category: CHECK 드롭 → 데이터 마이그레이션 → 새 CHECK
ALTER TABLE faqs DROP CONSTRAINT faqs_category_check;

UPDATE faqs SET category = '공통'
WHERE category IN ('결제', '돌봄', '환불', '회원', '유치원');

ALTER TABLE faqs ADD CONSTRAINT faqs_category_check
  CHECK (category IN ('공통'));

-- ② target: CHECK 드롭 → '전체' → '전체(공통)' 변경 → 새 CHECK
ALTER TABLE faqs DROP CONSTRAINT faqs_target_check;

UPDATE faqs SET target = '전체(공통)'
WHERE target = '전체';

ALTER TABLE faqs ADD CONSTRAINT faqs_target_check
  CHECK (target IN ('전체(공통)', '보호자', '유치원'));
