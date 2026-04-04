-- ============================================================
-- SQL 31: 신고접수 상세 — DB 마이그레이션
-- ============================================================
-- 실행 방법: Supabase SQL Editor에 전체 복사하여 실행
-- 목적:
--   1. reports.processed_by: text → uuid (FK → admin_accounts.id)
--   2. report_logs.processed_by: text → uuid (FK → admin_accounts.id)
--   3. report_logs.sanction_type: 신규 컬럼 추가 (nullable text)
--   4. search_reports RPC 재생성 (admin_accounts JOIN 추가)
-- 의존: admin_accounts 테이블, public.is_admin() 함수
-- 참고: HANDOVER 5-14 (FK 조인 가이드)
-- ============================================================

-- ============================================================
-- STEP 1: reports.processed_by — text → uuid FK
-- ============================================================
-- 1-1. 임시 컬럼 추가
ALTER TABLE reports ADD COLUMN processed_by_new uuid;

-- 1-2. 데이터 마이그레이션 (안전 처리: 알려진 텍스트만 변환, 나머지 NULL)
UPDATE reports
SET processed_by_new = CASE
  WHEN processed_by = '최고관리자' THEN (
    SELECT id FROM admin_accounts WHERE name = '권승혁' LIMIT 1
  )
  WHEN processed_by = '시스템' THEN NULL
  ELSE NULL  -- 기타 텍스트 값도 안전하게 NULL 처리 (uuid 캐스팅 에러 방지)
END;

-- 1-3. 원래 컬럼 제거 → 임시 컬럼 이름 변경
ALTER TABLE reports DROP COLUMN processed_by;
ALTER TABLE reports RENAME COLUMN processed_by_new TO processed_by;

-- 1-4. FK 제약조건 추가
ALTER TABLE reports
  ADD CONSTRAINT reports_processed_by_fk
  FOREIGN KEY (processed_by) REFERENCES admin_accounts(id);


-- ============================================================
-- STEP 2: report_logs.processed_by — text → uuid FK
-- ============================================================
-- 2-1. 임시 컬럼 추가
ALTER TABLE report_logs ADD COLUMN processed_by_new uuid;

-- 2-2. 데이터 마이그레이션
UPDATE report_logs
SET processed_by_new = CASE
  WHEN processed_by = '최고관리자' THEN (
    SELECT id FROM admin_accounts WHERE name = '권승혁' LIMIT 1
  )
  WHEN processed_by = '시스템' THEN NULL
  ELSE NULL  -- 기타 텍스트 값도 안전하게 NULL 처리
END;

-- 2-3. 원래 컬럼 제거 → 임시 컬럼 이름 변경
ALTER TABLE report_logs DROP COLUMN processed_by;
ALTER TABLE report_logs RENAME COLUMN processed_by_new TO processed_by;

-- 2-4. FK 제약조건 추가
ALTER TABLE report_logs
  ADD CONSTRAINT report_logs_processed_by_fk
  FOREIGN KEY (processed_by) REFERENCES admin_accounts(id);


-- ============================================================
-- STEP 3: report_logs.sanction_type 컬럼 추가
-- ============================================================
ALTER TABLE report_logs ADD COLUMN sanction_type text;


-- ============================================================
-- STEP 4: search_reports RPC 재생성 (admin_accounts JOIN 추가)
-- ============================================================
-- 기존 함수 DROP (시그니처 동일하므로 CREATE OR REPLACE로도 가능하나 명시적 DROP)
DROP FUNCTION IF EXISTS public.search_reports(text, text, text, text, text, text, text, int, int);

CREATE OR REPLACE FUNCTION public.search_reports(
  p_date_from        text DEFAULT NULL,
  p_date_to          text DEFAULT NULL,
  p_status           text DEFAULT NULL,
  p_reporter_type    text DEFAULT NULL,
  p_reason_category  text DEFAULT NULL,
  p_search_type      text DEFAULT NULL,
  p_search_keyword   text DEFAULT NULL,
  p_page             int  DEFAULT 1,
  p_per_page         int  DEFAULT 20
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_offset      int;
  v_total       bigint;
  v_rows        json;
BEGIN
  -- 관리자 권한 체크
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  v_offset := (p_page - 1) * p_per_page;

  -- 총 건수 카운트
  EXECUTE '
    SELECT COUNT(*)
    FROM reports r
    JOIN members reporter_m ON reporter_m.id = r.reporter_id
    JOIN members reported_m ON reported_m.id = r.reported_id
    WHERE ($1 IS NULL OR r.reported_at >= ($1 || '' 00:00:00'')::timestamptz)
      AND ($2 IS NULL OR r.reported_at <= ($2 || '' 23:59:59'')::timestamptz)
      AND ($3 IS NULL OR r.status = $3)
      AND ($4 IS NULL OR r.reporter_type = $4)
      AND ($5 IS NULL OR r.reason_category = $5)
      AND (
        $6 IS NULL OR $7 IS NULL
        OR ($6 = ''reporter'' AND reporter_m.nickname ILIKE ''%'' || $7 || ''%'')
        OR ($6 = ''reported'' AND reported_m.nickname ILIKE ''%'' || $7 || ''%'')
      )
  '
  INTO v_total
  USING p_date_from, p_date_to, p_status, p_reporter_type, p_reason_category,
        p_search_type, p_search_keyword;

  -- 데이터 조회 (admin_accounts LEFT JOIN 추가)
  EXECUTE '
    SELECT json_agg(t)
    FROM (
      SELECT
        r.id,
        r.reported_at,
        r.reporter_id,
        r.reporter_type,
        r.reported_id,
        r.reported_type,
        r.reason_category,
        r.status,
        r.processed_at,
        r.chat_room_id,
        json_build_object(
          ''name'', reporter_m.name,
          ''nickname'', reporter_m.nickname
        ) AS reporter,
        json_build_object(
          ''name'', reported_m.name,
          ''nickname'', reported_m.nickname
        ) AS reported,
        adm.name AS processed_by_name
      FROM reports r
      JOIN members reporter_m ON reporter_m.id = r.reporter_id
      JOIN members reported_m ON reported_m.id = r.reported_id
      LEFT JOIN admin_accounts adm ON adm.id = r.processed_by
      WHERE ($1 IS NULL OR r.reported_at >= ($1 || '' 00:00:00'')::timestamptz)
        AND ($2 IS NULL OR r.reported_at <= ($2 || '' 23:59:59'')::timestamptz)
        AND ($3 IS NULL OR r.status = $3)
        AND ($4 IS NULL OR r.reporter_type = $4)
        AND ($5 IS NULL OR r.reason_category = $5)
        AND (
          $6 IS NULL OR $7 IS NULL
          OR ($6 = ''reporter'' AND reporter_m.nickname ILIKE ''%'' || $7 || ''%'')
          OR ($6 = ''reported'' AND reported_m.nickname ILIKE ''%'' || $7 || ''%'')
        )
      ORDER BY r.reported_at DESC
      LIMIT $8 OFFSET $9
    ) t
  '
  INTO v_rows
  USING p_date_from, p_date_to, p_status, p_reporter_type, p_reason_category,
        p_search_type, p_search_keyword, p_per_page, v_offset;

  RETURN json_build_object(
    ''data'', COALESCE(v_rows, ''[]''::json),
    ''count'', v_total
  );
END;
$$;


-- ============================================================
-- 완료 메시지
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'SQL 31: 신고접수 상세 마이그레이션 완료!';
  RAISE NOTICE '========================================';
  RAISE NOTICE '변경사항:';
  RAISE NOTICE '  1. reports.processed_by: text → uuid FK (→ admin_accounts.id)';
  RAISE NOTICE '  2. report_logs.processed_by: text → uuid FK (→ admin_accounts.id)';
  RAISE NOTICE '  3. report_logs.sanction_type: 신규 컬럼 추가 (nullable text)';
  RAISE NOTICE '  4. search_reports RPC: admin_accounts LEFT JOIN 추가, processed_by_name 반환';
  RAISE NOTICE '========================================';
END $$;
