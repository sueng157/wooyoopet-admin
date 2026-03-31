-- ============================================================
-- SQL 21: RPC 함수 업데이트 (payment_type 반영)
-- ============================================================
-- 실행 방법: Supabase SQL Editor에 전체 복사하여 실행
-- 실행 순서: SQL 20 (마이그레이션) 실행 후 이 파일 실행
-- 목적:
--   1) search_payments: p_payment_type 파라미터 추가 (DEFAULT '돌봄')
--   2) search_refunds: penalty_payment_id로 위약금 결제 정보 JOIN
--   3) get_dashboard_monthly_sales: 위약금 집계를 payments에서 조회
--   4) get_dashboard_today_stats: 오늘 결제 총액에서 돌봄비만 집계
--   5) get_settlement_summary: 기간 필터 파라미터 추가 + 컬럼명 수정
--
-- 참고: payment_refactoring_plan.md 섹션 4 (의사결정 #6, #9)
-- ============================================================


-- ============================================================
-- 1. search_payments — 결제내역 탭 (파라미터화된 payment_type 필터)
-- ============================================================
-- 변경사항:
--   - p_payment_type 파라미터 추가 (DEFAULT '돌봄')
--   - WHERE 조건에 p.payment_type = p_payment_type 사용
--   - SELECT에 payment_type 반환 추가 (향후 확장 대비)
--   (의사결정 #6: 향후 '훈련', '구독' 등 확장 대비)

CREATE OR REPLACE FUNCTION public.search_payments(
  p_date_from      text    DEFAULT NULL,
  p_date_to        text    DEFAULT NULL,
  p_payment_method text    DEFAULT NULL,
  p_status         text    DEFAULT NULL,
  p_search_type    text    DEFAULT NULL,
  p_search_keyword text    DEFAULT NULL,
  p_amount_min     numeric DEFAULT NULL,
  p_amount_max     numeric DEFAULT NULL,
  p_page           int     DEFAULT 1,
  p_per_page       int     DEFAULT 20,
  p_payment_type   text    DEFAULT '돌봄'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_offset   int;
  v_total    bigint;
  v_rows     json;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  v_offset := (p_page - 1) * p_per_page;

  -- 총 건수 카운트 (p_payment_type 필터 적용)
  SELECT COUNT(*)
  INTO v_total
  FROM payments p
  JOIN members m ON m.id = p.member_id
  LEFT JOIN pets pt ON pt.id = p.pet_id
  LEFT JOIN kindergartens k ON k.id = p.kindergarten_id
  WHERE p.payment_type = p_payment_type
    AND (p_date_from IS NULL OR p.paid_at >= p_date_from::timestamptz)
    AND (p_date_to IS NULL OR p.paid_at <= p_date_to::timestamptz)
    AND (p_payment_method IS NULL OR p.payment_method = p_payment_method)
    AND (p_status IS NULL OR p.status = p_status)
    AND (p_amount_min IS NULL OR p.amount >= p_amount_min)
    AND (p_amount_max IS NULL OR p.amount <= p_amount_max)
    AND (
      p_search_type IS NULL OR p_search_keyword IS NULL
      OR (p_search_type = '보호자 닉네임' AND m.nickname ILIKE '%' || p_search_keyword || '%')
      OR (p_search_type = '유치원명' AND k.name ILIKE '%' || p_search_keyword || '%')
      OR (p_search_type = 'PG 거래번호' AND p.pg_transaction_id ILIKE '%' || p_search_keyword || '%')
      OR (p_search_type = '보호자 연락처' AND m.phone ILIKE '%' || p_search_keyword || '%')
    );

  -- 데이터 조회 (p_payment_type 필터 적용)
  SELECT json_agg(t)
  INTO v_rows
  FROM (
    SELECT
      p.id,
      p.pg_transaction_id,
      p.paid_at,
      p.created_at,
      p.amount,
      p.payment_method,
      p.status,
      p.reservation_id,
      p.payment_type,
      json_build_object(
        'nickname', m.nickname,
        'phone', m.phone
      ) AS members,
      json_build_object(
        'name', k.name
      ) AS kindergartens,
      json_build_object(
        'name', pt.name
      ) AS pets
    FROM payments p
    JOIN members m ON m.id = p.member_id
    LEFT JOIN pets pt ON pt.id = p.pet_id
    LEFT JOIN kindergartens k ON k.id = p.kindergarten_id
    WHERE p.payment_type = p_payment_type
      AND (p_date_from IS NULL OR p.paid_at >= p_date_from::timestamptz)
      AND (p_date_to IS NULL OR p.paid_at <= p_date_to::timestamptz)
      AND (p_payment_method IS NULL OR p.payment_method = p_payment_method)
      AND (p_status IS NULL OR p.status = p_status)
      AND (p_amount_min IS NULL OR p.amount >= p_amount_min)
      AND (p_amount_max IS NULL OR p.amount <= p_amount_max)
      AND (
        p_search_type IS NULL OR p_search_keyword IS NULL
        OR (p_search_type = '보호자 닉네임' AND m.nickname ILIKE '%' || p_search_keyword || '%')
        OR (p_search_type = '유치원명' AND k.name ILIKE '%' || p_search_keyword || '%')
        OR (p_search_type = 'PG 거래번호' AND p.pg_transaction_id ILIKE '%' || p_search_keyword || '%')
        OR (p_search_type = '보호자 연락처' AND m.phone ILIKE '%' || p_search_keyword || '%')
      )
    ORDER BY p.paid_at DESC
    LIMIT p_per_page OFFSET v_offset
  ) t;

  RETURN json_build_object(
    'data', COALESCE(v_rows, '[]'::json),
    'count', v_total
  );
END;
$$;


-- ============================================================
-- 2. search_refunds — 환불/위약금 탭
-- ============================================================
-- 변경사항:
--   - penalty_payment_id로 payments(pp) LEFT JOIN 추가
--   - SELECT에 위약금 결제 정보 (penalty_payment 객체) 반환
--   - '위약금 결제번호' 검색: pp.pg_transaction_id ILIKE (기존 FALSE → 실제 검색)

CREATE OR REPLACE FUNCTION public.search_refunds(
  p_date_from      text    DEFAULT NULL,
  p_date_to        text    DEFAULT NULL,
  p_status         text    DEFAULT NULL,
  p_requester      text    DEFAULT NULL,
  p_search_type    text    DEFAULT NULL,
  p_search_keyword text    DEFAULT NULL,
  p_page           int     DEFAULT 1,
  p_per_page       int     DEFAULT 20
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_offset   int;
  v_total    bigint;
  v_rows     json;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  v_offset := (p_page - 1) * p_per_page;

  -- 총 건수 카운트
  SELECT COUNT(*)
  INTO v_total
  FROM refunds rf
  JOIN members m ON m.id = rf.member_id
  LEFT JOIN kindergartens k ON k.id = rf.kindergarten_id
  LEFT JOIN reservations rv ON rv.id = rf.reservation_id
  LEFT JOIN pets pt ON pt.id = rv.pet_id
  LEFT JOIN payments pp ON pp.id = rf.penalty_payment_id
  WHERE (p_date_from IS NULL OR rf.requested_at >= p_date_from::timestamptz)
    AND (p_date_to IS NULL OR rf.requested_at <= p_date_to::timestamptz)
    AND (p_status IS NULL OR rf.status = p_status)
    AND (p_requester IS NULL OR rf.requester = p_requester)
    AND (
      p_search_type IS NULL OR p_search_keyword IS NULL
      OR (p_search_type = '보호자 닉네임' AND m.nickname ILIKE '%' || p_search_keyword || '%')
      OR (p_search_type = '보호자 연락처' AND m.phone ILIKE '%' || p_search_keyword || '%')
      OR (p_search_type = '유치원명' AND k.name ILIKE '%' || p_search_keyword || '%')
      OR (p_search_type = '위약금 결제번호' AND pp.pg_transaction_id ILIKE '%' || p_search_keyword || '%')
    );

  -- 데이터 조회
  SELECT json_agg(t)
  INTO v_rows
  FROM (
    SELECT
      rf.id,
      rf.requested_at,
      rf.requester,
      rf.refund_amount,
      rf.penalty_amount,
      rf.status,
      rf.completed_at,
      rf.payment_id,
      rf.penalty_payment_id,
      json_build_object(
        'nickname', m.nickname,
        'phone', m.phone
      ) AS members,
      json_build_object(
        'name', k.name
      ) AS kindergartens,
      json_build_object(
        'name', pt.name
      ) AS pets,
      CASE WHEN pp.id IS NOT NULL THEN
        json_build_object(
          'id', pp.id,
          'pg_transaction_id', pp.pg_transaction_id,
          'amount', pp.amount,
          'payment_method', pp.payment_method,
          'status', pp.status,
          'paid_at', pp.paid_at
        )
      ELSE NULL
      END AS penalty_payment
    FROM refunds rf
    JOIN members m ON m.id = rf.member_id
    LEFT JOIN kindergartens k ON k.id = rf.kindergarten_id
    LEFT JOIN reservations rv ON rv.id = rf.reservation_id
    LEFT JOIN pets pt ON pt.id = rv.pet_id
    LEFT JOIN payments pp ON pp.id = rf.penalty_payment_id
    WHERE (p_date_from IS NULL OR rf.requested_at >= p_date_from::timestamptz)
      AND (p_date_to IS NULL OR rf.requested_at <= p_date_to::timestamptz)
      AND (p_status IS NULL OR rf.status = p_status)
      AND (p_requester IS NULL OR rf.requester = p_requester)
      AND (
        p_search_type IS NULL OR p_search_keyword IS NULL
        OR (p_search_type = '보호자 닉네임' AND m.nickname ILIKE '%' || p_search_keyword || '%')
        OR (p_search_type = '보호자 연락처' AND m.phone ILIKE '%' || p_search_keyword || '%')
        OR (p_search_type = '유치원명' AND k.name ILIKE '%' || p_search_keyword || '%')
        OR (p_search_type = '위약금 결제번호' AND pp.pg_transaction_id ILIKE '%' || p_search_keyword || '%')
      )
    ORDER BY rf.requested_at DESC
    LIMIT p_per_page OFFSET v_offset
  ) t;

  RETURN json_build_object(
    'data', COALESCE(v_rows, '[]'::json),
    'count', v_total
  );
END;
$$;


-- ============================================================
-- 3. get_dashboard_monthly_sales — 이달 매출 요약
-- ============================================================
-- 변경사항:
--   - 돌봄 결제금액: payments WHERE payment_type='돌봄' (기존과 동일 범위, 명시적 필터 추가)
--   - 위약금 결제금액: payments WHERE payment_type='위약금' (기존: refunds.penalty_amount에서 조회)
--   - 취소·환불 금액: 기존과 동일 (refunds.refund_amount)

CREATE OR REPLACE FUNCTION public.get_dashboard_monthly_sales()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_month_start date;
  v_prev_month_start date;
  v_prev_month_end date;
  v_care_payment bigint;
  v_penalty_payment bigint;
  v_total_valid bigint;
  v_platform_fee numeric;
  v_kg_settlement numeric;
  v_cancel_refund bigint;
  v_prev_month_fee numeric;
  v_change_rate numeric;
  v_commission_rate numeric := 20; -- 플랫폼 수수료 20%
BEGIN
  v_month_start := date_trunc('month', CURRENT_DATE)::date;
  v_prev_month_start := (date_trunc('month', CURRENT_DATE) - interval '1 month')::date;
  v_prev_month_end := (date_trunc('month', CURRENT_DATE) - interval '1 day')::date;

  -- 1) 이번 달 돌봄 결제금액 (payment_type='돌봄', 결제완료 상태)
  SELECT COALESCE(SUM(amount), 0) INTO v_care_payment
  FROM payments
  WHERE paid_at >= v_month_start
    AND status = '결제완료'
    AND payment_type = '돌봄';

  -- 2) 이번 달 위약금 결제금액 (payment_type='위약금', 결제완료 상태)
  --    기존: refunds.penalty_amount에서 조회 → 변경: payments 테이블에서 직접 조회
  SELECT COALESCE(SUM(amount), 0) INTO v_penalty_payment
  FROM payments
  WHERE paid_at >= v_month_start
    AND status = '결제완료'
    AND payment_type = '위약금';

  -- 3) 총 유효 거래금액
  v_total_valid := v_care_payment + v_penalty_payment;

  -- 4) 플랫폼 수수료 수입 (20%)
  v_platform_fee := ROUND(v_total_valid * v_commission_rate / 100);

  -- 5) 유치원 정산 총액 (80%)
  v_kg_settlement := v_total_valid - v_platform_fee;

  -- 6) 이번 달 취소·환불 금액
  SELECT COALESCE(SUM(refund_amount), 0) INTO v_cancel_refund
  FROM refunds
  WHERE requested_at >= v_month_start
    AND status = '환불완료';

  -- 7) 전월 플랫폼 수수료 수입 (돌봄+위약금 합산)
  SELECT COALESCE(SUM(amount), 0) * v_commission_rate / 100 INTO v_prev_month_fee
  FROM payments
  WHERE paid_at >= v_prev_month_start
    AND paid_at < v_month_start
    AND status = '결제완료';

  -- 8) 전월 대비 증감률
  IF v_prev_month_fee > 0 THEN
    v_change_rate := ROUND(((v_platform_fee - v_prev_month_fee) / v_prev_month_fee) * 100, 1);
  ELSE
    v_change_rate := NULL;
  END IF;

  RETURN json_build_object(
    'care_payment', v_care_payment,
    'penalty_payment', v_penalty_payment,
    'total_valid', v_total_valid,
    'platform_fee', v_platform_fee,
    'kg_settlement', v_kg_settlement,
    'cancel_refund', v_cancel_refund,
    'prev_month_fee', v_prev_month_fee,
    'change_rate', v_change_rate
  );
END;
$$;


-- ============================================================
-- 4. get_dashboard_today_stats — 오늘의 현황
-- ============================================================
-- 변경사항:
--   - 오늘 결제 총액: payment_type='돌봄'만 집계 (위약금은 매출 요약에서 별도 표시)

CREATE OR REPLACE FUNCTION public.get_dashboard_today_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_today date := CURRENT_DATE;
  v_new_members bigint;
  v_new_reservations bigint;
  v_checkin_expected bigint;
  v_in_progress bigint;
  v_today_payments bigint;
  v_today_cancel_refund bigint;
BEGIN
  SELECT COUNT(*) INTO v_new_members
  FROM members WHERE created_at::date = v_today;

  SELECT COUNT(*) INTO v_new_reservations
  FROM reservations WHERE created_at::date = v_today;

  SELECT COUNT(*) INTO v_checkin_expected
  FROM reservations
  WHERE checkin_scheduled::date = v_today AND status = '예약확정';

  SELECT COUNT(*) INTO v_in_progress
  FROM reservations WHERE status = '돌봄진행중';

  -- 오늘 결제 총액 (돌봄 결제만 — 위약금은 별도 집계)
  SELECT COALESCE(SUM(amount), 0) INTO v_today_payments
  FROM payments
  WHERE paid_at::date = v_today
    AND status = '결제완료'
    AND payment_type = '돌봄';

  SELECT COUNT(*) INTO v_today_cancel_refund
  FROM refunds WHERE requested_at::date = v_today;

  RETURN json_build_object(
    'new_members', v_new_members,
    'new_reservations', v_new_reservations,
    'checkin_expected', v_checkin_expected,
    'in_progress', v_in_progress,
    'today_payments', v_today_payments,
    'today_cancel_refund', v_today_cancel_refund
  );
END;
$$;


-- ============================================================
-- 5. get_settlement_summary — 정산 요약 (기간 필터 추가 + 컬럼명 수정)
-- ============================================================
-- 변경사항:
--   - p_date_from, p_date_to 파라미터 추가 (기간 필터링)
--   - payment_status → status (실제 payments 테이블 컬럼명)
--   - settlement_status → status (실제 settlements 테이블 컬럼명)
--   - payment_type 필터 활용 (돌봄/위약금 구분)
--   (의사결정 #9: 전체 기간 합산 방지)

CREATE OR REPLACE FUNCTION public.get_settlement_summary(
  p_date_from text DEFAULT NULL,
  p_date_to   text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'care_payment',      COALESCE(SUM(CASE WHEN p.payment_type = '돌봄' AND p.status = '결제완료' THEN p.amount ELSE 0 END), 0),
    'penalty_payment',   COALESCE(SUM(CASE WHEN p.payment_type = '위약금' AND p.status = '결제완료' THEN p.amount ELSE 0 END), 0),
    'total_valid',       COALESCE(SUM(CASE WHEN p.status = '결제완료' THEN p.amount ELSE 0 END), 0),
    'platform_fee',      COALESCE(SUM(CASE WHEN p.status = '결제완료' THEN p.amount * 0.2 ELSE 0 END), 0),
    'kg_settlement',     COALESCE(SUM(CASE WHEN p.status = '결제완료' THEN p.amount * 0.8 ELSE 0 END), 0),
    'pending_count',     (SELECT COUNT(*) FROM settlements s WHERE s.status = '정산예정'
                            AND (p_date_from IS NULL OR s.scheduled_date >= p_date_from::date)
                            AND (p_date_to IS NULL OR s.scheduled_date <= p_date_to::date)),
    'pending_amount',    (SELECT COALESCE(SUM(s.settlement_amount), 0) FROM settlements s WHERE s.status = '정산예정'
                            AND (p_date_from IS NULL OR s.scheduled_date >= p_date_from::date)
                            AND (p_date_to IS NULL OR s.scheduled_date <= p_date_to::date)),
    'completed_count',   (SELECT COUNT(*) FROM settlements s WHERE s.status = '정산완료'
                            AND (p_date_from IS NULL OR s.scheduled_date >= p_date_from::date)
                            AND (p_date_to IS NULL OR s.scheduled_date <= p_date_to::date)),
    'completed_amount',  (SELECT COALESCE(SUM(s.settlement_amount), 0) FROM settlements s WHERE s.status = '정산완료'
                            AND (p_date_from IS NULL OR s.scheduled_date >= p_date_from::date)
                            AND (p_date_to IS NULL OR s.scheduled_date <= p_date_to::date))
  ) INTO result
  FROM payments p
  WHERE (p_date_from IS NULL OR p.paid_at >= p_date_from::timestamptz)
    AND (p_date_to IS NULL OR p.paid_at <= p_date_to::timestamptz);

  RETURN result;
END;
$$;
