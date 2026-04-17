-- ============================================================
-- SQL 44-10: app_get_settlement_summary RPC 함수
-- ============================================================
-- 실행 방법: Supabase SQL Editor에 전체 복사하여 실행
-- 원본 PHP: get_settlement.php
-- 용도: 정산 요약 + 기간별 상세 내역 — 유치원 운영자 전용
-- 보안: SECURITY INVOKER — 호출자 RLS 적용 + internal VIEW로 보호자 데이터 안전 조회
-- ============================================================
--
-- [사전 조건 — RLS 보강 필요]
--   43_01_app_rls_policies.sql의 settlements_select_app 정책에
--   유치원 운영자 조회 조건 추가 필요:
--
--   CREATE POLICY "settlements_select_app" ON settlements
--     FOR SELECT
--     USING (
--       member_id = auth.uid()
--       OR kindergarten_id IN (
--         SELECT id FROM kindergartens WHERE member_id = auth.uid()
--       )
--     );
--
--   사유: settlements.member_id는 결제자(보호자)이므로
--         유치원 운영자가 자기 유치원 정산 내역을 조회하려면
--         kindergarten_id 기반 조건 필요 (reservations/payments/refunds와 동일 패턴)
--
-- [PHP 원본 로직 (get_settlement.php)]
--   파라미터: mb_id (전화번호), start_date, end_date
--   1️⃣ 전체 누적 집계:
--      payment_request WHERE mb_id AND status='approved'
--      → is_settled=1 SUM(price) / is_settled=0 SUM(price)
--   2️⃣ 기간별 상세:
--      payment_request WHERE mb_id AND status='approved'
--      AND created_at BETWEEN start~end
--      → 각 건마다 g5_member N+1 쿼리
--   반환: total_settled_amount, total_unsettled_amount,
--         period_settled_amount, histories (날짜별 그룹)
--
--   원본 문제점:
--     - mb_id만으로 접근 제어 없음 (타인 정산 조회 가능)
--     - N+1 쿼리 (내역 건별 회원 조회)
--     - is_settled 플래그가 payment_request에 혼재
--     - 금융정보(bank_name/account) 노출
--     - 페이지네이션 없음 (전체 목록 한 번에 반환)
--     - 정산보류 구분 없음
--
-- [Supabase 전환]
--   - mb_id → auth.uid() + kindergartens.member_id 자동 조회
--   - payment_request.is_settled → settlements.status 별도 테이블
--   - N+1 → 단일 JOIN
--   - 금융정보 제외 (details 목록에서 account 비노출)
--   - next_settlement: settlement_infos에서 계좌정보 조회 (본인 데이터)
--   - 페이지네이션 추가 (p_page, p_per_page)
--   - 정산보류 (total_held_amount) 추가
--   - period_summary: 기간별 합산 집계 추가
--
-- [TODO] 기간 필터 날짜 기준: 현재 scheduled_date 단일 기준.
-- 정산완료 건은 completed_date 기준이 정확하나,
-- 초기 운영 시 scheduled_date = completed_date 동일하므로 일괄 적용.
-- 향후 정산예정일 ≠ 실제지급일 케이스 발생 시
-- CASE WHEN status='정산완료' THEN completed_date ELSE scheduled_date END 로 전환 필요.
--
-- [RLS 영향 분석]
--   4개 테이블/VIEW 참조:
--
--   ① kindergartens
--      정책: kindergartens_select_app — USING (true) — 전체 공개
--      통과: ✅ 본인 유치원 ID 조회
--
--   ② settlements
--      정책: settlements_select_app — USING (
--        member_id = auth.uid()
--        OR kindergarten_id IN (SELECT id FROM kindergartens WHERE member_id = auth.uid())
--      )
--      통과: ✅ 보강 후 유치원 운영자 통과
--
--   ③ settlement_infos
--      정책: settlement_infos_select_app — USING (member_id = auth.uid())
--      통과: ✅ settlement_infos.member_id = 유치원 운영자 (본인 데이터)
--
--   ④ members (→ internal.members_public_profile VIEW)
--      정책: members_select_app — USING (id = auth.uid()) — 본인만
--      통과: ❌ 보호자 프로필 조회 차단
--      해결: ✅ internal.members_public_profile VIEW 사용
--
--   RLS 충돌: 1건 (members) → internal VIEW 1개로 해결
--   SECURITY INVOKER 적합성: ✅
-- ============================================================


-- 기존 함수 제거 (재실행 안전)
DROP FUNCTION IF EXISTS public.app_get_settlement_summary(text, text, int, int);


-- ============================================================
-- 함수 정의
-- ============================================================
CREATE OR REPLACE FUNCTION public.app_get_settlement_summary(
  p_start_date   text    DEFAULT NULL,   -- 기간 시작 (YYYY-MM-DD), NULL=전체
  p_end_date     text    DEFAULT NULL,   -- 기간 종료 (YYYY-MM-DD), NULL=전체
  p_page         int     DEFAULT 1,
  p_per_page     int     DEFAULT 20      -- 최대 50
)
RETURNS json
LANGUAGE plpgsql
STABLE                                   -- 읽기 전용 함수
SECURITY INVOKER                         -- RLS 적용 (호출자 권한)
SET search_path = public
AS $$
DECLARE
  v_current_uid         uuid;
  v_kindergarten_id     uuid;
  v_per_page            int;
  v_page                int;
  v_offset              int;
  v_start_date          date;
  v_end_date            date;
  v_summary_json        json;
  v_next_settlement_json json;
  v_period_summary_json json;
  v_details_json        json;
  v_total               bigint;
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
  -- 2. 본인 유치원 조회 (유치원 운영자 전용)
  -- ──────────────────────────────────────────────────────
  SELECT kg.id
  INTO v_kindergarten_id
  FROM kindergartens kg
  WHERE kg.member_id = v_current_uid
  LIMIT 1;

  IF v_kindergarten_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', '유치원을 찾을 수 없습니다. 유치원 운영자만 정산 요약을 조회할 수 있습니다.',
      'code', 'KINDERGARTEN_NOT_FOUND'
    );
  END IF;

  -- ──────────────────────────────────────────────────────
  -- 3. 입력값 검증
  -- ──────────────────────────────────────────────────────
  -- 페이지네이션 안전값 보정
  v_per_page := LEAST(GREATEST(p_per_page, 1), 50);
  v_page     := GREATEST(p_page, 1);
  v_offset   := (v_page - 1) * v_per_page;

  -- 날짜 형식 검증 (YYYY-MM-DD)
  IF p_start_date IS NOT NULL THEN
    IF p_start_date !~ '^\d{4}-\d{2}-\d{2}$' THEN
      RETURN json_build_object(
        'success', false,
        'error', 'start_date 형식이 올바르지 않습니다. (YYYY-MM-DD)',
        'code', 'INVALID_DATE_FORMAT'
      );
    END IF;
    v_start_date := p_start_date::date;
  END IF;

  IF p_end_date IS NOT NULL THEN
    IF p_end_date !~ '^\d{4}-\d{2}-\d{2}$' THEN
      RETURN json_build_object(
        'success', false,
        'error', 'end_date 형식이 올바르지 않습니다. (YYYY-MM-DD)',
        'code', 'INVALID_DATE_FORMAT'
      );
    END IF;
    v_end_date := p_end_date::date;
  END IF;

  -- ──────────────────────────────────────────────────────
  -- 4. summary — 전체 기간 누적 집계 (기간 필터 무관)
  -- ──────────────────────────────────────────────────────
  SELECT json_build_object(
    'total_settled_amount',
      COALESCE(SUM(CASE WHEN s.status = '정산완료' THEN s.settlement_amount ELSE 0 END), 0),
    'total_unsettled_amount',
      COALESCE(SUM(CASE WHEN s.status = '정산예정' THEN s.settlement_amount ELSE 0 END), 0),
    'total_held_amount',
      COALESCE(SUM(CASE WHEN s.status = '정산보류' THEN s.settlement_amount ELSE 0 END), 0)
  )
  INTO v_summary_json
  FROM settlements s
  WHERE s.kindergarten_id = v_kindergarten_id;

  -- ──────────────────────────────────────────────────────
  -- 5. next_settlement — 가장 가까운 미래 정산예정
  --    정산예정 건 중 scheduled_date >= CURRENT_DATE인
  --    가장 가까운 날짜의 합산 금액 + 계좌정보
  --    계좌정보: settlement_infos에서 직접 조회 (본인 데이터, RLS 통과)
  -- ──────────────────────────────────────────────────────
  SELECT json_build_object(
    'amount', sub.total_amount,
    'scheduled_date', sub.next_date,
    'account_bank', si.account_bank,
    'account_number', si.account_number
  )
  INTO v_next_settlement_json
  FROM (
    SELECT
      s.scheduled_date AS next_date,
      SUM(s.settlement_amount) AS total_amount
    FROM settlements s
    WHERE s.kindergarten_id = v_kindergarten_id
      AND s.status = '정산예정'
      AND s.scheduled_date >= CURRENT_DATE
    GROUP BY s.scheduled_date
    ORDER BY s.scheduled_date ASC
    LIMIT 1
  ) sub
  LEFT JOIN settlement_infos si ON si.kindergarten_id = v_kindergarten_id;
  -- settlement_infos: 본인 데이터 (member_id = auth.uid()), RLS 직접 통과
  -- 정산예정 건이 없으면 sub가 0행 → v_next_settlement_json = NULL

  -- ──────────────────────────────────────────────────────
  -- 6. period_summary — 기간 필터 적용 합산 집계
  --    기간 미지정(NULL)이면 전체 기간
  --
  --    [TODO] 기간 필터 날짜 기준: 현재 scheduled_date 단일 기준.
  --    정산완료 건은 completed_date 기준이 정확하나,
  --    초기 운영 시 scheduled_date = completed_date 동일하므로 일괄 적용.
  --    향후 정산예정일 ≠ 실제지급일 케이스 발생 시
  --    CASE WHEN status='정산완료' THEN completed_date ELSE scheduled_date END 로 전환 필요.
  -- ──────────────────────────────────────────────────────
  SELECT json_build_object(
    'settlement_revenue',
      COALESCE(SUM(s.settlement_amount), 0),
    'total_payment_amount',
      COALESCE(SUM(s.payment_amount), 0),
    'total_commission_amount',
      COALESCE(SUM(s.commission_amount), 0)
  )
  INTO v_period_summary_json
  FROM settlements s
  WHERE s.kindergarten_id = v_kindergarten_id
    AND (v_start_date IS NULL OR s.scheduled_date >= v_start_date)
    AND (v_end_date IS NULL OR s.scheduled_date <= v_end_date);

  -- ──────────────────────────────────────────────────────
  -- 7. 총 건수 (기간 필터 적용)
  -- ──────────────────────────────────────────────────────
  SELECT COUNT(*)
  INTO v_total
  FROM settlements s
  WHERE s.kindergarten_id = v_kindergarten_id
    AND (v_start_date IS NULL OR s.scheduled_date >= v_start_date)
    AND (v_end_date IS NULL OR s.scheduled_date <= v_end_date);

  -- ──────────────────────────────────────────────────────
  -- 8. details — 기간 필터 + 페이지네이션
  --    LEFT JOIN internal.members_public_profile (보호자 정보)
  --    ORDER BY scheduled_date DESC
  --    member 주소: address_complex만 (address_building_dong 제외 — 주소 비대칭 정책)
  -- ──────────────────────────────────────────────────────
  SELECT COALESCE(json_agg(row_data ORDER BY row_scheduled_date DESC), '[]'::json)
  INTO v_details_json
  FROM (
    SELECT
      s.scheduled_date AS row_scheduled_date,
      json_build_object(
        'id', s.id,
        'transaction_type', s.transaction_type,
        'payment_amount', s.payment_amount,
        'commission_rate', s.commission_rate,
        'commission_amount', s.commission_amount,
        'settlement_amount', s.settlement_amount,
        'status', s.status,
        'scheduled_date', s.scheduled_date,
        'created_at', s.created_at,
        'reservation_id', s.reservation_id,
        -- 결제 보호자 정보 (internal VIEW — RLS 우회)
        -- [주소 비대칭 정책] 보호자: address_complex만 (개인정보 최소화)
        'member', CASE WHEN mp.id IS NOT NULL THEN
          json_build_object(
            'id', mp.id,
            'nickname', mp.nickname,
            'profile_image', mp.profile_image,
            'address_complex', mp.address_complex
          )
          ELSE NULL
        END
      ) AS row_data
    FROM settlements s
    LEFT JOIN internal.members_public_profile mp ON mp.id = s.member_id
    WHERE s.kindergarten_id = v_kindergarten_id
      AND (v_start_date IS NULL OR s.scheduled_date >= v_start_date)
      AND (v_end_date IS NULL OR s.scheduled_date <= v_end_date)
    ORDER BY s.scheduled_date DESC
    LIMIT v_per_page OFFSET v_offset
  ) sub;

  -- ──────────────────────────────────────────────────────
  -- 9. 성공 응답 조립
  -- ──────────────────────────────────────────────────────
  RETURN json_build_object(
    'success', true,
    'data', json_build_object(
      'summary', v_summary_json,
      'next_settlement', v_next_settlement_json,
      'period_summary', v_period_summary_json,
      'details', v_details_json,
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
GRANT EXECUTE ON FUNCTION public.app_get_settlement_summary(text, text, int, int)
  TO authenticated;

-- anon 역할 명시적 차단
REVOKE EXECUTE ON FUNCTION public.app_get_settlement_summary(text, text, int, int)
  FROM anon;


-- ============================================================
-- 함수 코멘트
-- ============================================================
COMMENT ON FUNCTION public.app_get_settlement_summary(text, text, int, int) IS
  '정산 요약 + 기간별 상세 내역 — 유치원 운영자 전용. '
  '원본: get_settlement.php. '
  'auth.uid() → 본인 유치원 자동 조회. '
  'SECURITY INVOKER: settlements는 보강된 RLS로 직접 통과, '
  'settlement_infos는 본인 데이터 RLS 통과, '
  'members는 internal.members_public_profile VIEW 사용. '
  'summary: 전체 기간 누적 (정산완료/정산예정/정산보류). '
  'next_settlement: 가장 가까운 미래 정산예정 합산 + 계좌정보. '
  'period_summary: 기간 필터 적용 합산 (settlement_revenue/payment/commission). '
  'details: 기간 필터 + 페이지네이션 + 보호자 정보. '
  'scheduled_date 기준 필터 (TODO: completed_date 분기 필요 시 전환). '
  'member 주소: address_complex만 (주소 비대칭 정책).';


-- ============================================================
-- 완료 알림
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE '[44-10] app_get_settlement_summary 함수 생성 완료';
  RAISE NOTICE '  - 인자: p_start_date text, p_end_date text, p_page int, p_per_page int';
  RAISE NOTICE '  - 반환: json {success, data: {summary, next_settlement, period_summary, details, meta}}';
  RAISE NOTICE '  - 유치원 운영자 전용: auth.uid() → kindergartens.member_id 자동 조회';
  RAISE NOTICE '  - 보안: SECURITY INVOKER + internal VIEW 1개 (members_public_profile)';
  RAISE NOTICE '  - summary: 전체 기간 (정산완료/정산예정/정산보류 SUM)';
  RAISE NOTICE '  - next_settlement: 가장 가까운 미래 정산예정 + settlement_infos 계좌';
  RAISE NOTICE '  - period_summary: 기간 필터 합산 (settlement_revenue/payment/commission)';
  RAISE NOTICE '  - details: 기간 + 페이지네이션 + 보호자 정보 (address_complex만)';
  RAISE NOTICE '  - 날짜 기준: scheduled_date (TODO: completed_date 전환 주석 포함)';
  RAISE NOTICE '  - [사전 조건] 43_01 settlements RLS 보강 필요';
  RAISE NOTICE '  ';
  RAISE NOTICE '  [앱 호출 예시]';
  RAISE NOTICE '  const { data } = await supabase.rpc(''app_get_settlement_summary'', {';
  RAISE NOTICE '    p_start_date: ''2026-03-01'',';
  RAISE NOTICE '    p_end_date: ''2026-03-31'',';
  RAISE NOTICE '    p_page: 1,';
  RAISE NOTICE '    p_per_page: 20';
  RAISE NOTICE '  });';
END $$;
