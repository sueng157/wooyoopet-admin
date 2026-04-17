-- ============================================================
-- SQL 44-4: app_get_guardians RPC 함수
-- ============================================================
-- 실행 방법: Supabase SQL Editor에 전체 복사하여 실행
-- 원본 PHP: get_protector_list.php (소스 미존재 — 역추론)
-- 용도: 보호자 목록 조회 (카드 리스트) — 거리 정렬 + 반려동물 썸네일
-- 보안: SECURITY INVOKER — 호출자 RLS 적용 + internal VIEW로 타인 데이터 안전 조회
-- ============================================================
--
-- [역추론 근거]
--   ① MOBILE_APP_ANALYSIS.md #21: api/get_protector_list.php → utils/fetchProtectorList.ts
--   ② legacy_php_api_all.txt: get_protector_list.php 파일 미존재 확인
--   ③ get_partner_list.php (유치원 목록)의 대칭 구조로 역추론
--      - 유치원 목록: mb_id(보호자) → 유치원 전체 목록 + 리뷰수 + 찜 반환
--      - 보호자 목록: auth.uid()(유치원 운영자) → 보호자 목록 + 반려동물 썸네일 반환
--   ④ 44_02 app_get_kindergartens를 템플릿으로 사용
--
-- [유치원 목록(#2)과의 차이점]
--   - 대상 테이블: kindergartens → internal.members_public_profile VIEW
--   - 필터: inicis_status/registration_status → current_mode='보호자' + status='정상'
--   - 가격 정보: 제외 (보호자에게 가격 없음)
--   - 리뷰 수: 제외 (앱 화면에 보호자 단위 리뷰 UI 없음)
--   - 찜 여부: 제외 (보호자 목록 카드에 찜 아이콘 없음, 상세(44_03)에서 반려동물별 표시)
--   - freshness/business_status: 제외 (유치원 전용 속성)
--   - description: 제외 (목록에 소개문 불필요)
--   - address_road/address_jibun: 제외 (보호자 상세 주소 비공개)
--   - distance_km: 정렬 전용으로 CTE 내부에서만 계산, 반환하지 않음
--   - pet_thumbnails: 추가 (보호자별 반려동물 첫 번째 사진 배열)
--   - address_building_dong: 추가 (카드에 "힐스테이트클래시안 102동" 형태 표시)
--   - name/nickname_tag/status/created_at: 제외 (타인 정보 비노출 / 목록 불필요)
--
-- [Supabase 전환]
--   - mb_id(text 전화번호) → auth.uid() (SECURITY INVOKER, 파라미터 불필요)
--   - 보호자 프로필 → internal.members_public_profile VIEW (11 안전 컬럼)
--   - 반려동물 썸네일 → internal.pets_public_info VIEW (상관 서브쿼리)
--   - Haversine 거리 계산: 44_02 동일 패턴 (CTE, LEAST(1.0) 보호)
--   - p_limit safety cap: 44_02 동일 패턴 (기본 100, 최대 200)
--
-- [주소 노출 정책]
--   address_complex(단지명) + address_building_dong(동)만 반환.
--   address_road/address_building_ho는 비공개.
--   ⚠️ address_building_dong은 현재 internal.members_public_profile VIEW에 미포함.
--      VIEW 수정(44_00)이 선행되어야 이 함수가 정상 동작함.
--
-- [페이지네이션 설계 결정]
--   모바일 앱이 무한스크롤 방식이므로 p_page/p_per_page 오프셋 방식 불필요.
--   44_02 app_get_kindergartens와 동일한 p_limit safety cap 방식 사용.
--
-- [WHERE 조건 분석]
--   ① mp.current_mode = '보호자'
--      역할: 유치원 운영자 모드인 회원을 목록에서 제외
--   ② mp.status = '정상'
--      역할: 탈퇴/정지 회원을 목록에서 제외
--      (상세(44_03)에서는 status를 반환만 하고 차단하지 않지만,
--       목록에서는 비정상 회원 카드 노출 방지를 위해 필터링 — 44_02와 동일 맥락)
--
-- [RLS 영향 분석]
--   2개 VIEW 참조:
--
--   ① internal.members_public_profile (VIEW, SECURITY DEFINER)
--      기저 테이블: members — 정책: members_select_app — USING (id = auth.uid()) — 본인만
--      통과: ✅ VIEW가 SECURITY DEFINER로 RLS 우회, 11 안전 컬럼만 노출
--      사용: 메인 쿼리 + total_count
--
--   ② internal.pets_public_info (VIEW, SECURITY DEFINER)
--      기저 테이블: pets — 정책: pets_select_app — USING (member_id = auth.uid()) — 본인만
--      통과: ✅ VIEW가 SECURITY DEFINER로 RLS 우회, 15 안전 컬럼 + deleted=false 필터
--      사용: 반려동물 썸네일 상관 서브쿼리
--
--   RLS 충돌: 0건 — internal VIEW 2개로 해결
--   SECURITY INVOKER 적합성: ✅
-- ============================================================


-- 기존 함수 제거 (재실행 안전)
DROP FUNCTION IF EXISTS public.app_get_guardians(double precision, double precision, int);


-- ============================================================
-- 함수 정의
-- ============================================================
CREATE OR REPLACE FUNCTION public.app_get_guardians(
  p_latitude   double precision DEFAULT NULL,   -- 조회자 현재 위도 (거리 정렬용, NULL이면 최신순)
  p_longitude  double precision DEFAULT NULL,   -- 조회자 현재 경도
  p_limit      int DEFAULT 100                  -- 최대 반환 건수 (safety cap, 기본 100)
)
RETURNS json
LANGUAGE plpgsql
STABLE                               -- 읽기 전용 함수
SECURITY INVOKER                     -- RLS 적용 (호출자 권한)
SET search_path = public
AS $$
DECLARE
  v_current_uid      uuid;
  v_safe_limit       int;
  v_has_coords       boolean;
  v_total_count      int;
  v_guardians        json;
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
  -- 2. 파라미터 정규화 및 전체 건수 조회
  -- ──────────────────────────────────────────────────────
  -- p_limit: 최소 1, 최대 200
  v_safe_limit := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 200);

  -- 좌표 유효성: 둘 다 NOT NULL이어야 거리 계산
  v_has_coords := (p_latitude IS NOT NULL AND p_longitude IS NOT NULL);

  -- 전체 건수 (필터 조건 동일)
  SELECT COUNT(*)::int
  INTO v_total_count
  FROM internal.members_public_profile mp
  WHERE mp.current_mode = '보호자'
    AND mp.status = '정상';

  -- ──────────────────────────────────────────────────────
  -- 3. 메인 쿼리 — CTE로 Haversine 1회 계산
  --    + 반려동물 썸네일 상관 서브쿼리
  -- ──────────────────────────────────────────────────────
  WITH guardian_list AS (
    SELECT
      -- 보호자 기본 정보
      mp.id,
      mp.nickname,
      mp.profile_image,
      mp.address_complex,
      mp.address_building_dong,
      mp.latitude,
      mp.longitude,
      -- Haversine 거리 (km) — 정렬 전용, 반환하지 않음
      -- acos 인자가 부동소수점 오차로 1.0을 초과할 수 있으므로 LEAST(1.0, ...) 보호
      CASE WHEN v_has_coords
                AND mp.latitude IS NOT NULL
                AND mp.longitude IS NOT NULL
      THEN ROUND((6371.0 * acos(LEAST(1.0,
        cos(radians(p_latitude)) * cos(radians(mp.latitude))
        * cos(radians(mp.longitude) - radians(p_longitude))
        + sin(radians(p_latitude)) * sin(radians(mp.latitude))
      )))::numeric, 2)
      END AS distance_km,
      -- 반려동물 썸네일 (상관 서브쿼리)
      -- 각 반려동물의 photo_urls 첫 번째 사진만 추출
      (SELECT json_agg(
        json_build_object(
          'id', pp.id,
          'name', pp.name,
          'thumbnail', pp.photo_urls[1]
        )
      )
      FROM internal.pets_public_info pp
      WHERE pp.member_id = mp.id
        AND pp.is_draft IS NOT TRUE
      ) AS pet_thumbnails
    FROM internal.members_public_profile mp
    WHERE mp.current_mode = '보호자'
      AND mp.status = '정상'
  )
  SELECT json_agg(
    json_build_object(
      'id', gl.id,
      'nickname', gl.nickname,
      'profile_image', gl.profile_image,
      'address_complex', gl.address_complex,
      'address_building_dong', gl.address_building_dong,
      'latitude', gl.latitude,
      'longitude', gl.longitude,
      'pet_thumbnails', COALESCE(gl.pet_thumbnails, '[]'::json)
    )
    -- 정렬: 좌표 있으면 거리순, 없으면 최신순 (id DESC)
    ORDER BY
      CASE WHEN gl.distance_km IS NOT NULL THEN gl.distance_km END ASC NULLS LAST,
      gl.id DESC
  )
  INTO v_guardians
  FROM (
    SELECT *
    FROM guardian_list
    ORDER BY
      CASE WHEN distance_km IS NOT NULL THEN distance_km END ASC NULLS LAST,
      id DESC
    LIMIT v_safe_limit
  ) gl;

  -- ──────────────────────────────────────────────────────
  -- 4. 성공 응답 조립
  --    결과 0건 시 빈 배열 반환 (목록 API이므로 에러 아님)
  -- ──────────────────────────────────────────────────────
  RETURN json_build_object(
    'success', true,
    'data', json_build_object(
      'total_count', v_total_count,
      'guardians', COALESCE(v_guardians, '[]'::json)
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
GRANT EXECUTE ON FUNCTION public.app_get_guardians(double precision, double precision, int)
  TO authenticated;

-- anon 역할 명시적 차단
REVOKE EXECUTE ON FUNCTION public.app_get_guardians(double precision, double precision, int)
  FROM anon;


-- ============================================================
-- 함수 코멘트
-- ============================================================
COMMENT ON FUNCTION public.app_get_guardians(double precision, double precision, int) IS
  '보호자 목록 조회 — 카드 리스트 (거리순 정렬 + 반려동물 썸네일). '
  '원본: get_protector_list.php (소스 미존재, get_partner_list.php 대칭 구조 역추론). '
  'SECURITY INVOKER: internal VIEW 2개로 타인 데이터 안전 조회. '
  'WHERE: current_mode=보호자 + status=정상. '
  '반환: nickname, profile_image, address_complex, address_building_dong, 좌표, pet_thumbnails. '
  '찜/리뷰 미포함 (목록 카드에 해당 UI 없음). '
  'distance_km는 정렬 전용 (반환하지 않음). '
  '좌표 미제공 시 최신순(id DESC) 정렬. 결과 0건 시 빈 배열 반환. '
  '⚠️ address_building_dong은 internal.members_public_profile VIEW 수정(44_00) 필요.';


-- ============================================================
-- 완료 알림
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE '[44-4] app_get_guardians 함수 생성 완료';
  RAISE NOTICE '  - 인자: p_latitude double precision, p_longitude double precision, p_limit int';
  RAISE NOTICE '  - 반환: json {success, data: {total_count, guardians: [...]}}';
  RAISE NOTICE '  - 보안: SECURITY INVOKER + internal VIEW 2개 사용';
  RAISE NOTICE '  - internal.members_public_profile: 보호자 프로필 (닉네임, 이미지, 단지명, 동, 좌표)';
  RAISE NOTICE '  - internal.pets_public_info: 반려동물 썸네일 (상관 서브쿼리, is_draft=false)';
  RAISE NOTICE '  - WHERE: current_mode=보호자 AND status=정상';
  RAISE NOTICE '  - Haversine 거리 계산: CTE 내 1회, 정렬 전용 (반환 안 함)';
  RAISE NOTICE '  - p_limit 경계값: LEAST(GREATEST(p_limit, 1), 200)';
  RAISE NOTICE '  - 찜/리뷰 미포함, distance_km 미반환';
  RAISE NOTICE '  - 결과 0건: 빈 배열 반환 (에러 아님)';
  RAISE NOTICE '  - ⚠️ VIEW 수정 필요: internal.members_public_profile에 address_building_dong 추가';
  RAISE NOTICE '  ';
  RAISE NOTICE '  [앱 호출 예시]';
  RAISE NOTICE '  // 거리순 정렬 (좌표 제공)';
  RAISE NOTICE '  const { data } = await supabase.rpc(''app_get_guardians'', {';
  RAISE NOTICE '    p_latitude: 37.5172,';
  RAISE NOTICE '    p_longitude: 127.0473,';
  RAISE NOTICE '    p_limit: 100';
  RAISE NOTICE '  });';
  RAISE NOTICE '  ';
  RAISE NOTICE '  // 최신순 정렬 (좌표 미제공)';
  RAISE NOTICE '  const { data } = await supabase.rpc(''app_get_guardians'', {});';
END $$;
