-- ============================================================
-- SQL 11-patch: RLS 순환 참조 수정 패치
-- ============================================================
-- 문제: admin_accounts SELECT 정책이 자기 테이블을 서브쿼리로 참조 → 순환 참조 발생
-- 해법: SECURITY DEFINER 함수로 auth.uid() 존재 여부를 RLS 우회하여 확인
-- 실행: Supabase SQL Editor에서 이 파일 전체를 복사하여 실행
-- ============================================================


-- ============================================================
-- STEP 1: RLS 우회 헬퍼 함수 생성
-- SECURITY DEFINER = RLS를 무시하고 테이블 직접 조회 가능
-- ============================================================

-- 1-1. auth.uid()가 admin_accounts에 존재하는지 확인
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM admin_accounts
    WHERE auth_user_id = auth.uid()
  );
$$;

-- 1-2. auth.uid()가 최고관리자인지 확인
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM admin_accounts
    WHERE auth_user_id = auth.uid()
      AND role = '최고관리자'
  );
$$;


-- ============================================================
-- STEP 2: admin_accounts RLS 정책 재생성
-- ============================================================

-- 기존 정책 삭제
DROP POLICY IF EXISTS "admin_accounts_select_authenticated" ON admin_accounts;
DROP POLICY IF EXISTS "admin_accounts_update_self" ON admin_accounts;
DROP POLICY IF EXISTS "admin_accounts_update_superadmin" ON admin_accounts;
DROP POLICY IF EXISTS "admin_accounts_insert_superadmin" ON admin_accounts;
DROP POLICY IF EXISTS "admin_accounts_delete_superadmin" ON admin_accounts;

-- SELECT: 인증된 관리자 → 전체 조회 가능 (헬퍼 함수로 순환 참조 해결)
CREATE POLICY "admin_accounts_select_authenticated" ON admin_accounts
  FOR SELECT
  USING ( public.is_admin() );

-- UPDATE (자기 자신): 자신의 last_login_at 등 업데이트 가능
CREATE POLICY "admin_accounts_update_self" ON admin_accounts
  FOR UPDATE
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- UPDATE (최고관리자): 모든 관리자 계정 수정 가능
CREATE POLICY "admin_accounts_update_superadmin" ON admin_accounts
  FOR UPDATE
  USING ( public.is_superadmin() );

-- INSERT (최고관리자): 새 관리자 등록 가능
CREATE POLICY "admin_accounts_insert_superadmin" ON admin_accounts
  FOR INSERT
  WITH CHECK ( public.is_superadmin() );

-- DELETE (최고관리자): 관리자 삭제 가능
CREATE POLICY "admin_accounts_delete_superadmin" ON admin_accounts
  FOR DELETE
  USING ( public.is_superadmin() );


-- ============================================================
-- STEP 3: admin_login_logs RLS 정책 재생성
-- ============================================================

DROP POLICY IF EXISTS "admin_login_logs_select_authenticated" ON admin_login_logs;
DROP POLICY IF EXISTS "admin_login_logs_insert_authenticated" ON admin_login_logs;

-- SELECT: 인증된 관리자만 조회
CREATE POLICY "admin_login_logs_select_authenticated" ON admin_login_logs
  FOR SELECT
  USING ( public.is_admin() );

-- INSERT: 인증된 관리자만 로그 기록
CREATE POLICY "admin_login_logs_insert_authenticated" ON admin_login_logs
  FOR INSERT
  WITH CHECK ( public.is_admin() );


-- ============================================================
-- 완료 확인
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================';
  RAISE NOTICE '  RLS 순환 참조 패치 완료!';
  RAISE NOTICE '============================================';
  RAISE NOTICE '  ✅ is_admin() 함수 생성';
  RAISE NOTICE '  ✅ is_superadmin() 함수 생성';
  RAISE NOTICE '  ✅ admin_accounts RLS 정책 재생성 (5개)';
  RAISE NOTICE '  ✅ admin_login_logs RLS 정책 재생성 (2개)';
  RAISE NOTICE '============================================';
  RAISE NOTICE '  → login.html에서 다시 로그인 테스트하세요';
  RAISE NOTICE '============================================';
END $$;
