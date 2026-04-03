-- ============================================================
-- SQL 24: search_settlements RPC 함수 (정산내역 탭 검색)
-- ============================================================
-- 실행 방법: Supabase SQL Editor에 전체 복사하여 실행
-- 목적:
--   정산내역 목록에서 조인 테이블(kindergartens.name, settlement_infos.business_reg_number)
--   기준 검색을 지원하기 위해 RPC 함수 방식으로 전환.
--   search_settlement_infos(sql/23) 및 search_payments(sql/21) 패턴 참고.
--
-- 사전 작업:
--   settlement_infos.kindergarten_id UNIQUE 제약 추가
--   (기존 일반 INDEX만 존재 → UNIQUE 제약으로 교체)
--
-- 파라미터 타입 패턴:
--   기존 RPC(search_payments, search_refunds, search_settlement_infos)와
--   동일한 원래 타입 유지 패턴 사용 (text, numeric, uuid, int).
--   JS에서 값이 있으면 원래 타입으로, 없으면 null을 전달.
--   PostgREST는 named parameter 기반 함수 매칭을 수행하며,
--   null 값은 any type으로 암시적 캐스팅됨.
--
-- ⚠️ 주의 (오버로드 충돌 방지):
--   이 함수의 시그니처를 변경할 경우 반드시 이전 시그니처를 DROP 한 뒤
--   CREATE OR REPLACE 해야 함. PostgreSQL은 파라미터 타입이 다르면
--   별도 함수(오버로드)로 인식하며, PostgREST는 같은 이름 + 다른 타입의
--   오버로드를 지원하지 않음 (공식 문서: "Overloaded functions with
--   the same argument names but different types are not supported").
--   오버로드가 존재하면 "Could not find the function" 에러 발생.
--
-- 파라미터:
--   p_date_from        text    : 정산 예정일 시작 (NULL=제한없음)
--   p_date_to          text    : 정산 예정일 종료 (NULL=제한없음)
--   p_status           text    : 정산상태 필터 (정산예정/정산완료/정산보류, NULL=전체)
--   p_transaction_type text    : 거래유형 필터 (돌봄/위약금, NULL=전체)
--   p_search_type      text    : 검색 기준 (유치원명/운영자 성명/사업자등록번호)
--   p_search_keyword   text    : 검색 키워드
--   p_amount_type      text    : 금액 검색 대상 (payment_amount/commission_amount/settlement_amount)
--   p_amount_min       numeric : 최소금액
--   p_amount_max       numeric : 최대금액
--   p_kindergarten_id  uuid    : 유치원 필터 (URL 파라미터, NULL=전체)
--   p_page             int     : 페이지 번호
--   p_per_page         int     : 페이지당 건수
--
-- 조인 구조:
--   settlements → kindergartens (kindergarten_id FK, 유치원명 검색)
--   settlements → settlement_infos (kindergarten_id 간접 연결, 사업자등록번호 검색)
--   ※ settlement_infos는 직접 FK가 아니므로 LATERAL + LIMIT 1 방어 처리
--
-- 반환: { data: [...], count: N }
-- ============================================================


-- ── 사전 작업: settlement_infos.kindergarten_id UNIQUE 제약 추가 ──
-- 기존 일반 INDEX 제거 후 UNIQUE 제약으로 교체
-- UNIQUE 제약이 자동으로 UNIQUE INDEX를 생성하므로 검색 성능 동일
DROP INDEX IF EXISTS idx_si_kindergarten;
ALTER TABLE settlement_infos
  ADD CONSTRAINT uq_settlement_infos_kindergarten_id UNIQUE (kindergarten_id);


-- ── 기존 함수 제거 (오버로드 충돌 방지) ──
-- 이전에 all-text 시그니처(text×12)로 생성된 버전이 있을 수 있으므로 모두 제거
DROP FUNCTION IF EXISTS public.search_settlements(
  text, text, text, text, text, text, text, text, text, text, text, text
);
-- 원래 타입 시그니처가 이미 존재할 경우도 제거 (CREATE OR REPLACE 전 안전 처리)
DROP FUNCTION IF EXISTS public.search_settlements(
  text, text, text, text, text, text, text, numeric, numeric, uuid, int, int
);


-- ── search_settlements RPC 함수 ──
-- 원래 타입 유지 패턴: search_payments(sql/21), search_settlement_infos(sql/23)와 동일
CREATE OR REPLACE FUNCTION public.search_settlements(
  p_date_from        text    DEFAULT NULL,
  p_date_to          text    DEFAULT NULL,
  p_status           text    DEFAULT NULL,
  p_transaction_type text    DEFAULT NULL,
  p_search_type      text    DEFAULT NULL,
  p_search_keyword   text    DEFAULT NULL,
  p_amount_type      text    DEFAULT NULL,
  p_amount_min       numeric DEFAULT NULL,
  p_amount_max       numeric DEFAULT NULL,
  p_kindergarten_id  uuid    DEFAULT NULL,
  p_page             int     DEFAULT 1,
  p_per_page         int     DEFAULT 20
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
  FROM settlements s
  LEFT JOIN kindergartens k ON k.id = s.kindergarten_id
  LEFT JOIN LATERAL (
    SELECT si2.business_reg_number
    FROM settlement_infos si2
    WHERE si2.kindergarten_id = s.kindergarten_id
    LIMIT 1
  ) si ON true
  WHERE (p_date_from IS NULL OR s.scheduled_date >= p_date_from::date)
    AND (p_date_to IS NULL OR s.scheduled_date <= p_date_to::date)
    AND (p_status IS NULL OR s.status = p_status)
    AND (p_transaction_type IS NULL OR s.transaction_type = p_transaction_type)
    AND (p_kindergarten_id IS NULL OR s.kindergarten_id = p_kindergarten_id)
    -- 금액 검색 (최소)
    AND (p_amount_type IS NULL OR p_amount_min IS NULL OR (
      (p_amount_type = 'payment_amount' AND s.payment_amount >= p_amount_min) OR
      (p_amount_type = 'commission_amount' AND s.commission_amount >= p_amount_min) OR
      (p_amount_type = 'settlement_amount' AND s.settlement_amount >= p_amount_min)
    ))
    -- 금액 검색 (최대)
    AND (p_amount_type IS NULL OR p_amount_max IS NULL OR (
      (p_amount_type = 'payment_amount' AND s.payment_amount <= p_amount_max) OR
      (p_amount_type = 'commission_amount' AND s.commission_amount <= p_amount_max) OR
      (p_amount_type = 'settlement_amount' AND s.settlement_amount <= p_amount_max)
    ))
    -- 키워드 검색
    AND (
      p_search_type IS NULL OR p_search_keyword IS NULL
      OR (p_search_type = '유치원명' AND k.name ILIKE '%' || p_search_keyword || '%')
      OR (p_search_type = '운영자 성명' AND s.operator_name ILIKE '%' || p_search_keyword || '%')
      OR (p_search_type = '사업자등록번호' AND si.business_reg_number ILIKE '%' || p_search_keyword || '%')
    );

  -- 데이터 조회
  SELECT json_agg(t)
  INTO v_rows
  FROM (
    SELECT
      s.id,
      s.scheduled_date,
      s.kindergarten_id,
      s.operator_name,
      s.transaction_type,
      s.payment_amount,
      s.commission_rate,
      s.commission_amount,
      s.settlement_amount,
      s.account_bank,
      s.account_number,
      s.status,
      s.completed_date,
      json_build_object('name', k.name) AS kindergartens
    FROM settlements s
    LEFT JOIN kindergartens k ON k.id = s.kindergarten_id
    LEFT JOIN LATERAL (
      SELECT si2.business_reg_number
      FROM settlement_infos si2
      WHERE si2.kindergarten_id = s.kindergarten_id
      LIMIT 1
    ) si ON true
    WHERE (p_date_from IS NULL OR s.scheduled_date >= p_date_from::date)
      AND (p_date_to IS NULL OR s.scheduled_date <= p_date_to::date)
      AND (p_status IS NULL OR s.status = p_status)
      AND (p_transaction_type IS NULL OR s.transaction_type = p_transaction_type)
      AND (p_kindergarten_id IS NULL OR s.kindergarten_id = p_kindergarten_id)
      AND (p_amount_type IS NULL OR p_amount_min IS NULL OR (
        (p_amount_type = 'payment_amount' AND s.payment_amount >= p_amount_min) OR
        (p_amount_type = 'commission_amount' AND s.commission_amount >= p_amount_min) OR
        (p_amount_type = 'settlement_amount' AND s.settlement_amount >= p_amount_min)
      ))
      AND (p_amount_type IS NULL OR p_amount_max IS NULL OR (
        (p_amount_type = 'payment_amount' AND s.payment_amount <= p_amount_max) OR
        (p_amount_type = 'commission_amount' AND s.commission_amount <= p_amount_max) OR
        (p_amount_type = 'settlement_amount' AND s.settlement_amount <= p_amount_max)
      ))
      AND (
        p_search_type IS NULL OR p_search_keyword IS NULL
        OR (p_search_type = '유치원명' AND k.name ILIKE '%' || p_search_keyword || '%')
        OR (p_search_type = '운영자 성명' AND s.operator_name ILIKE '%' || p_search_keyword || '%')
        OR (p_search_type = '사업자등록번호' AND si.business_reg_number ILIKE '%' || p_search_keyword || '%')
      )
    ORDER BY s.scheduled_date DESC NULLS LAST
    LIMIT p_per_page OFFSET v_offset
  ) t;

  RETURN json_build_object(
    'data', COALESCE(v_rows, '[]'::json),
    'count', v_total
  );
END;
$$;
