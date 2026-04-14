-- ============================================================
-- SQL 42-5: members ↔ kindergartens address_doc_urls 동기화 트리거
-- ============================================================
-- 실행 방법: Supabase SQL Editor에 전체 복사하여 실행
-- 목적: members.address_doc_urls 변경 시 해당 회원의
--        kindergartens.address_doc_urls에 자동 동기화
-- 참조: MIGRATION_PLAN.md 섹션 6-2,
--        DB_MAPPING_REFERENCE.md 2-2 (#23 비고)
-- 방향: members → kindergartens 단방향 (역방향 미적용)
--   이유: 앱에서는 항상 members 경유로 주소 인증 서류를 업로드하며,
--         유치원 테이블은 회원 정보를 복사하여 보관하는 구조
-- 패턴: 기존 28_chat_report_trigger.sql 스타일
-- 선행: members, kindergartens 테이블에 address_doc_urls 컬럼 존재 (✅)
-- ============================================================


-- ============================================================
-- 1. 트리거 함수 생성
-- ============================================================

CREATE OR REPLACE FUNCTION public.sync_address_doc_urls_to_kindergartens()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- address_doc_urls가 실제로 변경된 경우에만 동기화
  IF OLD.address_doc_urls IS DISTINCT FROM NEW.address_doc_urls THEN
    UPDATE public.kindergartens
    SET address_doc_urls = NEW.address_doc_urls
    WHERE member_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_address_doc_urls_to_kindergartens()
  IS 'members.address_doc_urls 변경 시 kindergartens에 자동 동기화';


-- ============================================================
-- 2. 기존 트리거 존재 시 삭제
-- ============================================================

DROP TRIGGER IF EXISTS trg_sync_address_doc_urls ON public.members;


-- ============================================================
-- 3. 트리거 생성 (UPDATE만 — INSERT 시점에는 kindergartens 미존재)
-- ============================================================

CREATE TRIGGER trg_sync_address_doc_urls
  AFTER UPDATE OF address_doc_urls ON public.members
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_address_doc_urls_to_kindergartens();


-- ============================================================
-- 4. 기존 데이터 일괄 동기화 (1회성)
-- ============================================================
-- 현재 members.address_doc_urls와 kindergartens.address_doc_urls가
-- 불일치할 수 있으므로, members 기준으로 일괄 보정합니다.

UPDATE public.kindergartens k
SET address_doc_urls = m.address_doc_urls
FROM public.members m
WHERE k.member_id = m.id
  AND k.address_doc_urls IS DISTINCT FROM m.address_doc_urls;


-- ============================================================
-- 완료 알림
-- ============================================================

DO $$
DECLARE
  v_synced bigint;
BEGIN
  -- 방금 동기화된 건수 확인 (참고용)
  GET DIAGNOSTICS v_synced = ROW_COUNT;
  RAISE NOTICE '[42-5] address_doc_urls 동기화 트리거 생성 + 기존 데이터 %건 보정 완료', v_synced;
END $$;
