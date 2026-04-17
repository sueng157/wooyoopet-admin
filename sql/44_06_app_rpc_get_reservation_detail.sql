-- ============================================================
-- SQL 44-6: app_get_reservation_detail RPC 함수
-- ============================================================
-- 실행 방법: Supabase SQL Editor에 전체 복사하여 실행
-- 원본 PHP: get_payment_request_by_id.php
-- 용도: 예약 상세 조회 (단건) — 예약 + 반려동물 + 유치원 + 보호자 + 결제 + 환불
-- 보안: SECURITY INVOKER — 호출자 RLS 적용 + internal VIEW로 타인 데이터 안전 조회
-- ============================================================
--
-- [PHP 원본 로직 (get_payment_request_by_id.php)]
--   파라미터: id (예약 ID)
--   1️⃣ payment_request SELECT * WHERE id = ?
--   2️⃣ payment_approval_info SELECT (결제 승인 상세)
--      + approval_date 문자열 파싱 (정규식으로 '+' 뒤 보완)
--   3️⃣ g5_write_animal (반려동물 1건 + animal_img1~10 → 절대 URL 배열)
--   4️⃣ g5_write_partner (유치원 1건 + partner_img1~10 + partner_apartment 조합)
--   5️⃣ g5_member (회원 1건 — to_mb_id 기준 = 유치원 운영자)
--   반환: 예약 전체 필드 + approval_info + pet + partner + member
--
--   원본 문제점:
--     - id만 있으면 누구나 조회 가능 (접근 제어 없음, 보안 구멍)
--     - partner_bank_name/account 노출 (금융정보)
--     - freshness: 실제값 반환하나 rCnt: '0' 하드코딩
--     - penalty 컬럼 직접 사용 (환불 정보가 예약에 혼재)
--
-- [Supabase 전환 — 통합 단건 함수]
--   함수 분리하지 않음 (상세는 단건 조회이므로 타입 분기 문제 없음).
--   보호자든 유치원이든 같은 예약 ID로 동일한 상세 정보 반환.
--   RLS가 "이 예약에 관련된 당사자인가"를 자동 판별.
--
--   - id만으로 조회 → auth.uid() + RLS가 당사자 검증
--   - payment_approval_info → payments 테이블에 통합 (상세 필드 확장)
--   - penalty → refunds LEFT JOIN (스키마 분리 반영)
--   - partner_bank_name/account → 제외 (금융정보 비노출)
--   - rCnt: '0' 하드코딩 → 제외 (상세에서 리뷰 수 불필요)
--   - 예약 필드 확장: reject_detail, rejected_at, requested_at,
--     guardian/kg_checkout_confirmed + _at (Supabase 신규 필드)
--   - is_review_written: guardian_reviews EXISTS (상세 화면 후기 유도)
--
-- [RLS 영향 분석]
--   7개 테이블/VIEW 참조:
--
--   ① reservations
--      정책: reservations_select_app — USING (
--        member_id = auth.uid()
--        OR kindergarten_id IN (SELECT id FROM kindergartens WHERE member_id = auth.uid())
--      )
--      통과: ✅ 보호자/유치원 양쪽 당사자 통과
--
--   ② kindergartens
--      정책: kindergartens_select_app — USING (true) — 전체 공개
--      통과: ✅ 직접 사용
--
--   ③ pets (→ internal.pets_public_info VIEW)
--      정책: pets_select_app — USING (member_id = auth.uid()) — 본인만
--      통과: ❌ 유치원 입장에서 보호자 pet 조회 차단
--      해결: ✅ internal.pets_public_info VIEW 사용
--
--   ④ members (→ internal.members_public_profile VIEW)
--      정책: members_select_app — USING (id = auth.uid()) — 본인만
--      통과: ❌ 상대방 프로필 조회 차단
--      해결: ✅ internal.members_public_profile VIEW 사용
--
--   ⑤ payments
--      정책: payments_select_app — USING (
--        member_id = auth.uid()
--        OR kindergarten_id IN (SELECT id FROM kindergartens WHERE member_id = auth.uid())
--      )
--      통과: ✅ 양쪽 당사자 통과
--
--   ⑥ refunds
--      정책: refunds_select_app — USING (
--        member_id = auth.uid()
--        OR kindergarten_id IN (SELECT id FROM kindergartens WHERE member_id = auth.uid())
--      )
--      통과: ✅ 양쪽 당사자 통과
--
--   ⑦ guardian_reviews
--      정책: guardian_reviews_select_app — USING (true) — 전체 공개
--      통과: ✅ 직접 사용 (EXISTS 서브쿼리)
--
--   RLS 충돌: 2건 (members, pets) → internal VIEW 2개로 해결
--   SECURITY INVOKER 적합성: ✅
-- ============================================================


-- 기존 함수 제거 (재실행 안전)
DROP FUNCTION IF EXISTS public.app_get_reservation_detail(uuid);


-- ============================================================
-- 함수 정의
-- ============================================================
CREATE OR REPLACE FUNCTION public.app_get_reservation_detail(
  p_reservation_id  uuid              -- 조회할 예약 ID (필수)
)
RETURNS json
LANGUAGE plpgsql
STABLE                               -- 읽기 전용 함수
SECURITY INVOKER                     -- RLS 적용 (호출자 권한)
SET search_path = public
AS $$
DECLARE
  v_current_uid    uuid;
  v_reservation    record;
  v_pet_json       json;
  v_kg_json        json;
  v_member_json    json;
  v_payment_json   json;
  v_refund_json    json;
  v_is_review      boolean;
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
  -- 2. 예약 조회 + 존재/권한 검증
  --    RLS가 당사자 여부를 자동 판별:
  --    member_id = auth.uid() OR kindergarten_id IN (내 유치원)
  --    → 비당사자는 NULL 반환 (접근 거부와 동일 효과)
  -- ──────────────────────────────────────────────────────
  SELECT
    r.id,
    r.member_id,
    r.kindergarten_id,
    r.pet_id,
    r.status,
    r.checkin_scheduled,
    r.checkout_scheduled,
    r.checkin_actual,
    r.checkout_actual,
    r.walk_count,
    r.pickup_requested,
    r.reject_reason,
    r.reject_detail,
    r.rejected_at,
    r.requested_at,
    r.guardian_checkout_confirmed,
    r.kg_checkout_confirmed,
    r.guardian_checkout_confirmed_at,
    r.kg_checkout_confirmed_at,
    r.created_at
  INTO v_reservation
  FROM reservations r
  WHERE r.id = p_reservation_id;

  IF v_reservation IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', '예약을 찾을 수 없습니다.',
      'code', 'RESERVATION_NOT_FOUND'
    );
  END IF;

  -- ──────────────────────────────────────────────────────
  -- 3. 반려동물 정보 (internal VIEW — RLS 우회)
  --    유치원 입장에서 보호자의 pet 조회 시 RLS 차단
  --    → internal.pets_public_info VIEW 사용
  --    상세이므로 description, birth_date 등 목록보다 많은 필드 포함
  -- ──────────────────────────────────────────────────────
  SELECT json_build_object(
    'id', pp.id,
    'name', pp.name,
    'breed', pp.breed,
    'gender', pp.gender,
    'birth_date', pp.birth_date,
    'is_birth_date_unknown', pp.is_birth_date_unknown,
    'size_class', pp.size_class,
    'weight', pp.weight,
    'is_neutered', pp.is_neutered,
    'is_vaccinated', pp.is_vaccinated,
    'photo_urls', pp.photo_urls,
    'is_representative', pp.is_representative,
    'description', pp.description
  )
  INTO v_pet_json
  FROM internal.pets_public_info pp
  WHERE pp.id = v_reservation.pet_id;

  -- ──────────────────────────────────────────────────────
  -- 4. 유치원 정보 (RLS: USING(true) 전체 공개 — 직접 조회)
  --    address_road 제외: 보호자가 도로명주소를 볼 필요 없음
  --    address_complex + address_building_dong만 반환 (#5 목록과 일관)
  -- ──────────────────────────────────────────────────────
  SELECT json_build_object(
    'id', kg.id,
    'name', kg.name,
    'address_complex', kg.address_complex,
    'address_building_dong', kg.address_building_dong,
    'photo_urls', kg.photo_urls,
    'freshness_current', kg.freshness_current
  )
  INTO v_kg_json
  FROM kindergartens kg
  WHERE kg.id = v_reservation.kindergarten_id;

  -- ──────────────────────────────────────────────────────
  -- 5. 보호자 정보 (internal VIEW — RLS 우회)
  --    예약의 member_id = 보호자
  --    보호자든 유치원이든 상대방 확인용으로 반환
  --    [주소 비대칭 정책]
  --      유치원: address_complex + address_building_dong 노출 (보호자가 동선 파악 필요)
  --      보호자: address_complex만 노출 (개인정보 최소화, 동/호 비공개)
  -- ──────────────────────────────────────────────────────
  SELECT json_build_object(
    'id', mp.id,
    'nickname', mp.nickname,
    'profile_image', mp.profile_image,
    'address_complex', mp.address_complex,
    'current_mode', mp.current_mode
  )
  INTO v_member_json
  FROM internal.members_public_profile mp
  WHERE mp.id = v_reservation.member_id;

  -- ──────────────────────────────────────────────────────
  -- 6. 결제 정보 (payments — 최신 1건)
  --    상세이므로 목록보다 확장된 필드:
  --    approval_number, card_number, card_company, pg_transaction_id
  --    PHP 원본의 payment_approval_info 별도 쿼리 →
  --    Supabase payments 테이블에 통합됨
  -- ──────────────────────────────────────────────────────
  SELECT json_build_object(
    'amount', pay.amount,
    'status', pay.status,
    'payment_method', pay.payment_method,
    'paid_at', pay.paid_at,
    'approval_number', pay.approval_number,
    'card_number', pay.card_number,
    'card_company', pay.card_company,
    'pg_transaction_id', pay.pg_transaction_id
  )
  INTO v_payment_json
  FROM payments pay
  WHERE pay.reservation_id = p_reservation_id
  ORDER BY pay.created_at DESC
  LIMIT 1;

  -- ──────────────────────────────────────────────────────
  -- 7. 환불/위약금 정보 (refunds — 단순 LEFT JOIN)
  --    1예약 1환불 (비즈니스 규칙)
  --    PHP 원본: payment_request.penalty 컬럼 직접 사용
  --    Supabase: refunds 테이블 분리 → LEFT JOIN
  -- ──────────────────────────────────────────────────────
  SELECT json_build_object(
    'penalty_amount', rf.penalty_amount,
    'refund_amount', rf.refund_amount,
    'status', rf.status,
    'completed_at', rf.completed_at,
    'cancel_reason', rf.cancel_reason
  )
  INTO v_refund_json
  FROM refunds rf
  WHERE rf.reservation_id = p_reservation_id;
  -- 1예약 1환불 (비즈니스 규칙) — LIMIT 불필요

  -- ──────────────────────────────────────────────────────
  -- 8. 후기 작성 여부 (guardian_reviews — 전체 공개)
  --    상세 화면에서 후기 유도 버튼 표시에 사용
  -- ──────────────────────────────────────────────────────
  SELECT EXISTS (
    SELECT 1
    FROM guardian_reviews gr
    WHERE gr.reservation_id = p_reservation_id
  )
  INTO v_is_review;

  -- ──────────────────────────────────────────────────────
  -- 9. 성공 응답 조립
  -- ──────────────────────────────────────────────────────
  RETURN json_build_object(
    'success', true,
    'data', json_build_object(
      'reservation', json_build_object(
        'id', v_reservation.id,
        'status', v_reservation.status,
        'checkin_scheduled', v_reservation.checkin_scheduled,
        'checkout_scheduled', v_reservation.checkout_scheduled,
        'checkin_actual', v_reservation.checkin_actual,
        'checkout_actual', v_reservation.checkout_actual,
        'walk_count', v_reservation.walk_count,
        'pickup_requested', v_reservation.pickup_requested,
        'reject_reason', v_reservation.reject_reason,
        'reject_detail', v_reservation.reject_detail,
        'rejected_at', v_reservation.rejected_at,
        'requested_at', v_reservation.requested_at,
        'guardian_checkout_confirmed', v_reservation.guardian_checkout_confirmed,
        'kg_checkout_confirmed', v_reservation.kg_checkout_confirmed,
        'guardian_checkout_confirmed_at', v_reservation.guardian_checkout_confirmed_at,
        'kg_checkout_confirmed_at', v_reservation.kg_checkout_confirmed_at,
        'created_at', v_reservation.created_at,
        'is_review_written', COALESCE(v_is_review, false)
      ),
      'pet', COALESCE(v_pet_json, '{}'::json),
      'kindergarten', COALESCE(v_kg_json, '{}'::json),
      'member', COALESCE(v_member_json, '{}'::json),
      'payment', v_payment_json,
      'refund', v_refund_json
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
GRANT EXECUTE ON FUNCTION public.app_get_reservation_detail(uuid)
  TO authenticated;

-- anon 역할 명시적 차단
REVOKE EXECUTE ON FUNCTION public.app_get_reservation_detail(uuid)
  FROM anon;


-- ============================================================
-- 함수 코멘트
-- ============================================================
COMMENT ON FUNCTION public.app_get_reservation_detail(uuid) IS
  '예약 상세 조회 (단건) — 예약 + 반려동물 + 유치원 + 보호자 + 결제 + 환불. '
  '원본: get_payment_request_by_id.php. '
  '보호자/유치원 통합 함수: RLS가 당사자 여부를 자동 판별. '
  'SECURITY INVOKER: reservations/kindergartens/payments/refunds/guardian_reviews는 RLS 직접 통과, '
  'members/pets는 internal VIEW로 안전 조회. '
  'payment: 상세 확장 (approval_number, card_number, card_company, pg_transaction_id). '
  'refund: 1예약 1환불 비즈니스 규칙 (penalty_amount, refund_amount, status, completed_at, cancel_reason). '
  'is_review_written: guardian_reviews EXISTS 서브쿼리. '
  'address_road 제외: address_complex + address_building_dong만 반환.';


-- ============================================================
-- 완료 알림
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE '[44-6] app_get_reservation_detail 함수 생성 완료';
  RAISE NOTICE '  - 인자: p_reservation_id uuid';
  RAISE NOTICE '  - 반환: json {success, data: {reservation, pet, kindergarten, member, payment, refund}}';
  RAISE NOTICE '  - 보안: SECURITY INVOKER + internal VIEW 2개 (members_public_profile, pets_public_info)';
  RAISE NOTICE '  - 통합 함수: 보호자/유치원 동일 응답 (RLS가 당사자 판별)';
  RAISE NOTICE '  - 결제 확장: approval_number, card_number, card_company, pg_transaction_id';
  RAISE NOTICE '  - 환불: 1예약 1환불 (penalty_amount, refund_amount, status, completed_at, cancel_reason)';
  RAISE NOTICE '  - 예약 확장: reject_detail, rejected_at, requested_at, checkout_confirmed 필드들';
  RAISE NOTICE '  - 후기: guardian_reviews EXISTS (is_review_written)';
  RAISE NOTICE '  - address_road 제외, address_complex + address_building_dong만';
  RAISE NOTICE '  ';
  RAISE NOTICE '  [앱 호출 예시]';
  RAISE NOTICE '  const { data } = await supabase.rpc(''app_get_reservation_detail'', {';
  RAISE NOTICE '    p_reservation_id: ''uuid-of-reservation''';
  RAISE NOTICE '  });';
END $$;
