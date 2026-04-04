-- ============================================================
-- SQL 30: 채팅관리 — 신고접수 통합 검색 함수
-- ============================================================
-- 실행 방법: Supabase SQL Editor에 전체 복사하여 실행
-- 목적: 조인 테이블(members) 기준 ILIKE 검색 지원 (신고자/피신고자 닉네임)
--        + admin_accounts JOIN으로 처리 관리자 이름 반환 (SQL 31 마이그레이션 후)
--        + p_sanction_type 필터 추가 (제재 유형 검색)
-- 의존: public.is_admin() 함수 (11_auth_setup.sql에서 생성됨)
-- 참고: search_chat_rooms / search_payments 와 동일 패턴 (HANDOVER 5-12)
-- 주의: SQL 31 실행 후 reports.processed_by가 uuid FK로 변경되어야 정상 작동
-- ============================================================
-- 파라미터→$N 매핑 (COUNT / SELECT 공통):
--   $1  = p_date_from
--   $2  = p_date_to
--   $3  = p_status
--   $4  = p_reporter_type
--   $5  = p_reason_category
--   $6  = p_sanction_type      ← 신규
--   $7  = p_search_type
--   $8  = p_search_keyword
--   $9  = p_per_page            (SELECT 전용)
--   $10 = v_offset              (SELECT 전용)
-- ============================================================

CREATE OR REPLACE FUNCTION public.search_reports(
  p_date_from        text DEFAULT NULL,
  p_date_to          text DEFAULT NULL,
  p_status           text DEFAULT NULL,
  p_reporter_type    text DEFAULT NULL,
  p_reason_category  text DEFAULT NULL,
  p_sanction_type    text DEFAULT NULL,
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

  -- 총 건수 카운트 ($1~$8)
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
      AND ($6 IS NULL OR r.sanction_type = $6)
      AND (
        $7 IS NULL OR $8 IS NULL
        OR ($7 = ''reporter'' AND reporter_m.nickname ILIKE ''%'' || $8 || ''%'')
        OR ($7 = ''reported'' AND reported_m.nickname ILIKE ''%'' || $8 || ''%'')
      )
  '
  INTO v_total
  USING p_date_from, p_date_to, p_status, p_reporter_type, p_reason_category,
        p_sanction_type, p_search_type, p_search_keyword;

  -- 데이터 조회 ($1~$10, admin_accounts LEFT JOIN)
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
        r.sanction_type,
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
        AND ($6 IS NULL OR r.sanction_type = $6)
        AND (
          $7 IS NULL OR $8 IS NULL
          OR ($7 = ''reporter'' AND reporter_m.nickname ILIKE ''%'' || $8 || ''%'')
          OR ($7 = ''reported'' AND reported_m.nickname ILIKE ''%'' || $8 || ''%'')
        )
      ORDER BY r.reported_at DESC
      LIMIT $9 OFFSET $10
    ) t
  '
  INTO v_rows
  USING p_date_from, p_date_to, p_status, p_reporter_type, p_reason_category,
        p_sanction_type, p_search_type, p_search_keyword, p_per_page, v_offset;

  RETURN json_build_object(
    'data', COALESCE(v_rows, '[]'::json),
    'count', v_total
  );
END;
$$;
