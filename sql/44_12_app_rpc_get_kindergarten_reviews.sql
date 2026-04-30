-- ============================================================
-- SQL 44-12: app_get_kindergarten_reviews RPC 함수
-- ============================================================
-- 실행 방법: Supabase SQL Editor에 전체 복사하여 실행
-- 원본 PHP: get_review.php (type='partner')
-- 용도: 유치원 후기 목록 — 보호자(반려동물) 프로필 화면에서 호출
-- 보안: SECURITY INVOKER — 호출자 RLS 적용 + internal VIEW로 타인 데이터 안전 조회
-- ============================================================
--
-- [PHP 원본 로직 (get_review.php, type='partner')]
--   파라미터: type='partner', id=partner_id
--   1️⃣ 태그 집계: RECURSIVE CTE로 JSON_EXTRACT → 6개 기본 태그 LEFT JOIN COUNT
--   2️⃣ 리뷰 목록: SELECT * FROM review WHERE type='partner' AND partner_id=? ORDER BY id DESC
--   3️⃣ N+1 서브쿼리: 리뷰 1건마다 pet/partner/member 개별 SELECT
--   반환: { tags: [{tag, count}], reviews: [{...}] }
--
--   원본 문제점:
--     - 페이지네이션 없음 (전체 목록 한 번에 반환)
--     - N+1 쿼리 (리뷰 N건 × 서브쿼리 3개)
--     - 인증 없음 (누구나 조회 가능)
--     - partner_bank_name/account 노출 (금융정보)
--     - rCnt: '0' 하드코딩
--     - is_hidden 필터 없음 (관리자 숨김 후기도 전체 노출)
--     - is_guardian_only 필터 없음 (보호자 전용 후기도 유치원에 노출)
--
-- [Supabase 전환]
--   - type 분기 제거: 별도 RPC로 분리 (app_get_kindergarten_reviews)
--   - partner_id 필터 → pet_id 필터 (유치원이 반려동물에 대해 작성한 후기)
--   - N+1 → 단일 JOIN 쿼리
--   - 페이지네이션 추가 (p_page, p_per_page, 최대 50)
--   - auth.uid() 인증 필수
--   - is_hidden = false 필터 (관리자 숨김 후기 제외)
--   - is_guardian_only 필터: 보호자가 아닌 사용자에게는 false인 후기만 표시
--   - partner_bank_name/account 제외
--   - ORDER BY written_at DESC (PHP의 id DESC → 자연스러운 시간순)
--
-- [태그 집계]
--   모바일앱 반려동물 프로필 화면에서 긍정 기준 태그 집계가 실제 표시됨.
--   현재는 긍정 태그 기준으로만 집계. 부정 태그의 마이너스 처리는 후속 과제.
--
--   PHP 원본의 6개 base_tags (유치원→반려동물 평가용):
--     '사람을 좋아하고 애교가 많아요'
--     '거의 짖지 않았어요'
--     '낯선 강아지/사람에게 공격성이 없어요'
--     '아이 청결상태가 좋아요'
--     '유치원에서 안정적으로 잘 있어요'
--     '편식이나 남기는것 없이 사료 잘 먹어요'
--
--   Supabase에서는 '다음에도 맡아주고 싶어요' 태그를 추가하여 7개 긍정 태그로 확장.
--   (테스트 데이터에서 실제 사용 확인됨)
--
--   [is_guardian_only 태그 집계 정책]
--   태그 집계 카운트: is_guardian_only = true 후기도 포함
--   (비공개는 내용이지 통계가 아님 — 태그 집계는 전체 후기 기반)
--   리뷰 목록 텍스트/내용: 보호자가 아닌 사용자에게는 is_guardian_only = false만 표시
--
-- [RLS 영향 분석]
--   5개 테이블/VIEW 참조:
--
--   ① kindergarten_reviews
--      정책: kindergarten_reviews_select_app — USING (true) — 전체 공개
--      통과: ✅ 직접 사용
--
--   ② kindergartens
--      정책: kindergartens_select_app — USING (true) — 전체 공개
--      통과: ✅ 직접 사용 (리뷰 작성 유치원 정보)
--
--   ③ pets (→ internal.pets_public_info VIEW)
--      정책: pets_select_app — USING (member_id = auth.uid()) — 본인만
--      통과: ❌ 반려동물 존재 확인 시 타인 pet 조회 필요
--      해결: ✅ internal.pets_public_info VIEW 사용
--
--   ④ members (→ internal.members_public_profile VIEW)
--      정책: members_select_app — USING (id = auth.uid()) — 본인만
--      통과: ❌ 반려동물 owner 확인 시 필요
--      해결: ✅ internal.members_public_profile VIEW 사용
--      (단, 리뷰 목록에서 member 객체는 반환하지 않음 — 유치원 운영자 프로필 불필요)
--
--   ⑤ pets (직접 — owner 확인용)
--      pets RLS: member_id = auth.uid() — is_guardian_only 분기 판단에 필요
--      → internal.pets_public_info VIEW로 member_id 확인 (VIEW에 member_id 포함)
--
--   RLS 충돌: 2건 (members, pets) → internal VIEW 2개로 해결
--   SECURITY INVOKER 적합성: ✅
-- ============================================================


-- 기존 함수 제거 (재실행 안전)
DROP FUNCTION IF EXISTS public.app_get_kindergarten_reviews(uuid, int, int);


-- ============================================================
-- 함수 정의
-- ============================================================
CREATE OR REPLACE FUNCTION public.app_get_kindergarten_reviews(
  p_pet_id           uuid,                -- 필수: 후기를 볼 반려동물 ID
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
  v_pet_owner_id   uuid;
  v_is_pet_owner   boolean;
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
  IF p_pet_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'pet_id는 필수입니다.',
      'code', 'MISSING_PARAMETER'
    );
  END IF;

  -- 반려동물 존재 확인 + owner 조회 (is_guardian_only 분기용)
  -- internal.pets_public_info VIEW 사용 (RLS 우회)
  SELECT pp.member_id
  INTO v_pet_owner_id
  FROM internal.pets_public_info pp
  WHERE pp.id = p_pet_id;

  IF v_pet_owner_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', '반려동물을 찾을 수 없습니다.',
      'code', 'PET_NOT_FOUND'
    );
  END IF;

  -- 호출자가 반려동물 보호자인지 확인
  v_is_pet_owner := (v_current_uid = v_pet_owner_id);

  -- 페이지네이션 안전값 보정
  v_per_page := LEAST(GREATEST(p_per_page, 1), 50);
  v_page     := GREATEST(p_page, 1);
  v_offset   := (v_page - 1) * v_per_page;

  -- ──────────────────────────────────────────────────────
  -- 3. 태그 집계 (긍정 태그 7개 기준)
  --    앱 반려동물 프로필 화면에서 실제 표시됨.
  --    긍정 태그만 COUNT (부정 태그 마이너스 처리는 후속 과제).
  --
  --    [is_guardian_only 태그 집계 정책]
  --    태그 집계 카운트: is_guardian_only = true 후기도 포함
  --    (비공개는 내용이지 통계가 아님)
  --    → WHERE 조건에 is_guardian_only 필터 없음
  -- ──────────────────────────────────────────────────────
  WITH base_tags(ord, tag) AS (
    VALUES
      (1, '사람을 좋아하고 애교가 많아요'),
      (2, '거의 짖지 않았어요'),
      (3, '낯선 강아지/사람에게 공격성이 없어요'),
      (4, '아이 청결상태가 좋아요'),
      (5, '유치원에서 안정적으로 잘 있어요'),
      (6, '편식이나 남기는것 없이 사료 잘 먹어요'),
      (7, '다음에도 맡아주고 싶어요')
  ),
  review_tags AS (
    SELECT jsonb_array_elements_text(kr.selected_tags) AS tag
    FROM kindergarten_reviews kr
    WHERE kr.pet_id = p_pet_id
      AND kr.is_hidden = false
      -- is_guardian_only 필터 없음: 태그 집계는 전체 후기 기반
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
  -- 4. 총 건수
  --    [is_guardian_only 리뷰 목록 정책]
  --    보호자(pet owner): 전체 후기 표시
  --    그 외 사용자: is_guardian_only = false만 표시
  -- ──────────────────────────────────────────────────────
  SELECT COUNT(*)
  INTO v_total
  FROM kindergarten_reviews kr
  WHERE kr.pet_id = p_pet_id
    AND kr.is_hidden = false
    AND (v_is_pet_owner OR kr.is_guardian_only = false);

  -- ──────────────────────────────────────────────────────
  -- 5. 리뷰 목록 조회
  --    - is_hidden = false (숨김 후기 제외)
  --    - is_guardian_only 분기: 보호자만 전체, 그 외 공개만
  --    - ORDER BY written_at DESC (최신순)
  --    - kindergarten: 리뷰 작성 유치원 정보 포함 (보호자 입장에서 어떤 유치원 후기인지)
  --    - pet 객체 제외 (조회 대상 = 반려동물이므로 중복)
  --    - member 객체 제외 (유치원 운영자 프로필을 따로 노출할 필요 없음)
  --    - image_urls 제외 (kindergarten_reviews에 image_urls 컬럼 없음)
  -- ──────────────────────────────────────────────────────
  SELECT COALESCE(json_agg(row_data ORDER BY row_written_at DESC), '[]'::json)
  INTO v_reviews_json
  FROM (
    SELECT
      kr.written_at AS row_written_at,
      json_build_object(
        'id', kr.id,
        'satisfaction', kr.satisfaction,
        'selected_tags', kr.selected_tags,
        'content', kr.content,
        'is_guardian_only', kr.is_guardian_only,
        'written_at', kr.written_at,
        -- 리뷰 작성 유치원 (RLS: USING(true) — 직접 조회)
        'kindergarten', json_build_object(
          'id', kg.id,
          'name', kg.name,
          'photo_urls', kg.photo_urls
        )
      ) AS row_data
    FROM kindergarten_reviews kr
    JOIN kindergartens kg ON kg.id = kr.kindergarten_id
    WHERE kr.pet_id = p_pet_id
      AND kr.is_hidden = false
      AND (v_is_pet_owner OR kr.is_guardian_only = false)
    ORDER BY kr.written_at DESC
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
GRANT EXECUTE ON FUNCTION public.app_get_kindergarten_reviews(uuid, int, int)
  TO authenticated;

-- anon 역할 명시적 차단
REVOKE EXECUTE ON FUNCTION public.app_get_kindergarten_reviews(uuid, int, int)
  FROM anon;


-- ============================================================
-- 함수 코멘트
-- ============================================================
COMMENT ON FUNCTION public.app_get_kindergarten_reviews(uuid, int, int) IS
  '유치원 후기 목록 — 보호자(반려동물) 프로필 화면. '
  '원본: get_review.php (type=partner). '
  'p_pet_id 기준 kindergarten_reviews 조회. '
  'SECURITY INVOKER: kindergarten_reviews/kindergartens는 RLS 직접 통과, '
  'pets는 internal VIEW로 owner 확인. '
  '태그 집계: 긍정 7개 기준 COUNT (앱에서 실제 표시). '
  '부정 태그 마이너스 처리는 후속 과제. '
  'is_guardian_only: 보호자만 전체 보임, 그 외 공개만 (리뷰 목록). '
  '태그 집계: is_guardian_only 무관 (비공개는 내용이지 통계가 아님). '
  'is_hidden = false 필터 (관리자 숨김 후기 제외). '
  'ORDER BY written_at DESC. 페이지네이션: p_page/p_per_page (최대 50).';


-- ============================================================
-- 완료 알림
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE '[44-12] app_get_kindergarten_reviews 함수 생성 완료';
  RAISE NOTICE '  - 인자: p_pet_id uuid, p_page int, p_per_page int';
  RAISE NOTICE '  - 반환: json {success, data: {tags, reviews, meta}}';
  RAISE NOTICE '  - 보안: SECURITY INVOKER + internal VIEW (pets_public_info)';
  RAISE NOTICE '  - 태그: 긍정 7개 기준 COUNT (앱 실제 표시)';
  RAISE NOTICE '  - 태그 집계: is_guardian_only 무관 (비공개는 내용이지 통계가 아님)';
  RAISE NOTICE '  - is_guardian_only: 보호자만 전체, 그 외 공개만';
  RAISE NOTICE '  - 필터: is_hidden = false, ORDER BY written_at DESC';
  RAISE NOTICE '  - 반환 필드: id, satisfaction, selected_tags, content, is_guardian_only, written_at, kindergarten';
  RAISE NOTICE '  - image_urls 없음 (kindergarten_reviews에 해당 컬럼 없음)';
  RAISE NOTICE '  - pet/member 객체 제외 (조회 대상 = 반려동물, 유치원 운영자 프로필 불필요)';
  RAISE NOTICE '  ';
  RAISE NOTICE '  [앱 호출 예시]';
  RAISE NOTICE '  const { data } = await supabase.rpc(''app_get_kindergarten_reviews'', {';
  RAISE NOTICE '    p_pet_id: ''uuid-of-pet'',';
  RAISE NOTICE '    p_page: 1,';
  RAISE NOTICE '    p_per_page: 20';
  RAISE NOTICE '  });';
END $$;
