-- ============================================================
-- SQL 44-6 PATCH: app_get_reservation_detail — payment.id 필드 추가
-- ============================================================
-- 베이스: sql/44_06_app_rpc_get_reservation_detail.sql
-- 변경점: payment JSON 블록에 'id' 필드 1개 추가 (그 외 변경 없음)
-- 목적: PG 결제취소 호출 시 앱에서 payment.id 참조 가능하도록 함
--       (앱의 usePaymentRequest.ts:127가 r.payment.id를 매핑 — 현재 빈 값)
-- 응답 구조: data.reservation.* 중첩 구조 유지 (앱이 r.reservation 으로 접근 중)
-- 실행 방법: Supabase SQL Editor에 전체 복사하여 실행 (CREATE OR REPLACE)
-- ============================================================

DROP FUNCTION IF EXISTS public.app_get_reservation_detail(uuid);

CREATE OR REPLACE FUNCTION public.app_get_reservation_detail(
  p_reservation_id  uuid
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
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
  v_current_uid := auth.uid();

  IF v_current_uid IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', '인증되지 않은 사용자입니다.',
      'code', 'AUTH_REQUIRED'
    );
  END IF;

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

  SELECT json_build_object(
    'id', pay.id,                        -- ★ PATCH: PG 결제취소용 식별자
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

  SELECT EXISTS (
    SELECT 1
    FROM guardian_reviews gr
    WHERE gr.reservation_id = p_reservation_id
  )
  INTO v_is_review;

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

GRANT EXECUTE ON FUNCTION public.app_get_reservation_detail(uuid)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.app_get_reservation_detail(uuid)
  FROM anon;

COMMENT ON FUNCTION public.app_get_reservation_detail(uuid) IS
  '예약 상세 조회 (단건) — 예약 + 반려동물 + 유치원 + 보호자 + 결제 + 환불. '
  '원본: 44_06. PATCH: payment.id 필드 추가 (PG 결제취소 호출용). '
  '응답 구조: data.reservation.* 중첩 구조 유지.';

DO $$
BEGIN
  RAISE NOTICE '[44-6 PATCH] app_get_reservation_detail payment.id 추가 완료';
END $$;
