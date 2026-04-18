-- ============================================================
-- SQL 44-14: app_create_chat_room RPC 함수
-- ============================================================
-- 실행 방법: Supabase SQL Editor에 전체 복사하여 실행
-- 원본 PHP: chat.php → create_room
-- 용도: 채팅방 생성 (보호자↔유치원 1:1 채팅)
-- 보안: SECURITY DEFINER — chat_room_members INSERT RLS 부재
-- ============================================================
--
-- [사전 조건]
--   ① sql/43_01_app_rls_policies.sql 실행 완료 (chat_rooms, chat_room_members RLS)
--   ② chat_rooms 테이블 존재 (guardian_id, kindergarten_id FK)
--   ③ chat_room_members 테이블 존재 (INSERT RLS 없음 — 의도적)
--   ④ kindergartens 테이블 존재 (member_id FK)
--   ⑤ chat_rooms에 (guardian_id, kindergarten_id) UNIQUE 제약 필요
--      → 이 파일 내에서 함수 생성 전에 ALTER TABLE로 추가
--      → race condition 시 unique_violation EXCEPTION 발생 보장
--      → 동일 보호자+유치원 조합의 방 중복 생성 방지 (DB 레벨 보장)
--
-- [PHP 원본 로직 (chat.php → create_room)]
--   파라미터: mb_id (본인 전화번호), to_mb_id (상대방 전화번호)
--   1️⃣ 양쪽 회원의 mb_5(역할)를 조회
--   2️⃣ 'mb_id-역할,mb_id-역할' 형식 문자열로 방 name 생성
--   3️⃣ room_members GROUP_CONCAT으로 기존 방 검색
--   4️⃣ 방이 없으면 room INSERT → room_members 2건 INSERT
--   5️⃣ 방이 있으면 기존 방 반환
--   반환: { data: { room정보 + members배열 } }
--
--   원본 문제점:
--     - 문자열 기반 방 이름으로 중복 검사 (정규화 부재)
--     - mb_id 파라미터만으로 접근 제어 (스푸핑 가능)
--     - 방 삭제(soft delete) 후 동일 구성원 재생성 미처리
--     - SQL Injection 취약 (문자열 직접 삽입)
--
-- [Supabase 전환]
--   - mb_id → auth.uid() 자동 사용 (p_target_member_id만 전달)
--   - 문자열 방 이름 → guardian_id + kindergarten_id FK 조합으로 정규화
--   - 역할 판별: auth.uid()의 current_mode ('보호자'/'유치원') + kindergartens 소유 여부
--   - 기존 방 검색: guardian_id + kindergarten_id 조합 (UNIQUE 패턴)
--   - 비활성 방 복원: status = '비활성' → '활성'으로 전환 (is_new = false)
--   - SECURITY DEFINER: chat_room_members에 INSERT RLS가 없으므로 필수
--
-- [RLS 영향 분석]
--   4개 테이블 참조:
--
--   ① members
--      정책: members_select_app — USING (id = auth.uid()) — 본인만
--      영향: 본인 current_mode 조회는 통과.
--            상대방 정보 조회는 차단됨.
--      해결: ✅ SECURITY DEFINER이므로 RLS 자체가 우회됨.
--            함수 내부에서 auth.uid() 수동 검증으로 안전성 보장.
--
--   ② kindergartens
--      정책: kindergartens_select_app — USING (true) — 전체 공개
--      통과: ✅
--
--   ③ chat_rooms
--      정책: chat_rooms_select_app — USING (EXISTS(chat_room_members ...))
--      영향: 새 방 생성 시 아직 멤버가 없으므로 SELECT 차단
--      해결: ✅ SECURITY DEFINER로 우회
--
--   ④ chat_room_members
--      정책: SELECT — USING (member_id = auth.uid())
--             INSERT — ❌ 정책 없음 (의도적)
--             UPDATE — USING (member_id = auth.uid())
--      영향: INSERT 불가 (RLS 차단)
--      해결: ✅ SECURITY DEFINER로 우회
--
--   SECURITY DEFINER 사용 이유:
--     1. chat_room_members에 INSERT RLS가 의도적으로 없음
--        → SECURITY INVOKER로는 멤버 추가 불가
--     2. 채팅방 생성은 반드시 2명의 멤버를 동시에 INSERT해야 함
--        → 한 쪽은 auth.uid()가 아닌 상대방 (RLS 통과 불가)
--     3. chat_rooms 조회 시 아직 멤버가 없는 상태에서
--        guardian_id+kindergarten_id 중복 검사 필요 → RLS 차단
--
--   ※ STEP4_WORK_PLAN.md §3-6: "4-8만 SECURITY DEFINER" 명시
--   ※ APP_MIGRATION_GUIDE.md §14-3: SECURITY DEFINER 필수 사유 설명
-- ============================================================


-- ============================================================
-- STEP 0: chat_rooms UNIQUE 제약 추가 (guardian_id + kindergarten_id)
-- ============================================================
-- 동일 보호자+유치원 조합의 채팅방을 DB 레벨에서 1개로 제한.
-- 이 제약이 없으면:
--   1. 동시 요청 시 중복 방 생성 가능 (SELECT→INSERT 사이 gap)
--   2. EXCEPTION WHEN unique_violation이 발생하지 않아
--      race condition 안전망이 무의미해짐
--
-- IF NOT EXISTS 패턴: 이미 존재하면 무시 (재실행 안전)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chat_rooms_guardian_kindergarten_unique'
      AND conrelid = 'public.chat_rooms'::regclass
  ) THEN
    ALTER TABLE public.chat_rooms
      ADD CONSTRAINT chat_rooms_guardian_kindergarten_unique
      UNIQUE (guardian_id, kindergarten_id);
    RAISE NOTICE '[44-14] chat_rooms UNIQUE 제약 추가 완료: (guardian_id, kindergarten_id)';
  ELSE
    RAISE NOTICE '[44-14] chat_rooms UNIQUE 제약 이미 존재: chat_rooms_guardian_kindergarten_unique';
  END IF;
END $$;


-- 기존 함수 제거 (재실행 안전)
DROP FUNCTION IF EXISTS public.app_create_chat_room(uuid);


-- ============================================================
-- 함수 정의
-- ============================================================
CREATE OR REPLACE FUNCTION public.app_create_chat_room(
  p_target_member_id  uuid            -- 상대방 회원 ID (채팅 상대)
)
RETURNS json
LANGUAGE plpgsql
VOLATILE                                 -- INSERT/UPDATE 수행
SECURITY DEFINER                         -- chat_room_members INSERT RLS 부재 → 우회 필수
SET search_path = public
AS $$
DECLARE
  v_current_uid       uuid;
  v_current_mode      text;
  v_target_mode       text;
  v_guardian_id        uuid;              -- 보호자 멤버 ID
  v_kindergarten_id   uuid;              -- 유치원 테이블 ID (members.id 아님)
  v_existing_room_id  uuid;
  v_existing_status   text;
  v_new_room_id       uuid;
  v_target_kg_id      uuid;              -- 상대방이 유치원일 때의 유치원 ID
BEGIN
  -- ──────────────────────────────────────────────────────
  -- 1. 호출자 인증 확인 (SECURITY DEFINER이므로 수동 검증 필수)
  -- ──────────────────────────────────────────────────────
  v_current_uid := auth.uid();

  IF v_current_uid IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', '인증이 필요합니다'
    );
  END IF;

  -- ──────────────────────────────────────────────────────
  -- 2. 입력값 검증
  -- ──────────────────────────────────────────────────────
  IF p_target_member_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', '상대방 회원 ID가 필요합니다'
    );
  END IF;

  -- 자기 자신에게 채팅 시도 방지
  IF p_target_member_id = v_current_uid THEN
    RETURN json_build_object(
      'success', false,
      'error', '자기 자신과 채팅방을 생성할 수 없습니다'
    );
  END IF;

  -- ──────────────────────────────────────────────────────
  -- 3. 호출자 역할 판별 (current_mode)
  --    보호자: current_mode = '보호자'
  --    유치원: current_mode = '유치원' + kindergartens.member_id = auth.uid()
  -- ──────────────────────────────────────────────────────
  SELECT m.current_mode
  INTO v_current_mode
  FROM members m
  WHERE m.id = v_current_uid;

  IF v_current_mode IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', '회원 정보를 찾을 수 없습니다'
    );
  END IF;

  -- 상대방 존재 및 역할 확인
  SELECT m.current_mode
  INTO v_target_mode
  FROM members m
  WHERE m.id = p_target_member_id
    AND m.status = '정상';

  IF v_target_mode IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', '상대방 회원을 찾을 수 없거나 이용이 제한된 회원입니다'
    );
  END IF;

  -- 보호자↔유치원 채팅만 허용 (동일 역할 간 채팅 금지)
  IF v_current_mode = v_target_mode THEN
    RETURN json_build_object(
      'success', false,
      'error', '보호자와 유치원 사이에서만 채팅방을 생성할 수 있습니다'
    );
  END IF;

  -- ──────────────────────────────────────────────────────
  -- 4. guardian_id / kindergarten_id 결정
  --    chat_rooms.guardian_id = 보호자의 members.id
  --    chat_rooms.kindergarten_id = kindergartens.id (유치원 테이블 PK)
  -- ──────────────────────────────────────────────────────
  IF v_current_mode = '보호자' THEN
    -- 호출자가 보호자, 상대방이 유치원
    v_guardian_id := v_current_uid;

    -- 상대방(유치원 운영자)의 kindergartens.id 조회
    SELECT kg.id
    INTO v_kindergarten_id
    FROM kindergartens kg
    WHERE kg.member_id = p_target_member_id
    LIMIT 1;

    IF v_kindergarten_id IS NULL THEN
      RETURN json_build_object(
        'success', false,
        'error', '상대방의 유치원 정보를 찾을 수 없습니다'
      );
    END IF;

  ELSE
    -- 호출자가 유치원, 상대방이 보호자
    v_guardian_id := p_target_member_id;

    -- 호출자(유치원 운영자)의 kindergartens.id 조회
    SELECT kg.id
    INTO v_kindergarten_id
    FROM kindergartens kg
    WHERE kg.member_id = v_current_uid
    LIMIT 1;

    IF v_kindergarten_id IS NULL THEN
      RETURN json_build_object(
        'success', false,
        'error', '유치원 정보를 찾을 수 없습니다. 유치원 등록이 필요합니다'
      );
    END IF;
  END IF;

  -- ──────────────────────────────────────────────────────
  -- 5. 기존 방 검색 (guardian_id + kindergarten_id 조합)
  --    방이 이미 있으면:
  --      - status='활성': 기존 방 반환 (is_new=false)
  --      - status='비활성': 활성으로 복원 후 반환 (is_new=false)
  --    방이 없으면: 신규 생성 (is_new=true)
  -- ──────────────────────────────────────────────────────
  SELECT cr.id, cr.status
  INTO v_existing_room_id, v_existing_status
  FROM chat_rooms cr
  WHERE cr.guardian_id = v_guardian_id
    AND cr.kindergarten_id = v_kindergarten_id
  LIMIT 1;

  IF v_existing_room_id IS NOT NULL THEN
    -- 기존 방이 존재

    IF v_existing_status = '비활성' THEN
      -- 비활성 방 복원 (나갔다가 다시 대화 시작)
      UPDATE chat_rooms
      SET status = '활성',
          updated_at = now()
      WHERE id = v_existing_room_id;
    END IF;

    -- 기존 방 반환
    RETURN json_build_object(
      'success', true,
      'data', json_build_object(
        'room_id', v_existing_room_id,
        'is_new', false
      )
    );
  END IF;

  -- ──────────────────────────────────────────────────────
  -- 6. 신규 채팅방 생성
  -- ──────────────────────────────────────────────────────
  INSERT INTO chat_rooms (
    guardian_id,
    kindergarten_id,
    status,
    total_message_count,
    has_report,
    created_at,
    updated_at
  ) VALUES (
    v_guardian_id,
    v_kindergarten_id,
    '활성',
    0,
    false,
    now(),
    now()
  )
  RETURNING id INTO v_new_room_id;

  -- ──────────────────────────────────────────────────────
  -- 7. chat_room_members 2건 INSERT (보호자 + 유치원)
  --    ※ INSERT RLS가 의도적으로 없으므로 SECURITY DEFINER 필수
  -- ──────────────────────────────────────────────────────

  -- 보호자 멤버
  INSERT INTO chat_room_members (
    chat_room_id,
    member_id,
    role,
    is_muted,
    joined_at,
    updated_at
  ) VALUES (
    v_new_room_id,
    v_guardian_id,
    '보호자',
    false,
    now(),
    now()
  );

  -- 유치원 멤버 (kindergartens.member_id = 유치원 운영자의 members.id)
  INSERT INTO chat_room_members (
    chat_room_id,
    member_id,
    role,
    is_muted,
    joined_at,
    updated_at
  ) VALUES (
    v_new_room_id,
    CASE WHEN v_current_mode = '유치원' THEN v_current_uid ELSE p_target_member_id END,
    '유치원',
    false,
    now(),
    now()
  );

  -- ──────────────────────────────────────────────────────
  -- 8. 성공 응답 (신규 생성)
  -- ──────────────────────────────────────────────────────
  RETURN json_build_object(
    'success', true,
    'data', json_build_object(
      'room_id', v_new_room_id,
      'is_new', true
    )
  );

EXCEPTION
  WHEN unique_violation THEN
    -- guardian_id + kindergarten_id 중복 (동시 요청 시 race condition)
    -- → 기존 방 조회하여 반환
    SELECT cr.id
    INTO v_existing_room_id
    FROM chat_rooms cr
    WHERE cr.guardian_id = v_guardian_id
      AND cr.kindergarten_id = v_kindergarten_id
    LIMIT 1;

    IF v_existing_room_id IS NOT NULL THEN
      RETURN json_build_object(
        'success', true,
        'data', json_build_object(
          'room_id', v_existing_room_id,
          'is_new', false
        )
      );
    END IF;

    RETURN json_build_object(
      'success', false,
      'error', '채팅방 생성 중 충돌이 발생했습니다. 다시 시도해주세요'
    );

  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;


-- ============================================================
-- 함수 소유자 및 권한
-- ============================================================
ALTER FUNCTION public.app_create_chat_room(uuid) OWNER TO postgres;

-- authenticated 역할에만 실행 허용
GRANT EXECUTE ON FUNCTION public.app_create_chat_room(uuid)
  TO authenticated;

-- anon 역할 명시적 차단
REVOKE EXECUTE ON FUNCTION public.app_create_chat_room(uuid)
  FROM anon;


-- ============================================================
-- 함수 코멘트
-- ============================================================
COMMENT ON FUNCTION public.app_create_chat_room(uuid) IS
  '채팅방 생성 — 보호자↔유치원 1:1 채팅방 생성 또는 기존 방 반환. '
  '원본: chat.php → create_room. '
  'auth.uid() → 호출자 역할 자동 판별 (current_mode). '
  'p_target_member_id만 전달 — guardian_id/kindergarten_id 자동 결정. '
  'SECURITY DEFINER: chat_room_members INSERT RLS 부재 → 우회 필수. '
  '중복 검사: guardian_id + kindergarten_id 조합 (동일 조합은 1개 방만). '
  '비활성 방 복원: status=비활성 → 활성으로 전환 (is_new=false). '
  'race condition 처리: unique_violation 시 기존 방 반환. '
  '반환: json { success, data: { room_id, is_new } }. '
  '보호자↔유치원만 허용 (동일 역할 간 채팅 금지).';


-- ============================================================
-- 완료 알림
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE '[44-14] app_create_chat_room 함수 생성 완료';
  RAISE NOTICE '  - 인자: p_target_member_id (uuid) — 채팅 상대방 회원 ID';
  RAISE NOTICE '  - 반환: json {success, data: {room_id, is_new}}';
  RAISE NOTICE '  - 보안: SECURITY DEFINER + auth.uid() 수동 검증';
  RAISE NOTICE '  - 로직: guardian_id+kindergarten_id 중복 검사 → 기존 방 반환 또는 신규 생성';
  RAISE NOTICE '  - 비활성 방 복원: status=비활성 → 활성 전환';
  RAISE NOTICE '  - chat_room_members: 2건 동시 INSERT (보호자 + 유치원)';
  RAISE NOTICE '  - race condition: unique_violation → 기존 방 반환';
  RAISE NOTICE '  ';
  RAISE NOTICE '  [사전 조건]';
  RAISE NOTICE '    ① 43_01_app_rls_policies.sql (chat_rooms/chat_room_members RLS)';
  RAISE NOTICE '    ② chat_rooms, chat_room_members, kindergartens 테이블';
  RAISE NOTICE '    ③ chat_rooms UNIQUE (guardian_id, kindergarten_id) — 이 파일에서 자동 추가';
  RAISE NOTICE '  ';
  RAISE NOTICE '  [앱 호출 예시]';
  RAISE NOTICE '  const { data } = await supabase.rpc(''app_create_chat_room'', {';
  RAISE NOTICE '    p_target_member_id: ''상대방-UUID''';
  RAISE NOTICE '  });';
  RAISE NOTICE '  // data.data => {room_id: UUID, is_new: boolean}';
END $$;
