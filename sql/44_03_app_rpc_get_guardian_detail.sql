-- ============================================================
-- SQL 44-3: app_get_guardian_detail RPC 함수
-- ============================================================
-- 실행 방법: Supabase SQL Editor에 전체 복사하여 실행
-- 원본 PHP: get_protector.php (소스 미존재 — 역추론)
-- 용도: 보호자 상세 정보 통합 조회 (프로필 + 반려동물 목록 + 반려동물별 찜 여부)
-- 보안: SECURITY INVOKER — 호출자 RLS 적용 + internal VIEW로 타인 데이터 안전 조회
-- ============================================================
--
-- [역추론 근거]
--   ① MOBILE_APP_ANALYSIS.md #20: api/get_protector.php → hooks/useProtector.ts
--   ② legacy_php_api_all.txt: get_protector.php 파일 미존재 확인
--   ③ get_partner.php (유치원 상세)의 대칭 구조로 역추론
--      - 유치원 상세: mb_id(유치원) + user_id(보호자) → 프로필 + 반려동물 + 찜
--      - 보호자 상세: p_member_id(보호자) + auth.uid()(유치원 운영자) → 프로필 + 반려동물 + 찜
--   ④ 44_01 app_get_kindergarten_detail을 템플릿으로 사용
--
-- [유치원 상세(#1)와의 차이점]
--   - prices, inicis_status: 제외 (보호자에게 가격표/정산 없음)
--   - address_road: 제외 (보호자 상세 주소는 개인정보)
--     → address_complex(단지명) + address_building_dong(동) 노출
--       (internal.members_public_profile VIEW에 포함, 보호자 목록 "단지+동" 표시)
--   - address_auth_status, address_doc_urls: 제외 (보호자 인증 서류 비공개)
--   - business_status, freshness_*: 제외 (유치원 전용 속성)
--   - review_count: 제외 (앱 화면에 보호자 단위 리뷰 UI 없음.
--     반려동물별 리뷰는 44_12 app_get_kindergarten_reviews가 p_pet_id 기준으로 처리)
--   - is_favorite: 보호자 단위 → 반려동물 단위 (pets 배열 내부에 개별 포함)
--   - resident_pets (kindergarten_resident_pets JOIN) → pets (member_id 직접 필터)
--   - owner (운영자 프로필) → guardian (보호자 본인이 조회 대상)
--
-- [Supabase 전환]
--   - mb_id(text 전화번호) → p_member_id uuid
--   - user_id(text 전화번호) → auth.uid() (SECURITY INVOKER)
--   - g5_write_animal → internal.pets_public_info VIEW (deleted=false, is_draft 필터 추가)
--   - g5_favorite_animal → favorite_pets LEFT JOIN (반려동물별 찜 여부)
--   - 보호자 프로필 → internal.members_public_profile VIEW (9 안전 컬럼)
--
-- [주소 노출 정책]
--   address_complex(단지명) + address_building_dong(동) 반환. address_road/ho는 비공개.
--   보호자의 상세 주소는 개인정보이므로 단지명 수준만 노출.
--
-- [RLS 영향 분석]
--   3개 테이블/VIEW 참조:
--
--   ① internal.members_public_profile (VIEW, SECURITY DEFINER)
--      기저 테이블: members — 정책: members_select_app — USING (id = auth.uid()) — 본인만
--      통과: ✅ VIEW가 SECURITY DEFINER로 RLS 우회, 9 안전 컬럼만 노출
--
--   ② internal.pets_public_info (VIEW, SECURITY DEFINER)
--      기저 테이블: pets — 정책: pets_select_app — USING (member_id = auth.uid()) — 본인만
--      통과: ✅ VIEW가 SECURITY DEFINER로 RLS 우회, 15 안전 컬럼 + deleted=false 필터
--
--   ③ favorite_pets
--      정책: favorite_pets_select_app — USING (member_id = auth.uid()) — 본인만
--      통과: ✅ auth.uid() 기준으로 본인 찜만 확인 (RLS 일치)
--
--   RLS 충돌: 0건 — internal VIEW 2개 + favorite_pets RLS 직접 통과
--   SECURITY INVOKER 적합성: ✅
-- ============================================================


-- 기존 함수 제거 (재실행 안전)
DROP FUNCTION IF EXISTS public.app_get_guardian_detail(uuid);


-- ============================================================
-- 함수 정의
-- ============================================================
CREATE OR REPLACE FUNCTION public.app_get_guardian_detail(
  p_member_id uuid              -- 조회할 보호자 회원 ID
)
RETURNS json
LANGUAGE plpgsql
STABLE                          -- 읽기 전용 함수
SECURITY INVOKER                -- RLS 적용 (호출자 권한)
SET search_path = public
AS $$
DECLARE
  v_current_uid   uuid;
  v_guardian       record;
  v_pets_json     json;
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
  -- 2. 보호자 존재 여부 + 프로필 조회 (internal VIEW — RLS 우회)
  --    members 직접 조회 시 RLS(id = auth.uid()) 차단
  --    internal.members_public_profile은 9 안전 컬럼만 노출
  --    status는 반환만 하고 차단하지 않음 (44_01 유치원 상세와 동일 정책)
  --    → 앱에서 status 값으로 UI 처리 (전체 RPC 일관성 유지)
  -- ──────────────────────────────────────────────────────
  SELECT
    mp.id,
    mp.nickname,
    mp.profile_image,
    mp.address_complex,
    mp.address_building_dong,
    mp.status
  INTO v_guardian
  FROM internal.members_public_profile mp
  WHERE mp.id = p_member_id;

  IF v_guardian IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', '보호자를 찾을 수 없습니다.',
      'code', 'GUARDIAN_NOT_FOUND'
    );
  END IF;

  -- ──────────────────────────────────────────────────────
  -- 3. 반려동물 목록 + 반려동물별 찜 여부
  --    internal.pets_public_info: deleted=false 자동 필터
  --    is_draft = true: 임시저장 상태 → 타인 조회 시 제외
  --    favorite_pets: 호출자(유치원 운영자)가 해당 반려동물을 찜했는지
  --      → RLS(member_id = auth.uid()) 정확 일치, RLS 통과 ✅
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
      'description', pp.description,
      'is_favorite', COALESCE(fp.is_favorite, false)
    )
  )
  INTO v_pets_json
  FROM internal.pets_public_info pp
  LEFT JOIN favorite_pets fp
    ON fp.pet_id = pp.id
    AND fp.member_id = v_current_uid   -- 호출자(유치원 운영자)의 찜
    AND fp.is_favorite = true
  WHERE pp.member_id = p_member_id
    AND pp.is_draft IS NOT TRUE;       -- 임시저장 반려동물 제외

  -- ──────────────────────────────────────────────────────
  -- 4. 성공 응답 조립
  -- ──────────────────────────────────────────────────────
  RETURN json_build_object(
    'success', true,
    'data', json_build_object(
      'guardian', json_build_object(
        'id', v_guardian.id,
        'nickname', v_guardian.nickname,
        'profile_image', v_guardian.profile_image,
        'address_complex', v_guardian.address_complex,
        'address_building_dong', v_guardian.address_building_dong,
        'status', v_guardian.status
      ),
      'pets', COALESCE(v_pets_json, '[]'::json)
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
GRANT EXECUTE ON FUNCTION public.app_get_guardian_detail(uuid)
  TO authenticated;

-- anon 역할 명시적 차단
REVOKE EXECUTE ON FUNCTION public.app_get_guardian_detail(uuid)
  FROM anon;


-- ============================================================
-- 함수 코멘트
-- ============================================================
COMMENT ON FUNCTION public.app_get_guardian_detail(uuid) IS
  '보호자 상세 정보 통합 조회 — 프로필 + 반려동물 목록 + 반려동물별 찜여부. '
  '원본: get_protector.php (소스 미존재, get_partner.php 대칭 구조 역추론). '
  'SECURITY INVOKER: favorite_pets는 RLS 직접 통과, '
  'members/pets는 internal VIEW로 안전 조회. '
  '보호자 상세 주소(address_road/ho) 비공개, address_complex(단지명)+address_building_dong(동) 노출. '
  '리뷰 수 미포함 (앱 화면에 보호자 단위 리뷰 UI 없음, 반려동물별 리뷰는 44_12 참조). '
  '찜은 보호자 단위가 아닌 반려동물 단위로 pets 배열 내부에 개별 포함.';


-- ============================================================
-- 완료 알림
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE '[44-3] app_get_guardian_detail 함수 생성 완료';
  RAISE NOTICE '  - 인자: p_member_id uuid';
  RAISE NOTICE '  - 반환: json {success, data: {guardian, pets[]}}';
  RAISE NOTICE '  - 보안: SECURITY INVOKER + internal VIEW 2개 사용';
  RAISE NOTICE '  - internal.members_public_profile: 보호자 프로필 (닉네임, 프로필 이미지, 단지명+동, 상태) — name,nickname_tag,created_at 제거';
  RAISE NOTICE '  - internal.pets_public_info: 보호자 반려동물 (is_draft=false, deleted=false)';
  RAISE NOTICE '  - favorite_pets LEFT JOIN: 반려동물별 찜 여부 (RLS member_id=auth.uid() 통과)';
  RAISE NOTICE '  - guardian 반환: id, nickname, profile_image, address_complex, address_building_dong, status';
  RAISE NOTICE '  - 리뷰 수 미포함, 찜은 pets 배열 내부 반려동물별 is_favorite';
  RAISE NOTICE '  ';
  RAISE NOTICE '  [앱 호출 예시]';
  RAISE NOTICE '  const { data } = await supabase.rpc(''app_get_guardian_detail'', {';
  RAISE NOTICE '    p_member_id: ''uuid-of-guardian''';
  RAISE NOTICE '  });';
END $$;
