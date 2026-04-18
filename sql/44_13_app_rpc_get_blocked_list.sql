-- ============================================================
-- SQL 44-13: app_get_blocked_list RPC 함수
-- ============================================================
-- 실행 방법: Supabase SQL Editor에 전체 복사하여 실행
-- 원본 PHP: get_blocked_list.php
-- 용도: 내가 차단한 회원 목록 조회 (차단 관리 화면)
-- 보안: SECURITY DEFINER — members RLS 우회 + internal VIEW로 안전 조회
-- ============================================================
--
-- [사전 조건]
--   ① sql/44_00_app_public_views.sql 실행 완료 (internal.members_public_profile VIEW)
--   ② sql/43_01_app_rls_policies.sql 실행 완료 (member_blocks RLS 정책)
--
-- [PHP 원본 로직 (get_blocked_list.php)]
--   파라미터: mb_id (전화번호)
--   1️⃣ block_users WHERE mb_id 조회
--   2️⃣ 각 차단 대상 회원의 g5_member 정보 N+1 쿼리
--   반환: data[] { mb_id, mb_nick, mb_profile1 }
--
--   원본 문제점:
--     - mb_id 파라미터만으로 접근 제어 (타인 차단 목록 조회 가능)
--     - N+1 쿼리 (차단 건별 회원 조회)
--     - 프로필 이미지: 파일명만 반환 (전체 URL 아님)
--
-- [Supabase 전환]
--   - mb_id → auth.uid() 자동 조회 (파라미터 불필요)
--   - N+1 → 단일 JOIN (member_blocks + internal.members_public_profile)
--   - 프로필 이미지: profile_image (전체 URL)
--   - 플랫 구조 반환: { blocked_id, nickname, profile_image, blocked_at }[]
--
-- [RLS 영향 분석]
--   2개 테이블/VIEW 참조:
--
--   ① member_blocks
--      정책: member_blocks_select_app — USING (blocker_id = auth.uid())
--      통과: ✅ 본인 차단 건만 조회 (SECURITY DEFINER이므로 RLS 우회되지만,
--             함수 내부에서 auth.uid() 수동 필터로 동일 보안 보장)
--
--   ② members (→ internal.members_public_profile VIEW)
--      정책: members_select_app — USING (id = auth.uid()) — 본인만
--      통과: ❌ 차단 대상(타인) 프로필 조회 차단
--      해결: ✅ internal.members_public_profile VIEW 사용
--             (SECURITY DEFINER VIEW로 RLS 우회, 9 안전 컬럼만 노출)
--
--   SECURITY DEFINER 사용 이유:
--     members 테이블 RLS가 타인 행 SELECT를 차단하므로,
--     SECURITY INVOKER로는 internal VIEW가 있더라도
--     member_blocks → members JOIN 시 차단 대상 프로필을 가져올 수 없음.
--     → SECURITY DEFINER + auth.uid() 수동 검증으로 안전하게 우회.
--
--   ※ internal.members_public_profile VIEW 자체가 SECURITY DEFINER이므로
--     실제로는 SECURITY INVOKER로도 동작 가능하나,
--     설계 문서(GUIDE.md §7-2, STEP4_WORK_PLAN.md §4-2)의 명시적
--     SECURITY DEFINER 지정을 준수.
-- ============================================================


-- 기존 함수 제거 (재실행 안전)
DROP FUNCTION IF EXISTS public.app_get_blocked_list();


-- ============================================================
-- 함수 정의
-- ============================================================
CREATE OR REPLACE FUNCTION public.app_get_blocked_list()
RETURNS json
LANGUAGE plpgsql
STABLE                                   -- 읽기 전용 함수
SECURITY DEFINER                         -- members RLS 우회 (internal VIEW 보완)
SET search_path = public
AS $$
DECLARE
  v_current_uid   uuid;
  v_result_json   json;
BEGIN
  -- ──────────────────────────────────────────────────────
  -- 1. 호출자 인증 확인 (SECURITY DEFINER이므로 수동 검증 필수)
  -- ──────────────────────────────────────────────────────
  v_current_uid := auth.uid();

  IF v_current_uid IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', '인증이 필요합니다'
    );
  END IF;

  -- ──────────────────────────────────────────────────────
  -- 2. 차단 목록 조회 (member_blocks + internal VIEW JOIN)
  --    blocked_at DESC 정렬 (최근 차단 순)
  --    플랫 구조: { blocked_id, nickname, profile_image, blocked_at }[]
  -- ──────────────────────────────────────────────────────
  SELECT COALESCE(
    json_agg(
      json_build_object(
        'blocked_id', mb.blocked_id,
        'nickname', mp.nickname,
        'profile_image', mp.profile_image,
        'blocked_at', mb.blocked_at
      )
      ORDER BY mb.blocked_at DESC
    ),
    '[]'::json
  )
  INTO v_result_json
  FROM member_blocks mb
  LEFT JOIN internal.members_public_profile mp ON mp.id = mb.blocked_id
  WHERE mb.blocker_id = v_current_uid
    AND mb.unblocked_at IS NULL;  -- 현재 차단 중인 건만 (해제된 건 제외)

  -- ──────────────────────────────────────────────────────
  -- 3. 성공 응답
  -- ──────────────────────────────────────────────────────
  RETURN json_build_object(
    'success', true,
    'data', v_result_json
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;


-- ============================================================
-- 함수 소유자 및 권한
-- ============================================================
ALTER FUNCTION public.app_get_blocked_list() OWNER TO postgres;

-- authenticated 역할에만 실행 허용
GRANT EXECUTE ON FUNCTION public.app_get_blocked_list()
  TO authenticated;

-- anon 역할 명시적 차단
REVOKE EXECUTE ON FUNCTION public.app_get_blocked_list()
  FROM anon;


-- ============================================================
-- 함수 코멘트
-- ============================================================
COMMENT ON FUNCTION public.app_get_blocked_list() IS
  '차단 회원 목록 조회 — 내가 차단한 회원의 공개 프로필 반환. '
  '원본: get_blocked_list.php. '
  'auth.uid() → blocker_id 자동 필터. 파라미터 없음. '
  'SECURITY DEFINER: members RLS(id=auth.uid()) 우회 — '
  'internal.members_public_profile VIEW로 안전 컬럼만 노출. '
  'unblocked_at IS NULL: 현재 차단 중인 건만 (해제된 건 제외). '
  '반환: json { success, data: [{ blocked_id, nickname, profile_image, blocked_at }] }. '
  '정렬: blocked_at DESC (최근 차단 순).';


-- ============================================================
-- 완료 알림
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE '[44-13] app_get_blocked_list 함수 생성 완료';
  RAISE NOTICE '  - 인자: 없음 (auth.uid() 자동 사용)';
  RAISE NOTICE '  - 반환: json {success, data: [{blocked_id, nickname, profile_image, blocked_at}]}';
  RAISE NOTICE '  - 보안: SECURITY DEFINER + internal.members_public_profile VIEW';
  RAISE NOTICE '  - 필터: blocker_id = auth.uid() AND unblocked_at IS NULL';
  RAISE NOTICE '  - 정렬: blocked_at DESC (최근 차단 순)';
  RAISE NOTICE '  ';
  RAISE NOTICE '  [사전 조건]';
  RAISE NOTICE '    ① 44_00_app_public_views.sql (internal.members_public_profile VIEW)';
  RAISE NOTICE '    ② 43_01_app_rls_policies.sql (member_blocks RLS 정책)';
  RAISE NOTICE '  ';
  RAISE NOTICE '  [앱 호출 예시]';
  RAISE NOTICE '  const { data } = await supabase.rpc(''app_get_blocked_list'');';
  RAISE NOTICE '  // data.data => [{blocked_id, nickname, profile_image, blocked_at}]';
END $$;
