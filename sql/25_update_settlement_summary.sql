-- ============================================================
-- SQL 25: get_settlement_summary 수정 (정산보류 건수/금액 추가)
-- ============================================================
-- 실행 방법: Supabase SQL Editor에 전체 복사하여 실행
-- 변경사항:
--   - hold_count, hold_amount 반환값 2개 추가
--   - 기존 9개 반환값 유지 (care_payment, penalty_payment, total_valid,
--     platform_fee, kg_settlement, pending_count, pending_amount,
--     completed_count, completed_amount)
-- 시그니처: (text, text) 동일하므로 DROP 불필요, CREATE OR REPLACE 사용
-- 참고: 기존 함수는 sql/21_rpc_payment_type_update.sql 섹션 5에서 생성됨
-- ============================================================

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
                            AND (p_date_to IS NULL OR s.scheduled_date <= p_date_to::date)),
    'hold_count',        (SELECT COUNT(*) FROM settlements s WHERE s.status = '정산보류'
                            AND (p_date_from IS NULL OR s.scheduled_date >= p_date_from::date)
                            AND (p_date_to IS NULL OR s.scheduled_date <= p_date_to::date)),
    'hold_amount',       (SELECT COALESCE(SUM(s.settlement_amount), 0) FROM settlements s WHERE s.status = '정산보류'
                            AND (p_date_from IS NULL OR s.scheduled_date >= p_date_from::date)
                            AND (p_date_to IS NULL OR s.scheduled_date <= p_date_to::date))
  ) INTO result
  FROM payments p
  WHERE (p_date_from IS NULL OR p.paid_at >= p_date_from::timestamptz)
    AND (p_date_to IS NULL OR p.paid_at <= p_date_to::timestamptz);

  RETURN result;
END;
$$;
