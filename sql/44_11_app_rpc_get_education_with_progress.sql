-- ============================================================
-- SQL 44-11: app_get_education_with_progress RPC 함수
-- ============================================================
-- 실행 방법: Supabase SQL Editor에 전체 복사하여 실행
-- 원본 PHP: get_education.php
-- 용도: 교육 주제 목록 + 퀴즈 + 유치원별 이수 현황 통합 조회
-- 보안: SECURITY INVOKER — education 테이블들의 RLS 자동 적용
-- ============================================================
--
-- [PHP 원본 로직 (get_education.php)]
--   1. ca_name(선택) 필터로 g5_write_education 전체 조회
--   2. g5_quiz_solved LEFT JOIN (mb_id 기준) → 퀴즈별 풀이 여부 확인
--   3. wr_content JSON 파싱 → intro(슬라이드 배열), question, answers 분리
--   4. 이미지 경로를 절대 URL로 변환
--   5. solved boolean 반환 (퀴즈별)
--
-- [Supabase 전환]
--   - g5_write_education → education_topics (정규화된 별도 테이블)
--   - wr_content JSON 내 퀴즈 → education_quizzes (별도 테이블, 파싱 불필요)
--   - g5_quiz_solved (퀴즈 단위) → education_completions (유치원 단위, JSONB)
--   - mb_id → p_kindergarten_id (유치원 단위 이수 관리)
--   - 이미지 URL → Supabase Storage URL로 이미 저장 (변환 불필요)
--
-- [핵심 차이]
--   레거시: 퀴즈 단위 풀이 추적 (g5_quiz_solved, 1 quiz = 1 row)
--   Supabase: 주제 단위 이수 추적 (education_completions.topic_details JSONB)
--   → topic별 completed_at 존재 여부가 solved 플래그를 대체
--
-- [RLS 영향 분석]
--   대상 테이블 3개:
--
--   ① education_topics
--      정책: education_topics_select_app — USING (true) — 전체 공개
--      통과: ✅ 모든 인증 사용자 SELECT 가능
--
--   ② education_quizzes
--      정책: education_quizzes_select_app — USING (true) — 전체 공개
--      통과: ✅ 모든 인증 사용자 SELECT 가능
--
--   ③ education_completions
--      정책: education_completions_select_app
--        USING (kindergarten_id IN (
--          SELECT id FROM kindergartens WHERE member_id = auth.uid()
--        ))
--      통과: ✅ 본인 소유 유치원의 이수 기록만 조회 가능
--        → 함수 호출자 = 유치원 운영자이므로 자연스럽게 통과
--        → 타인 유치원 ID 전달 시: RLS가 차단 → completion 0건
--          → 에러가 아닌, 모든 topic이 "미이수" + 기본값 반환 (안전)
--
--   RLS 충돌: ❌ 없음
--   internal VIEW 사용: ❌ 불필요 (members/pets/settlement_infos 참조 없음)
--   SECURITY INVOKER 적합성: ✅
-- ============================================================


-- 기존 함수 제거 (재실행 안전)
DROP FUNCTION IF EXISTS public.app_get_education_with_progress(uuid);


-- ============================================================
-- 함수 정의
-- ============================================================
CREATE OR REPLACE FUNCTION public.app_get_education_with_progress(
  p_kindergarten_id uuid              -- 이수 현황을 조회할 유치원 ID
)
RETURNS json
LANGUAGE plpgsql
STABLE                               -- 읽기 전용 함수
SECURITY INVOKER                     -- RLS 적용 (호출자 권한)
SET search_path = public
AS $$
DECLARE
  v_current_uid    uuid;
  v_total_topics   int;
  v_topic_details  jsonb;
  v_completion     record;
  v_completion_json json;
  v_topics_json    json;
BEGIN
  -- ──────────────────────────────────────────────────────
  -- 1. 호출자 인증 확인
  -- ──────────────────────────────────────────────────────
  v_current_uid := auth.uid();

  IF v_current_uid IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', '인증되지 않은 사용자입니다.',
      'code', 'AUTH_REQUIRED'
    );
  END IF;

  -- ──────────────────────────────────────────────────────
  -- 2. 공개 교육 주제 수 동적 계산
  --    completion 레코드 유무와 무관하게 항상 최신 값 사용
  -- ──────────────────────────────────────────────────────
  SELECT COUNT(*)::int
  INTO v_total_topics
  FROM education_topics
  WHERE visibility = '공개';

  -- ──────────────────────────────────────────────────────
  -- 3. 유치원의 이수 기록 조회 (0건 또는 1건)
  --    ※ RLS(education_completions_select_app)가 자동 적용:
  --      본인 소유 유치원이 아니면 0건 반환
  -- ──────────────────────────────────────────────────────
  SELECT
    ec.topic_details,
    ec.completed_topics,
    ec.progress_rate,
    ec.completion_status,
    ec.checklist_confirmed,
    ec.pledge_agreed,
    ec.all_completed_at
  INTO v_completion
  FROM education_completions ec
  WHERE ec.kindergarten_id = p_kindergarten_id;

  -- ──────────────────────────────────────────────────────
  -- 4. completion 결과 → JSON 변환
  --    ※ 보완사항: 레코드 미존재 시 기본값으로 채움
  --    → 앱에서 별도 null 체크 없이 바로 사용 가능
  -- ──────────────────────────────────────────────────────
  IF v_completion IS NULL THEN
    -- 이수 기록이 아직 생성되지 않은 경우 (첫 진입)
    v_topic_details := '[]'::jsonb;
    v_completion_json := json_build_object(
      'kindergarten_id', p_kindergarten_id,
      'total_topics', v_total_topics,
      'completed_topics', 0,
      'progress_rate', 0.0,
      'completion_status', '미시작',
      'checklist_confirmed', false,
      'pledge_agreed', false,
      'all_completed_at', null
    );
  ELSE
    -- 이수 기록이 존재하는 경우
    v_topic_details := COALESCE(v_completion.topic_details, '[]'::jsonb);
    v_completion_json := json_build_object(
      'kindergarten_id', p_kindergarten_id,
      'total_topics', v_total_topics,
      'completed_topics', COALESCE(v_completion.completed_topics, 0),
      'progress_rate', COALESCE(v_completion.progress_rate, 0.0),
      'completion_status', COALESCE(v_completion.completion_status, '미시작'),
      'checklist_confirmed', COALESCE(v_completion.checklist_confirmed, false),
      'pledge_agreed', COALESCE(v_completion.pledge_agreed, false),
      'all_completed_at', v_completion.all_completed_at
    );
  END IF;

  -- ──────────────────────────────────────────────────────
  -- 5. 공개 교육 주제 + 퀴즈 + 이수 여부 통합 조회
  --    ※ education_topics: 공개 SELECT (USING true)
  --    ※ education_quizzes: 공개 SELECT (USING true)
  --    ※ topic_details JSONB에서 topic_id 매칭으로 완료 여부 판정
  -- ──────────────────────────────────────────────────────
  SELECT json_agg(t ORDER BY t.display_order ASC)
  INTO v_topics_json
  FROM (
    SELECT
      et.id               AS topic_id,
      et.display_order,
      et.title,
      et.top_image_url,
      et.principle_text,
      et.principle_details,
      et.correct_behavior_1,
      et.correct_behavior_2,
      et.wrong_behavior_1,
      -- 이수 여부: topic_details JSONB에서 해당 topic_id의 completed_at 존재 여부
      EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_topic_details) AS td
        WHERE (td->>'topic_id')::uuid = et.id
      ) AS is_completed,
      -- 완료 일시
      (
        SELECT td->>'completed_at'
        FROM jsonb_array_elements(v_topic_details) AS td
        WHERE (td->>'topic_id')::uuid = et.id
        LIMIT 1
      ) AS completed_at,
      -- 퀴즈 (1:1 LEFT JOIN → JSON 객체)
      CASE
        WHEN eq.id IS NOT NULL THEN
          json_build_object(
            'quiz_id', eq.id,
            'question_text', eq.question_text,
            'question_image_url', eq.question_image_url,
            'choice_a', eq.choice_a,
            'choice_b', eq.choice_b,
            'correct_answer', eq.correct_answer,
            'correct_explanation', eq.correct_explanation,
            'wrong_explanation', eq.wrong_explanation
          )
        ELSE NULL
      END AS quiz
    FROM education_topics et
    LEFT JOIN education_quizzes eq ON eq.topic_id = et.id
    WHERE et.visibility = '공개'
  ) t;

  -- ──────────────────────────────────────────────────────
  -- 6. 성공 응답
  -- ──────────────────────────────────────────────────────
  RETURN json_build_object(
    'success', true,
    'data', json_build_object(
      'completion', v_completion_json,
      'topics', COALESCE(v_topics_json, '[]'::json)
    )
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM,
      'code', SQLSTATE
    );
END;
$$;


-- ============================================================
-- 함수 권한 부여
-- ============================================================
-- authenticated 역할에만 실행 허용 (비인증 사용자 차단)
GRANT EXECUTE ON FUNCTION public.app_get_education_with_progress(uuid)
  TO authenticated;

-- anon 역할 명시적 차단
REVOKE EXECUTE ON FUNCTION public.app_get_education_with_progress(uuid)
  FROM anon;


-- ============================================================
-- 함수 코멘트
-- ============================================================
COMMENT ON FUNCTION public.app_get_education_with_progress(uuid) IS
  '교육 주제 + 퀴즈 + 이수현황 통합 조회 — 유치원별 교육 진행 상태를 반환. '
  '원본: get_education.php. '
  'SECURITY INVOKER: education_completions RLS가 본인 소유 유치원만 허용. '
  'completion 레코드 미존재 시 기본값(미시작, 0%) 반환.';


-- ============================================================
-- 완료 알림
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE '[44-11] app_get_education_with_progress 함수 생성 완료';
  RAISE NOTICE '  - 인자: p_kindergarten_id uuid';
  RAISE NOTICE '  - 반환: json {success, data: {completion, topics}}';
  RAISE NOTICE '  - 보안: SECURITY INVOKER + education RLS 자동 적용';
  RAISE NOTICE '  - completion 미존재 시: 기본값 반환 (미시작, 0%%, false)';
  RAISE NOTICE '  ';
  RAISE NOTICE '  [앱 호출 예시]';
  RAISE NOTICE '  const { data } = await supabase.rpc(''app_get_education_with_progress'', {';
  RAISE NOTICE '    p_kindergarten_id: ''uuid-of-kindergarten''';
  RAISE NOTICE '  });';
  RAISE NOTICE '  ';
  RAISE NOTICE '  [반환 구조]';
  RAISE NOTICE '  {';
  RAISE NOTICE '    "success": true,';
  RAISE NOTICE '    "data": {';
  RAISE NOTICE '      "completion": {';
  RAISE NOTICE '        "kindergarten_id": "...",';
  RAISE NOTICE '        "total_topics": 3,';
  RAISE NOTICE '        "completed_topics": 2,';
  RAISE NOTICE '        "progress_rate": 66.7,';
  RAISE NOTICE '        "completion_status": "진행중",';
  RAISE NOTICE '        "checklist_confirmed": false,';
  RAISE NOTICE '        "pledge_agreed": false,';
  RAISE NOTICE '        "all_completed_at": null';
  RAISE NOTICE '      },';
  RAISE NOTICE '      "topics": [';
  RAISE NOTICE '        {';
  RAISE NOTICE '          "topic_id": "...",';
  RAISE NOTICE '          "display_order": 1,';
  RAISE NOTICE '          "title": "안전한 돌봄 환경 만들기",';
  RAISE NOTICE '          "is_completed": true,';
  RAISE NOTICE '          "completed_at": "2026-02-01T14:00:00+09:00",';
  RAISE NOTICE '          "quiz": { ... }';
  RAISE NOTICE '        }';
  RAISE NOTICE '      ]';
  RAISE NOTICE '    }';
  RAISE NOTICE '  }';
END $$;
