-- ============================================================
-- SQL 12: Phase 3 대시보드 DB 함수
-- ============================================================
-- 실행 방법: Supabase SQL Editor에 전체 복사하여 실행
-- 목적: 대시보드 4개 섹션(오늘 현황, 승인 대기, 매출 요약, 활동 로그) 데이터 조회
-- ============================================================


-- ============================================================
-- 1. 오늘의 현황 — get_dashboard_today_stats
-- ============================================================
-- 반환: {new_members, new_reservations, checkin_expected, in_progress, today_payments, today_cancel_refund}

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
  -- 1) 오늘 신규 가입 회원 수
  SELECT COUNT(*) INTO v_new_members
  FROM members
  WHERE created_at::date = v_today;

  -- 2) 오늘 신규 예약 건수 (requested_at 기준)
  SELECT COUNT(*) INTO v_new_reservations
  FROM reservations
  WHERE created_at::date = v_today;

  -- 3) 오늘 등원 예정 (체크인 예정일이 오늘, 상태=예약확정)
  SELECT COUNT(*) INTO v_checkin_expected
  FROM reservations
  WHERE checkin_scheduled::date = v_today
    AND status = '예약확정';

  -- 4) 현재 돌봄 진행 중
  SELECT COUNT(*) INTO v_in_progress
  FROM reservations
  WHERE status = '돌봄진행중';

  -- 5) 오늘 결제 총액
  SELECT COALESCE(SUM(amount), 0) INTO v_today_payments
  FROM payments
  WHERE paid_at::date = v_today
    AND status = '결제완료';

  -- 6) 오늘 취소·환불 건수
  SELECT COUNT(*) INTO v_today_cancel_refund
  FROM refunds
  WHERE requested_at::date = v_today;

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
-- 2. 관리자 승인 대기 — get_dashboard_pending_counts
-- ============================================================
-- 반환: {address_pending, settlement_new, settlement_fail, refund_pending,
--         report_pending, settlement_hold, feedback_unconfirmed}

CREATE OR REPLACE FUNCTION public.get_dashboard_pending_counts()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_address_pending bigint;
  v_settlement_new bigint;
  v_settlement_fail bigint;
  v_refund_pending bigint;
  v_report_pending bigint;
  v_settlement_hold bigint;
  v_feedback_unconfirmed bigint;
BEGIN
  -- 1) 주소인증 대기 (회원 + 유치원 합산)
  SELECT COUNT(*) INTO v_address_pending
  FROM members
  WHERE address_auth_status = '심사중';

  -- 2) 정산정보 신규 제출
  SELECT COUNT(*) INTO v_settlement_new
  FROM settlement_infos
  WHERE inicis_status = '미등록'
     OR inicis_status = '요청중';

  -- 3) 정산정보 심사 실패
  SELECT COUNT(*) INTO v_settlement_fail
  FROM settlement_infos
  WHERE inicis_status = '실패';

  -- 4) 환불 대기
  SELECT COUNT(*) INTO v_refund_pending
  FROM refunds
  WHERE status = '환불대기';

  -- 5) 신고 미처리 (접수 + 처리중)
  SELECT COUNT(*) INTO v_report_pending
  FROM reports
  WHERE status IN ('접수', '처리중');

  -- 6) 정산 보류
  SELECT COUNT(*) INTO v_settlement_hold
  FROM settlements
  WHERE status = '정산보류';

  -- 7) 피드백 미확인
  SELECT COUNT(*) INTO v_feedback_unconfirmed
  FROM feedbacks
  WHERE is_confirmed = false;

  RETURN json_build_object(
    'address_pending', v_address_pending,
    'settlement_new', v_settlement_new,
    'settlement_fail', v_settlement_fail,
    'refund_pending', v_refund_pending,
    'report_pending', v_report_pending,
    'settlement_hold', v_settlement_hold,
    'feedback_unconfirmed', v_feedback_unconfirmed
  );
END;
$$;


-- ============================================================
-- 3. 이달 매출 요약 — get_dashboard_monthly_sales
-- ============================================================
-- 반환: {care_payment, penalty_payment, total_valid, platform_fee,
--         kg_settlement, cancel_refund, prev_month_fee, change_rate}

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

  -- 1) 이번 달 돌봄 결제금액 (취소 제외, 결제완료 상태)
  SELECT COALESCE(SUM(amount), 0) INTO v_care_payment
  FROM payments
  WHERE paid_at >= v_month_start
    AND status = '결제완료';

  -- 2) 이번 달 위약금 결제금액
  SELECT COALESCE(SUM(penalty_amount), 0) INTO v_penalty_payment
  FROM refunds
  WHERE requested_at >= v_month_start
    AND penalty_amount > 0;

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

  -- 7) 전월 플랫폼 수수료 수입
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
-- 4. 최근 활동 로그 — get_dashboard_recent_activity
-- ============================================================
-- DB Function 방식: 여러 테이블에서 최근 이벤트를 UNION ALL로 조합
-- 반환: [{event_at, event_type, summary, link_page, link_id}] (최신 5건)

CREATE OR REPLACE FUNCTION public.get_dashboard_recent_activity()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_result json;
BEGIN
  SELECT json_agg(t) INTO v_result
  FROM (
    SELECT event_at, event_type, summary, link_page, link_id
    FROM (
      -- 신규가입
      (SELECT
        created_at AS event_at,
        '신규가입'::text AS event_type,
        name || '님이 ' || current_mode || ' 모드로 회원가입했습니다' AS summary,
        'member-detail.html'::text AS link_page,
        id::text AS link_id
      FROM members
      ORDER BY created_at DESC
      LIMIT 3)

      UNION ALL

      -- 예약접수
      (SELECT
        r.created_at AS event_at,
        '예약접수'::text AS event_type,
        m.name || '님이 ' || k.name || '에 돌봄 예약을 신청했습니다' AS summary,
        'reservation-detail.html'::text AS link_page,
        r.id::text AS link_id
      FROM reservations r
      JOIN members m ON m.id = r.member_id
      JOIN kindergartens k ON k.id = r.kindergarten_id
      ORDER BY r.created_at DESC
      LIMIT 3)

      UNION ALL

      -- 결제완료
      (SELECT
        p.paid_at AS event_at,
        '결제완료'::text AS event_type,
        m.name || '님의 결제 ' || p.amount || '원이 완료되었습니다' AS summary,
        'payment-detail.html'::text AS link_page,
        p.id::text AS link_id
      FROM payments p
      JOIN members m ON m.id = p.member_id
      WHERE p.status = '결제완료'
      ORDER BY p.paid_at DESC
      LIMIT 3)

      UNION ALL

      -- 취소요청
      (SELECT
        rf.requested_at AS event_at,
        '취소요청'::text AS event_type,
        m.name || '님이 환불을 요청했습니다 (' || rf.refund_amount || '원)' AS summary,
        'refund-detail.html'::text AS link_page,
        rf.id::text AS link_id
      FROM refunds rf
      JOIN members m ON m.id = rf.member_id
      ORDER BY rf.requested_at DESC
      LIMIT 2)

      UNION ALL

      -- 신고접수
      (SELECT
        rp.reported_at AS event_at,
        '신고접수'::text AS event_type,
        '채팅방에서 ' || rp.reason_category || ' 신고가 접수되었습니다' AS summary,
        'report-detail.html'::text AS link_page,
        rp.id::text AS link_id
      FROM reports rp
      ORDER BY rp.reported_at DESC
      LIMIT 2)
    ) combined
    ORDER BY event_at DESC
    LIMIT 5
  ) t;

  RETURN COALESCE(v_result, '[]'::json);
END;
$$;


-- ============================================================
-- 5. RLS 정책 — 나머지 테이블 admin 조회 허용
-- ============================================================
-- Phase 3에서 admin이 모든 데이터 테이블을 읽을 수 있도록 RLS 정책 추가
-- (admin_accounts, admin_login_logs는 Phase 2에서 설정 완료)

-- members
DROP POLICY IF EXISTS "members_select_admin" ON members;
DROP POLICY IF EXISTS "members_update_admin" ON members;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members_select_admin" ON members FOR SELECT USING (public.is_admin());
CREATE POLICY "members_update_admin" ON members FOR UPDATE USING (public.is_admin());

-- kindergartens
DROP POLICY IF EXISTS "kindergartens_select_admin" ON kindergartens;
DROP POLICY IF EXISTS "kindergartens_update_admin" ON kindergartens;
ALTER TABLE kindergartens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kindergartens_select_admin" ON kindergartens FOR SELECT USING (public.is_admin());
CREATE POLICY "kindergartens_update_admin" ON kindergartens FOR UPDATE USING (public.is_admin());

-- pets
DROP POLICY IF EXISTS "pets_select_admin" ON pets;
ALTER TABLE pets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pets_select_admin" ON pets FOR SELECT USING (public.is_admin());

-- kindergarten_resident_pets
DROP POLICY IF EXISTS "kindergarten_resident_pets_select_admin" ON kindergarten_resident_pets;
ALTER TABLE kindergarten_resident_pets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kindergarten_resident_pets_select_admin" ON kindergarten_resident_pets FOR SELECT USING (public.is_admin());

-- reservations
DROP POLICY IF EXISTS "reservations_select_admin" ON reservations;
DROP POLICY IF EXISTS "reservations_update_admin" ON reservations;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reservations_select_admin" ON reservations FOR SELECT USING (public.is_admin());
CREATE POLICY "reservations_update_admin" ON reservations FOR UPDATE USING (public.is_admin());

-- payments
DROP POLICY IF EXISTS "payments_select_admin" ON payments;
DROP POLICY IF EXISTS "payments_update_admin" ON payments;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payments_select_admin" ON payments FOR SELECT USING (public.is_admin());
CREATE POLICY "payments_update_admin" ON payments FOR UPDATE USING (public.is_admin());

-- refunds
DROP POLICY IF EXISTS "refunds_select_admin" ON refunds;
DROP POLICY IF EXISTS "refunds_update_admin" ON refunds;
ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "refunds_select_admin" ON refunds FOR SELECT USING (public.is_admin());
CREATE POLICY "refunds_update_admin" ON refunds FOR UPDATE USING (public.is_admin());

-- settlement_infos
DROP POLICY IF EXISTS "settlement_infos_select_admin" ON settlement_infos;
DROP POLICY IF EXISTS "settlement_infos_update_admin" ON settlement_infos;
ALTER TABLE settlement_infos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settlement_infos_select_admin" ON settlement_infos FOR SELECT USING (public.is_admin());
CREATE POLICY "settlement_infos_update_admin" ON settlement_infos FOR UPDATE USING (public.is_admin());

-- settlements
DROP POLICY IF EXISTS "settlements_select_admin" ON settlements;
DROP POLICY IF EXISTS "settlements_update_admin" ON settlements;
ALTER TABLE settlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settlements_select_admin" ON settlements FOR SELECT USING (public.is_admin());
CREATE POLICY "settlements_update_admin" ON settlements FOR UPDATE USING (public.is_admin());

-- chat_rooms
DROP POLICY IF EXISTS "chat_rooms_select_admin" ON chat_rooms;
DROP POLICY IF EXISTS "chat_rooms_update_admin" ON chat_rooms;
ALTER TABLE chat_rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chat_rooms_select_admin" ON chat_rooms FOR SELECT USING (public.is_admin());
CREATE POLICY "chat_rooms_update_admin" ON chat_rooms FOR UPDATE USING (public.is_admin());

-- chat_room_reservations
DROP POLICY IF EXISTS "chat_room_reservations_select_admin" ON chat_room_reservations;
ALTER TABLE chat_room_reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chat_room_reservations_select_admin" ON chat_room_reservations FOR SELECT USING (public.is_admin());

-- chat_messages
DROP POLICY IF EXISTS "chat_messages_select_admin" ON chat_messages;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chat_messages_select_admin" ON chat_messages FOR SELECT USING (public.is_admin());

-- guardian_reviews
DROP POLICY IF EXISTS "guardian_reviews_select_admin" ON guardian_reviews;
DROP POLICY IF EXISTS "guardian_reviews_update_admin" ON guardian_reviews;
ALTER TABLE guardian_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "guardian_reviews_select_admin" ON guardian_reviews FOR SELECT USING (public.is_admin());
CREATE POLICY "guardian_reviews_update_admin" ON guardian_reviews FOR UPDATE USING (public.is_admin());

-- kindergarten_reviews
DROP POLICY IF EXISTS "kindergarten_reviews_select_admin" ON kindergarten_reviews;
DROP POLICY IF EXISTS "kindergarten_reviews_update_admin" ON kindergarten_reviews;
ALTER TABLE kindergarten_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kindergarten_reviews_select_admin" ON kindergarten_reviews FOR SELECT USING (public.is_admin());
CREATE POLICY "kindergarten_reviews_update_admin" ON kindergarten_reviews FOR UPDATE USING (public.is_admin());

-- reports
DROP POLICY IF EXISTS "reports_select_admin" ON reports;
DROP POLICY IF EXISTS "reports_update_admin" ON reports;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reports_select_admin" ON reports FOR SELECT USING (public.is_admin());
CREATE POLICY "reports_update_admin" ON reports FOR UPDATE USING (public.is_admin());

-- report_logs
DROP POLICY IF EXISTS "report_logs_select_admin" ON report_logs;
DROP POLICY IF EXISTS "report_logs_insert_admin" ON report_logs;
ALTER TABLE report_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "report_logs_select_admin" ON report_logs FOR SELECT USING (public.is_admin());
CREATE POLICY "report_logs_insert_admin" ON report_logs FOR INSERT WITH CHECK (public.is_admin());

-- education_topics
DROP POLICY IF EXISTS "education_topics_select_admin" ON education_topics;
DROP POLICY IF EXISTS "education_topics_all_admin" ON education_topics;
ALTER TABLE education_topics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "education_topics_select_admin" ON education_topics FOR SELECT USING (public.is_admin());
CREATE POLICY "education_topics_all_admin" ON education_topics FOR ALL USING (public.is_admin());

-- education_quizzes
DROP POLICY IF EXISTS "education_quizzes_select_admin" ON education_quizzes;
DROP POLICY IF EXISTS "education_quizzes_all_admin" ON education_quizzes;
ALTER TABLE education_quizzes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "education_quizzes_select_admin" ON education_quizzes FOR SELECT USING (public.is_admin());
CREATE POLICY "education_quizzes_all_admin" ON education_quizzes FOR ALL USING (public.is_admin());

-- education_completions
DROP POLICY IF EXISTS "education_completions_select_admin" ON education_completions;
DROP POLICY IF EXISTS "education_completions_update_admin" ON education_completions;
ALTER TABLE education_completions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "education_completions_select_admin" ON education_completions FOR SELECT USING (public.is_admin());
CREATE POLICY "education_completions_update_admin" ON education_completions FOR UPDATE USING (public.is_admin());

-- checklists
DROP POLICY IF EXISTS "checklists_select_admin" ON checklists;
DROP POLICY IF EXISTS "checklists_all_admin" ON checklists;
ALTER TABLE checklists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "checklists_select_admin" ON checklists FOR SELECT USING (public.is_admin());
CREATE POLICY "checklists_all_admin" ON checklists FOR ALL USING (public.is_admin());

-- checklist_items
DROP POLICY IF EXISTS "checklist_items_select_admin" ON checklist_items;
DROP POLICY IF EXISTS "checklist_items_all_admin" ON checklist_items;
ALTER TABLE checklist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "checklist_items_select_admin" ON checklist_items FOR SELECT USING (public.is_admin());
CREATE POLICY "checklist_items_all_admin" ON checklist_items FOR ALL USING (public.is_admin());

-- pledges
DROP POLICY IF EXISTS "pledges_select_admin" ON pledges;
DROP POLICY IF EXISTS "pledges_all_admin" ON pledges;
ALTER TABLE pledges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pledges_select_admin" ON pledges FOR SELECT USING (public.is_admin());
CREATE POLICY "pledges_all_admin" ON pledges FOR ALL USING (public.is_admin());

-- pledge_items
DROP POLICY IF EXISTS "pledge_items_select_admin" ON pledge_items;
DROP POLICY IF EXISTS "pledge_items_all_admin" ON pledge_items;
ALTER TABLE pledge_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pledge_items_select_admin" ON pledge_items FOR SELECT USING (public.is_admin());
CREATE POLICY "pledge_items_all_admin" ON pledge_items FOR ALL USING (public.is_admin());

-- banners
DROP POLICY IF EXISTS "banners_select_admin" ON banners;
DROP POLICY IF EXISTS "banners_all_admin" ON banners;
ALTER TABLE banners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "banners_select_admin" ON banners FOR SELECT USING (public.is_admin());
CREATE POLICY "banners_all_admin" ON banners FOR ALL USING (public.is_admin());

-- notices
DROP POLICY IF EXISTS "notices_select_admin" ON notices;
DROP POLICY IF EXISTS "notices_all_admin" ON notices;
ALTER TABLE notices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notices_select_admin" ON notices FOR SELECT USING (public.is_admin());
CREATE POLICY "notices_all_admin" ON notices FOR ALL USING (public.is_admin());

-- faqs
DROP POLICY IF EXISTS "faqs_select_admin" ON faqs;
DROP POLICY IF EXISTS "faqs_all_admin" ON faqs;
ALTER TABLE faqs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "faqs_select_admin" ON faqs FOR SELECT USING (public.is_admin());
CREATE POLICY "faqs_all_admin" ON faqs FOR ALL USING (public.is_admin());

-- terms
DROP POLICY IF EXISTS "terms_select_admin" ON terms;
DROP POLICY IF EXISTS "terms_all_admin" ON terms;
ALTER TABLE terms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "terms_select_admin" ON terms FOR SELECT USING (public.is_admin());
CREATE POLICY "terms_all_admin" ON terms FOR ALL USING (public.is_admin());

-- term_versions
DROP POLICY IF EXISTS "term_versions_select_admin" ON term_versions;
DROP POLICY IF EXISTS "term_versions_all_admin" ON term_versions;
ALTER TABLE term_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "term_versions_select_admin" ON term_versions FOR SELECT USING (public.is_admin());
CREATE POLICY "term_versions_all_admin" ON term_versions FOR ALL USING (public.is_admin());

-- member_term_agreements
DROP POLICY IF EXISTS "member_term_agreements_select_admin" ON member_term_agreements;
ALTER TABLE member_term_agreements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "member_term_agreements_select_admin" ON member_term_agreements FOR SELECT USING (public.is_admin());

-- feedbacks
DROP POLICY IF EXISTS "feedbacks_select_admin" ON feedbacks;
DROP POLICY IF EXISTS "feedbacks_update_admin" ON feedbacks;
ALTER TABLE feedbacks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "feedbacks_select_admin" ON feedbacks FOR SELECT USING (public.is_admin());
CREATE POLICY "feedbacks_update_admin" ON feedbacks FOR UPDATE USING (public.is_admin());

-- audit_logs
DROP POLICY IF EXISTS "audit_logs_select_admin" ON audit_logs;
DROP POLICY IF EXISTS "audit_logs_insert_admin" ON audit_logs;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_logs_select_admin" ON audit_logs FOR SELECT USING (public.is_admin());
CREATE POLICY "audit_logs_insert_admin" ON audit_logs FOR INSERT WITH CHECK (public.is_admin());

-- noshow_records
DROP POLICY IF EXISTS "noshow_records_select_admin" ON noshow_records;
DROP POLICY IF EXISTS "noshow_records_update_admin" ON noshow_records;
ALTER TABLE noshow_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "noshow_records_select_admin" ON noshow_records FOR SELECT USING (public.is_admin());
CREATE POLICY "noshow_records_update_admin" ON noshow_records FOR UPDATE USING (public.is_admin());

-- member_blocks
DROP POLICY IF EXISTS "member_blocks_select_admin" ON member_blocks;
ALTER TABLE member_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "member_blocks_select_admin" ON member_blocks FOR SELECT USING (public.is_admin());

-- member_status_logs
DROP POLICY IF EXISTS "member_status_logs_select_admin" ON member_status_logs;
DROP POLICY IF EXISTS "member_status_logs_insert_admin" ON member_status_logs;
ALTER TABLE member_status_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "member_status_logs_select_admin" ON member_status_logs FOR SELECT USING (public.is_admin());
CREATE POLICY "member_status_logs_insert_admin" ON member_status_logs FOR INSERT WITH CHECK (public.is_admin());

-- reservation_status_logs
DROP POLICY IF EXISTS "reservation_status_logs_select_admin" ON reservation_status_logs;
DROP POLICY IF EXISTS "reservation_status_logs_insert_admin" ON reservation_status_logs;
ALTER TABLE reservation_status_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reservation_status_logs_select_admin" ON reservation_status_logs FOR SELECT USING (public.is_admin());
CREATE POLICY "reservation_status_logs_insert_admin" ON reservation_status_logs FOR INSERT WITH CHECK (public.is_admin());

-- settlement_info_logs
DROP POLICY IF EXISTS "settlement_info_logs_select_admin" ON settlement_info_logs;
DROP POLICY IF EXISTS "settlement_info_logs_insert_admin" ON settlement_info_logs;
ALTER TABLE settlement_info_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settlement_info_logs_select_admin" ON settlement_info_logs FOR SELECT USING (public.is_admin());
CREATE POLICY "settlement_info_logs_insert_admin" ON settlement_info_logs FOR INSERT WITH CHECK (public.is_admin());

-- kindergarten_status_logs
DROP POLICY IF EXISTS "kindergarten_status_logs_select_admin" ON kindergarten_status_logs;
DROP POLICY IF EXISTS "kindergarten_status_logs_insert_admin" ON kindergarten_status_logs;
ALTER TABLE kindergarten_status_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kindergarten_status_logs_select_admin" ON kindergarten_status_logs FOR SELECT USING (public.is_admin());
CREATE POLICY "kindergarten_status_logs_insert_admin" ON kindergarten_status_logs FOR INSERT WITH CHECK (public.is_admin());

-- setting_change_logs
DROP POLICY IF EXISTS "setting_change_logs_select_admin" ON setting_change_logs;
DROP POLICY IF EXISTS "setting_change_logs_insert_admin" ON setting_change_logs;
ALTER TABLE setting_change_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "setting_change_logs_select_admin" ON setting_change_logs FOR SELECT USING (public.is_admin());
CREATE POLICY "setting_change_logs_insert_admin" ON setting_change_logs FOR INSERT WITH CHECK (public.is_admin());


-- ============================================================
-- 5. 정산 요약 함수
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_settlement_summary()
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'care_payment',      COALESCE(SUM(CASE WHEN p.payment_type = '돌봄' AND p.payment_status = '결제완료' THEN p.amount ELSE 0 END), 0),
    'penalty_payment',   COALESCE(SUM(CASE WHEN p.payment_type = '위약금' AND p.payment_status = '결제완료' THEN p.amount ELSE 0 END), 0),
    'total_valid',       COALESCE(SUM(CASE WHEN p.payment_status = '결제완료' THEN p.amount ELSE 0 END), 0),
    'platform_fee',      COALESCE(SUM(CASE WHEN p.payment_status = '결제완료' THEN p.amount * 0.2 ELSE 0 END), 0),
    'kg_settlement',     COALESCE(SUM(CASE WHEN p.payment_status = '결제완료' THEN p.amount * 0.8 ELSE 0 END), 0),
    'pending_count',     (SELECT COUNT(*) FROM settlements WHERE settlement_status = '정산예정'),
    'pending_amount',    (SELECT COALESCE(SUM(settlement_amount), 0) FROM settlements WHERE settlement_status = '정산예정'),
    'completed_count',   (SELECT COUNT(*) FROM settlements WHERE settlement_status = '정산완료'),
    'completed_amount',  (SELECT COALESCE(SUM(settlement_amount), 0) FROM settlements WHERE settlement_status = '정산완료')
  ) INTO result
  FROM payments p;

  RETURN result;
END;
$$;


-- ============================================================
-- 완료 메시지
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================';
  RAISE NOTICE '  Phase 3 DB 함수 및 RLS 정책 설정 완료!';
  RAISE NOTICE '============================================';
  RAISE NOTICE '  DB 함수:';
  RAISE NOTICE '    get_dashboard_today_stats()    - 오늘의 현황 6개 카드';
  RAISE NOTICE '    get_dashboard_pending_counts() - 관리자 승인 대기 7개 항목';
  RAISE NOTICE '    get_dashboard_monthly_sales()  - 이달 매출 요약 8개 항목';
  RAISE NOTICE '    get_dashboard_recent_activity() - 최근 활동 로그 5건';
  RAISE NOTICE '  ';
  RAISE NOTICE '  RLS 정책:';
  RAISE NOTICE '    모든 데이터 테이블에 admin SELECT/UPDATE 정책 추가';
  RAISE NOTICE '    로그 테이블에 admin INSERT 정책 추가';
  RAISE NOTICE '    콘텐츠 관리 테이블에 admin ALL 정책 추가';
  RAISE NOTICE '============================================';
END $$;
