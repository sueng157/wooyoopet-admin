-- ============================================================
-- SQL 44-5: app_get_reservations_guardian RPC 함수
-- ============================================================
-- 실행 방법: Supabase SQL Editor에 전체 복사하여 실행
-- 원본 PHP: get_payment_request.php
-- 용도: 보호자용 예약 목록 조회 — 내가 요청한 돌봄예약 + 유치원·반려동물·결제 정보
-- 보안: SECURITY INVOKER — 호출자 RLS 적용 + internal VIEW로 타인 데이터 안전 조회
-- ============================================================
--
-- [PHP 원본 로직 (get_payment_request.php)]
--   파라미터: mb_id(보호자), to_mb_id(유치원), pet_id(선택), page(기본1, perPage=50)
--   1️⃣ payment_request SELECT * WHERE 조건 필터 + ORDER BY created_at DESC
--      + LIMIT offset, perPage (페이지네이션)
--   2️⃣ 각 예약마다 N+1 쿼리 3회:
--      ① g5_write_animal — 반려동물 1건 + animal_img1~10 → 절대 URL 배열
--      ② g5_write_partner — 유치원 1건 + partner_img1~10 → 절대 URL 배열
--         + mb_4(단지명)+mb_dong(동) 문자열 조합 → partner_apartment
--      ③ g5_member — 회원 1건 + mb_profile1 → 절대 URL
--   3️⃣ JSON 반환: { data: [...], meta: { page, perPage, total: 0 } }
--
--   원본 문제점:
--     - N+1 쿼리: 예약 1건당 3번 추가 조회 → 50건이면 150회 추가 쿼리
--     - total: 0 하드코딩 (구현 누락)
--     - mb_id/to_mb_id 파라미터로 타인 예약 조회 가능 (보안 구멍)
--     - partner_bank_name/account 노출 (금융정보)
--
-- [Supabase 전환 — 보호자 전용 함수]
--   - mb_id → auth.uid() (SECURITY INVOKER, 파라미터 불필요)
--   - RLS 정책이 member_id = auth.uid() 자동 필터링
--   - N+1 → 단일 CTE + LEFT JOIN 통합 쿼리
--   - g5_write_partner → kindergartens 직접 조회 (RLS: USING(true) 전체 공개)
--   - g5_write_animal → internal.pets_public_info VIEW
--     (RLS: pets.member_id = auth.uid() 본인만 → 본인 pet이므로 직접 조회도 가능하나,
--      VIEW 사용으로 일관성 유지)
--   - g5_member(유치원 운영자) → internal.members_public_profile VIEW
--     (RLS: members.id = auth.uid() 본인만 → 유치원 운영자 프로필 조회 불가)
--   - is_review_written 컬럼 → guardian_reviews EXISTS 서브쿼리
--     (Supabase에 is_review_written 컬럼 없음, 리뷰 테이블 JOIN으로 판단)
--   - price/penalty → payments LEFT JOIN (Supabase 스키마 분리)
--   - partner_bank_name/account → 제외 (금융정보 비노출 원칙)
--   - total 하드코딩 → 실제 COUNT 구현
--
-- [함수 분리 설계]
--   보호자용(본 함수)과 유치원용(44_05b)을 분리.
--   이유: 반환 데이터가 역할별로 완전히 다름.
--   - 보호자: kindergarten 키에 유치원 정보 반환 (상대방=유치원)
--   - 유치원: member 키에 보호자 정보 반환 (상대방=보호자)
--   통합 시 TypeScript union type 분기 캐스팅 필요 → 의미 없음.
--   리뷰 RPC 분리(#9/#12) 선례와 일관.
--
-- [RLS 영향 분석]
--   6개 테이블/VIEW 참조:
--
--   ① reservations
--      정책: reservations_select_app — USING (
--        member_id = auth.uid()
--        OR kindergarten_id IN (SELECT id FROM kindergartens WHERE member_id = auth.uid())
--      )
--      통과: ✅ 보호자 → member_id = auth.uid() 매칭
--
--   ② kindergartens
--      정책: kindergartens_select_app — USING (true) — 전체 공개
--      통과: ✅ 직접 사용
--
--   ③ pets (→ internal.pets_public_info VIEW)
--      정책: pets_select_app — USING (member_id = auth.uid()) — 본인만
--      통과: ✅ 보호자 본인의 pet이므로 직접 조회도 가능하나 VIEW 사용 일관성 유지
--      해결: ✅ internal.pets_public_info VIEW 사용
--
--   ④ members (→ internal.members_public_profile VIEW)
--      정책: members_select_app — USING (id = auth.uid()) — 본인만
--      통과: ❌ 차단 (유치원 운영자 프로필 조회 불가)
--      해결: ✅ internal.members_public_profile VIEW 사용
--
--   ⑤ payments
--      정책: payments_select_app — USING (
--        member_id = auth.uid()
--        OR kindergarten_id IN (SELECT id FROM kindergartens WHERE member_id = auth.uid())
--      )
--      통과: ✅ 보호자 → member_id = auth.uid() 매칭
--
--   ⑥ guardian_reviews
--      정책: guardian_reviews_select_app — USING (true) — 전체 공개
--      통과: ✅ 직접 사용 (EXISTS 서브쿼리)
--
--   RLS 충돌: 1건 (members) → internal VIEW 1개로 해결
--   pets는 본인 소유이므로 RLS 통과 가능하나, VIEW 사용으로 일관성 유지
--   SECURITY INVOKER 적합성: ✅
-- ============================================================


-- 기존 함수 제거 (재실행 안전)
DROP FUNCTION IF EXISTS public.app_get_reservations_guardian(text, uuid, int, int);


-- ============================================================
-- 함수 정의
-- ============================================================
CREATE OR REPLACE FUNCTION public.app_get_reservations_guardian(
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
  v_current_uid   uuid;
  v_page          int;
  v_per_page      int;
  v_offset        int;
  v_total         int;
  v_reservations  json;
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
  v_page     := GREATEST(COALESCE(p_page, 1), 1);
  v_per_page := LEAST(GREATEST(COALESCE(p_per_page, 20), 1), 50);
  v_offset   := (v_page - 1) * v_per_page;

  -- ──────────────────────────────────────────────────────
  -- 3. 전체 건수 조회 (페이지네이션 meta용)
  --    RLS가 member_id = auth.uid() 자동 필터링
  -- ──────────────────────────────────────────────────────
  SELECT COUNT(*)::int
  INTO v_total
  FROM reservations r
  WHERE r.member_id = v_current_uid
    AND (p_status IS NULL OR r.status = p_status)
    AND (p_pet_id IS NULL OR r.pet_id = p_pet_id);

  -- ──────────────────────────────────────────────────────
  -- 4. 메인 쿼리 — 보호자용 예약 목록
  --    상대방 = 유치원 → kindergarten 키로 반환
  --    N+1 쿼리 → 단일 CTE + LEFT JOIN 통합
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
      -- Supabase에 is_review_written 컬럼 없음 → 리뷰 테이블로 판단
      -- guardian_reviews: 보호자가 유치원에게 쓰는 후기
      'is_review_written', EXISTS (
        SELECT 1
        FROM guardian_reviews gr
        WHERE gr.reservation_id = r.id
      ),
      -- 반려동물 정보 (internal VIEW — 일관성 유지)
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
      -- 유치원 정보 (RLS: USING(true) 전체 공개 — 직접 조회)
      -- 보호자 입장에서 상대방 = 유치원
      'kindergarten', json_build_object(
        'id', kg.id,
        'name', kg.name,
        'address_complex', kg.address_complex,
        'address_building_dong', kg.address_building_dong,
        'photo_urls', kg.photo_urls
      ),
      -- 결제 정보 (payments — LATERAL JOIN 최신 1건)
      -- PHP 원본: payment_request.price 직접 사용
      -- Supabase: payments 테이블 분리 → LEFT JOIN
      'payment', CASE WHEN pay.id IS NOT NULL THEN
        json_build_object(
          'amount', pay.amount,
          'status', pay.status,
          'payment_method', pay.payment_method,
          'paid_at', pay.paid_at
        )
      ELSE NULL END
    ) AS row_data
    FROM reservations r
    -- 반려동물 (internal VIEW — RLS 우회, 일관성)
    LEFT JOIN internal.pets_public_info pp
      ON pp.id = r.pet_id
    -- 유치원 (RLS: USING(true) 전체 공개)
    LEFT JOIN kindergartens kg
      ON kg.id = r.kindergarten_id
    -- 결제 (LATERAL JOIN — 최신 1건)
    -- 1 예약 : N 결제 가능 (재결제, 위약금 등)
    -- 앱 목록에서는 가장 최근 결제 정보만 표시
    LEFT JOIN LATERAL (
      SELECT pay_inner.id,
             pay_inner.amount,
             pay_inner.status,
             pay_inner.payment_method,
             pay_inner.paid_at
      FROM payments pay_inner
      WHERE pay_inner.reservation_id = r.id
      ORDER BY pay_inner.created_at DESC
      LIMIT 1
    ) pay ON true
    -- WHERE: 보호자 본인 예약만 (RLS도 동일 조건이지만 명시적 필터로 성능 최적화)
    WHERE r.member_id = v_current_uid
      AND (p_status IS NULL OR r.status = p_status)
      AND (p_pet_id IS NULL OR r.pet_id = p_pet_id)
    ORDER BY r.created_at DESC
    LIMIT v_per_page
    OFFSET v_offset
  ) sub;

  -- ──────────────────────────────────────────────────────
  -- 5. 성공 응답 조립
  --    결과 0건 시 빈 배열 반환 (목록 API이므로 에러 아님)
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
GRANT EXECUTE ON FUNCTION public.app_get_reservations_guardian(text, uuid, int, int)
  TO authenticated;

-- anon 역할 명시적 차단
REVOKE EXECUTE ON FUNCTION public.app_get_reservations_guardian(text, uuid, int, int)
  FROM anon;


-- ============================================================
-- 함수 코멘트
-- ============================================================
COMMENT ON FUNCTION public.app_get_reservations_guardian(text, uuid, int, int) IS
  '보호자용 예약 목록 조회 — 내가 요청한 돌봄예약 + 유치원/반려동물/결제 정보. '
  '원본: get_payment_request.php. '
  '함수 분리: guardian(본 함수) + kindergarten(44_05b). '
  'SECURITY INVOKER: reservations/kindergartens/payments/guardian_reviews는 RLS 직접 통과, '
  'members는 미사용(보호자 본인 정보 불필요), pets는 internal VIEW 사용(일관성). '
  'is_review_written: guardian_reviews EXISTS 서브쿼리. '
  'payment: LATERAL JOIN 최신 1건. '
  'auth.uid()로 보호자 본인 예약만 조회 (mb_id 파라미터 제거).';


-- ============================================================
-- 완료 알림
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE '[44-5] app_get_reservations_guardian 함수 생성 완료';
  RAISE NOTICE '  - 인자: p_status text, p_pet_id uuid, p_page int, p_per_page int';
  RAISE NOTICE '  - 반환: json {success, data: {reservations: [...], meta: {page, per_page, total}}}';
  RAISE NOTICE '  - 보안: SECURITY INVOKER + internal VIEW 1개 (pets_public_info)';
  RAISE NOTICE '  - 상대방 정보: kindergarten 키 (유치원 — RLS 전체 공개 직접 조회)';
  RAISE NOTICE '  - 결제: payments LATERAL JOIN 최신 1건';
  RAISE NOTICE '  - 후기: guardian_reviews EXISTS 서브쿼리 (is_review_written)';
  RAISE NOTICE '  - 페이지네이션: p_page/p_per_page (최대 50 cap)';
  RAISE NOTICE '  - WHERE: member_id = auth.uid() + p_status + p_pet_id 선택 필터';
  RAISE NOTICE '  ';
  RAISE NOTICE '  [앱 호출 예시]';
  RAISE NOTICE '  // 전체 예약 목록 (기본값)';
  RAISE NOTICE '  const { data } = await supabase.rpc(''app_get_reservations_guardian'', {});';
  RAISE NOTICE '  ';
  RAISE NOTICE '  // 상태 필터 + 페이지네이션';
  RAISE NOTICE '  const { data } = await supabase.rpc(''app_get_reservations_guardian'', {';
  RAISE NOTICE '    p_status: ''예약확정'',';
  RAISE NOTICE '    p_page: 2,';
  RAISE NOTICE '    p_per_page: 20';
  RAISE NOTICE '  });';
END $$;
