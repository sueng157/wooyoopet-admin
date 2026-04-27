-- ============================================================
-- 회원 완전 삭제 RPC 함수
-- 테스트 회원 정리용 — 모든 연관 데이터를 하나의 트랜잭션에서 삭제
-- 하나라도 실패하면 전체 롤백
--
-- 회원이 유치원 운영자인 경우, 해당 유치원과 유치원의 모든 연관 데이터도 함께 삭제
-- ============================================================

CREATE OR REPLACE FUNCTION delete_member_completely(p_member_id UUID)
RETURNS void AS $$
DECLARE
  v_kindergarten_ids UUID[];
  v_chat_room_ids UUID[];
  v_reservation_ids UUID[];
  v_report_ids UUID[];
  v_pet_ids UUID[];
BEGIN
  -- 1. 사전 조회 — 회원 소유 유치원 ID 목록
  SELECT ARRAY_AGG(id) INTO v_kindergarten_ids FROM kindergartens WHERE member_id = p_member_id;

  -- 2. 사전 조회 — 채팅방 ID (보호자로서 + 유치원 운영자로서)
  SELECT ARRAY_AGG(id) INTO v_chat_room_ids FROM chat_rooms
    WHERE guardian_id = p_member_id
       OR (v_kindergarten_ids IS NOT NULL AND kindergarten_id = ANY(v_kindergarten_ids));

  -- 3. 사전 조회 — 예약 ID (보호자로서 + 유치원 운영자로서)
  IF v_kindergarten_ids IS NOT NULL THEN
    SELECT ARRAY_AGG(id) INTO v_reservation_ids FROM reservations
      WHERE member_id = p_member_id OR kindergarten_id = ANY(v_kindergarten_ids);
  ELSE
    SELECT ARRAY_AGG(id) INTO v_reservation_ids FROM reservations WHERE member_id = p_member_id;
  END IF;

  -- 4. 사전 조회 — 신고 ID (채팅방 기반 + 신고자/피신고자 기반)
  SELECT ARRAY_AGG(id) INTO v_report_ids FROM reports
    WHERE (v_chat_room_ids IS NOT NULL AND chat_room_id = ANY(v_chat_room_ids))
       OR reporter_id = p_member_id
       OR reported_id = p_member_id;

  -- 5. 사전 조회 — 반려동물 ID
  SELECT ARRAY_AGG(id) INTO v_pet_ids FROM pets WHERE member_id = p_member_id;

  -- ═══════════════════════════════════════
  -- 간접 연관 테이블 삭제
  -- ═══════════════════════════════════════

  -- 신고 관련
  IF v_report_ids IS NOT NULL THEN
    DELETE FROM report_logs WHERE report_id = ANY(v_report_ids);
    DELETE FROM reports WHERE id = ANY(v_report_ids);
  END IF;

  -- 채팅 관련
  IF v_chat_room_ids IS NOT NULL THEN
    DELETE FROM chat_room_reservations WHERE chat_room_id = ANY(v_chat_room_ids);
    DELETE FROM chat_messages WHERE chat_room_id = ANY(v_chat_room_ids);
    DELETE FROM chat_room_members WHERE chat_room_id = ANY(v_chat_room_ids);
    DELETE FROM chat_rooms WHERE id = ANY(v_chat_room_ids);
  END IF;

  -- 예약 관련
  IF v_reservation_ids IS NOT NULL THEN
    DELETE FROM reservation_status_logs WHERE reservation_id = ANY(v_reservation_ids);
    DELETE FROM noshow_records WHERE reservation_id = ANY(v_reservation_ids);
  END IF;

  -- ═══════════════════════════════════════
  -- 직접 FK 테이블 삭제 (reviews → refunds → settlements → payments → reservations 순서)
  -- ═══════════════════════════════════════

  -- 후기 (reservation_id FK 보유 → reservations보다 먼저 삭제)
  DELETE FROM kindergarten_reviews WHERE member_id = p_member_id;
  DELETE FROM guardian_reviews WHERE member_id = p_member_id;

  -- 유치원 소유 시, 유치원에 달린 후기도 삭제
  IF v_kindergarten_ids IS NOT NULL THEN
    DELETE FROM kindergarten_reviews WHERE kindergarten_id = ANY(v_kindergarten_ids);
    DELETE FROM guardian_reviews WHERE kindergarten_id = ANY(v_kindergarten_ids);
  END IF;

  -- 환불 / 정산 / 결제 / 예약
  DELETE FROM refunds WHERE member_id = p_member_id;
  DELETE FROM settlements WHERE member_id = p_member_id;
  DELETE FROM payments WHERE member_id = p_member_id;
  DELETE FROM reservations WHERE member_id = p_member_id;

  -- 유치원 소유 시, 유치원 기준 거래 데이터도 삭제
  IF v_kindergarten_ids IS NOT NULL THEN
    DELETE FROM refunds WHERE kindergarten_id = ANY(v_kindergarten_ids);
    DELETE FROM settlements WHERE kindergarten_id = ANY(v_kindergarten_ids);
    DELETE FROM payments WHERE kindergarten_id = ANY(v_kindergarten_ids);
    DELETE FROM reservations WHERE kindergarten_id = ANY(v_kindergarten_ids);
  END IF;

  -- ═══════════════════════════════════════
  -- 유치원 관련 (회원이 유치원 운영자인 경우)
  -- ═══════════════════════════════════════
  IF v_kindergarten_ids IS NOT NULL THEN
    DELETE FROM settlement_info_logs WHERE settlement_info_id IN (SELECT id FROM settlement_infos WHERE kindergarten_id = ANY(v_kindergarten_ids));
    DELETE FROM kindergarten_status_logs WHERE kindergarten_id = ANY(v_kindergarten_ids);
    DELETE FROM education_completions WHERE kindergarten_id = ANY(v_kindergarten_ids);
    DELETE FROM kindergarten_resident_pets WHERE kindergarten_id = ANY(v_kindergarten_ids);
    DELETE FROM settlement_infos WHERE kindergarten_id = ANY(v_kindergarten_ids);
    DELETE FROM favorite_kindergartens WHERE kindergarten_id = ANY(v_kindergarten_ids);
    DELETE FROM kindergartens WHERE id = ANY(v_kindergarten_ids);
  END IF;

  -- ═══════════════════════════════════════
  -- 반려동물 관련
  -- ═══════════════════════════════════════
  IF v_pet_ids IS NOT NULL THEN
    DELETE FROM favorite_pets WHERE pet_id = ANY(v_pet_ids);
  END IF;
  DELETE FROM favorite_pets WHERE member_id = p_member_id;
  DELETE FROM pets WHERE member_id = p_member_id;

  -- ═══════════════════════════════════════
  -- 회원 직접 연관 테이블
  -- ═══════════════════════════════════════
  DELETE FROM member_blocks WHERE blocker_id = p_member_id OR blocked_id = p_member_id;
  DELETE FROM member_term_agreements WHERE member_id = p_member_id;
  DELETE FROM member_status_logs WHERE member_id = p_member_id;
  DELETE FROM feedbacks WHERE member_id = p_member_id;
  DELETE FROM noshow_records WHERE member_id = p_member_id;
  DELETE FROM favorite_kindergartens WHERE member_id = p_member_id;
  DELETE FROM fcm_tokens WHERE member_id = p_member_id;
  DELETE FROM notifications WHERE member_id = p_member_id;

  -- ═══════════════════════════════════════
  -- 최종 삭제
  -- ═══════════════════════════════════════
  DELETE FROM members WHERE id = p_member_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
