-- ============================================================
-- SQL 40: FAQ 노출순서 재정렬 RPC 함수
-- ============================================================
-- 실행 방법: Supabase SQL Editor에 전체 복사하여 실행
-- 목적: FAQ 수정/삭제 시 같은 카테고리 내 display_order 재정렬을
--        단일 트랜잭션으로 처리하여 데이터 정합성 보장
-- 의존: public.faqs 테이블
-- ============================================================


-- ============================================================
-- 1. reorder_faq_display_order — 순서 이동 + 자기 자신 업데이트
-- ============================================================
-- 사용 시점: FAQ 상세 편집에서 display_order를 변경하며 저장할 때
-- 트랜잭션: plpgsql 함수 = 단일 트랜잭션 (중간 실패 시 전체 롤백)
--
-- 동작:
--   앞으로 이동 (4→2): new ~ old-1 구간의 다른 FAQ들 +1
--   뒤로 이동 (2→4): old+1 ~ new 구간의 다른 FAQ들 -1
--   자기 자신: 전달받은 p_update_data(category, question, answer, target)로 업데이트
--              + display_order를 p_new_order로 설정

CREATE OR REPLACE FUNCTION public.reorder_faq_display_order(
  p_faq_id      uuid,
  p_category    text,
  p_old_order   int,
  p_new_order   int,
  p_update_data jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 1) 다른 FAQ들의 display_order 재정렬
  IF p_new_order < p_old_order THEN
    -- 앞으로 이동: new ~ old-1 구간 +1
    UPDATE faqs
    SET display_order = display_order + 1
    WHERE category = p_category
      AND id != p_faq_id
      AND display_order >= p_new_order
      AND display_order < p_old_order;
  ELSIF p_new_order > p_old_order THEN
    -- 뒤로 이동: old+1 ~ new 구간 -1
    UPDATE faqs
    SET display_order = display_order - 1
    WHERE category = p_category
      AND id != p_faq_id
      AND display_order > p_old_order
      AND display_order <= p_new_order;
  END IF;

  -- 2) 자기 자신 업데이트 (전체 수정 데이터 반영)
  UPDATE faqs
  SET category      = COALESCE(p_update_data->>'category', category),
      question      = COALESCE(p_update_data->>'question', question),
      answer        = COALESCE(p_update_data->>'answer', answer),
      target        = COALESCE(p_update_data->>'target', target),
      display_order = p_new_order
  WHERE id = p_faq_id;

  RETURN json_build_object('success', true);
END;
$$;


-- ============================================================
-- 2. delete_faq_and_reorder — 삭제 + 뒷순서 당기기
-- ============================================================
-- 사용 시점: FAQ 상세에서 삭제할 때
-- 순서: DELETE 먼저 → 같은 카테고리 내 뒷순서 display_order -1
-- 트랜잭션: 단일 트랜잭션 (중간 실패 시 전체 롤백)

CREATE OR REPLACE FUNCTION public.delete_faq_and_reorder(
  p_faq_id    uuid,
  p_category  text,
  p_order     int
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 1) 먼저 삭제
  DELETE FROM faqs WHERE id = p_faq_id;

  -- 2) 같은 카테고리 내 뒷순서 당기기
  UPDATE faqs
  SET display_order = display_order - 1
  WHERE category = p_category
    AND display_order > p_order;

  RETURN json_build_object('success', true);
END;
$$;
