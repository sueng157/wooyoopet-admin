-- ============================================================
-- SQL 52-01: chat_messages INSERT 후 chat_rooms 자동 갱신 트리거
-- ============================================================
-- 실행 방법: Supabase SQL Editor에서 직접 실행
-- 목적:
--   1. chat_rooms.last_message — 메시지 타입별 미리보기 텍스트 설정
--   2. chat_rooms.last_message_at — 메시지 생성 시각으로 갱신
--   3. chat_rooms.total_message_count — 1 증가
-- 배경:
--   - 앱에서 직접 INSERT하는 방식을 사용 중이며 chat_rooms 갱신이 누락됨
--   - 앱의 updateChatRoomLastMessage()는 total_message_count 미처리 + RLS 차단 가능
--   - SECURITY DEFINER로 RLS와 무관하게 확실히 갱신
-- 적용 후:
--   - useChat.ts에서 updateChatRoomLastMessage() 호출 제거 필요
-- 주의:
--   - CASE 분기는 sql/51_01 CHECK 제약 영문 12종과 1:1 대응
--   - payment_* 3종은 제거 완료 (sql/51_01 참조)
-- ============================================================

-- ── 트리거 함수 ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_update_chat_room_last_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_display_content text;
BEGIN
  -- DB CHECK 제약 영문 12종에 맞춘 미리보기 텍스트
  CASE NEW.message_type
    WHEN 'image'                  THEN v_display_content := '[이미지]';
    WHEN 'video'                  THEN v_display_content := '[동영상]';
    WHEN 'file'                   THEN v_display_content := '[파일]';
    WHEN 'send_pet'               THEN v_display_content := '[반려동물 정보]';
    WHEN 'reservation_request'    THEN v_display_content := '[돌봄 요청]';
    WHEN 'reservation_confirmed'  THEN v_display_content := '[돌봄 확정]';
    WHEN 'reservation_rejected'   THEN v_display_content := '[돌봄 거절]';
    WHEN 'reservation_cancelled'  THEN v_display_content := '[돌봄 취소]';
    WHEN 'care_start'             THEN v_display_content := '[돌봄 시작]';
    WHEN 'care_end'               THEN v_display_content := '[돌봄 종료]';
    WHEN 'review'                 THEN v_display_content := '[후기]';
    ELSE                               v_display_content := COALESCE(LEFT(NEW.content, 100), '');
  END CASE;

  UPDATE chat_rooms
  SET last_message        = v_display_content,
      last_message_at     = COALESCE(NEW.created_at, now()),
      total_message_count = COALESCE(total_message_count, 0) + 1
  WHERE id = NEW.chat_room_id;

  RETURN NEW;
END;
$$;

-- ── 트리거 생성 (기존 동명 트리거 있으면 교체) ───────────────
DROP TRIGGER IF EXISTS trg_chat_room_last_message ON chat_messages;

CREATE TRIGGER trg_chat_room_last_message
  AFTER INSERT ON chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_update_chat_room_last_message();

-- ── 검증 ─────────────────────────────────────────────────────
DO $$
DECLARE
  v_func_exists boolean;
  v_trigger_exists boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM pg_proc WHERE proname = 'fn_update_chat_room_last_message'
  ) INTO v_func_exists;

  SELECT EXISTS(
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_chat_room_last_message'
  ) INTO v_trigger_exists;

  RAISE NOTICE '========================================';
  RAISE NOTICE 'SQL 52-01: chat_room_last_message 트리거 적용 완료';
  RAISE NOTICE '========================================';
  RAISE NOTICE '함수 생성: %', v_func_exists;
  RAISE NOTICE '트리거 생성: %', v_trigger_exists;
  RAISE NOTICE '처리 항목:';
  RAISE NOTICE '  - last_message: 메시지 타입별 미리보기 텍스트';
  RAISE NOTICE '  - last_message_at: 메시지 생성 시각';
  RAISE NOTICE '  - total_message_count: +1 증가';
  RAISE NOTICE '========================================';
  RAISE NOTICE '⚠️ 앱 코드에서 updateChatRoomLastMessage() 제거 필요';
  RAISE NOTICE '========================================';
END $$;
