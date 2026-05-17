-- ============================================================
-- SQL 44-5 PATCH: app_get_reservations_guardian — payment.id 필드 추가
-- ============================================================
-- 베이스: sql/44_05_app_rpc_get_reservations.sql
-- 변경점: payment JSON 블록에 'id' 필드 1개 추가 (그 외 변경 없음)
-- 목적: PG 결제취소 호출 시 앱에서 payment.id 참조 가능하도록 함
--       (앱의 usePaymentRequest.ts는 이미 r.payment.id를 매핑 시도 중 — 현재 빈 값)
-- 실행 방법: Supabase SQL Editor에 전체 복사하여 실행 (CREATE OR REPLACE)
-- ============================================================

DROP FUNCTION IF EXISTS public.app_get_reservations_guardian(text, uuid, int, int);

CREATE OR REPLACE FUNCTION public.app_get_reservations_guardian(
  p_status    text    DEFAULT NULL,
  p_pet_id    uuid    DEFAULT NULL,
  p_page      int     DEFAULT 1,
  p_per_page  int     DEFAULT 20
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
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
  v_current_uid := auth.uid();

  IF v_current_uid IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', '인증되지 않은 사용자입니다.',
      'code', 'AUTH_REQUIRED'
    );
  END IF;

  v_page     := GREATEST(COALESCE(p_page, 1), 1);
  v_per_page := LEAST(GREATEST(COALESCE(p_per_page, 20), 1), 50);
  v_offset   := (v_page - 1) * v_per_page;

  SELECT COUNT(*)::int
  INTO v_total
  FROM reservations r
  WHERE r.member_id = v_current_uid
    AND (p_status IS NULL OR r.status = p_status)
    AND (p_pet_id IS NULL OR r.pet_id = p_pet_id);

  SELECT json_agg(row_data)
  INTO v_reservations
  FROM (
    SELECT json_build_object(
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
      'is_review_written', EXISTS (
        SELECT 1
        FROM guardian_reviews gr
        WHERE gr.reservation_id = r.id
      ),
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
      'kindergarten', json_build_object(
        'id', kg.id,
        'name', kg.name,
        'address_complex', kg.address_complex,
        'address_building_dong', kg.address_building_dong,
        'photo_urls', kg.photo_urls
      ),
      'payment', CASE WHEN pay.id IS NOT NULL THEN
        json_build_object(
          'id', pay.id,                        -- ★ PATCH: PG 결제취소용 식별자
          'amount', pay.amount,
          'status', pay.status,
          'payment_method', pay.payment_method,
          'paid_at', pay.paid_at
        )
      ELSE NULL END
    ) AS row_data
    FROM reservations r
    LEFT JOIN internal.pets_public_info pp
      ON pp.id = r.pet_id
    LEFT JOIN kindergartens kg
      ON kg.id = r.kindergarten_id
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
    WHERE r.member_id = v_current_uid
      AND (p_status IS NULL OR r.status = p_status)
      AND (p_pet_id IS NULL OR r.pet_id = p_pet_id)
    ORDER BY r.created_at DESC
    LIMIT v_per_page
    OFFSET v_offset
  ) sub;

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

GRANT EXECUTE ON FUNCTION public.app_get_reservations_guardian(text, uuid, int, int)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.app_get_reservations_guardian(text, uuid, int, int)
  FROM anon;

COMMENT ON FUNCTION public.app_get_reservations_guardian(text, uuid, int, int) IS
  '보호자용 예약 목록 조회 — 내가 요청한 돌봄예약 + 유치원/반려동물/결제 정보. '
  '원본: 44_05. PATCH: payment.id 필드 추가 (PG 결제취소 호출용).';

DO $$
BEGIN
  RAISE NOTICE '[44-5 PATCH] app_get_reservations_guardian payment.id 추가 완료';
END $$;
