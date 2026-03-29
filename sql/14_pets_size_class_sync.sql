-- ============================================================
-- SQL 14: pets 테이블 size_class 자동 동기화
-- ============================================================
-- 실행 방법: Supabase SQL Editor에 전체 복사하여 한번에 실행
-- 목적: weight 기준으로 size_class 자동 계산 (기존 데이터 정정 + 트리거)
-- 기준: 10kg 미만 = 소형, 10~25kg 미만 = 중형, 25kg 이상 = 대형
-- ============================================================

-- ① 기존 데이터 일괄 업데이트
UPDATE pets
SET size_class = CASE
  WHEN weight IS NULL THEN NULL
  WHEN weight < 10    THEN '소형'
  WHEN weight < 25    THEN '중형'
  ELSE                     '대형'
END
WHERE weight IS NOT NULL;

-- ② 트리거 함수: weight 값에 따라 size_class 자동 계산
CREATE OR REPLACE FUNCTION public.set_pet_size_class()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.weight IS NOT NULL THEN
    IF NEW.weight < 10 THEN
      NEW.size_class := '소형';
    ELSIF NEW.weight < 25 THEN
      NEW.size_class := '중형';
    ELSE
      NEW.size_class := '대형';
    END IF;
  ELSE
    NEW.size_class := NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- ③ 트리거 생성 (기존 있으면 교체)
DROP TRIGGER IF EXISTS trg_set_pet_size_class ON pets;

CREATE TRIGGER trg_set_pet_size_class
  BEFORE INSERT OR UPDATE OF weight ON pets
  FOR EACH ROW
  EXECUTE FUNCTION public.set_pet_size_class();
