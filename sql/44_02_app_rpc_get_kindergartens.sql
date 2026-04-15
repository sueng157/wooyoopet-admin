-- ============================================================
-- SQL 44-2: app_get_kindergartens RPC 함수
-- ============================================================
-- 실행 방법: Supabase SQL Editor에 전체 복사하여 실행
-- 원본 PHP: get_partner_list.php
-- 용도: 유치원 목록 조회 (지도/카드 리스트) — 거리 정렬 + 리뷰수 + 찜 + 소형 가격
-- 보안: SECURITY INVOKER — 호출자 RLS 적용 + internal VIEW로 타인 프로필 안전 조회
-- ============================================================
--
-- [PHP 원본 로직 (get_partner_list.php)]
--   파라미터: mb_id (보호자/조회자 전화번호)
--   1️⃣ g5_write_partner.* 전체 SELECT
--      + settlement_info LEFT JOIN → WHERE settlement_info.status = 'active'
--        (LEFT JOIN이지만 WHERE 절에서 status='active' 필터링하므로 INNER JOIN 효과)
--      + g5_favorite_partner LEFT JOIN → is_favorite 판정
--      + review COUNT 서브쿼리 (type='partner' AND partner_id)
--   2️⃣ while 루프: partner_img1~10 → 절대 URL 배열 변환
--   3️⃣ JSON 반환: { result: { partners: [...] } }
--
--   원본 문제점/미구현:
--     - 페이지네이션 없음 — 전체 유치원을 한 번에 반환 (확장성 문제)
--     - 거리 정렬 없음 — 반환 순서 미정의
--     - partner_bank_name/account 노출됨 → 금융정보 비노출 원칙 위반
--     - partner_ho(호수) 노출됨 → 호수 비공개 정책 위반
--     - registration_status 개념 없음 (임시저장 유치원도 포함될 수 있음)
--
-- [Supabase 전환]
--   - mb_id(text 전화번호) → auth.uid() (SECURITY INVOKER, 파라미터 불필요)
--   - settlement_info.status = 'active' → kg.inicis_status = '등록완료' 직접 필터
--     kindergartens 테이블에 inicis_status 컬럼이 존재하므로
--     settlement_infos_public VIEW JOIN 불필요 (단일 테이블 필터로 단순화)
--   - g5_favorite_partner → favorite_kindergartens (auth.uid() 기준)
--   - review COUNT → guardian_reviews COUNT (kindergarten_id 기준)
--   - partner_img1~10 → photo_urls (text[] 배열, 변환 불필요)
--   - partner_bank_name/account → 제외 (금융정보 비노출)
--   - partner_ho → 제외 (호수 비공개 정책)
--   - noshow_count/noshow_sanction → 제외 (관리자 전용 데이터)
--   - registration_status 필터 추가 (임시저장 유치원 제외)
--   - Haversine 거리 계산 + 정렬 추가 (신규 개선)
--   - p_limit safety cap 추가 (신규 개선, 페이지네이션 대신)
--
-- [페이지네이션 설계 결정]
--   PHP 원본은 전체 반환 (페이지네이션 없음).
--   앱 화면은 지도 기반 유치원 목록 (utils/fetchPartnerList.ts).
--   지도 화면은 보이는 영역 내 전체 유치원을 한 번에 표시해야 하므로
--   p_page/p_per_page 오프셋 방식은 부적합.
--   → p_limit safety cap으로 최대 반환 건수만 제한 (기본 100, 최대 200).
--
-- [total_count 유지 사유]
--   지도 클러스터링(핀 안에 유치원 개수 표시)은 클라이언트에서 처리하는 것으로 추정.
--   외주개발자 확인 전이므로 total_count를 일단 유지하되,
--   클라이언트 클러스터링 확인 후 제거 가능.
--
-- [WHERE 조건 분석]
--   ① kg.inicis_status = '등록완료'
--      PHP: settlement_info.status = 'active' → Supabase: kindergartens.inicis_status 직접 필터
--      역할: PG(이니시스) 등록 완료된 유치원만 목록 표시 (결제 가능)
--   ② kg.registration_status = 'registered'
--      PHP: 해당 개념 없음 (Supabase에서 42_02에서 추가된 컬럼)
--      역할: 정식 등록 유치원만 표시, 임시저장(temp) 제외
--   ③ kg.business_status — 필터 아님, 표시용으로 반환만
--      '영업중'/'방학중' 값을 그대로 반환하여 앱 UI 표시
--
-- [RLS 영향 분석]
--   4개 테이블/VIEW 참조 + 1개 서브쿼리:
--
--   ① kindergartens
--      정책: kindergartens_select_app — USING (true) — 전체 공개
--      통과: ✅ 직접 사용
--
--   ② members (→ internal.members_public_profile VIEW)
--      정책: members_select_app — USING (id = auth.uid()) — 본인만
--      통과: ❌ 차단 (타인=운영자 프로필 조회 불가)
--      해결: ✅ internal.members_public_profile VIEW 사용
--            (SECURITY DEFINER, 11 안전 컬럼만 노출)
--
--   ③ favorite_kindergartens
--      정책: favorite_kindergartens_select_app — USING (member_id = auth.uid())
--      통과: ✅ auth.uid() 기준으로 본인 찜만 확인 (RLS 일치)
--
--   ④ guardian_reviews
--      정책: guardian_reviews_select_app — USING (true) — 전체 공개
--      통과: ✅ 직접 사용 (COUNT 서브쿼리)
--
--   RLS 충돌: 1건 (members) → internal VIEW 1개로 해결
--   settlement_infos_public VIEW: 불필요 (kindergartens.inicis_status 직접 필터)
--   SECURITY INVOKER 적합성: ✅
-- ============================================================


-- 기존 함수 제거 (재실행 안전)
DROP FUNCTION IF EXISTS public.app_get_kindergartens(double precision, double precision, int);


-- ============================================================
-- 함수 정의
-- ============================================================
CREATE OR REPLACE FUNCTION public.app_get_kindergartens(
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
  v_kindergartens    json;
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
  -- 2. 파라미터 정규화 및 경계값 방어
  -- ──────────────────────────────────────────────────────
  -- p_limit: 최소 1, 최대 200
  v_safe_limit := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 200);

  -- 좌표 유효성: 둘 다 NOT NULL이어야 거리 계산
  v_has_coords := (p_latitude IS NOT NULL AND p_longitude IS NOT NULL);

  -- ──────────────────────────────────────────────────────
  -- 3. 전체 건수 조회
  --    클라이언트 클러스터링 확인 후 제거 가능
  -- ──────────────────────────────────────────────────────
  SELECT COUNT(*)::int
  INTO v_total_count
  FROM kindergartens kg
  WHERE kg.inicis_status = '등록완료'
    AND kg.registration_status = 'registered';

  -- ──────────────────────────────────────────────────────
  -- 4. 메인 쿼리 — CTE로 Haversine 1회 계산
  --    + 리뷰 수 서브쿼리 + 찜 여부 + 운영자 프로필
  -- ──────────────────────────────────────────────────────
  WITH kg_list AS (
    SELECT
      -- 유치원 기본 정보
      kg.id,
      kg.name,
      kg.description,
      kg.photo_urls,
      kg.business_status,
      kg.freshness_current,
      -- 주소 (address_building_ho 제외 — 호수 비공개 정책)
      kg.address_road,
      kg.address_jibun,
      kg.address_complex,
      kg.address_building_dong,
      -- 위치
      kg.latitude,
      kg.longitude,
      -- 소형 기준 가격 2개 (목록 표시용, 12개 전체는 상세에서)
      kg.price_small_1h,
      kg.price_small_24h,
      -- Haversine 거리 (km) — CTE 내에서 1회 계산
      -- acos 인자가 부동소수점 오차로 1.0을 초과할 수 있으므로 LEAST(1.0, ...) 보호
      CASE WHEN v_has_coords
                AND kg.latitude IS NOT NULL
                AND kg.longitude IS NOT NULL
      THEN ROUND((6371.0 * acos(LEAST(1.0,
        cos(radians(p_latitude)) * cos(radians(kg.latitude))
        * cos(radians(kg.longitude) - radians(p_longitude))
        + sin(radians(p_latitude)) * sin(radians(kg.latitude))
      )))::numeric, 2)
      END AS distance_km,
      -- 리뷰 수 (guardian_reviews — 공개 SELECT, 상관 서브쿼리)
      (SELECT COUNT(*)::int
       FROM guardian_reviews gr
       WHERE gr.kindergarten_id = kg.id
         AND gr.is_hidden = false
      ) AS review_count,
      -- 찜 여부 (favorite_kindergartens — RLS: member_id = auth.uid())
      -- auth.uid() NULL은 단계 1에서 이미 차단되었으므로 여기서는 안전
      -- 방어적으로 COALESCE 처리
      COALESCE(fk.kindergarten_id IS NOT NULL, false) AS is_favorite,
      -- 운영자 프로필 (internal VIEW — RLS 우회)
      -- members 직접 조회 시 RLS(id = auth.uid()) 차단
      json_build_object(
        'nickname', mp.nickname,
        'profile_image', mp.profile_image
      ) AS owner
    FROM kindergartens kg
    -- 운영자 프로필 (internal VIEW — RLS 차단 우회)
    LEFT JOIN internal.members_public_profile mp
      ON mp.id = kg.member_id
    -- 찜 여부 (RLS 통과: member_id = auth.uid())
    LEFT JOIN favorite_kindergartens fk
      ON fk.kindergarten_id = kg.id
      AND fk.member_id = v_current_uid
    -- WHERE: 활성 유치원만
    WHERE kg.inicis_status = '등록완료'              -- PG 등록 완료 (결제 가능)
      AND kg.registration_status = 'registered'      -- 정식 등록 (임시저장 제외)
    -- noshow_count, noshow_sanction: 조회하지 않음 (관리자 전용)
    -- address_building_ho: 조회하지 않음 (호수 비공개)
    -- partner_bank_name/account: 조회하지 않음 (금융정보 비노출)
  )
  SELECT json_agg(
    json_build_object(
      'id', kl.id,
      'name', kl.name,
      'description', kl.description,
      'photo_urls', kl.photo_urls,
      'business_status', kl.business_status,
      'freshness_current', kl.freshness_current,
      'address_road', kl.address_road,
      'address_jibun', kl.address_jibun,
      'address_complex', kl.address_complex,
      'address_building_dong', kl.address_building_dong,
      'latitude', kl.latitude,
      'longitude', kl.longitude,
      'distance_km', kl.distance_km,
      'price_small_1h', kl.price_small_1h,
      'price_small_24h', kl.price_small_24h,
      'review_count', kl.review_count,
      'is_favorite', kl.is_favorite,
      'owner', kl.owner
    )
    -- 정렬: 좌표 있으면 거리순, 없으면 최신순 (id DESC)
    ORDER BY
      CASE WHEN kl.distance_km IS NOT NULL THEN kl.distance_km END ASC NULLS LAST,
      kl.id DESC
  )
  INTO v_kindergartens
  FROM (
    SELECT *
    FROM kg_list
    ORDER BY
      CASE WHEN distance_km IS NOT NULL THEN distance_km END ASC NULLS LAST,
      id DESC
    LIMIT v_safe_limit
  ) kl;

  -- ──────────────────────────────────────────────────────
  -- 5. 성공 응답 조립
  --    결과 0건 시 빈 배열 반환 (목록 API이므로 에러 아님)
  -- ──────────────────────────────────────────────────────
  RETURN json_build_object(
    'success', true,
    'data', json_build_object(
      -- 전체 건수: 클라이언트 클러스터링 확인 후 제거 가능
      'total_count', v_total_count,
      'kindergartens', COALESCE(v_kindergartens, '[]'::json)
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
GRANT EXECUTE ON FUNCTION public.app_get_kindergartens(double precision, double precision, int)
  TO authenticated;

-- anon 역할 명시적 차단
REVOKE EXECUTE ON FUNCTION public.app_get_kindergartens(double precision, double precision, int)
  FROM anon;


-- ============================================================
-- 함수 코멘트
-- ============================================================
COMMENT ON FUNCTION public.app_get_kindergartens(double precision, double precision, int) IS
  '유치원 목록 조회 — 지도/카드 리스트 (거리순 정렬 + 리뷰수 + 찜여부 + 소형 가격). '
  '원본: get_partner_list.php. '
  'SECURITY INVOKER: kindergartens/favorite_kindergartens/reviews는 RLS 직접 통과, '
  'members는 internal.members_public_profile VIEW로 안전 조회. '
  'WHERE: inicis_status=등록완료 + registration_status=registered. '
  'settlement_infos_public VIEW 불필요 (kindergartens.inicis_status 직접 필터). '
  'address_building_ho(호수), noshow_count/sanction(관리자 전용), 금융정보 비공개. '
  '좌표 미제공 시 최신순(id DESC) 정렬. 결과 0건 시 빈 배열 반환.';


-- ============================================================
-- 완료 알림
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE '[44-2] app_get_kindergartens 함수 생성 완료';
  RAISE NOTICE '  - 인자: p_latitude double precision, p_longitude double precision, p_limit int';
  RAISE NOTICE '  - 반환: json {success, data: {total_count, kindergartens: [...]}}';
  RAISE NOTICE '  - 보안: SECURITY INVOKER + internal.members_public_profile VIEW 1개 사용';
  RAISE NOTICE '  - WHERE: inicis_status=등록완료 AND registration_status=registered';
  RAISE NOTICE '  - settlement_infos_public VIEW 불필요 (kg 테이블 직접 필터)';
  RAISE NOTICE '  - Haversine 거리 계산: CTE 내 1회, LEAST(1.0) 부동소수점 보호';
  RAISE NOTICE '  - p_limit 경계값: LEAST(GREATEST(p_limit, 1), 200)';
  RAISE NOTICE '  - 목록 가격: price_small_1h, price_small_24h (소형 2개만)';
  RAISE NOTICE '  - 제외: address_building_ho, noshow_*, bank_name/account';
  RAISE NOTICE '  - 결과 0건: 빈 배열 반환 (에러 아님)';
  RAISE NOTICE '  ';
  RAISE NOTICE '  [앱 호출 예시]';
  RAISE NOTICE '  // 거리순 정렬 (좌표 제공)';
  RAISE NOTICE '  const { data } = await supabase.rpc(''app_get_kindergartens'', {';
  RAISE NOTICE '    p_latitude: 37.5172,';
  RAISE NOTICE '    p_longitude: 127.0473,';
  RAISE NOTICE '    p_limit: 100';
  RAISE NOTICE '  });';
  RAISE NOTICE '  ';
  RAISE NOTICE '  // 최신순 정렬 (좌표 미제공)';
  RAISE NOTICE '  const { data } = await supabase.rpc(''app_get_kindergartens'', {});';
END $$;
