-- ============================================================
-- SQL 51-01: chat_messages.message_type CHECK 제약 수정
-- ============================================================
-- 실행 방법: Supabase SQL Editor에서 직접 실행
-- 목적:
--   1. 사용하지 않는 타입 3개 제거: payment_request, payment_approval, payment_cancel
--   2. 동영상 전용 타입 추가: video
--   3. 예약거절/취소 타입 유지: reservation_rejected, reservation_cancelled
-- 배경:
--   - payment_* 3종은 옛 예약 로직 잔재로 실제 사용되지 않음 (DB 데이터 0건)
--   - 앱에서 동영상 업로드 시 message_type='video'로 전송하도록 변경됨
--   - 기존 'file' 타입은 일반 파일 첨부용으로 유지
-- 주의: 실행 전 payment_* 데이터가 없는지 사전 검증 쿼리를 먼저 실행하세요
-- ============================================================

-- ── 사전 검증: 삭제 대상 타입에 데이터가 없는지 확인 ────────
-- 아래 쿼리 결과가 0이어야 안전하게 실행 가능
-- SELECT COUNT(*) FROM chat_messages
-- WHERE message_type IN ('payment_request', 'payment_approval', 'payment_cancel');

-- ── Step 1: 기존 CHECK 제약 삭제 ──────────────────────────
ALTER TABLE public.chat_messages
  DROP CONSTRAINT IF EXISTS chat_messages_message_type_check;

-- ── Step 2: 새 CHECK 제약 추가 ────────────────────────────
ALTER TABLE public.chat_messages
  ADD CONSTRAINT chat_messages_message_type_check
  CHECK (message_type = ANY (ARRAY[
    'text'::text,                    -- 텍스트 메시지 (사용자 전송)
    'image'::text,                   -- 이미지 메시지 (사용자 전송)
    'video'::text,                   -- 동영상 메시지 (사용자 전송) ★ 신규
    'file'::text,                    -- 파일 첨부 메시지 (사용자 전송)
    'send_pet'::text,                -- 반려동물 정보 공유 (사용자 전송)
    'reservation_request'::text,     -- 돌봄 요청 시스템 메시지 (create-reservation EF)
    'reservation_confirmed'::text,   -- 돌봄 확정 시스템 메시지 (create-reservation EF)
    'reservation_rejected'::text,    -- 돌봄 거절 시스템 메시지 (create-reservation EF)
    'reservation_cancelled'::text,   -- 돌봄 취소 시스템 메시지 (create-reservation EF)
    'care_start'::text,              -- 돌봄 시작 시스템 메시지 (scheduler EF)
    'care_end'::text,                -- 돌봄 종료 시스템 메시지 (complete-care EF)
    'review'::text                   -- 후기 작성 유도 시스템 메시지 (complete-care EF)
  ]));

-- ── Step 3: 검증 ──────────────────────────────────────────
DO $$
DECLARE
  v_constraint text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_constraint
  FROM pg_constraint
  WHERE conrelid = 'public.chat_messages'::regclass
    AND conname = 'chat_messages_message_type_check';

  RAISE NOTICE '========================================';
  RAISE NOTICE 'SQL 51-01: message_type CHECK 제약 수정 완료';
  RAISE NOTICE '========================================';
  RAISE NOTICE '새 제약: %', v_constraint;
  RAISE NOTICE '변경사항:';
  RAISE NOTICE '  + video (동영상 전용 타입 추가)';
  RAISE NOTICE '  - payment_request (미사용, 제거)';
  RAISE NOTICE '  - payment_approval (미사용, 제거)';
  RAISE NOTICE '  - payment_cancel (미사용, 제거)';
  RAISE NOTICE '========================================';
END $$;
