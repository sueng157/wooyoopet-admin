-- ============================================================
-- 유치원 완전 삭제 RPC 함수
-- 테스트 유치원 정리용 — 모든 연관 데이터를 하나의 트랜잭션에서 삭제
-- 하나라도 실패하면 전체 롤백
-- ============================================================

CREATE OR REPLACE FUNCTION delete_kindergarten_completely(p_kg_id UUID)
RETURNS void AS $$
DECLARE
  v_chat_room_ids UUID[];
  v_reservation_ids UUID[];
  v_report_ids UUID[];
BEGIN
  -- 1. 간접 연관 ID 사전 조회
  SELECT ARRAY_AGG(id) INTO v_chat_room_ids FROM chat_rooms WHERE kindergarten_id = p_kg_id;
  SELECT ARRAY_AGG(id) INTO v_reservation_ids FROM reservations WHERE kindergarten_id = p_kg_id;

  IF v_chat_room_ids IS NOT NULL THEN
    SELECT ARRAY_AGG(id) INTO v_report_ids FROM reports WHERE chat_room_id = ANY(v_chat_room_ids);
  END IF;

  -- 2. 간접 연관 테이블 삭제 (조회한 ID 기반)
  IF v_report_ids IS NOT NULL THEN
    DELETE FROM report_logs WHERE report_id = ANY(v_report_ids);
    DELETE FROM reports WHERE id = ANY(v_report_ids);
  END IF;

  IF v_chat_room_ids IS NOT NULL THEN
    DELETE FROM chat_room_reservations WHERE chat_room_id = ANY(v_chat_room_ids);
    DELETE FROM chat_messages WHERE chat_room_id = ANY(v_chat_room_ids);
  END IF;

  IF v_reservation_ids IS NOT NULL THEN
    DELETE FROM reservation_status_logs WHERE reservation_id = ANY(v_reservation_ids);
    DELETE FROM noshow_records WHERE reservation_id = ANY(v_reservation_ids);
  END IF;

  -- 3. 직접 FK 테이블 삭제 (reservation_id FK를 가진 테이블을 reservations보다 먼저 삭제)
  DELETE FROM settlement_info_logs WHERE settlement_info_id IN (SELECT id FROM settlement_infos WHERE kindergarten_id = p_kg_id);
  DELETE FROM kindergarten_status_logs WHERE kindergarten_id = p_kg_id;
  DELETE FROM chat_rooms WHERE kindergarten_id = p_kg_id;
  DELETE FROM kindergarten_reviews WHERE kindergarten_id = p_kg_id;
  DELETE FROM guardian_reviews WHERE kindergarten_id = p_kg_id;
  DELETE FROM refunds WHERE kindergarten_id = p_kg_id;
  DELETE FROM settlements WHERE kindergarten_id = p_kg_id;
  DELETE FROM payments WHERE kindergarten_id = p_kg_id;
  DELETE FROM reservations WHERE kindergarten_id = p_kg_id;
  DELETE FROM education_completions WHERE kindergarten_id = p_kg_id;
  DELETE FROM kindergarten_resident_pets WHERE kindergarten_id = p_kg_id;
  DELETE FROM settlement_infos WHERE kindergarten_id = p_kg_id;
  DELETE FROM favorite_kindergartens WHERE kindergarten_id = p_kg_id;

  -- 4. 최종 삭제
  DELETE FROM kindergartens WHERE id = p_kg_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
