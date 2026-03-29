-- ============================================================
-- SQL 13: 돌봄예약관리 통합 검색 함수
-- ============================================================
-- 실행 방법: Supabase SQL Editor에 전체 복사하여 실행
-- 목적: 조인 테이블(members, pets, kindergartens) 필터/검색 지원
-- 의존: public.is_admin() 함수 (11_auth_setup.sql에서 생성됨)
-- ============================================================

CREATE OR REPLACE FUNCTION public.search_reservations(
  p_date_type      text DEFAULT 'requested',
  p_date_from      text DEFAULT NULL,
  p_date_to        text DEFAULT NULL,
  p_status         text DEFAULT NULL,
  p_size_class     text DEFAULT NULL,
  p_search_type    text DEFAULT NULL,
  p_search_keyword text DEFAULT NULL,
  p_page           int  DEFAULT 1,
  p_per_page       int  DEFAULT 20
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_offset   int;
  v_total    bigint;
  v_rows     json;
  v_date_col text;
BEGIN
  -- 관리자 권한 체크
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  v_offset := (p_page - 1) * p_per_page;

  -- 날짜 컬럼 결정
  IF p_date_type = 'checkin' THEN
    v_date_col := 'checkin_scheduled';
  ELSE
    v_date_col := 'created_at';
  END IF;

  -- 총 건수 카운트
  EXECUTE format('
    SELECT COUNT(*)
    FROM reservations r
    JOIN members m ON m.id = r.member_id
    JOIN pets pt ON pt.id = r.pet_id
    JOIN kindergartens k ON k.id = r.kindergarten_id
    WHERE ($1 IS NULL OR r.%I >= $1::timestamptz)
      AND ($2 IS NULL OR r.%I <= $2::timestamptz)
      AND ($3 IS NULL OR r.status = $3)
      AND ($4 IS NULL OR pt.size_class = $4)
      AND (
        $5 IS NULL OR $6 IS NULL
        OR ($5 = ''보호자 닉네임'' AND m.nickname ILIKE ''%%'' || $6 || ''%%'')
        OR ($5 = ''보호자 연락처'' AND m.phone ILIKE ''%%'' || $6 || ''%%'')
        OR ($5 = ''반려동물 이름'' AND pt.name ILIKE ''%%'' || $6 || ''%%'')
        OR ($5 = ''유치원명'' AND k.name ILIKE ''%%'' || $6 || ''%%'')
      )
  ', v_date_col, v_date_col)
  INTO v_total
  USING p_date_from, p_date_to, p_status, p_size_class, p_search_type, p_search_keyword;

  -- 데이터 조회
  EXECUTE format('
    SELECT json_agg(t)
    FROM (
      SELECT
        r.id,
        r.status,
        r.requested_at,
        r.created_at,
        r.checkin_scheduled,
        r.checkout_scheduled,
        r.checkin_actual,
        r.checkout_actual,
        r.walk_count,
        r.pickup_requested,
        r.reject_reason,
        json_build_object(
          ''name'', m.name,
          ''nickname'', m.nickname,
          ''phone'', m.phone
        ) AS members,
        json_build_object(
          ''name'', pt.name,
          ''size_class'', pt.size_class
        ) AS pets,
        json_build_object(
          ''name'', k.name,
          ''address_road'', k.address_road
        ) AS kindergartens,
        (
          SELECT json_agg(json_build_object(
            ''id'', pay.id,
            ''amount'', pay.amount,
            ''status'', pay.status,
            ''paid_at'', pay.paid_at
          ))
          FROM payments pay
          WHERE pay.reservation_id = r.id
        ) AS payments
      FROM reservations r
      JOIN members m ON m.id = r.member_id
      JOIN pets pt ON pt.id = r.pet_id
      JOIN kindergartens k ON k.id = r.kindergarten_id
      WHERE ($1 IS NULL OR r.%I >= $1::timestamptz)
        AND ($2 IS NULL OR r.%I <= $2::timestamptz)
        AND ($3 IS NULL OR r.status = $3)
        AND ($4 IS NULL OR pt.size_class = $4)
        AND (
          $5 IS NULL OR $6 IS NULL
          OR ($5 = ''보호자 닉네임'' AND m.nickname ILIKE ''%%'' || $6 || ''%%'')
          OR ($5 = ''보호자 연락처'' AND m.phone ILIKE ''%%'' || $6 || ''%%'')
          OR ($5 = ''반려동물 이름'' AND pt.name ILIKE ''%%'' || $6 || ''%%'')
          OR ($5 = ''유치원명'' AND k.name ILIKE ''%%'' || $6 || ''%%'')
        )
      ORDER BY r.created_at DESC
      LIMIT $7 OFFSET $8
    ) t
  ', v_date_col, v_date_col)
  INTO v_rows
  USING p_date_from, p_date_to, p_status, p_size_class,
        p_search_type, p_search_keyword, p_per_page, v_offset;

  RETURN json_build_object(
    'data', COALESCE(v_rows, '[]'::json),
    'count', v_total
  );
END;
$$;
