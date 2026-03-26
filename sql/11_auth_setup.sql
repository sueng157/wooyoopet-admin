-- ============================================================
-- SQL 11: 우유펫(WOOYOOPET) — Phase 2 관리자 인증 설정
-- ============================================================
-- 실행 방법: Supabase SQL Editor에 전체 복사하여 실행
-- 실행 시점: Auth 사용자 3명 수동 생성 완료 후 실행
-- ============================================================
--
-- ★★★ 사전 작업 (Supabase Dashboard에서 수동 수행) ★★★
--
-- Supabase Dashboard > Authentication > Users > "Add user" 버튼으로
-- 아래 3개 계정을 **하나씩** 만들어 주세요.
-- (Auto Confirm User 체크 필수 — 이메일 인증 건너뛰기)
--
--   1) shkwon@wooyoopet.com  / admin1234!
--   2) kmhwang@wooyoopet.com / admin1234!
--   3) dev@wooyoopet.com     / admin1234!
--
-- 3개 모두 생성 완료 후 이 SQL을 실행하세요.
-- ============================================================


-- ============================================================
-- STEP 1: admin_accounts 이메일 업데이트
-- 기존 테스트 데이터의 이메일을 실제 회사 이메일로 변경
-- ============================================================

UPDATE admin_accounts
SET email = 'shkwon@wooyoopet.com',
    updated_at = NOW()
WHERE id = 'a0a0a0a0-0001-4000-a000-000000000001';

UPDATE admin_accounts
SET email = 'kmhwang@wooyoopet.com',
    updated_at = NOW()
WHERE id = 'a0a0a0a0-0002-4000-a000-000000000002';

UPDATE admin_accounts
SET email = 'dev@wooyoopet.com',
    updated_at = NOW()
WHERE id = 'a0a0a0a0-0003-4000-a000-000000000003';


-- ============================================================
-- STEP 2: auth_user_id 연결
-- auth.users에 생성된 사용자의 id를 admin_accounts에 매핑
-- (이메일 기준으로 자동 매칭)
-- ============================================================

UPDATE admin_accounts ac
SET auth_user_id = au.id,
    updated_at = NOW()
FROM auth.users au
WHERE au.email = ac.email;


-- ============================================================
-- STEP 3: 연결 결과 확인 쿼리
-- 3행 모두 auth_user_id가 채워져 있으면 성공
-- ============================================================

SELECT
  ac.id,
  ac.admin_login_id,
  ac.name,
  ac.email,
  ac.role,
  ac.status,
  ac.auth_user_id,
  CASE WHEN ac.auth_user_id IS NOT NULL THEN '✅ 연결됨' ELSE '❌ 미연결' END AS auth_status
FROM admin_accounts ac
ORDER BY ac.id;


-- ============================================================
-- STEP 4: RLS 우회 헬퍼 함수 생성
-- SECURITY DEFINER = RLS를 무시하고 테이블 직접 조회 가능
-- (RLS 정책에서 자기 테이블을 서브쿼리로 참조하면 순환 참조 발생 → 함수로 우회)
-- ============================================================

-- 4-1. auth.uid()가 admin_accounts에 존재하는지 확인
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

-- 4-2. auth.uid()가 최고관리자인지 확인
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
-- STEP 5: admin_accounts RLS 정책 설정
-- 헬퍼 함수를 사용하여 순환 참조 없이 권한 체크
-- ============================================================

-- 5-1. 기존 RLS 정책 삭제 (있는 경우 충돌 방지)
DROP POLICY IF EXISTS "admin_accounts_select_authenticated" ON admin_accounts;
DROP POLICY IF EXISTS "admin_accounts_update_self" ON admin_accounts;
DROP POLICY IF EXISTS "admin_accounts_update_superadmin" ON admin_accounts;
DROP POLICY IF EXISTS "admin_accounts_insert_superadmin" ON admin_accounts;
DROP POLICY IF EXISTS "admin_accounts_delete_superadmin" ON admin_accounts;

-- 5-2. RLS 활성화 (이미 활성화되어 있으면 무시됨)
ALTER TABLE admin_accounts ENABLE ROW LEVEL SECURITY;

-- 5-3. SELECT: 인증된 관리자 → 전체 조회 가능
CREATE POLICY "admin_accounts_select_authenticated" ON admin_accounts
  FOR SELECT
  USING ( public.is_admin() );

-- 5-4. UPDATE (자기 자신): 자신의 last_login_at 등 업데이트 가능
CREATE POLICY "admin_accounts_update_self" ON admin_accounts
  FOR UPDATE
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- 5-5. UPDATE (최고관리자): 모든 관리자 계정 수정 가능
CREATE POLICY "admin_accounts_update_superadmin" ON admin_accounts
  FOR UPDATE
  USING ( public.is_superadmin() );

-- 5-6. INSERT (최고관리자): 새 관리자 등록 가능
CREATE POLICY "admin_accounts_insert_superadmin" ON admin_accounts
  FOR INSERT
  WITH CHECK ( public.is_superadmin() );

-- 5-7. DELETE (최고관리자): 관리자 삭제 가능
CREATE POLICY "admin_accounts_delete_superadmin" ON admin_accounts
  FOR DELETE
  USING ( public.is_superadmin() );


-- ============================================================
-- STEP 6: admin_login_logs RLS 정책
-- 인증된 관리자만 로그인 로그를 INSERT/SELECT 가능
-- ============================================================

DROP POLICY IF EXISTS "admin_login_logs_select_authenticated" ON admin_login_logs;
DROP POLICY IF EXISTS "admin_login_logs_insert_authenticated" ON admin_login_logs;

ALTER TABLE admin_login_logs ENABLE ROW LEVEL SECURITY;

-- 6-1. SELECT: 인증된 관리자만 조회
CREATE POLICY "admin_login_logs_select_authenticated" ON admin_login_logs
  FOR SELECT
  USING ( public.is_admin() );

-- 6-2. INSERT: 인증된 관리자만 로그 기록
CREATE POLICY "admin_login_logs_insert_authenticated" ON admin_login_logs
  FOR INSERT
  WITH CHECK ( public.is_admin() );


-- ============================================================
-- 완료 메시지
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================';
  RAISE NOTICE '  Phase 2 인증 설정 완료!';
  RAISE NOTICE '============================================';
  RAISE NOTICE '  ✅ admin_accounts 이메일 업데이트 (3건)';
  RAISE NOTICE '  ✅ auth_user_id 연결 (3건)';
  RAISE NOTICE '  ✅ is_admin() / is_superadmin() 헬퍼 함수 (2개)';
  RAISE NOTICE '  ✅ admin_accounts RLS 정책 (5개)';
  RAISE NOTICE '  ✅ admin_login_logs RLS 정책 (2개)';
  RAISE NOTICE '============================================';
END $$;
