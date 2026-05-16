-- ============================================================
-- SQL 56-01: app_get_active_checklist RPC 함수 (신규)
-- ============================================================
-- 용도:
--   모바일앱에서 현재 적용중인 체크리스트 1건과 해당 항목 목록을 조회.
--   target 파라미터로 '유치원' / '보호자' 구분.
--
-- 사용 예시 (3개 화면):
--   ① 유치원 교육이수 화면 (마지막 단계 체크리스트)
--      → rpc('app_get_active_checklist', { p_target: '유치원' })
--   ② 유치원 모드 채팅창 상단 아코디언
--      → rpc('app_get_active_checklist', { p_target: '유치원' })
--   ③ 보호자 모드 채팅창 상단 아코디언
--      → rpc('app_get_active_checklist', { p_target: '보호자' })
--
-- 보안:
--   SECURITY DEFINER — checklists/checklist_items RLS 우회.
--   대신 함수 내부에서 target 검증 + apply_status 필터로 안전성 확보.
--   적용중인 체크리스트는 어차피 모든 앱 사용자가 봐도 되는 공개 정보.
--
-- 반환:
--   적용중 버전이 있을 때:
--   {
--     "id": "uuid",
--     "version_number": 1,
--     "target": "보호자",
--     "items": [
--       { "display_order": 1, "content": "수칙 내용 1" },
--       { "display_order": 2, "content": "수칙 내용 2" }
--     ]
--   }
--
--   적용중 버전이 없을 때: NULL
--   잘못된 target 값: 예외 발생
--
-- 실행 방법:
--   Supabase SQL Editor에 이 파일 전체 복사하여 한 번에 실행.
-- ============================================================


-- 기존 함수 제거 (재실행 안전)
DROP FUNCTION IF EXISTS public.app_get_active_checklist(text);


-- ============================================================
-- 함수 정의
-- ============================================================
CREATE OR REPLACE FUNCTION public.app_get_active_checklist(
  p_target text                       -- '유치원' 또는 '보호자'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE                                -- 읽기 전용
SECURITY DEFINER                      -- RLS 우회 (함수 내부에서 안전성 보장)
SET search_path = public
AS $$
DECLARE
  v_checklist  record;
  v_items      jsonb;
BEGIN
  -- ──────────────────────────────────────────────────────
  -- 1. 입력값 검증
  -- ──────────────────────────────────────────────────────
  IF p_target IS NULL OR p_target NOT IN ('유치원', '보호자') THEN
    RAISE EXCEPTION '잘못된 target 값입니다: %. ''유치원'' 또는 ''보호자''만 허용됩니다.', p_target
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- ──────────────────────────────────────────────────────
  -- 2. 현재 적용중인 체크리스트 1건 조회
  --    같은 target 안에서 '현재 적용중'은 최대 1건이 정상.
  --    혹시 2건 이상이면 최신(version_number DESC) 1건만 선택.
  -- ──────────────────────────────────────────────────────
  SELECT id, version_number, target
  INTO v_checklist
  FROM checklists
  WHERE target = p_target
    AND apply_status = '현재 적용중'
  ORDER BY version_number DESC
  LIMIT 1;

  -- 적용중 버전이 없으면 NULL 반환 (앱에서 빈 화면 처리)
  IF v_checklist IS NULL THEN
    RETURN NULL;
  END IF;

  -- ──────────────────────────────────────────────────────
  -- 3. 해당 체크리스트의 활성 항목 조회 (display_order 순)
  -- ──────────────────────────────────────────────────────
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'display_order', ci.display_order,
        'content', ci.content
      )
      ORDER BY ci.display_order ASC
    ),
    '[]'::jsonb
  )
  INTO v_items
  FROM checklist_items ci
  WHERE ci.checklist_id = v_checklist.id
    AND ci.is_active = true;

  -- ──────────────────────────────────────────────────────
  -- 4. 통합 결과 반환
  -- ──────────────────────────────────────────────────────
  RETURN jsonb_build_object(
    'id',             v_checklist.id,
    'version_number', v_checklist.version_number,
    'target',         v_checklist.target,
    'items',          v_items
  );
END;
$$;


-- ============================================================
-- 함수 권한 부여
-- ============================================================
-- authenticated 역할에만 실행 허용 (비인증 사용자 차단)
GRANT EXECUTE ON FUNCTION public.app_get_active_checklist(text)
  TO authenticated;

-- anon 역할 명시적 차단
REVOKE EXECUTE ON FUNCTION public.app_get_active_checklist(text)
  FROM anon;


-- ============================================================
-- 함수 코멘트
-- ============================================================
COMMENT ON FUNCTION public.app_get_active_checklist(text) IS
  '모바일앱용: 현재 적용중인 체크리스트 1건과 활성 항목을 조회. '
  'p_target: ''유치원'' 또는 ''보호자''. '
  '적용중 버전이 없으면 NULL 반환. '
  '사용처: 유치원 교육이수 마지막 단계, 보호자/유치원 채팅창 상단 아코디언.';


-- ============================================================
-- 검증 쿼리 (함수 생성 후 별도 실행)
-- ============================================================

-- (1) 유치원 체크리스트 조회 — 적용중인 v3가 있다면 v3 + items 반환
-- SELECT app_get_active_checklist('유치원');

-- (2) 보호자 체크리스트 조회 — 적용중 버전 없으면 NULL
-- SELECT app_get_active_checklist('보호자');

-- (3) 잘못된 target — 예외 발생 확인
-- SELECT app_get_active_checklist('관리자');


-- ============================================================
-- 완료 알림
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE '[56-01] app_get_active_checklist 함수 생성 완료';
  RAISE NOTICE '  - 인자: p_target text (''유치원'' 또는 ''보호자'')';
  RAISE NOTICE '  - 반환: jsonb { id, version_number, target, items[] } 또는 NULL';
  RAISE NOTICE '  - 보안: SECURITY DEFINER + 함수 내부 검증';
  RAISE NOTICE '  ';
  RAISE NOTICE '  [앱 호출 예시]';
  RAISE NOTICE '  const { data } = await supabase.rpc(''app_get_active_checklist'', {';
  RAISE NOTICE '    p_target: ''보호자''';
  RAISE NOTICE '  });';
END $$;
