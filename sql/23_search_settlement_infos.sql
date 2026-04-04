-- ============================================================
-- SQL 23: search_settlement_infos RPC 함수 (정산정보 탭 검색)
-- ============================================================
-- 실행 방법: Supabase SQL Editor에 전체 복사하여 실행
-- 목적:
--   정산정보 목록에서 조인 테이블(kindergartens.name) 기준 검색을 지원하기 위해
--   RPC 함수 방식으로 전환. search_payments 패턴을 참고하여 동일 구조로 작성.
--
-- 파라미터:
--   p_inicis_status   : 이니시스 등록상태 필터 (미등록/요청중/완료/실패, NULL=전체)
--   p_business_type   : 사업자유형 필터 (개인사업자/법인사업자/비사업자, NULL=전체)
--   p_search_type     : 검색 기준 (유치원명/운영자 성명/사업자등록번호)
--   p_search_keyword  : 검색 키워드
--   p_kindergarten_id : 유치원 필터 (URL 파라미터로 전달, NULL=전체)
--   p_page            : 페이지 번호
--   p_per_page        : 페이지당 건수
--
-- 반환: { data: [...], count: N }
-- ============================================================

CREATE OR REPLACE FUNCTION public.search_settlement_infos(
  p_inicis_status    text DEFAULT NULL,
  p_business_type    text DEFAULT NULL,
  p_search_type      text DEFAULT NULL,
  p_search_keyword   text DEFAULT NULL,
  p_kindergarten_id  uuid DEFAULT NULL,
  p_page             int  DEFAULT 1,
  p_per_page         int  DEFAULT 20
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
  -- 관리자 권한 체크
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  v_offset := (p_page - 1) * p_per_page;

  -- 총 건수 카운트
  SELECT COUNT(*)
  INTO v_total
  FROM settlement_infos si
  LEFT JOIN kindergartens k ON k.id = si.kindergarten_id
  WHERE (p_inicis_status IS NULL OR si.inicis_status = p_inicis_status)
    AND (p_business_type IS NULL OR si.business_type = p_business_type)
    AND (p_kindergarten_id IS NULL OR si.kindergarten_id = p_kindergarten_id)
    AND (
      p_search_type IS NULL OR p_search_keyword IS NULL
      OR (p_search_type = '유치원명' AND k.name ILIKE '%' || p_search_keyword || '%')
      OR (p_search_type = '운영자 성명' AND si.operator_name ILIKE '%' || p_search_keyword || '%')
      OR (p_search_type = '사업자등록번호' AND si.business_reg_number ILIKE '%' || p_search_keyword || '%')
    );

  -- 데이터 조회
  SELECT json_agg(t)
  INTO v_rows
  FROM (
    SELECT
      si.id,
      si.kindergarten_id,
      si.member_id,
      si.operator_name,
      si.operator_phone,
      si.business_type,
      si.business_reg_number,
      si.account_bank,
      si.account_number,
      si.account_holder,
      si.inicis_seller_id,
      si.inicis_status,
      si.inicis_fail_reason,
      si.inicis_requested_at,
      si.inicis_completed_at,
      si.created_at,
      json_build_object(
        'name', k.name
      ) AS kindergartens
    FROM settlement_infos si
    LEFT JOIN kindergartens k ON k.id = si.kindergarten_id
    WHERE (p_inicis_status IS NULL OR si.inicis_status = p_inicis_status)
      AND (p_business_type IS NULL OR si.business_type = p_business_type)
      AND (p_kindergarten_id IS NULL OR si.kindergarten_id = p_kindergarten_id)
      AND (
        p_search_type IS NULL OR p_search_keyword IS NULL
        OR (p_search_type = '유치원명' AND k.name ILIKE '%' || p_search_keyword || '%')
        OR (p_search_type = '운영자 성명' AND si.operator_name ILIKE '%' || p_search_keyword || '%')
        OR (p_search_type = '사업자등록번호' AND si.business_reg_number ILIKE '%' || p_search_keyword || '%')
      )
    ORDER BY si.created_at DESC NULLS LAST
    LIMIT p_per_page OFFSET v_offset
  ) t;

  RETURN json_build_object(
    'data', COALESCE(v_rows, '[]'::json),
    'count', v_total
  );
END;
$$;
