-- ============================================
-- 48_07: 주소인증 양방향 트리거 동기화
-- 일시: 2026-04-24
-- 설명:
--   1. 기존 트리거 함수 수정: address_doc_urls 외에 address_auth_status, address_auth_date도
--      members → kindergartens 동기화 추가
--   2. 역방향 트리거 신규 생성: kindergartens → members 동기화
--      (address_doc_urls, address_auth_status, address_auth_date)
--
-- 동작:
--   - 보호자모드에서 members.address_doc_urls UPDATE → kindergartens 자동 동기화
--   - 유치원모드에서 kindergartens.address_doc_urls UPDATE → members 자동 동기화
--   - 관리자가 회원관리에서 승인 (members.address_auth_status UPDATE) → kindergartens 자동 동기화
--   - 관리자가 유치원관리에서 승인 (kindergartens.address_auth_status UPDATE) → members 자동 동기화
--
-- 무한루프 방지: IS DISTINCT FROM 조건으로 값이 실제로 변경된 경우에만 동작
--   members 변경 → kindergartens UPDATE → 역방향 트리거 발동
--   → 하지만 값이 이미 같으므로 IS DISTINCT FROM = false → UPDATE 안 함 → 멈춤
--
-- 참고: 기존 트리거 trg_sync_address_doc_urls (42_05에서 생성)
-- ============================================


-- ============================================
-- 1. 기존 트리거 함수 수정 (members → kindergartens)
--    address_auth_status, address_auth_date 동기화 추가
-- ============================================

CREATE OR REPLACE FUNCTION public.sync_address_doc_urls_to_kindergartens()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- address_doc_urls 동기화 (기존)
  IF OLD.address_doc_urls IS DISTINCT FROM NEW.address_doc_urls THEN
    UPDATE public.kindergartens
    SET address_doc_urls = NEW.address_doc_urls
    WHERE member_id = NEW.id;
  END IF;

  -- address_auth_status 동기화 (추가)
  IF OLD.address_auth_status IS DISTINCT FROM NEW.address_auth_status THEN
    UPDATE public.kindergartens
    SET address_auth_status = NEW.address_auth_status,
        address_auth_date = NEW.address_auth_date
    WHERE member_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$function$;


-- ============================================
-- 2. 역방향 트리거 함수 생성 (kindergartens → members)
-- ============================================

CREATE OR REPLACE FUNCTION public.sync_address_status_to_members()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF OLD.address_auth_status IS DISTINCT FROM NEW.address_auth_status THEN
    UPDATE public.members
    SET address_auth_status = NEW.address_auth_status,
        address_auth_date = NEW.address_auth_date
    WHERE id = NEW.member_id;
  END IF;

  IF OLD.address_doc_urls IS DISTINCT FROM NEW.address_doc_urls THEN
    UPDATE public.members
    SET address_doc_urls = NEW.address_doc_urls
    WHERE id = NEW.member_id;
  END IF;

  RETURN NEW;
END;
$function$;


-- ============================================
-- 3. 역방향 트리거 연결
-- ============================================

CREATE TRIGGER trg_sync_address_to_members
  AFTER UPDATE ON public.kindergartens
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_address_status_to_members();
