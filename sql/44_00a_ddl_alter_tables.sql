-- ============================================================
-- SQL 44-0a: DDL ALTER — VIEW 및 RPC 선행 조건 테이블 변경
-- ============================================================
-- 실행 방법: Supabase SQL Editor에 전체 복사하여 실행
-- ⚠️ 실행 순서: 44_00a → 44_00 → 44_01 ~ 44_12
--    이 파일은 44_00 VIEW 및 44_07 RPC의 선행 조건이 되는
--    DDL 변경 전용 파일이다. 반드시 44_00보다 먼저 실행해야 한다.
--
-- [포함 내용]
--   1. pets 테이블: deleted 컬럼 추가 (soft-delete용)
--      → internal.pets_public_info VIEW의 WHERE deleted = false 조건에 필요
--      → 44_07 app_withdraw_member에서 pets.deleted = true로 soft delete
--   2. kindergartens 테이블: registration_status CHECK 제약에 'withdrawn' 추가
--      → 44_07 app_withdraw_member에서 registration_status = 'withdrawn' 설정
--
-- [멱등성]
--   ADD COLUMN IF NOT EXISTS — 이미 존재하면 무시
--   DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT — 재실행 안전
-- ============================================================


-- ============================================================
-- 1. pets 테이블: deleted 컬럼 추가
-- ============================================================
-- 용도: soft-delete 플래그 (true이면 삭제된 반려동물)
-- 기본값: false (기존 레코드에 자동 적용)
-- 참조: internal.pets_public_info VIEW (WHERE deleted = false)
--       44_07 app_withdraw_member (UPDATE pets SET deleted = true)
-- ============================================================

ALTER TABLE pets
  ADD COLUMN IF NOT EXISTS deleted bool DEFAULT false;

COMMENT ON COLUMN pets.deleted IS
  'soft-delete 플래그 — true이면 삭제된 반려동물. '
  'internal.pets_public_info VIEW에서 WHERE deleted = false로 자동 필터링. '
  '회원 탈퇴(44_07) 및 반려동물 삭제(set_animal_delete.php → 자동 API)에서 사용.';


-- ============================================================
-- 2. kindergartens 테이블: registration_status CHECK 제약 변경
-- ============================================================
-- 기존 값: 'registered', 'temp'
-- 추가 값: 'withdrawn' (회원 탈퇴 시 유치원 비활성화)
-- 참조: 44_07 app_withdraw_member
--       (UPDATE kindergartens SET registration_status = 'withdrawn')
-- ============================================================

ALTER TABLE kindergartens
  DROP CONSTRAINT IF EXISTS kindergartens_registration_status_check,
  ADD CONSTRAINT kindergartens_registration_status_check
    CHECK (registration_status IN ('registered', 'temp', 'withdrawn'));


-- ============================================================
-- 완료 알림
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE '[44-0a] DDL ALTER 완료';
  RAISE NOTICE '  ⚠️ 실행 순서: 44_00a → 44_00 → 44_01 ~ 44_12';
  RAISE NOTICE '  1. pets.deleted bool DEFAULT false — soft-delete 컬럼 추가';
  RAISE NOTICE '  2. kindergartens.registration_status CHECK — ''withdrawn'' 값 추가';
  RAISE NOTICE '     허용값: registered, temp, withdrawn';
END $$;
