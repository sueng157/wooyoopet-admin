-- ============================================================
-- SQL 44-15: app_get_chat_rooms RPC 함수
-- ============================================================
-- 실행 방법: Supabase SQL Editor에 전체 복사하여 실행
-- 원본 PHP: chat.php → get_rooms
-- 용도: 채팅방 목록 조회 (채팅 탭 화면)
-- 보안: SECURITY INVOKER — RLS 자동 적용 + internal VIEW로 상대방 프로필 안전 조회
-- ============================================================
--
-- [사전 조건]
--   ① sql/44_00_app_public_views.sql 실행 완료 (internal.members_public_profile VIEW)
--   ② sql/43_01_app_rls_policies.sql 실행 완료 (chat 관련 RLS 정책 전체)
--   ③ sql/44_14_app_rpc_create_chat_room.sql 실행 완료 (채팅방 생성 RPC)
--   ④ chat_rooms, chat_room_members, chat_messages, chat_room_reservations 테이블
--
-- [PHP 원본 로직 (chat.php → get_rooms)]
--   파라미터: mb_id (전화번호), is_unread (필터)
--   1️⃣ room_members JOIN room WHERE mb_id 조회
--   2️⃣ 각 방마다 unread_count 서브쿼리 (chat.id > last_read_message_id)
--   3️⃣ 각 방마다 최신 메시지 N+1 쿼리
--   4️⃣ 각 방마다 상대방 멤버 정보 N+1 쿼리 (relationMemeber)
--   반환: data[] { room정보 + unread_count + is_muted + last_message + members }
--
--   원본 문제점:
--     - mb_id 파라미터만으로 접근 제어 (타인 채팅 목록 조회 가능)
--     - N+1 쿼리 3중첩 (방별 → 메시지 + 멤버)
--     - chat.id (auto_increment INT) 비교로 미읽음 카운트 → UUID v4에서는 불가능
--     - room.deleted_at 소프트 삭제 (Supabase에서는 status 컬럼으로 관리)
--
-- [Supabase 전환]
--   - mb_id → auth.uid() 자동 조회 (파라미터 불필요)
--   - N+1 → 단일 쿼리 (서브쿼리 + LEFT JOIN)
--   - chat.id 비교 → created_at 타임스탬프 비교 (UUID v4 정렬 불가)
--   - room.deleted_at → chat_rooms.status 필터 (활성만)
--   - 상대방 프로필: chat_rooms FK(guardian_id/kindergarten_id)로 도출
--     + kindergartens.member_id 조회 + internal.members_public_profile VIEW
--     (chat_room_members RLS가 상대방 행 SELECT를 차단하므로 FK로 우회)
--   - reservation_count: chat_room_reservations 서브쿼리 추가
--   - last_message_type: 최신 메시지의 message_type 서브쿼리 추가
--
-- [⚠️ UUID v4 정렬 금지 — STEP4_WORK_PLAN.md §5-1 ⚠️1]
--   Supabase의 gen_random_uuid()는 UUID v4(랜덤)를 생성한다.
--   UUID v4는 시간 순서가 아니므로 cm.id > crm.last_read_message_id 비교는
--   정확한 미읽음 카운트를 보장하지 못한다.
--
--   올바른 방법: created_at 타임스탬프 비교
--     WHERE cm.created_at > COALESCE(
--       (SELECT cm2.created_at FROM chat_messages cm2
--        WHERE cm2.id = crm.last_read_message_id),
--       '1970-01-01T00:00:00Z'::timestamptz
--     )
--
-- [RLS 영향 분석]
--   5개 테이블/VIEW 참조:
--
--   ① chat_room_members
--      정책: chat_room_members_select_app — USING (member_id = auth.uid())
--      통과: ✅ 본인 참여 정보만 조회 (is_muted, last_read_message_id)
--      ⚠️ 상대방 chat_room_members 행은 RLS에 의해 차단됨
--      → 상대방 ID/역할은 chat_rooms의 guardian_id/kindergarten_id에서 도출
--
--   ② chat_rooms
--      정책: chat_rooms_select_app — USING (EXISTS(chat_room_members ...))
--      통과: ✅ 본인 참여 방만 조회 (chat_room_members를 통한 간접 검증)
--      → guardian_id (보호자 ID), kindergarten_id (유치원 FK)로 상대방 판별
--
--   ③ chat_messages
--      정책: chat_messages_select_app — USING (EXISTS(chat_room_members ...))
--      통과: ✅ 참여 채팅방의 메시지만 조회 가능
--
--   ④ chat_room_reservations
--      정책: chat_room_reservations_select_app — USING (EXISTS(chat_room_members ...))
--      통과: ✅ 참여 채팅방의 예약 연결만 조회 가능
--
--   ⑤ kindergartens
--      정책: kindergartens_select_app — USING (true) — 전체 공개
--      통과: ✅ 유치원의 member_id 조회 (상대방이 유치원일 때)
--
--   ⑥ members (→ internal.members_public_profile VIEW)
--      정책: members_select_app — USING (id = auth.uid()) — 본인만
--      통과: ❌ 상대방 프로필 조회 차단
--      해결: ✅ internal.members_public_profile VIEW 사용
--             (SECURITY DEFINER VIEW로 RLS 우회, 9 안전 컬럼만 노출)
--
--   RLS 충돌: 1건 (members) → internal VIEW 1개로 해결
--   상대방 정보 도출: chat_rooms FK → kindergartens.member_id → internal VIEW
--   SECURITY INVOKER 적합성: ✅ (모든 테이블 RLS 통과 또는 VIEW 우회)
-- ============================================================


-- 기존 함수 제거 (재실행 안전)
DROP FUNCTION IF EXISTS public.app_get_chat_rooms();


-- ============================================================
-- 함수 정의
-- ============================================================
CREATE OR REPLACE FUNCTION public.app_get_chat_rooms()
RETURNS json
LANGUAGE plpgsql
STABLE                                   -- 읽기 전용 함수
SECURITY INVOKER                         -- RLS 적용 (호출자 권한)
SET search_path = public
AS $$
DECLARE
  v_current_uid   uuid;
  v_result_json   json;
BEGIN
  -- ──────────────────────────────────────────────────────
  -- 1. 호출자 인증 확인
  -- ──────────────────────────────────────────────────────
  v_current_uid := auth.uid();

  IF v_current_uid IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', '인증이 필요합니다'
    );
  END IF;

  -- ──────────────────────────────────────────────────────
  -- 2. 채팅방 목록 조회
  --    chat_room_members → chat_rooms JOIN
  --    + 상대방 프로필 (internal VIEW)
  --    + 미읽음 카운트 (created_at 타임스탬프 비교)
  --    + 최신 메시지 타입 (서브쿼리)
  --    + 예약 건수 (chat_room_reservations 서브쿼리)
  --
  --    정렬: last_message_at DESC (최근 대화 순)
  --    필터: status = '활성' (비활성 방 제외)
  -- ──────────────────────────────────────────────────────
  SELECT COALESCE(
    json_agg(row_data ORDER BY row_last_message_at DESC NULLS LAST),
    '[]'::json
  )
  INTO v_result_json
  FROM (
    SELECT
      -- 정렬 키 (json_agg ORDER BY용 — 최종 JSON에는 포함하지 않음)
      cr.last_message_at AS row_last_message_at,

      -- 결과 JSON 빌드
      json_build_object(
        'room_id', cr.id,
        'status', cr.status,
        'last_message', cr.last_message,
        'last_message_at', cr.last_message_at,

        -- last_message_type: 가장 최근 비시스템 메시지의 타입
        -- chat_rooms 테이블에 last_message_type 컬럼이 없으므로 서브쿼리로 조회
        'last_message_type', (
          SELECT cm_last.message_type
          FROM chat_messages cm_last
          WHERE cm_last.chat_room_id = cr.id
            AND cm_last.sender_type <> '시스템'
          ORDER BY cm_last.created_at DESC
          LIMIT 1
        ),

        -- 미읽음 카운트 (⚠️ UUID v4 비교 금지 — created_at 타임스탬프 사용)
        -- last_read_message_id가 NULL이면 epoch 기준 (모든 메시지 미읽음)
        'unread_count', (
          SELECT COUNT(*)::int
          FROM chat_messages cm_unread
          WHERE cm_unread.chat_room_id = cr.id
            AND cm_unread.sender_id <> v_current_uid
            AND cm_unread.sender_type <> '시스템'
            AND cm_unread.created_at > COALESCE(
              (SELECT cm_ref.created_at
               FROM chat_messages cm_ref
               WHERE cm_ref.id = my_membership.last_read_message_id),
              '1970-01-01T00:00:00Z'::timestamptz
            )
        ),

        'is_muted', COALESCE(my_membership.is_muted, false),

        -- 상대방 프로필 (chat_rooms FK로 상대방 ID 도출 + internal VIEW)
        -- ⚠️ chat_room_members RLS(member_id = auth.uid())로 상대방 행 조회 불가
        -- → chat_rooms.guardian_id / kindergarten_id + kindergartens.member_id로 도출
        -- 내가 보호자 → 상대방 = 유치원 운영자 (kindergartens.member_id)
        -- 내가 유치원 → 상대방 = 보호자 (guardian_id)
        'opponent', CASE
          WHEN my_membership.role = '보호자' THEN (
            -- 내가 보호자 → 상대방은 유치원 운영자
            SELECT json_build_object(
              'id', kg.member_id,
              'nickname', mp.nickname,
              'profile_image', mp.profile_image,
              'role', '유치원'
            )
            FROM kindergartens kg
            LEFT JOIN internal.members_public_profile mp
              ON mp.id = kg.member_id
            WHERE kg.id = cr.kindergarten_id
          )
          ELSE (
            -- 내가 유치원 → 상대방은 보호자 (guardian_id)
            SELECT json_build_object(
              'id', cr.guardian_id,
              'nickname', mp.nickname,
              'profile_image', mp.profile_image,
              'role', '보호자'
            )
            FROM internal.members_public_profile mp
            WHERE mp.id = cr.guardian_id
          )
        END,

        -- 예약 건수 (연결된 예약 수)
        'reservation_count', (
          SELECT COUNT(*)::int
          FROM chat_room_reservations crr
          WHERE crr.chat_room_id = cr.id
        )
      ) AS row_data

    FROM chat_room_members my_membership
    JOIN chat_rooms cr ON cr.id = my_membership.chat_room_id
    WHERE my_membership.member_id = v_current_uid
      AND cr.status = '활성'
  ) sub;

  -- ──────────────────────────────────────────────────────
  -- 3. 성공 응답
  -- ──────────────────────────────────────────────────────
  RETURN json_build_object(
    'success', true,
    'data', v_result_json
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;


-- ============================================================
-- 함수 권한 부여
-- ============================================================
-- authenticated 역할에만 실행 허용
GRANT EXECUTE ON FUNCTION public.app_get_chat_rooms()
  TO authenticated;

-- anon 역할 명시적 차단
REVOKE EXECUTE ON FUNCTION public.app_get_chat_rooms()
  FROM anon;


-- ============================================================
-- 함수 코멘트
-- ============================================================
COMMENT ON FUNCTION public.app_get_chat_rooms() IS
  '채팅방 목록 조회 — 내가 참여한 활성 채팅방 + 상대방 프로필 + 미읽음 카운트. '
  '원본: chat.php → get_rooms. '
  'auth.uid() → 자동 필터. 파라미터 없음. '
  'SECURITY INVOKER: RLS 자동 적용 + internal.members_public_profile VIEW로 상대방 조회. '
  '미읽음 카운트: created_at 타임스탬프 비교 (UUID v4 직접 비교 금지). '
  'last_message_type: chat_messages 서브쿼리 (chat_rooms에 컬럼 부재). '
  'reservation_count: chat_room_reservations COUNT. '
  '정렬: last_message_at DESC (최근 대화 순). '
  '필터: status=활성 (비활성 방 제외). '
  '반환: json { success, data: [{ room_id, status, last_message, last_message_at, '
  'last_message_type, unread_count, is_muted, opponent: {id, nickname, profile_image, role}, '
  'reservation_count }] }.';


-- ============================================================
-- 완료 알림
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE '[44-15] app_get_chat_rooms 함수 생성 완료';
  RAISE NOTICE '  - 인자: 없음 (auth.uid() 자동 사용)';
  RAISE NOTICE '  - 반환: json {success, data: [{room_id, status, last_message, last_message_at,';
  RAISE NOTICE '          last_message_type, unread_count, is_muted, opponent, reservation_count}]}';
  RAISE NOTICE '  - 보안: SECURITY INVOKER + internal.members_public_profile VIEW';
  RAISE NOTICE '  - 미읽음: created_at 타임스탬프 비교 (UUID v4 비교 금지)';
  RAISE NOTICE '  - 정렬: last_message_at DESC (최근 대화 순)';
  RAISE NOTICE '  - 필터: status=활성만';
  RAISE NOTICE '  ';
  RAISE NOTICE '  [사전 조건]';
  RAISE NOTICE '    ① 44_00_app_public_views.sql (internal.members_public_profile VIEW)';
  RAISE NOTICE '    ② 43_01_app_rls_policies.sql (chat 관련 RLS)';
  RAISE NOTICE '    ③ 44_14_app_rpc_create_chat_room.sql (채팅방 생성 RPC)';
  RAISE NOTICE '  ';
  RAISE NOTICE '  [앱 호출 예시]';
  RAISE NOTICE '  const { data } = await supabase.rpc(''app_get_chat_rooms'');';
  RAISE NOTICE '  // data.data => [{room_id, status, last_message, last_message_at,';
  RAISE NOTICE '  //   last_message_type, unread_count, is_muted, opponent, reservation_count}]';
END $$;
