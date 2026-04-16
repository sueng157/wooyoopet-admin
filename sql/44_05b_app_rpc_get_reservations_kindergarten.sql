-- ============================================================
-- SQL 44-5b: app_get_reservations_kindergarten RPC 함수
-- ============================================================
-- 실행 방법: Supabase SQL Editor에 전체 복사하여 실행
-- 원본 PHP: get_payment_request.php
-- 용도: 유치원용 예약 목록 조회 — 나에게 들어온 돌봄예약 + 보호자·반려동물·결제 정보
-- 보안: SECURITY INVOKER — 호출자 RLS 적용 + internal VIEW로 타인 데이터 안전 조회
-- ============================================================
--
-- [PHP 원본 로직 (get_payment_request.php)]
--   파라미터: mb_id(보호자), to_mb_id(유치원), pet_id(선택), page(기본1, perPage=50)
--   → 유치원 입장에서는 to_mb_id 파라미터로 자기에게 온 예약을 조회.
--   이하 쿼리 구조는 보호자 조회와 동일 (N+1 패턴, 동일 테이블 JOIN).
--
-- [Supabase 전환 — 유치원 전용 함수]
--   - to_mb_id → auth.uid()가 운영하는 유치원의 id를 자동 조회
--   - RLS 정책: kindergarten_id IN (SELECT id FROM kindergartens WHERE member_id = auth.uid())
--   - 보호자 함수(44_05)와의 차이점:
--     ① WHERE 조건: kindergarten_id = v_my_kindergarten_id (유치원에 온 예약)
--     ② 상대방: member 키에 보호자 정보 반환 (internal.members_public_profile VIEW)
--     ③ 유치원 정보는 본인이므로 반환하지 않음
--
-- [함수 분리 설계]
--   보호자용(44_05)과 유치원용(본 함수)을 분리.
--   - 보호자: kindergarten 키에 유치원 정보 반환
--   - 유치원: member 키에 보호자 정보 반환
--   반환 필드가 역할별로 완전히 다르므로 통합 시 이점 없음.
--
-- [유치원 식별 방식]
--   PHP: to_mb_id(전화번호)로 직접 필터
--   Supabase: auth.uid() → kindergartens.member_id 매칭
--   → 유치원 미등록 사용자가 호출 시 0건 반환 (에러가 아닌 빈 배열)
--   → 1인 1유치원 가정 (현행 앱 구조). 다중 유치원 시 p_kindergarten_id 파라미터 추가 필요.
--
-- [RLS 영향 분석]
--   5개 테이블/VIEW 참조:
--
--   ① reservations
--      정책: reservations_select_app — USING (
--        member_id = auth.uid()
--        OR kindergarten_id IN (SELECT id FROM kindergartens WHERE member_id = auth.uid())
--      )
--      통과: ✅ 유치원 → kindergarten_id IN (내 유치원) 매칭
--
--   ② members (→ internal.members_public_profile VIEW)
--      정책: members_select_app — USING (id = auth.uid()) — 본인만
--      통과: ❌ 차단 (보호자 프로필 조회 불가)
--      해결: ✅ internal.members_public_profile VIEW 사용
--
--   ③ pets (→ internal.pets_public_info VIEW)
--      정책: pets_select_app — USING (member_id = auth.uid()) — 본인만
--      통과: ❌ 차단 (보호자의 반려동물 조회 불가)
--      해결: ✅ internal.pets_public_info VIEW 사용
--
--   ④ payments
--      정책: payments_select_app — USING (
--        member_id = auth.uid()
--        OR kindergarten_id IN (SELECT id FROM kindergartens WHERE member_id = auth.uid())
--      )
--      통과: ✅ 유치원 → kindergarten_id IN (내 유치원) 매칭
--
--   ⑤ guardian_reviews
--      정책: guardian_reviews_select_app — USING (true) — 전체 공개
--      통과: ✅ 직접 사용 (EXISTS 서브쿼리)
--
--   ⑥ kindergartens (유치원 ID 조회용)
--      정책: kindergartens_select_app — USING (true) — 전체 공개
--      통과: ✅ 직접 사용
--
--   RLS 충돌: 2건 (members, pets) → internal VIEW 2개로 해결
--   SECURITY INVOKER 적합성: ✅
-- ============================================================


-- 기존 함수 제거 (재실행 안전)
DROP FUNCTION IF EXISTS public.app_get_reservations_kindergarten(text, uuid, int, int);


-- ============================================================
-- 함수 정의
-- ============================================================
CREATE OR REPLACE FUNCTION public.app_get_reservations_kindergarten(
  p_status    text    DEFAULT NULL,   -- 상태 필터 (NULL=전체)
  p_pet_id    uuid    DEFAULT NULL,   -- 반려동물 필터 (선택)
  p_page      int     DEFAULT 1,      -- 페이지 번호
  p_per_page  int     DEFAULT 20      -- 페이지당 건수 (최대 50)
)
RETURNS json
LANGUAGE plpgsql
STABLE                               -- 읽기 전용 함수
SECURITY INVOKER                     -- RLS 적용 (호출자 권한)
SET search_path = public
AS $$
DECLARE
  v_current_uid         uuid;
  v_my_kindergarten_id  uuid;
  v_page                int;
  v_per_page            int;
  v_offset              int;
  v_total               int;
  v_reservations        json;
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
  -- 2. 내 유치원 ID 조회
  --    1인 1유치원 가정 (현행 앱 구조)
  --    유치원 미등록 사용자 → 0건 빈 배열 반환 (에러 아님)
  -- ──────────────────────────────────────────────────────
  SELECT kg.id
  INTO v_my_kindergarten_id
  FROM kindergartens kg
  WHERE kg.member_id = v_current_uid
  LIMIT 1;

  -- 유치원이 없으면 빈 결과 반환 (에러가 아닌 정상 응답)
  IF v_my_kindergarten_id IS NULL THEN
    RETURN json_build_object(
      'success', true,
      'data', json_build_object(
        'reservations', '[]'::json,
        'meta', json_build_object(
          'page', COALESCE(p_page, 1),
          'per_page', COALESCE(p_per_page, 20),
          'total', 0
        )
      )
    );
  END IF;

  -- ──────────────────────────────────────────────────────
  -- 3. 파라미터 정규화 및 경계값 방어
  -- ──────────────────────────────────────────────────────
  v_page     := GREATEST(COALESCE(p_page, 1), 1);
  v_per_page := LEAST(GREATEST(COALESCE(p_per_page, 20), 1), 50);
  v_offset   := (v_page - 1) * v_per_page;

  -- ──────────────────────────────────────────────────────
  -- 4. 전체 건수 조회 (페이지네이션 meta용)
  -- ──────────────────────────────────────────────────────
  SELECT COUNT(*)::int
  INTO v_total
  FROM reservations r
  WHERE r.kindergarten_id = v_my_kindergarten_id
    AND (p_status IS NULL OR r.status = p_status)
    AND (p_pet_id IS NULL OR r.pet_id = p_pet_id);

  -- ──────────────────────────────────────────────────────
  -- 5. 메인 쿼리 — 유치원용 예약 목록
  --    상대방 = 보호자 → member 키로 반환
  -- ──────────────────────────────────────────────────────
  SELECT json_agg(row_data)
  INTO v_reservations
  FROM (
    SELECT json_build_object(
      -- 예약 기본 정보
      'id', r.id,
      'status', r.status,
      'checkin_scheduled', r.checkin_scheduled,
      'checkout_scheduled', r.checkout_scheduled,
      'checkin_actual', r.checkin_actual,
      'checkout_actual', r.checkout_actual,
      'walk_count', r.walk_count,
      'pickup_requested', r.pickup_requested,
      'reject_reason', r.reject_reason,
      'created_at', r.created_at,
      -- 후기 작성 여부 (guardian_reviews EXISTS 서브쿼리)
      'is_review_written', EXISTS (
        SELECT 1
        FROM guardian_reviews gr
        WHERE gr.reservation_id = r.id
      ),
      -- 반려동물 정보 (internal VIEW — 보호자의 pet이므로 RLS 차단)
      'pet', json_build_object(
        'id', pp.id,
        'name', pp.name,
        'breed', pp.breed,
        'gender', pp.gender,
        'size_class', pp.size_class,
        'weight', pp.weight,
        'photo_urls', pp.photo_urls,
        'is_representative', pp.is_representative
      ),
      -- 보호자 정보 (internal VIEW — RLS: id = auth.uid() 차단)
      -- 유치원 입장에서 상대방 = 보호자
      'member', json_build_object(
        'id', mp.id,
        'name', mp.name,
        'nickname', mp.nickname,
        'nickname_tag', mp.nickname_tag,
        'profile_image', mp.profile_image,
        'address_complex', mp.address_complex,
        'current_mode', mp.current_mode
      ),
      -- 결제 정보 (payments — LATERAL JOIN 최신 1건)
      'payment', CASE WHEN pay.id IS NOT NULL THEN
        json_build_object(
          'amount', pay.amount,
          'status', pay.status,
          'paid_at', pay.paid_at
        )
      ELSE NULL END
    ) AS row_data
    FROM reservations r
    -- 반려동물 (internal VIEW — 보호자의 pet, RLS 차단 우회)
    LEFT JOIN internal.pets_public_info pp
      ON pp.id = r.pet_id
    -- 보호자 프로필 (internal VIEW — RLS 차단 우회)
    LEFT JOIN internal.members_public_profile mp
      ON mp.id = r.member_id
    -- 결제 (LATERAL JOIN — 최신 1건)
    LEFT JOIN LATERAL (
      SELECT pay_inner.id,
             pay_inner.amount,
             pay_inner.status,
             pay_inner.paid_at
      FROM payments pay_inner
      WHERE pay_inner.reservation_id = r.id
      ORDER BY pay_inner.created_at DESC
      LIMIT 1
    ) pay ON true
    -- WHERE: 내 유치원에 온 예약만
    WHERE r.kindergarten_id = v_my_kindergarten_id
      AND (p_status IS NULL OR r.status = p_status)
      AND (p_pet_id IS NULL OR r.pet_id = p_pet_id)
    ORDER BY r.created_at DESC
    LIMIT v_per_page
    OFFSET v_offset
  ) sub;

  -- ──────────────────────────────────────────────────────
  -- 6. 성공 응답 조립
  -- ──────────────────────────────────────────────────────
  RETURN json_build_object(
    'success', true,
    'data', json_build_object(
      'reservations', COALESCE(v_reservations, '[]'::json),
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
GRANT EXECUTE ON FUNCTION public.app_get_reservations_kindergarten(text, uuid, int, int)
  TO authenticated;

-- anon 역할 명시적 차단
REVOKE EXECUTE ON FUNCTION public.app_get_reservations_kindergarten(text, uuid, int, int)
  FROM anon;


-- ============================================================
-- 함수 코멘트
-- ============================================================
COMMENT ON FUNCTION public.app_get_reservations_kindergarten(text, uuid, int, int) IS
  '유치원용 예약 목록 조회 — 나에게 들어온 돌봄예약 + 보호자/반려동물/결제 정보. '
  '원본: get_payment_request.php. '
  '함수 분리: guardian(44_05) + kindergarten(본 함수). '
  'SECURITY INVOKER: reservations/payments는 RLS 직접 통과, '
  'members/pets는 internal VIEW로 안전 조회. '
  'is_review_written: guardian_reviews EXISTS 서브쿼리. '
  'payment: LATERAL JOIN 최신 1건. '
  'auth.uid() → kindergartens.member_id 매칭으로 유치원 자동 식별. '
  '유치원 미등록 사용자: 0건 빈 배열 정상 반환.';


-- ============================================================
-- 완료 알림
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE '[44-5b] app_get_reservations_kindergarten 함수 생성 완료';
  RAISE NOTICE '  - 인자: p_status text, p_pet_id uuid, p_page int, p_per_page int';
  RAISE NOTICE '  - 반환: json {success, data: {reservations: [...], meta: {page, per_page, total}}}';
  RAISE NOTICE '  - 보안: SECURITY INVOKER + internal VIEW 2개 (members_public_profile, pets_public_info)';
  RAISE NOTICE '  - 상대방 정보: member 키 (보호자 프로필 — internal VIEW)';
  RAISE NOTICE '  - 유치원 식별: auth.uid() → kindergartens.member_id 매칭';
  RAISE NOTICE '  - 결제: payments LATERAL JOIN 최신 1건';
  RAISE NOTICE '  - 후기: guardian_reviews EXISTS 서브쿼리 (is_review_written)';
  RAISE NOTICE '  - 유치원 미등록: 빈 배열 정상 반환 (에러 아님)';
  RAISE NOTICE '  ';
  RAISE NOTICE '  [앱 호출 예시]';
  RAISE NOTICE '  // 전체 예약 목록 (기본값)';
  RAISE NOTICE '  const { data } = await supabase.rpc(''app_get_reservations_kindergarten'', {});';
  RAISE NOTICE '  ';
  RAISE NOTICE '  // 수락대기 상태만 필터링';
  RAISE NOTICE '  const { data } = await supabase.rpc(''app_get_reservations_kindergarten'', {';
  RAISE NOTICE '    p_status: ''수락대기'',';
  RAISE NOTICE '    p_page: 1';
  RAISE NOTICE '  });';
END $$;
