-- ============================================================
-- SQL 56-02: app_get_active_pledge RPC 함수 (신규)
-- ============================================================
-- 용도:
--   모바일앱에서 현재 적용중인 활동서약서 1건(제목, 인트로 본문, 항목+서브항목)
--   을 조회. 서약서는 유치원용 단일 시리즈만 운영 중이므로 파라미터 없음.
--
-- 사용 예시:
--   유치원 교육이수 화면 (체크리스트 다음 단계)
--   → rpc('app_get_active_pledge')
--
-- 보안:
--   SECURITY DEFINER — pledges/pledge_items RLS 우회.
--   적용중인 서약서는 어차피 모든 앱 사용자가 봐도 되는 공개 정보.
--
-- 반환:
--   적용중 버전이 있을 때:
--   {
--     "id": "uuid",
--     "version_number": 1,
--     "title": "유치원 파트너 활동 서약서",
--     "body_content": "우유펫 유치원은 ...",
--     "items": [
--       {
--         "display_order": 1,
--         "content": "1. 역할의 한정 및 성실한 돌봄",
--         "sub_items": ["급여 제한: ...", "탈출 방지: ...", "책임 소재: ..."]
--       }
--     ]
--   }
--
--   적용중 버전이 없을 때: NULL
--
-- 실행 방법:
--   Supabase SQL Editor에 이 파일 전체 복사하여 한 번에 실행.
-- ============================================================


-- 기존 함수 제거 (재실행 안전)
DROP FUNCTION IF EXISTS public.app_get_active_pledge();


-- ============================================================
-- 함수 정의
-- ============================================================
CREATE OR REPLACE FUNCTION public.app_get_active_pledge()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pledge  record;
  v_items   jsonb;
BEGIN
  -- ──────────────────────────────────────────────────────
  -- 1. 현재 적용중인 서약서 1건 조회
  --    같은 상태는 최대 1건이 정상. 혹시 2건 이상이면 최신 버전 선택.
  -- ──────────────────────────────────────────────────────
  SELECT id, version_number, title, body_content
  INTO v_pledge
  FROM pledges
  WHERE apply_status = '현재 적용중'
  ORDER BY version_number DESC
  LIMIT 1;

  IF v_pledge IS NULL THEN
    RETURN NULL;
  END IF;

  -- ──────────────────────────────────────────────────────
  -- 2. 해당 서약서 항목 + 서브항목(JSONB) 조회 (display_order 순)
  -- ──────────────────────────────────────────────────────
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'display_order', pi.display_order,
        'content',       pi.content,
        'sub_items',     COALESCE(pi.sub_items, '[]'::jsonb)
      )
      ORDER BY pi.display_order ASC
    ),
    '[]'::jsonb
  )
  INTO v_items
  FROM pledge_items pi
  WHERE pi.pledge_id = v_pledge.id;

  -- ──────────────────────────────────────────────────────
  -- 3. 통합 결과 반환
  -- ──────────────────────────────────────────────────────
  RETURN jsonb_build_object(
    'id',             v_pledge.id,
    'version_number', v_pledge.version_number,
    'title',          v_pledge.title,
    'body_content',   v_pledge.body_content,
    'items',          v_items
  );
END;
$$;


-- ============================================================
-- 함수 권한 부여
-- ============================================================
GRANT EXECUTE ON FUNCTION public.app_get_active_pledge() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.app_get_active_pledge() FROM anon;


-- ============================================================
-- 함수 코멘트
-- ============================================================
COMMENT ON FUNCTION public.app_get_active_pledge() IS
  '모바일앱용: 현재 적용중인 활동서약서 1건(제목/본문/항목+서브항목)을 조회. '
  '서약서는 유치원용 단일 시리즈만 운영(파라미터 없음). '
  '적용중 버전이 없으면 NULL 반환. '
  '사용처: 유치원 교육이수 마지막 단계(체크리스트 다음).';


-- ============================================================
-- 검증 쿼리 (함수 생성 후 별도 실행)
-- ============================================================
-- SELECT app_get_active_pledge();


-- ============================================================
-- 완료 알림
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE '[56-02] app_get_active_pledge 함수 생성 완료';
  RAISE NOTICE '  - 인자: 없음';
  RAISE NOTICE '  - 반환: jsonb { id, version_number, title, body_content, items[] } 또는 NULL';
  RAISE NOTICE '  ';
  RAISE NOTICE '  [앱 호출 예시]';
  RAISE NOTICE '  const { data } = await supabase.rpc(''app_get_active_pledge'');';
END $$;
