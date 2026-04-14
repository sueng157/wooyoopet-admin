-- ============================================================
-- SQL 42-4: pets 테이블 — 컬럼 매핑 검증 (DDL 변경 없음)
-- ============================================================
-- 실행 방법: Supabase SQL Editor에 전체 복사하여 실행
-- 목적: MariaDB g5_write_animal ↔ Supabase pets 컬럼 매핑 확인
-- 참조: DB_MAPPING_REFERENCE.md 2-3
-- 결론: 2개 컬럼 누락 확인 → sql/42_06에서 추가
-- ============================================================
--
-- 매핑 검증 결과 (2026-04-14 외주 개발자 확인으로 전면 교정):
--
--   MariaDB 컬럼     → Supabase 컬럼             상태
--   ─────────────────────────────────────────────────────
--   wr_id (PK)       → id (uuid)                ✅ 존재
--   mb_id            → member_id (FK)            ✅ 존재
--   wr_subject       → name                     ✅ 존재
--   wr_content       → description               ✅ 존재
--   wr_1 (이름)      → name                     ✅ 존재 (wr_subject와 중복, 무시)
--   wr_2 (성별)      → gender                   ✅ 존재
--   wr_3 (중성화)    → is_neutered               ✅ 존재
--   wr_4 (품종)      → breed                    ✅ 존재
--   wr_5 (생년월일)  → birth_date                ✅ 존재
--   wr_6 (생일체크)  → is_birth_date_unknown     🆕 추가 (sql/42_06)
--   wr_7 (몸무게)    → weight                   ✅ 존재
--   wr_8 (백신)      → is_vaccinated             ✅ 존재
--   wr_9 (미사용)    → —                        제외
--   wr_10 (임시저장) → is_draft                  🆕 추가 (sql/42_06)
--   wr_11 (믹스체크) → —                        breed='믹스견'으로 처리
--   firstYN          → is_representative         ✅ 존재
--   deleteYN         → (soft delete)             ✅ 앱에서 deleted 플래그 사용
--   animal_img1~10   → photo_urls (text[])       ✅ 존재
--   animal_kind_mix  → —                        breed에 포함
--
-- ============================================================


-- ============================================================
-- 1. 현재 pets 테이블 컬럼 목록 조회
-- ============================================================
-- 아래 쿼리 결과로 14개 컬럼이 확인되면 정상입니다.

SELECT
  column_name,
  data_type,
  udt_name,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'pets'
ORDER BY ordinal_position;


-- ============================================================
-- 2. size_class 자동 계산 트리거 존재 확인
-- ============================================================
-- SQL 14에서 생성한 trg_set_pet_size_class 트리거가
-- 정상 동작 중인지 확인합니다.

SELECT
  trigger_name,
  event_manipulation,
  action_timing
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND event_object_table = 'pets';


-- ============================================================
-- 완료 알림
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE '[42-4] pets 테이블 컬럼 매핑 검증 완료 — 추가 컬럼 없음';
END $$;
