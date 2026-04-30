-- ============================================================
-- SQL 44-9: app_get_guardian_reviews RPC 함수
-- ============================================================
-- 실행 방법: Supabase SQL Editor에 전체 복사하여 실행
-- 원본 PHP: get_review.php (type='pet')
-- 용도: 보호자 후기 목록 — 유치원 상세 화면 "후기" 탭에서 호출
-- 보안: SECURITY INVOKER — 호출자 RLS 적용 + internal VIEW로 타인 데이터 안전 조회
-- ============================================================
--
-- [PHP 원본 로직 (get_review.php, type='pet')]
--   파라미터: type='pet', id=pet_id
--   1️⃣ 태그 집계: RECURSIVE CTE로 JSON_EXTRACT → 6개 기본 태그 LEFT JOIN COUNT
--   2️⃣ 리뷰 목록: SELECT * FROM review WHERE type='pet' AND pet_id=? ORDER BY id DESC
--   3️⃣ N+1 서브쿼리: 리뷰 1건마다 pet/partner/member 개별 SELECT
--   반환: { tags: [{tag, count}], reviews: [{...}] }
--
--   원본 문제점:
--     - 페이지네이션 없음 (전체 목록 한 번에 반환)
--     - N+1 쿼리 (리뷰 N건 × 서브쿼리 3개)
--     - 인증 없음 (누구나 조회 가능)
--     - partner_bank_name/account 노출 (금융정보)
--     - rCnt: '0' 하드코딩, sDeg: '100%' 하드코딩
--     - is_hidden 필터 없음 (관리자 숨김 후기도 전체 노출)
--
-- [Supabase 전환]
--   - type 분기 제거: 별도 RPC로 분리 (app_get_guardian_reviews)
--   - pet_id 필터 → kindergarten_id 필터 (보호자가 유치원에 대해 작성한 후기)
--   - N+1 → 단일 JOIN 쿼리
--   - 페이지네이션 추가 (p_page, p_per_page, 최대 50)
--   - auth.uid() 인증 필수
--   - is_hidden = false 필터 (관리자 숨김 후기 제외)
--   - partner_bank_name/account 제외
--   - ORDER BY written_at DESC (PHP의 id DESC → 자연스러운 시간순)
--
-- [태그 집계]
--   현재 모바일앱에서 보호자 후기의 태그 집계 화면은 없음.
--   향후 확장 대비로 포함 (서버에서 제거하면 RPC 재배포 필요).
--   앱에서 tags 배열을 무시하면 부작용 없음. 집계 비용도 미미 (7개 COUNT).
--
--   guardian_reviews 태그는 만족도에 따라 동일 주제의 긍정/부정 문구가 다름.
--   (7개 주제 × 긍정/부정 = 14개 태그)
--   태그 집계는 긍정 태그만 COUNT (부정 태그의 마이너스 처리는 후속 과제).
--   → 유치원 평판 지표로 사용 시 긍정 기준이 자연스러움.
--
--   [7개 주제별 긍정/부정 태그]
--     ① 상담: 긍정 "상담이 친절하고 편안했어요" / 부정 "상담이 불친절하거나 불편했어요"
--     ② 사진: 긍정 "사진과 영상을 자주 보내주셨어요" / 부정 "사진과 영상 공유가 부족했어요"
--     ③ 상태보고: 긍정 "아이 상태를 자세히 알려주셨어요" / 부정 "아이 상태 공유가 부족했어요"
--     ④ 컨디션: 긍정 "아이 컨디션 변화에 빠르게 대응해 주셨어요" / 부정 "아이 컨디션 변화에 대응이 느렸어요"
--     ⑤ 시설: 긍정 "시설이 깨끗하고 관리가 잘 되어있어요" / 부정 "집(유치원)이 지저분하거나 위생이 걱정됐어요"
--     ⑥ 일정: 긍정 "예약한 돌봄 일정을 잘 지켜주셨어요" / 부정 "돌봄 일정이 잘 지켜지지 않았어요"
--     ⑦ 재이용: 긍정 "다음에도 맡기고 싶어요" / 부정 "다시 맡기기는 어려울 것 같아요"
--
-- [RLS 영향 분석]
--   4개 테이블/VIEW 참조:
--
--   ① guardian_reviews
--      정책: guardian_reviews_select_app — USING (true) — 전체 공개
--      통과: ✅ 직접 사용
--
--   ② kindergartens
--      정책: kindergartens_select_app — USING (true) — 전체 공개
--      통과: ✅ 직접 사용 (유치원 존재 확인)
--
--   ③ pets (→ internal.pets_public_info VIEW)
--      정책: pets_select_app — USING (member_id = auth.uid()) — 본인만
--      통과: ❌ 타인의 pet 정보 필요 (리뷰에 연결된 반려동물)
--      해결: ✅ internal.pets_public_info VIEW 사용
--
--   ④ members (→ internal.members_public_profile VIEW)
--      정책: members_select_app — USING (id = auth.uid()) — 본인만
--      통과: ❌ 리뷰 작성자 프로필 필요
--      해결: ✅ internal.members_public_profile VIEW 사용
--
--   RLS 충돌: 2건 (members, pets) → internal VIEW 2개로 해결
--   SECURITY INVOKER 적합성: ✅
-- ============================================================


-- 기존 함수 제거 (재실행 안전)
DROP FUNCTION IF EXISTS public.app_get_guardian_reviews(uuid, int, int);


-- ============================================================
-- 함수 정의
-- ============================================================
CREATE OR REPLACE FUNCTION public.app_get_guardian_reviews(
  p_kindergarten_id  uuid,                -- 필수: 후기를 볼 유치원 ID
  p_page             int  DEFAULT 1,
  p_per_page         int  DEFAULT 20      -- 최대 50
)
RETURNS json
LANGUAGE plpgsql
STABLE                                    -- 읽기 전용 함수
SECURITY INVOKER                          -- RLS 적용 (호출자 권한)
SET search_path = public
AS $$
DECLARE
  v_current_uid    uuid;
  v_per_page       int;
  v_page           int;
  v_offset         int;
  v_total          bigint;
  v_tags_json      json;
  v_reviews_json   json;
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
  -- 2. 입력값 검증
  -- ──────────────────────────────────────────────────────
  IF p_kindergarten_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'kindergarten_id는 필수입니다.',
      'code', 'MISSING_PARAMETER'
    );
  END IF;

  -- 유치원 존재 확인
  IF NOT EXISTS (SELECT 1 FROM kindergartens WHERE id = p_kindergarten_id) THEN
    RETURN json_build_object(
      'success', false,
      'error', '유치원을 찾을 수 없습니다.',
      'code', 'KINDERGARTEN_NOT_FOUND'
    );
  END IF;

  -- 페이지네이션 안전값 보정
  v_per_page := LEAST(GREATEST(p_per_page, 1), 50);
  v_page     := GREATEST(p_page, 1);
  v_offset   := (v_page - 1) * v_per_page;

  -- ──────────────────────────────────────────────────────
  -- 3. 태그 집계 (긍정 태그 7개 기준)
  --    현재 앱 미사용 — 향후 확장 대비 포함.
  --    앱에서 tags 배열을 무시하면 부작용 없음.
  --    긍정 태그만 COUNT (부정 태그 마이너스 처리는 후속 과제).
  --
  --    집계 대상: is_hidden = false (숨김 후기 제외)
  -- ──────────────────────────────────────────────────────
  WITH base_tags(ord, tag) AS (
    VALUES
      (1, '상담이 친절하고 편안했어요'),
      (2, '사진과 영상을 자주 보내주셨어요'),
      (3, '아이 상태를 자세히 알려주셨어요'),
      (4, '아이 컨디션 변화에 빠르게 대응해 주셨어요'),
      (5, '시설이 깨끗하고 관리가 잘 되어있어요'),
      (6, '예약한 돌봄 일정을 잘 지켜주셨어요'),
      (7, '다음에도 맡기고 싶어요')
  ),
  review_tags AS (
    SELECT jsonb_array_elements_text(gr.selected_tags) AS tag
    FROM guardian_reviews gr
    WHERE gr.kindergarten_id = p_kindergarten_id
      AND gr.is_hidden = false
  ),
  tag_counts AS (
    SELECT bt.ord, bt.tag, COUNT(rt.tag) AS cnt
    FROM base_tags bt
    LEFT JOIN review_tags rt ON bt.tag = rt.tag
    GROUP BY bt.ord, bt.tag
  )
  SELECT COALESCE(json_agg(
    json_build_object('tag', tc.tag, 'count', tc.cnt)
    ORDER BY tc.ord
  ), '[]'::json)
  INTO v_tags_json
  FROM tag_counts tc;

  -- ──────────────────────────────────────────────────────
  -- 4. 총 건수 (is_hidden = false 기준)
  -- ──────────────────────────────────────────────────────
  SELECT COUNT(*)
  INTO v_total
  FROM guardian_reviews gr
  WHERE gr.kindergarten_id = p_kindergarten_id
    AND gr.is_hidden = false;

  -- ──────────────────────────────────────────────────────
  -- 5. 리뷰 목록 조회
  --    - is_hidden = false (숨김 후기 제외)
  --    - ORDER BY written_at DESC (최신순)
  --    - pet: internal.pets_public_info VIEW (RLS 우회)
  --    - member: internal.members_public_profile VIEW (RLS 우회)
  --    - kindergarten 객체 제외 (조회 대상 = 유치원이므로 중복)
  -- ──────────────────────────────────────────────────────
  SELECT COALESCE(json_agg(row_data ORDER BY row_written_at DESC), '[]'::json)
  INTO v_reviews_json
  FROM (
    SELECT
      gr.written_at AS row_written_at,
      json_build_object(
        'id', gr.id,
        'satisfaction', gr.satisfaction,
        'selected_tags', gr.selected_tags,
        'content', gr.content,
        'image_urls', gr.image_urls,
        'written_at', gr.written_at,
        -- 리뷰에 연결된 반려동물 (internal VIEW — RLS 우회)
        'pet', CASE WHEN pp.id IS NOT NULL THEN
          json_build_object(
            'id', pp.id,
            'name', pp.name,
            'breed', pp.breed,
            'photo_urls', pp.photo_urls
          )
          ELSE NULL
        END,
        -- 리뷰 작성자 = 보호자 (internal VIEW — RLS 우회)
        'member', json_build_object(
          'id', mp.id,
          'nickname', mp.nickname,
          'profile_image', mp.profile_image
        )
      ) AS row_data
    FROM guardian_reviews gr
    LEFT JOIN internal.pets_public_info pp ON pp.id = gr.pet_id
    JOIN internal.members_public_profile mp ON mp.id = gr.member_id
    WHERE gr.kindergarten_id = p_kindergarten_id
      AND gr.is_hidden = false
    ORDER BY gr.written_at DESC
    LIMIT v_per_page OFFSET v_offset
  ) sub;

  -- ──────────────────────────────────────────────────────
  -- 6. 성공 응답 조립
  -- ──────────────────────────────────────────────────────
  RETURN json_build_object(
    'success', true,
    'data', json_build_object(
      'tags', v_tags_json,
      'reviews', v_reviews_json,
      'meta', json_build_object(
        'page', v_page,
        'per_page', v_per_page,
        'total', v_total
      )
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
GRANT EXECUTE ON FUNCTION public.app_get_guardian_reviews(uuid, int, int)
  TO authenticated;

-- anon 역할 명시적 차단
REVOKE EXECUTE ON FUNCTION public.app_get_guardian_reviews(uuid, int, int)
  FROM anon;


-- ============================================================
-- 함수 코멘트
-- ============================================================
COMMENT ON FUNCTION public.app_get_guardian_reviews(uuid, int, int) IS
  '보호자 후기 목록 — 유치원 상세 화면 "후기" 탭. '
  '원본: get_review.php (type=pet). '
  'p_kindergarten_id 기준 guardian_reviews 조회. '
  'SECURITY INVOKER: guardian_reviews/kindergartens는 RLS 직접 통과, '
  'members/pets는 internal VIEW로 안전 조회. '
  '태그 집계: 긍정 태그 7개 기준 COUNT (현재 앱 미사용, 향후 확장 대비). '
  '부정 태그 마이너스 처리는 후속 과제. '
  'is_hidden = false 필터 (관리자 숨김 후기 제외). '
  'ORDER BY written_at DESC. 페이지네이션: p_page/p_per_page (최대 50).';


-- ============================================================
-- 완료 알림
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE '[44-9] app_get_guardian_reviews 함수 생성 완료';
  RAISE NOTICE '  - 인자: p_kindergarten_id uuid, p_page int, p_per_page int';
  RAISE NOTICE '  - 반환: json {success, data: {tags, reviews, meta}}';
  RAISE NOTICE '  - 보안: SECURITY INVOKER + internal VIEW 2개 (members_public_profile, pets_public_info)';
  RAISE NOTICE '  - 태그: 긍정 7개 기준 COUNT (앱 미사용, 향후 대비)';
  RAISE NOTICE '  - 7개 주제: 상담/사진/상태보고/컨디션/시설/일정/재이용 (긍정+부정=14개 태그)';
  RAISE NOTICE '  - 필터: is_hidden = false, ORDER BY written_at DESC';
  RAISE NOTICE '  - 반환 필드: id, satisfaction, selected_tags, content, image_urls, written_at, pet, member';
  RAISE NOTICE '  - kindergarten 객체 제외 (조회 대상 = 유치원이므로 중복)';
  RAISE NOTICE '  ';
  RAISE NOTICE '  [앱 호출 예시]';
  RAISE NOTICE '  const { data } = await supabase.rpc(''app_get_guardian_reviews'', {';
  RAISE NOTICE '    p_kindergarten_id: ''uuid-of-kindergarten'',';
  RAISE NOTICE '    p_page: 1,';
  RAISE NOTICE '    p_per_page: 20';
  RAISE NOTICE '  });';
END $$;
