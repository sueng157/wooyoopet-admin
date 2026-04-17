-- ============================================================
-- SQL 44-7: app_withdraw_member RPC 함수
-- ============================================================
-- 실행 방법: Supabase SQL Editor에 전체 복사하여 실행
-- ⚠️ 선행 조건: 44_00a_ddl_alter_tables.sql 실행 필요
--    (pets.deleted 컬럼, kindergartens.registration_status CHECK 변경)
-- 원본 PHP: set_member_leave.php
-- 용도: 회원 탈퇴 (soft delete) + 관련 데이터 정리
-- 보안: SECURITY INVOKER — auth.uid() 직접 사용 (타인 탈퇴 방지)
-- ============================================================
--
-- [PHP 원본 로직 (set_member_leave.php)]
--   파라미터: mb_id (전화번호), reason (탈퇴 사유)
--   1️⃣ g5_member SELECT * WHERE mb_id
--   2️⃣ g5_member_leave INSERT (탈퇴 이관 테이블에 회원 정보 복사 + raw JSON)
--   3️⃣ g5_member DELETE (hard delete)
--   4️⃣ g5_write_animal DELETE (hard delete — 반려동물)
--   5️⃣ g5_write_partner DELETE (hard delete — 유치원)
--
--   원본 문제점:
--     - hard DELETE → 결제/예약/채팅/리뷰 FK 참조 무결성 파괴 위험
--     - 진행 중 예약 검증 없음 → 돌봄 중 탈퇴 가능 (비즈니스 위험)
--     - 관련 데이터 정리 최소 (채팅, 찜, FCM, 차단 등 미처리)
--     - 트랜잭션 주석처리 상태 (사실상 비트랜잭션)
--     - mb_id(전화번호)만 있으면 타인 탈퇴 가능 (인증 없음)
--
-- [Supabase 전환]
--   - hard DELETE → soft delete (status 업데이트)
--   - mb_id 파라미터 → auth.uid() 직접 사용 (타인 탈퇴 구조적 불가)
--   - g5_member_leave 이관 → 불필요 (soft delete이므로 원본 보존)
--   - 진행 중 예약 검증 추가 (보호자 + 유치원 운영자 양쪽)
--   - 관련 데이터 정리 확장 (찜, FCM, 차단)
--   - PL/pgSQL 함수 = 자동 트랜잭션 (예외 시 전체 롤백)
--   - Auth 계정 삭제는 RPC 범위 밖 (Edge Function에서 처리)
--
-- [soft delete 설계]
--   회원(members): status = '탈퇴', withdraw_reason, withdrawn_at
--   반려동물(pets): deleted = true (기존 soft delete 패턴)
--   유치원(kindergartens): registration_status = 'withdrawn'
--   → FK 참조 무결성 보존, 결제/예약/정산 이력 안전
--
-- [관련 데이터 정리 정책]
--
--   [정리하는 테이블 — 6개]
--     ① pets: deleted = true (soft delete, 리뷰/예약 FK 보존)
--     ② kindergartens: registration_status = 'withdrawn' (예약 이력 FK 보존)
--     ③ favorite_kindergartens: DELETE (본인 찜, FK 영향 없음)
--     ④ favorite_pets: DELETE (본인 찜, FK 영향 없음)
--     ⑤ fcm_tokens: DELETE (탈퇴 후 푸시 알림 차단)
--     ⑥ member_blocks: DELETE WHERE blocker_id (본인이 건 차단만)
--
--   [정리하지 않는 테이블 — 이력 보존]
--     reservations, payments, refunds — 결제/정산 이력, 법적 보존 의무
--     settlements — 정산 이력
--     guardian_reviews, kindergarten_reviews — 후기 이력
--       (탈퇴 회원 표시는 앱에서 members.status='탈퇴' 확인 후 UI 처리)
--     chat_rooms, chat_messages, chat_room_members — 채팅 이력
--       (chat_room_members: status 컬럼 없음, 앱에서 members.status='탈퇴'로 처리)
--     member_term_agreements — 약관 동의 이력
--     notifications — 알림 이력
--
-- [Auth 계정 삭제 — RPC 범위 밖]
--   Supabase Auth 계정 삭제는 service_role 키가 필요하므로 RPC에서 직접 처리 불가.
--   처리 방법:
--     ① 앱 → app_withdraw_member RPC 호출 → soft delete 완료
--     ② 앱 → Edge Function 호출 → supabase.auth.admin.deleteUser(uid)
--   또는 DB trigger/webhook으로 members.status = '탈퇴' 변경 시 자동 호출.
--
-- [RLS 영향 분석]
--   7개 테이블 참조 (모두 RLS 통과):
--
--   ① members
--      정책: members_select_app — USING (id = auth.uid()) — 본인만
--      정책: members_update_app — USING (id = auth.uid()) — 본인만
--      통과: ✅ auth.uid() = 본인 레코드 SELECT + UPDATE
--
--   ② reservations
--      정책: reservations_select_app — USING (
--        member_id = auth.uid()
--        OR kindergarten_id IN (SELECT id FROM kindergartens WHERE member_id = auth.uid())
--      )
--      통과: ✅ 보호자(member_id) + 운영자(kindergarten) 양쪽 확인 가능
--
--   ③ pets
--      정책: pets_update_app — USING (member_id = auth.uid()) — 본인만
--      통과: ✅ 본인 반려동물 UPDATE
--
--   ④ kindergartens
--      정책: kindergartens_update_app — USING (member_id = auth.uid()) — 본인만
--      통과: ✅ 본인 유치원 UPDATE
--
--   ⑤ favorite_kindergartens
--      정책: favorite_kindergartens_delete_app — USING (member_id = auth.uid())
--      통과: ✅ 본인 찜 DELETE
--
--   ⑥ favorite_pets
--      정책: favorite_pets_delete_app — USING (member_id = auth.uid())
--      통과: ✅ 본인 찜 DELETE (타인이 내 동물 찜한 것은 RLS 차단 → 남김.
--            동물 deleted=true이므로 앱에서 자연 제외)
--
--   ⑦ fcm_tokens
--      정책: fcm_tokens_delete_app — USING (member_id = auth.uid())
--      통과: ✅ 본인 토큰 DELETE
--
--   ⑧ member_blocks
--      정책: member_blocks_delete_app — USING (blocker_id = auth.uid())
--      통과: ✅ 본인이 건 차단 DELETE (상대방이 나를 차단한 것은 RLS 차단 → 남김.
--            탈퇴 회원이므로 실질 영향 없음)
--
--   RLS 충돌: 0건 — 모든 처리가 본인 소유 레코드 범위 내
--   SECURITY INVOKER 적합성: ✅
-- ============================================================


-- 기존 함수 제거 (재실행 안전)
DROP FUNCTION IF EXISTS public.app_withdraw_member(text);


-- ============================================================
-- 함수 정의
-- ============================================================
CREATE OR REPLACE FUNCTION public.app_withdraw_member(
  p_reason  text DEFAULT NULL           -- 탈퇴 사유 (선택)
)
RETURNS json
LANGUAGE plpgsql
VOLATILE                                -- 데이터 변경 함수
SECURITY INVOKER                        -- RLS 적용 (호출자 권한)
SET search_path = public
AS $$
DECLARE
  v_member_id         uuid;
  v_member_status     text;
  v_has_active        boolean;
  v_withdrawn_at      timestamptz;
BEGIN
  -- ──────────────────────────────────────────────────────
  -- 1. 호출자 인증 확인
  --    p_member_id 파라미터 없음 — auth.uid() 직접 사용
  --    → 타인 탈퇴 구조적으로 불가능
  -- ──────────────────────────────────────────────────────
  v_member_id := auth.uid();

  IF v_member_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', '인증되지 않은 사용자입니다.',
      'code', 'AUTH_REQUIRED'
    );
  END IF;

  -- ──────────────────────────────────────────────────────
  -- 2. 회원 존재 및 상태 확인
  --    RLS: members_select_app — id = auth.uid() ✅
  --    이미 탈퇴한 회원의 중복 탈퇴 요청 방어
  -- ──────────────────────────────────────────────────────
  SELECT m.status
  INTO v_member_status
  FROM members m
  WHERE m.id = v_member_id;

  IF v_member_status IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', '회원 정보를 찾을 수 없습니다.',
      'code', 'MEMBER_NOT_FOUND'
    );
  END IF;

  IF v_member_status = '탈퇴' THEN
    RETURN json_build_object(
      'success', false,
      'error', '이미 탈퇴한 회원입니다.',
      'code', 'ALREADY_WITHDRAWN'
    );
  END IF;

  -- ──────────────────────────────────────────────────────
  -- 3. 진행 중 예약 검증 — 보호자 + 유치원 운영자 양쪽
  --    돌봄 진행 중 탈퇴 방지 (비즈니스 안전장치)
  --    RLS: reservations_select_app — member_id = auth.uid()
  --         OR kindergarten_id IN (내 유치원) ✅
  --
  --    [보호자 역할]
  --    본인이 예약한 진행 중 예약 확인
  --    [유치원 운영자 역할]
  --    본인 유치원에 들어온 진행 중 예약 확인
  --    → 어느 쪽이든 존재하면 탈퇴 불가
  -- ──────────────────────────────────────────────────────

  -- 3-a. 보호자로서 진행 중 예약
  SELECT EXISTS (
    SELECT 1
    FROM reservations r
    WHERE r.member_id = v_member_id
      AND r.status IN ('수락대기', '예약확정', '돌봄진행중')
  )
  INTO v_has_active;

  IF v_has_active THEN
    RETURN json_build_object(
      'success', false,
      'error', '진행 중인 예약이 있어 탈퇴할 수 없습니다. 예약을 취소하거나 완료한 후 다시 시도해주세요.',
      'code', 'ACTIVE_RESERVATION_EXISTS'
    );
  END IF;

  -- 3-b. 유치원 운영자로서 진행 중 예약
  SELECT EXISTS (
    SELECT 1
    FROM reservations r
    JOIN kindergartens k ON r.kindergarten_id = k.id
    WHERE k.member_id = v_member_id
      AND r.status IN ('수락대기', '예약확정', '돌봄진행중')
  )
  INTO v_has_active;

  IF v_has_active THEN
    RETURN json_build_object(
      'success', false,
      'error', '유치원에 진행 중인 예약이 있어 탈퇴할 수 없습니다. 모든 예약을 완료한 후 다시 시도해주세요.',
      'code', 'ACTIVE_RESERVATION_EXISTS'
    );
  END IF;

  -- ──────────────────────────────────────────────────────
  -- 4. 회원 soft delete
  --    RLS: members_update_app — id = auth.uid() ✅
  --    hard DELETE 대신 status 변경으로 FK 무결성 보존
  --    withdraw_reason: 사용자 입력 사유 (NULL 허용)
  --    withdrawn_at: 서버 시간 기준 탈퇴 시각
  -- ──────────────────────────────────────────────────────
  v_withdrawn_at := now();

  UPDATE members
  SET
    status          = '탈퇴',
    withdraw_reason = p_reason,
    withdrawn_at    = v_withdrawn_at
  WHERE id = v_member_id;

  -- ──────────────────────────────────────────────────────
  -- 5. 관련 데이터 정리 (6개 테이블, 7개 쿼리)
  --    PL/pgSQL 함수 내이므로 자동 트랜잭션 보장
  --    → 단계 4~5 중 하나라도 실패하면 전체 롤백
  -- ──────────────────────────────────────────────────────

  -- 5-1. 반려동물 soft delete
  --      RLS: pets_update_app — member_id = auth.uid() ✅
  --      deleted = true → internal.pets_public_info VIEW 자동 필터
  UPDATE pets
  SET deleted = true
  WHERE member_id = v_member_id;

  -- 5-2. 유치원 비활성화
  --      RLS: kindergartens_update_app — member_id = auth.uid() ✅
  --      registration_status = 'withdrawn' → 유치원 목록(44_02) 자동 제외
  --      (WHERE registration_status = 'registered' 조건)
  UPDATE kindergartens
  SET registration_status = 'withdrawn'
  WHERE member_id = v_member_id;

  -- 5-3. 찜 정리: 내가 찜한 유치원
  --      RLS: favorite_kindergartens_delete_app — member_id = auth.uid() ✅
  DELETE FROM favorite_kindergartens
  WHERE member_id = v_member_id;

  -- 5-4. 찜 정리: 내가 찜한 반려동물
  --      RLS: favorite_pets_delete_app — member_id = auth.uid() ✅
  --      타인이 내 동물을 찜한 레코드는 RLS 차단 → 남김
  --      (동물 deleted=true이므로 앱에서 자연 제외)
  DELETE FROM favorite_pets
  WHERE member_id = v_member_id;

  -- 5-5. FCM 토큰 삭제
  --      RLS: fcm_tokens_delete_app — member_id = auth.uid() ✅
  --      탈퇴 후 푸시 알림 차단
  DELETE FROM fcm_tokens
  WHERE member_id = v_member_id;

  -- 5-6. 차단 정리: 내가 건 차단만
  --      RLS: member_blocks_delete_app — blocker_id = auth.uid() ✅
  --      상대방이 나를 차단한 레코드는 RLS 차단 → 남김
  --      (탈퇴 회원이므로 실질 영향 없음)
  DELETE FROM member_blocks
  WHERE blocker_id = v_member_id;

  -- ──────────────────────────────────────────────────────
  -- 6. 성공 응답
  --    withdrawn_at 반환: 앱에서 탈퇴 완료 화면 표시용
  --    이후 앱은 Edge Function 호출하여 Auth 계정 삭제
  -- ──────────────────────────────────────────────────────
  RETURN json_build_object(
    'success', true,
    'data', json_build_object(
      'withdrawn_at', v_withdrawn_at
    )
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
GRANT EXECUTE ON FUNCTION public.app_withdraw_member(text)
  TO authenticated;

-- anon 역할 명시적 차단
REVOKE EXECUTE ON FUNCTION public.app_withdraw_member(text)
  FROM anon;


-- ============================================================
-- 함수 코멘트
-- ============================================================
COMMENT ON FUNCTION public.app_withdraw_member(text) IS
  '회원 탈퇴 (soft delete) — members.status=탈퇴 + 관련 데이터 정리. '
  '원본: set_member_leave.php (hard DELETE → soft delete 전환). '
  'SECURITY INVOKER: auth.uid() 직접 사용, 타인 탈퇴 구조적 불가. '
  '진행 중 예약 검증: 보호자 + 유치원 운영자 양쪽 확인. '
  'soft delete: members(status=탈퇴), pets(deleted=true), kindergartens(registration_status=withdrawn). '
  '정리: favorite_kindergartens, favorite_pets, fcm_tokens, member_blocks DELETE. '
  '보존: reservations, payments, refunds, settlements, reviews, chat, notifications. '
  'Auth 삭제: RPC 범위 밖 — Edge Function에서 admin.deleteUser(uid) 처리.';


-- ============================================================
-- 완료 알림
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE '[44-7] app_withdraw_member 함수 생성 완료';
  RAISE NOTICE '  ⚠️ 선행 조건: 44_00a DDL ALTER 실행 필요';
  RAISE NOTICE '  - 인자: p_reason text (선택)';
  RAISE NOTICE '  - 반환: json {success, data: {withdrawn_at}}';
  RAISE NOTICE '  - 보안: SECURITY INVOKER — auth.uid() 직접 사용 (타인 탈퇴 불가)';
  RAISE NOTICE '  - VOLATILE: 데이터 변경 함수 (자동 트랜잭션)';
  RAISE NOTICE '  ';
  RAISE NOTICE '  [처리 단계]';
  RAISE NOTICE '  1. 인증 확인 (auth.uid())';
  RAISE NOTICE '  2. 회원 존재/상태 확인 (MEMBER_NOT_FOUND, ALREADY_WITHDRAWN)';
  RAISE NOTICE '  3. 진행 중 예약 검증 (보호자 + 유치원 운영자 양쪽)';
  RAISE NOTICE '  4. 회원 soft delete (status=탈퇴, withdraw_reason, withdrawn_at)';
  RAISE NOTICE '  5. 관련 데이터 정리 (7개 쿼리)';
  RAISE NOTICE '     - pets.deleted = true';
  RAISE NOTICE '     - kindergartens.registration_status = withdrawn';
  RAISE NOTICE '     - DELETE: favorite_kindergartens, favorite_pets, fcm_tokens, member_blocks';
  RAISE NOTICE '  6. EXCEPTION → JSON 에러 반환';
  RAISE NOTICE '  ';
  RAISE NOTICE '  [이력 보존 — 정리하지 않음]';
  RAISE NOTICE '  reservations, payments, refunds, settlements,';
  RAISE NOTICE '  guardian_reviews, kindergarten_reviews,';
  RAISE NOTICE '  chat_rooms, chat_messages, chat_room_members,';
  RAISE NOTICE '  member_term_agreements, notifications';
  RAISE NOTICE '  ';
  RAISE NOTICE '  [Auth 삭제 — RPC 범위 밖]';
  RAISE NOTICE '  RPC 성공 후 앱에서 Edge Function 호출:';
  RAISE NOTICE '  supabase.auth.admin.deleteUser(uid)';
  RAISE NOTICE '  ';
  RAISE NOTICE '  [앱 호출 예시]';
  RAISE NOTICE '  // 사유 포함 탈퇴';
  RAISE NOTICE '  const { data } = await supabase.rpc(''app_withdraw_member'', {';
  RAISE NOTICE '    p_reason: ''서비스 불만족''';
  RAISE NOTICE '  });';
  RAISE NOTICE '  ';
  RAISE NOTICE '  // 사유 없이 탈퇴';
  RAISE NOTICE '  const { data } = await supabase.rpc(''app_withdraw_member'', {});';
  RAISE NOTICE '  ';
  RAISE NOTICE '  // RPC 성공 후 Auth 삭제 (Edge Function)';
  RAISE NOTICE '  if (data.success) {';
  RAISE NOTICE '    await supabase.functions.invoke(''delete-auth-user'');';
  RAISE NOTICE '  }';
END $$;
