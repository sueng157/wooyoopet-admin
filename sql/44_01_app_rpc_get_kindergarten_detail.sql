-- ============================================================
-- SQL 44-1: app_get_kindergarten_detail RPC 함수
-- ============================================================
-- 실행 방법: Supabase SQL Editor에 전체 복사하여 실행
-- 원본 PHP: get_partner.php
-- 용도: 유치원 상세 정보 통합 조회 (프로필 + 운영자 + 상주동물 + 리뷰수 + 찜 + 정산상태)
-- 보안: SECURITY INVOKER — 호출자 RLS 적용 + internal VIEW로 타인 데이터 안전 조회
-- ============================================================
--
-- [PHP 원본 로직 (get_partner.php)]
--   파라미터: mb_id(유치원 운영자), user_id(조회자/보호자)
--   1️⃣ g5_write_partner 1건 조회
--      + g5_address_verification LEFT JOIN (주소 인증 정보)
--      + settlement_info LEFT JOIN (정산 상태: status)
--      + g5_favorite_partner LEFT JOIN (user_id 기준 찜 여부)
--      → partner_img1~10 → 절대 URL 배열 변환
--   2️⃣ g5_write_animal WHERE mb_id (유치원 보유 반려동물 목록)
--      → animal_img1~10 → 절대 URL 배열 변환
--   3️⃣ JSON 반환: { partner: {...}, animals: [...] }
--
--   원본 하드코딩/미구현:
--     - partner_freshness: 100 하드코딩 → Supabase: freshness_current 실제값
--     - partner_rCnt: '0' 하드코딩 → Supabase: guardian_reviews COUNT 실제값
--     - partner_bank_name/account: 노출됨 → Supabase: 제외 (금융정보 비노출)
--
-- [Supabase 전환]
--   - mb_id(text 전화번호) → p_kindergarten_id uuid
--   - user_id(text 전화번호) → auth.uid() (SECURITY INVOKER)
--   - p_viewer_id 파라미터 제거: auth.uid()를 직접 사용
--     → 외부에서 viewer ID를 받으면 타인의 찜 정보 조회 가능 (보안 구멍)
--   - partner_img1~10 → photo_urls (text[] 배열, 변환 불필요)
--   - g5_address_verification → kindergartens.address_auth_status 컬럼으로 통합
--   - settlement_info → internal.settlement_infos_public VIEW
--   - g5_favorite_partner → favorite_kindergartens
--   - g5_write_animal → kindergarten_resident_pets + internal.pets_public_info
--   - noshow_count/noshow_sanction → 제외 (관리자 전용 데이터, 앱 비노출)
--   - address_building_ho → 제외 (호수 비공개 정책, 1층/로비 원칙)
--
-- [settlement_infos 레코드 생성 시점 — PHP 원본 분석]
--   ① set_partner_update.php (L1162~1174):
--      유치원 등록/수정 시 settlement_info가 없으면 mb_id만으로 기본 행 INSERT.
--      → 유치원 최초 등록 시점에 빈 settlement_info 행이 생성됨.
--   ② set_settlement_info.php (L4407~4428):
--      정산정보 저장 시 기존 행이 없으면 INSERT, 있으면 UPDATE.
--      → 정산정보 입력 시점에도 UPSERT 처리.
--   결론: 유치원 등록 시 settlement_info 행이 생성되므로 대부분 존재하지만,
--         마이그레이션 시 누락 또는 비정상 상태 가능성 있음.
--         → LEFT JOIN + COALESCE(si.inicis_status, '미등록') 방어 처리 적용.
--
-- [주소 노출 정책]
--   address_building_dong까지만 반환. address_building_ho(호수)는 비공개.
--   유치원↔보호자 만남은 1층/로비 원칙이므로 호수 불필요.
--
-- [RLS 영향 분석]
--   7개 테이블/VIEW 참조:
--
--   ① kindergartens
--      정책: kindergartens_select_app — USING (true) — 전체 공개
--      통과: ✅ 직접 사용
--
--   ② members (→ internal.members_public_profile VIEW)
--      정책: members_select_app — USING (id = auth.uid()) — 본인만
--      통과: ❌ 차단 (타인=운영자 프로필 조회 불가)
--      해결: ✅ internal.members_public_profile VIEW 사용
--            (SECURITY DEFINER, 9 안전 컬럼만 노출)
--
--   ③ pets (→ internal.pets_public_info VIEW)
--      정책: pets_select_app — USING (member_id = auth.uid()) — 본인만
--      통과: ❌ 차단 (타인=운영자 반려동물 조회 불가)
--      해결: ✅ internal.pets_public_info VIEW 사용
--            (SECURITY DEFINER, 15 안전 컬럼, deleted=false 필터)
--
--   ④ settlement_infos (→ internal.settlement_infos_public VIEW)
--      정책: settlement_infos_select_app — USING (member_id = auth.uid()) — 본인만
--      통과: ❌ 차단 (타인 정산정보 조회 불가)
--      해결: ✅ internal.settlement_infos_public VIEW 사용
--            (SECURITY DEFINER, 4 안전 컬럼: id, member_id, kindergarten_id, inicis_status)
--
--   ⑤ favorite_kindergartens
--      정책: favorite_kindergartens_select_app — USING (member_id = auth.uid()) — 본인만
--      통과: ✅ auth.uid() 기준으로 본인 찜만 확인 (RLS 일치)
--
--   ⑥ kindergarten_resident_pets
--      정책: kindergarten_resident_pets_select_app — USING (true) — 전체 공개
--      통과: ✅ 직접 사용
--
--   ⑦ guardian_reviews
--      정책: guardian_reviews_select_app — USING (true) — 전체 공개
--      통과: ✅ 직접 사용 (COUNT 집계)
--
--   RLS 충돌: 3건 → internal VIEW 3개로 해결
--   SECURITY INVOKER 적합성: ✅
-- ============================================================


-- 기존 함수 제거 (재실행 안전)
DROP FUNCTION IF EXISTS public.app_get_kindergarten_detail(uuid);


-- ============================================================
-- 함수 정의
-- ============================================================
CREATE OR REPLACE FUNCTION public.app_get_kindergarten_detail(
  p_kindergarten_id uuid              -- 조회할 유치원 ID
)
RETURNS json
LANGUAGE plpgsql
STABLE                               -- 읽기 전용 함수
SECURITY INVOKER                     -- RLS 적용 (호출자 권한)
SET search_path = public
AS $$
DECLARE
  v_current_uid      uuid;
  v_kg               record;
  v_operator_json    json;
  v_animals_json     json;
  v_resident_pets_json json;
  v_review_count     int;
  v_inicis_status    text;
  v_is_favorite      boolean;
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
  -- 2. 유치원 존재 여부 사전 검증
  --    존재하지 않으면 즉시 에러 반환 (null JSON 조립 방지)
  -- ──────────────────────────────────────────────────────
  SELECT
    kg.id,
    kg.member_id,
    kg.name,
    kg.description,
    kg.photo_urls,
    kg.business_status,
    kg.freshness_current,
    kg.freshness_initial,
    kg.address_road,
    kg.address_jibun,
    kg.address_complex,
    kg.address_building_dong,
    -- address_building_ho 제외 (호수 비공개 정책)
    kg.address_auth_status,
    kg.address_doc_urls,
    kg.price_small_1h,
    kg.price_small_24h,
    kg.price_small_walk,
    kg.price_small_pickup,
    kg.price_medium_1h,
    kg.price_medium_24h,
    kg.price_medium_walk,
    kg.price_medium_pickup,
    kg.price_large_1h,
    kg.price_large_24h,
    kg.price_large_walk,
    kg.price_large_pickup,
    kg.registration_status,
    -- noshow_count, noshow_sanction 제외 (관리자 전용 데이터, 앱 비노출)
    kg.latitude,
    kg.longitude,
    kg.created_at
  INTO v_kg
  FROM kindergartens kg
  WHERE kg.id = p_kindergarten_id;

  IF v_kg IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', '유치원을 찾을 수 없습니다.',
      'code', 'KINDERGARTEN_NOT_FOUND'
    );
  END IF;

  -- ──────────────────────────────────────────────────────
  -- 3. 운영자(operator) 프로필 (internal VIEW — RLS 우회)
  --    members 직접 조회 시 RLS(id = auth.uid()) 차단
  --    VIEW 변경: name, nickname_tag, status 제거 (앱 미사용)
  -- ──────────────────────────────────────────────────────
  SELECT json_build_object(
    'id', mp.id,
    'nickname', mp.nickname,
    'profile_image', mp.profile_image
  )
  INTO v_operator_json
  FROM internal.members_public_profile mp
  WHERE mp.id = v_kg.member_id;

  -- ──────────────────────────────────────────────────────
  -- 4. 상주 반려동물 (kindergarten_resident_pets + internal VIEW)
  --    운영자가 키우는 반려동물 = 유치원 상주 반려동물
  --    kindergarten_resident_pets JOIN으로 한 번만 조회
  -- ──────────────────────────────────────────────────────
  SELECT json_agg(
    json_build_object(
      'id', pp.id,
      'name', pp.name,
      'breed', pp.breed,
      'gender', pp.gender,
      'birth_date', pp.birth_date,
      'is_birth_date_unknown', pp.is_birth_date_unknown,
      'weight', pp.weight,
      'size_class', pp.size_class,
      'is_neutered', pp.is_neutered,
      'is_vaccinated', pp.is_vaccinated,
      'photo_urls', pp.photo_urls,
      'is_representative', pp.is_representative,
      'description', pp.description
    )
  )
  INTO v_resident_pets_json
  FROM kindergarten_resident_pets krp
  JOIN internal.pets_public_info pp ON pp.id = krp.pet_id
  WHERE krp.kindergarten_id = p_kindergarten_id;

  -- ──────────────────────────────────────────────────────
  -- 5. 리뷰 수 집계 (guardian_reviews — 공개 SELECT)
  --    review_count만 반환 (만족도는 텍스트 평가이므로 평균 개념 없음)
  -- ──────────────────────────────────────────────────────
  SELECT COUNT(*)::int
  INTO v_review_count
  FROM guardian_reviews
  WHERE kindergarten_id = p_kindergarten_id
    AND is_hidden = false;

  -- ──────────────────────────────────────────────────────
  -- 6. 정산 활성화 상태 (internal VIEW — RLS 우회)
  --    settlement_infos 레코드 미존재 가능성 방어:
  --    유치원 등록 시 기본 행이 생성되지만 (set_partner_update.php L1162~1174)
  --    마이그레이션 누락 등 비정상 상태 대비 COALESCE 처리
  -- ──────────────────────────────────────────────────────
  SELECT COALESCE(si.inicis_status, '미등록')
  INTO v_inicis_status
  FROM internal.settlement_infos_public si
  WHERE si.kindergarten_id = p_kindergarten_id;

  -- settlement_infos 레코드 자체가 없는 경우
  IF v_inicis_status IS NULL THEN
    v_inicis_status := '미등록';
  END IF;

  -- ──────────────────────────────────────────────────────
  -- 7. 찜 여부 (favorite_kindergartens — RLS 통과)
  --    auth.uid()를 직접 사용 (p_viewer_id 제거)
  --    auth.uid()가 NULL인 경우 이미 단계 1에서 에러 반환하므로
  --    여기까지 도달하면 v_current_uid는 항상 NOT NULL.
  --    그러나 방어적으로 false 기본값 처리.
  -- ──────────────────────────────────────────────────────
  SELECT EXISTS (
    SELECT 1
    FROM favorite_kindergartens
    WHERE kindergarten_id = p_kindergarten_id
      AND member_id = v_current_uid
  )
  INTO v_is_favorite;

  -- 방어 처리: 예상치 못한 상황 대비
  v_is_favorite := COALESCE(v_is_favorite, false);

  -- ──────────────────────────────────────────────────────
  -- 8. 성공 응답 조립
  -- ──────────────────────────────────────────────────────
  RETURN json_build_object(
    'success', true,
    'data', json_build_object(
      'kindergarten', json_build_object(
        'id', v_kg.id,
        'name', v_kg.name,
        'description', v_kg.description,
        'photo_urls', v_kg.photo_urls,
        'business_status', v_kg.business_status,
        'freshness_current', v_kg.freshness_current,
        'freshness_initial', v_kg.freshness_initial,
        'address_road', v_kg.address_road,
        'address_jibun', v_kg.address_jibun,
        'address_complex', v_kg.address_complex,
        'address_building_dong', v_kg.address_building_dong,
        'address_auth_status', v_kg.address_auth_status,
        'address_doc_urls', v_kg.address_doc_urls,
        'prices', json_build_object(
          'small', json_build_object(
            '1h', v_kg.price_small_1h,
            '24h', v_kg.price_small_24h,
            'walk', v_kg.price_small_walk,
            'pickup', v_kg.price_small_pickup
          ),
          'medium', json_build_object(
            '1h', v_kg.price_medium_1h,
            '24h', v_kg.price_medium_24h,
            'walk', v_kg.price_medium_walk,
            'pickup', v_kg.price_medium_pickup
          ),
          'large', json_build_object(
            '1h', v_kg.price_large_1h,
            '24h', v_kg.price_large_24h,
            'walk', v_kg.price_large_walk,
            'pickup', v_kg.price_large_pickup
          )
        ),
        'registration_status', v_kg.registration_status,
        'latitude', v_kg.latitude,
        'longitude', v_kg.longitude,
        'created_at', v_kg.created_at
      ),
      'operator', COALESCE(v_operator_json, '{}'::json),
      'resident_pets', COALESCE(v_resident_pets_json, '[]'::json),
      'review_count', v_review_count,
      'inicis_status', v_inicis_status,
      'is_favorite', v_is_favorite
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
GRANT EXECUTE ON FUNCTION public.app_get_kindergarten_detail(uuid)
  TO authenticated;

-- anon 역할 명시적 차단
REVOKE EXECUTE ON FUNCTION public.app_get_kindergarten_detail(uuid)
  FROM anon;


-- ============================================================
-- 함수 코멘트
-- ============================================================
COMMENT ON FUNCTION public.app_get_kindergarten_detail(uuid) IS
  '유치원 상세 정보 통합 조회 — 프로필 + operator(운영자) + 상주동물 + 리뷰수 + 찜여부 + 정산상태. '
  '원본: get_partner.php. '
  'SECURITY INVOKER: kindergartens/favorite_kindergartens/reviews는 RLS 직접 통과, '
  'members/pets/settlement_infos는 internal VIEW로 안전 조회. '
  'address_building_ho(호수), noshow_count/sanction(관리자 전용) 비공개. '
  'auth.uid()로 찜여부 확인 (p_viewer_id 제거).';


-- ============================================================
-- 완료 알림
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE '[44-1] app_get_kindergarten_detail 함수 생성 완료';
  RAISE NOTICE '  - 인자: p_kindergarten_id uuid';
  RAISE NOTICE '  - 반환: json {success, data: {kindergarten, operator, resident_pets, review_count, inicis_status, is_favorite}}';
  RAISE NOTICE '  - 보안: SECURITY INVOKER + internal VIEW 3개 사용';
  RAISE NOTICE '  - internal.members_public_profile: 운영자 프로필 (닉네임, 프로필 이미지) — name,nickname_tag,status 제거';
  RAISE NOTICE '  - internal.pets_public_info: 상주 반려동물 (kindergarten_resident_pets JOIN)';
  RAISE NOTICE '  - internal.settlement_infos_public: 정산 상태 (inicis_status)';
  RAISE NOTICE '  - 호수(address_building_ho) 비공개, review_count만 반환';
  RAISE NOTICE '  ';
  RAISE NOTICE '  [앱 호출 예시]';
  RAISE NOTICE '  const { data } = await supabase.rpc(''app_get_kindergarten_detail'', {';
  RAISE NOTICE '    p_kindergarten_id: ''uuid-of-kindergarten''';
  RAISE NOTICE '  });';
END $$;
