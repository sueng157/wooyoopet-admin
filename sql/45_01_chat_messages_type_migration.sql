-- ============================================================
-- SQL 45-01: chat_messages.message_type 한글 → 영문 마이그레이션
-- ============================================================
-- 실행 방법: Supabase SQL Editor에서 직접 실행 (매니저 확인 후)
-- 목적: chat_messages.message_type을 한글(텍스트/이미지/시스템)에서
--        영문 8종(text, image, file, reservation_request, reservation_confirmed,
--        care_start, care_end, review)으로 전환
-- 주의: 이 스크립트는 되돌릴 수 없습니다 (시스템 레코드 삭제 포함)
-- ============================================================

-- ── Step 1: 기존 CHECK 제약 삭제 ──────────────────────────
-- chat_messages.message_type에 걸린 한글 CHECK 제약 조건 제거
DO $$
DECLARE
  constraint_name text;
BEGIN
  -- message_type 컬럼의 CHECK 제약 조건 이름 조회
  SELECT con.conname INTO constraint_name
  FROM pg_constraint con
  JOIN pg_attribute att ON att.attnum = ANY(con.conkey)
    AND att.attrelid = con.conrelid
  WHERE con.conrelid = 'public.chat_messages'::regclass
    AND att.attname = 'message_type'
    AND con.contype = 'c'
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.chat_messages DROP CONSTRAINT %I', constraint_name);
    RAISE NOTICE 'Step 1: CHECK 제약 [%] 삭제 완료', constraint_name;
  ELSE
    RAISE NOTICE 'Step 1: message_type CHECK 제약 조건 없음 (이미 삭제되었거나 존재하지 않음)';
  END IF;
END $$;

-- ── Step 2: 한글 데이터 → 영문 변환, 시스템 레코드 삭제 ────
DO $$
DECLARE
  updated_text integer;
  updated_image integer;
  deleted_system integer;
BEGIN
  -- '텍스트' → 'text'
  UPDATE chat_messages SET message_type = 'text' WHERE message_type = '텍스트';
  GET DIAGNOSTICS updated_text = ROW_COUNT;

  -- '이미지' → 'image'
  UPDATE chat_messages SET message_type = 'image' WHERE message_type = '이미지';
  GET DIAGNOSTICS updated_image = ROW_COUNT;

  -- '시스템' 레코드 삭제
  -- 시스템 메시지는 새 영문 타입(reservation_request, care_start 등)으로 대체됨
  DELETE FROM chat_messages WHERE message_type = '시스템';
  GET DIAGNOSTICS deleted_system = ROW_COUNT;

  RAISE NOTICE 'Step 2: 변환 완료 — 텍스트→text: %건, 이미지→image: %건, 시스템 삭제: %건',
    updated_text, updated_image, deleted_system;
END $$;

-- ── Step 3: 영문 8종 CHECK 제약 추가 ────────────────────────
ALTER TABLE public.chat_messages
  ADD CONSTRAINT chat_messages_message_type_check
  CHECK (message_type IN (
    'text',                   -- 텍스트 메시지 (사용자 전송)
    'image',                  -- 이미지 메시지 (사용자 전송)
    'file',                   -- 동영상/파일 메시지 (사용자 전송)
    'reservation_request',    -- 예약 요청 시스템 메시지 (create-reservation EF)
    'reservation_confirmed',  -- 예약 확정 시스템 메시지 (create-reservation EF)
    'care_start',             -- 돌봄 시작 시스템 메시지 (scheduler EF)
    'care_end',               -- 돌봄 종료 시스템 메시지 (complete-care EF)
    'review'                  -- 후기 작성 유도 시스템 메시지 (complete-care EF)
  ));

DO $$
BEGIN
  RAISE NOTICE 'Step 3: 영문 8종 CHECK 제약 추가 완료';
END $$;

-- ── Step 4: 검증 ───────────────────────────────────────────
DO $$
DECLARE
  total_count integer;
  type_summary text;
  remaining_korean integer;
BEGIN
  -- 전체 메시지 수
  SELECT COUNT(*) INTO total_count FROM chat_messages;

  -- 타입별 카운트
  SELECT string_agg(message_type || ': ' || cnt::text, ', ' ORDER BY message_type)
  INTO type_summary
  FROM (
    SELECT message_type, COUNT(*) as cnt
    FROM chat_messages
    GROUP BY message_type
  ) sub;

  -- 한글 잔존 확인
  SELECT COUNT(*) INTO remaining_korean
  FROM chat_messages
  WHERE message_type IN ('텍스트', '이미지', '시스템');

  RAISE NOTICE '========================================';
  RAISE NOTICE 'SQL 45-01: chat_messages.message_type 마이그레이션 완료';
  RAISE NOTICE '========================================';
  RAISE NOTICE '전체 메시지 수: %', total_count;
  RAISE NOTICE '타입별 분포: %', COALESCE(type_summary, '(없음)');
  RAISE NOTICE '한글 잔존 데이터: %건 (0이어야 정상)', remaining_korean;
  RAISE NOTICE '========================================';

  IF remaining_korean > 0 THEN
    RAISE WARNING '⚠️ 한글 message_type이 %건 남아 있습니다! 수동 확인 필요', remaining_korean;
  END IF;
END $$;
