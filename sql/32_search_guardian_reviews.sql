-- ============================================================
-- SQL 32: 후기관리 — 보호자 후기 통합 검색 함수
-- ============================================================
-- 실행 방법: Supabase SQL Editor에 전체 복사하여 실행
-- 목적: 보호자 후기 목록 검색 — 날짜범위, 만족도, 이미지 유무,
--        검색대상(보호자 닉네임/유치원명/반려동물 이름) 키워드 필터
-- 의존: public.is_admin() 함수 (11_auth_setup.sql에서 생성됨)
-- 참고: search_reports (30_search_reports.sql) 와 동일 패턴 (HANDOVER 5-12)
-- 주의: guardian_reviews.pet_id는 nullable이므로 pets는 반드시 LEFT JOIN 사용
--        (HANDOVER 5-14 — INNER JOIN 사용 시 pet_id IS NULL 후기 누락)
-- ============================================================
-- 파라미터→$N 매핑 (COUNT / SELECT 공통):
--   $1  = p_date_from
--   $2  = p_date_to
--   $3  = p_satisfaction
--   $4  = p_image_filter
--   $5  = p_search_type
--   $6  = p_search_keyword
--   $7  = p_per_page            (SELECT 전용)
--   $8  = v_offset              (SELECT 전용)
-- ============================================================

CREATE OR REPLACE FUNCTION public.search_guardian_reviews(
  p_date_from        text DEFAULT NULL,
  p_date_to          text DEFAULT NULL,
  p_satisfaction     text DEFAULT NULL,
  p_image_filter     text DEFAULT NULL,
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

  -- 총 건수 카운트 ($1~$6)
  EXECUTE '
    SELECT COUNT(*)
    FROM guardian_reviews gr
    JOIN members m ON m.id = gr.member_id
    JOIN kindergartens kg ON kg.id = gr.kindergarten_id
    LEFT JOIN pets p ON p.id = gr.pet_id
    WHERE ($1 IS NULL OR gr.written_at >= ($1 || '' 00:00:00'')::timestamptz)
      AND ($2 IS NULL OR gr.written_at <= ($2 || '' 23:59:59'')::timestamptz)
      AND ($3 IS NULL OR gr.satisfaction = $3)
      AND (
        $4 IS NULL
        OR ($4 = ''있음'' AND gr.image_urls IS NOT NULL AND jsonb_array_length(gr.image_urls) > 0)
        OR ($4 = ''없음'' AND (gr.image_urls IS NULL OR jsonb_array_length(gr.image_urls) = 0))
      )
      AND (
        $5 IS NULL OR $6 IS NULL
        OR ($5 = ''보호자 닉네임'' AND m.nickname ILIKE ''%'' || $6 || ''%'')
        OR ($5 = ''유치원명''       AND kg.name    ILIKE ''%'' || $6 || ''%'')
        OR ($5 = ''반려동물 이름''  AND p.name     ILIKE ''%'' || $6 || ''%'')
      )
  '
  INTO v_total
  USING p_date_from, p_date_to, p_satisfaction, p_image_filter,
        p_search_type, p_search_keyword;

  -- 데이터 조회 ($1~$8)
  EXECUTE '
    SELECT json_agg(t)
    FROM (
      SELECT
        gr.id,
        gr.written_at,
        gr.satisfaction,
        gr.selected_tags,
        gr.content,
        gr.image_urls,
        gr.is_hidden,
        gr.reservation_id,
        json_build_object(
          ''nickname'', m.nickname
        ) AS members,
        json_build_object(
          ''name'', kg.name
        ) AS kindergartens,
        CASE WHEN p.id IS NOT NULL
          THEN json_build_object(''name'', p.name)
          ELSE NULL
        END AS pets
      FROM guardian_reviews gr
      JOIN members m ON m.id = gr.member_id
      JOIN kindergartens kg ON kg.id = gr.kindergarten_id
      LEFT JOIN pets p ON p.id = gr.pet_id
      WHERE ($1 IS NULL OR gr.written_at >= ($1 || '' 00:00:00'')::timestamptz)
        AND ($2 IS NULL OR gr.written_at <= ($2 || '' 23:59:59'')::timestamptz)
        AND ($3 IS NULL OR gr.satisfaction = $3)
        AND (
          $4 IS NULL
          OR ($4 = ''있음'' AND gr.image_urls IS NOT NULL AND jsonb_array_length(gr.image_urls) > 0)
          OR ($4 = ''없음'' AND (gr.image_urls IS NULL OR jsonb_array_length(gr.image_urls) = 0))
        )
        AND (
          $5 IS NULL OR $6 IS NULL
          OR ($5 = ''보호자 닉네임'' AND m.nickname ILIKE ''%'' || $6 || ''%'')
          OR ($5 = ''유치원명''       AND kg.name    ILIKE ''%'' || $6 || ''%'')
          OR ($5 = ''반려동물 이름''  AND p.name     ILIKE ''%'' || $6 || ''%'')
        )
      ORDER BY gr.written_at DESC
      LIMIT $7 OFFSET $8
    ) t
  '
  INTO v_rows
  USING p_date_from, p_date_to, p_satisfaction, p_image_filter,
        p_search_type, p_search_keyword, p_per_page, v_offset;

  RETURN json_build_object(
    'data', COALESCE(v_rows, '[]'::json),
    'count', v_total
  );
END;
$$;
