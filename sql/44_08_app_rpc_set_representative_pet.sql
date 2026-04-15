-- ============================================================
-- SQL 44-8: app_set_representative_pet RPC 함수
-- ============================================================
-- 실행 방법: Supabase SQL Editor에 전체 복사하여 실행
-- 원본 PHP: set_first_animal_set.php
-- 용도: 선택한 반려동물을 대표(is_representative)로 설정
-- 보안: SECURITY INVOKER — pets 테이블의 RLS 자동 적용
--        (본인 반려동물만 UPDATE 가능)
-- ============================================================
--
-- [PHP 원본 로직 (set_first_animal_set.php)]
--   1. mb_id(회원 ID)와 wr_id(동물 ID) POST 파라미터 수신
--   2. UPDATE g5_write_animal SET firstYN='N' WHERE mb_id=?
--      → 해당 회원의 모든 동물을 비대표로 리셋
--   3. UPDATE g5_write_animal SET firstYN='Y' WHERE wr_id=? AND mb_id=?
--      → 선택한 동물만 대표로 설정
--   4. JSON 응답: {result: {msg: 'SUCCESS'}}
--
-- [Supabase 전환]
--   - firstYN (text 'Y'/'N') → is_representative (bool)
--   - mb_id (text 전화번호) → p_pet_id uuid (Supabase Auth uid 기반 RLS)
--   - p_member_id 불필요: SECURITY INVOKER이므로 auth.uid()로 자동 제한
--
-- [트랜잭션 안전성]
--   기존 대표 해제(UPDATE ①) 후 새 대표 설정(UPDATE ②)에서 실패하면
--   모든 반려동물이 비대표 상태가 되는 버그 발생 가능.
--   → 해결: UPDATE ① 실행 전에 p_pet_id 존재 여부를 SELECT로 먼저 검증.
--   → p_pet_id가 유효하지 않으면 해제 자체를 실행하지 않으므로 롤백 불필요.
--
-- [RLS 영향 분석]
--   대상 테이블: pets
--   관련 RLS 정책:
--     - pets_select_app:  FOR SELECT  USING (member_id = auth.uid())  ← 본인만 조회
--     - pets_update_app:  FOR UPDATE  USING (member_id = auth.uid())  ← 본인만 수정
--     - pets_insert_app:  FOR INSERT  WITH CHECK (member_id = auth.uid())
--   충돌 여부: ❌ 없음
--     → 이 함수는 본인의 반려동물만 UPDATE하므로 RLS가 정확히 일치.
--     → 타 회원 데이터 접근 없음 → VIEW 사용 불필요.
--   SECURITY INVOKER 적합성: ✅
--     → RLS가 호출자(auth.uid()) 기준으로 자동 필터링.
--     → 악의적으로 타인의 pet_id를 전달해도 member_id ≠ auth.uid()이므로
--       RLS에 의해 UPDATE 대상 0건 → 에러 처리됨.
-- ============================================================


-- 기존 함수 제거 (재실행 안전)
DROP FUNCTION IF EXISTS public.app_set_representative_pet(uuid);


-- ============================================================
-- 함수 정의
-- ============================================================
CREATE OR REPLACE FUNCTION public.app_set_representative_pet(
  p_pet_id uuid                      -- 대표로 설정할 반려동물 ID
)
RETURNS json
LANGUAGE plpgsql
VOLATILE                             -- 쓰기 함수
SECURITY INVOKER                     -- RLS 적용 (호출자 권한)
SET search_path = public
AS $$
DECLARE
  v_current_uid uuid;
  v_pet_exists  boolean;
  v_reset_count int;
  v_updated_pet record;
BEGIN
  -- ──────────────────────────────────────────────────────
  -- 1. 호출자 인증 확인
  -- ──────────────────────────────────────────────────────
  v_current_uid := auth.uid();

  IF v_current_uid IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', '인증되지 않은 사용자입니다.'
    );
  END IF;

  -- ──────────────────────────────────────────────────────
  -- 2. p_pet_id 사전 검증 (트랜잭션 안전성)
  --    ※ 핵심: 이 검증을 기존 대표 해제 UPDATE보다 먼저 수행.
  --    p_pet_id가 유효하지 않으면 해제 자체를 실행하지 않으므로
  --    "모든 반려동물이 비대표가 되는" 버그를 원천 차단한다.
  -- ──────────────────────────────────────────────────────
  SELECT EXISTS (
    SELECT 1 FROM pets
    WHERE id = p_pet_id
      AND member_id = v_current_uid
      AND deleted = false
  ) INTO v_pet_exists;

  IF NOT v_pet_exists THEN
    RETURN json_build_object(
      'success', false,
      'error', '반려동물을 찾을 수 없거나 권한이 없습니다.',
      'code', 'PET_NOT_FOUND'
    );
  END IF;

  -- ──────────────────────────────────────────────────────
  -- 3. 기존 대표 반려동물 해제
  --    RLS가 자동으로 member_id = auth.uid() 필터링
  --    ※ 단계 2에서 p_pet_id 유효성이 확인된 후에만 실행됨
  -- ──────────────────────────────────────────────────────
  UPDATE pets
  SET is_representative = false
  WHERE member_id = v_current_uid
    AND is_representative = true
    AND deleted = false;

  GET DIAGNOSTICS v_reset_count = ROW_COUNT;

  -- ──────────────────────────────────────────────────────
  -- 4. 선택한 반려동물을 대표로 설정
  --    단계 2에서 이미 검증했으므로 UPDATE 0건은 발생하지 않음
  -- ──────────────────────────────────────────────────────
  UPDATE pets
  SET is_representative = true
  WHERE id = p_pet_id
    AND member_id = v_current_uid
    AND deleted = false
  RETURNING
    id,
    member_id,
    name,
    breed,
    gender,
    birth_date,
    is_birth_date_unknown,
    weight,
    size_class,
    is_neutered,
    is_vaccinated,
    photo_urls,
    is_representative,
    is_draft,
    description
  INTO v_updated_pet;

  -- ──────────────────────────────────────────────────────
  -- 5. 성공 응답
  -- ──────────────────────────────────────────────────────
  RETURN json_build_object(
    'success', true,
    'data', json_build_object(
      'id', v_updated_pet.id,
      'member_id', v_updated_pet.member_id,
      'name', v_updated_pet.name,
      'breed', v_updated_pet.breed,
      'gender', v_updated_pet.gender,
      'birth_date', v_updated_pet.birth_date,
      'is_birth_date_unknown', v_updated_pet.is_birth_date_unknown,
      'weight', v_updated_pet.weight,
      'size_class', v_updated_pet.size_class,
      'is_neutered', v_updated_pet.is_neutered,
      'is_vaccinated', v_updated_pet.is_vaccinated,
      'photo_urls', v_updated_pet.photo_urls,
      'is_representative', v_updated_pet.is_representative,
      'is_draft', v_updated_pet.is_draft,
      'description', v_updated_pet.description
    ),
    'reset_count', v_reset_count
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM,
      'code', SQLSTATE
    );
END;
$$;


-- ============================================================
-- 함수 권한 부여
-- ============================================================
-- authenticated 역할에만 실행 허용 (비인증 사용자 차단)
GRANT EXECUTE ON FUNCTION public.app_set_representative_pet(uuid)
  TO authenticated;

-- anon 역할 명시적 차단
REVOKE EXECUTE ON FUNCTION public.app_set_representative_pet(uuid)
  FROM anon;


-- ============================================================
-- 함수 코멘트
-- ============================================================
COMMENT ON FUNCTION public.app_set_representative_pet(uuid) IS
  '대표 반려동물 설정 — 기존 대표 해제 후 지정한 반려동물을 대표로 설정. '
  '원본: set_first_animal_set.php. '
  'SECURITY INVOKER: RLS(pets_update_app)가 본인 소유만 UPDATE 허용.';


-- ============================================================
-- 완료 알림
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE '[44-8] app_set_representative_pet 함수 생성 완료';
  RAISE NOTICE '  - 인자: p_pet_id uuid';
  RAISE NOTICE '  - 반환: json {success, data, reset_count} 또는 {success, error, code}';
  RAISE NOTICE '  - 보안: SECURITY INVOKER + pets RLS 자동 적용';
  RAISE NOTICE '  ';
  RAISE NOTICE '  [앱 호출 예시]';
  RAISE NOTICE '  const { data } = await supabase.rpc(''app_set_representative_pet'', {';
  RAISE NOTICE '    p_pet_id: ''uuid-of-pet''';
  RAISE NOTICE '  });';
END $$;
