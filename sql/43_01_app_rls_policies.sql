-- ============================================================
-- SQL 43-1: 앱 사용자(authenticated)용 RLS 정책
-- ============================================================
-- 실행 방법: Supabase SQL Editor에 전체 복사하여 실행
-- 목적: 모바일 앱 사용자가 Supabase 자동 API로 직접 접근할 때
--        본인 데이터만 읽기/쓰기, 공개 데이터는 전체 읽기
-- 참조: MIGRATION_PLAN.md 섹션 6-3, 9-1
-- 전제: members.id = auth.uid() (Supabase Auth uid)
-- 주의: 기존 관리자 RLS 정책(12_phase3_functions.sql)은 절대 DROP하지 않음
--        다중 정책 = OR 평가이므로, 관리자 + 앱 정책이 공존
-- ============================================================
-- 매니저 검토 반영:
--   수정1: app_settings 테이블 RLS 추가 (누락분)
--   수정2: get_my_member_id() 헬퍼 함수 미생성, auth.uid() 직접 사용
--   수정4: payments/refunds는 member_id 직접 참조 (서브쿼리 불필요)
--   수정5: education_completions INSERT는 앱 사용자용만 추가
-- ============================================================


-- ============================================================
-- STEP 1: 회원/인증 관련 테이블
-- ============================================================

-- ── members ──────────────────────────────────────────────────
-- 본인만 조회/수정 (타인 조회는 RPC SECURITY DEFINER)
DROP POLICY IF EXISTS "members_select_app" ON members;
DROP POLICY IF EXISTS "members_update_app" ON members;

CREATE POLICY "members_select_app" ON members
  FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "members_update_app" ON members
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());


-- ── member_term_agreements ───────────────────────────────────
-- 본인 약관 동의 조회/등록
DROP POLICY IF EXISTS "member_term_agreements_select_app" ON member_term_agreements;
DROP POLICY IF EXISTS "member_term_agreements_insert_app" ON member_term_agreements;

CREATE POLICY "member_term_agreements_select_app" ON member_term_agreements
  FOR SELECT
  USING (member_id = auth.uid());

CREATE POLICY "member_term_agreements_insert_app" ON member_term_agreements
  FOR INSERT
  WITH CHECK (member_id = auth.uid());


-- ── member_blocks ────────────────────────────────────────────
-- 본인이 차단한 목록 관리
DROP POLICY IF EXISTS "member_blocks_select_app" ON member_blocks;
DROP POLICY IF EXISTS "member_blocks_insert_app" ON member_blocks;
DROP POLICY IF EXISTS "member_blocks_delete_app" ON member_blocks;

CREATE POLICY "member_blocks_select_app" ON member_blocks
  FOR SELECT
  USING (blocker_id = auth.uid());

CREATE POLICY "member_blocks_insert_app" ON member_blocks
  FOR INSERT
  WITH CHECK (blocker_id = auth.uid());

CREATE POLICY "member_blocks_delete_app" ON member_blocks
  FOR DELETE
  USING (blocker_id = auth.uid());


-- ============================================================
-- STEP 2: 유치원/반려동물
-- ============================================================

-- ── kindergartens ────────────────────────────────────────────
-- 전체 공개 조회, 본인 소유만 등록/수정
DROP POLICY IF EXISTS "kindergartens_select_app" ON kindergartens;
DROP POLICY IF EXISTS "kindergartens_insert_app" ON kindergartens;
DROP POLICY IF EXISTS "kindergartens_update_app" ON kindergartens;

CREATE POLICY "kindergartens_select_app" ON kindergartens
  FOR SELECT
  USING (true);

CREATE POLICY "kindergartens_insert_app" ON kindergartens
  FOR INSERT
  WITH CHECK (member_id = auth.uid());

CREATE POLICY "kindergartens_update_app" ON kindergartens
  FOR UPDATE
  USING (member_id = auth.uid())
  WITH CHECK (member_id = auth.uid());


-- ── kindergarten_resident_pets ───────────────────────────────
-- 전체 공개 읽기 (유치원 상세 페이지에 포함)
DROP POLICY IF EXISTS "kindergarten_resident_pets_select_app" ON kindergarten_resident_pets;

CREATE POLICY "kindergarten_resident_pets_select_app" ON kindergarten_resident_pets
  FOR SELECT
  USING (true);


-- ── pets ─────────────────────────────────────────────────────
-- 본인 반려동물만 직접 조회/등록/수정 (타인 조회는 RPC SECURITY DEFINER)
DROP POLICY IF EXISTS "pets_select_app" ON pets;
DROP POLICY IF EXISTS "pets_insert_app" ON pets;
DROP POLICY IF EXISTS "pets_update_app" ON pets;

CREATE POLICY "pets_select_app" ON pets
  FOR SELECT
  USING (member_id = auth.uid());

CREATE POLICY "pets_insert_app" ON pets
  FOR INSERT
  WITH CHECK (member_id = auth.uid());

CREATE POLICY "pets_update_app" ON pets
  FOR UPDATE
  USING (member_id = auth.uid())
  WITH CHECK (member_id = auth.uid());


-- ============================================================
-- STEP 3: 예약/결제/환불/정산
-- ============================================================

-- ── reservations ─────────────────────────────────────────────
-- 보호자(member_id) 또는 유치원 소유자가 접근
DROP POLICY IF EXISTS "reservations_select_app" ON reservations;
DROP POLICY IF EXISTS "reservations_insert_app" ON reservations;
DROP POLICY IF EXISTS "reservations_update_app" ON reservations;

CREATE POLICY "reservations_select_app" ON reservations
  FOR SELECT
  USING (
    member_id = auth.uid()
    OR kindergarten_id IN (
      SELECT id FROM kindergartens WHERE member_id = auth.uid()
    )
  );

CREATE POLICY "reservations_insert_app" ON reservations
  FOR INSERT
  WITH CHECK (member_id = auth.uid());

CREATE POLICY "reservations_update_app" ON reservations
  FOR UPDATE
  USING (
    member_id = auth.uid()
    OR kindergarten_id IN (
      SELECT id FROM kindergartens WHERE member_id = auth.uid()
    )
  )
  WITH CHECK (
    member_id = auth.uid()
    OR kindergarten_id IN (
      SELECT id FROM kindergartens WHERE member_id = auth.uid()
    )
  );


-- ── payments ─────────────────────────────────────────────────
-- 본인 관련 결제만 조회 (member_id 직접 참조)
-- 성능 이슈 발생 시 SECURITY DEFINER RPC로 전환 가능
DROP POLICY IF EXISTS "payments_select_app" ON payments;

CREATE POLICY "payments_select_app" ON payments
  FOR SELECT
  USING (
    member_id = auth.uid()
    OR kindergarten_id IN (
      SELECT id FROM kindergartens WHERE member_id = auth.uid()
    )
  );


-- ── refunds ──────────────────────────────────────────────────
-- 본인 관련 환불만 조회 (member_id 직접 참조)
-- 성능 이슈 발생 시 SECURITY DEFINER RPC로 전환 가능
DROP POLICY IF EXISTS "refunds_select_app" ON refunds;

CREATE POLICY "refunds_select_app" ON refunds
  FOR SELECT
  USING (
    member_id = auth.uid()
    OR kindergarten_id IN (
      SELECT id FROM kindergartens WHERE member_id = auth.uid()
    )
  );


-- ── settlement_infos ─────────────────────────────────────────
-- 본인 정산정보 조회/등록/수정
DROP POLICY IF EXISTS "settlement_infos_select_app" ON settlement_infos;
DROP POLICY IF EXISTS "settlement_infos_insert_app" ON settlement_infos;
DROP POLICY IF EXISTS "settlement_infos_update_app" ON settlement_infos;

CREATE POLICY "settlement_infos_select_app" ON settlement_infos
  FOR SELECT
  USING (member_id = auth.uid());

CREATE POLICY "settlement_infos_insert_app" ON settlement_infos
  FOR INSERT
  WITH CHECK (member_id = auth.uid());

CREATE POLICY "settlement_infos_update_app" ON settlement_infos
  FOR UPDATE
  USING (member_id = auth.uid())
  WITH CHECK (member_id = auth.uid());


-- ── settlements ──────────────────────────────────────────────
-- 본인 정산 내역 조회
DROP POLICY IF EXISTS "settlements_select_app" ON settlements;

CREATE POLICY "settlements_select_app" ON settlements
  FOR SELECT
  USING (member_id = auth.uid());


-- ============================================================
-- STEP 4: 채팅
-- ============================================================

-- ── chat_rooms ───────────────────────────────────────────────
-- 본인이 참여한 채팅방만 조회/수정 (deleted_at 설정 등)
DROP POLICY IF EXISTS "chat_rooms_select_app" ON chat_rooms;
DROP POLICY IF EXISTS "chat_rooms_update_app" ON chat_rooms;

CREATE POLICY "chat_rooms_select_app" ON chat_rooms
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM chat_room_members
      WHERE chat_room_id = chat_rooms.id
        AND member_id = auth.uid()
    )
  );

CREATE POLICY "chat_rooms_update_app" ON chat_rooms
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM chat_room_members
      WHERE chat_room_id = chat_rooms.id
        AND member_id = auth.uid()
    )
  );


-- ── chat_room_reservations ───────────────────────────────────
-- 참여 채팅방의 예약 연결 정보 조회
DROP POLICY IF EXISTS "chat_room_reservations_select_app" ON chat_room_reservations;

CREATE POLICY "chat_room_reservations_select_app" ON chat_room_reservations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM chat_room_members
      WHERE chat_room_id = chat_room_reservations.chat_room_id
        AND member_id = auth.uid()
    )
  );


-- ── chat_messages ────────────────────────────────────────────
-- 참여 채팅방의 메시지만 조회/발송
-- INSERT는 Edge Function(send-chat-message)에서도 수행하지만,
-- 자동 API로 직접 발송하는 경우도 허용
DROP POLICY IF EXISTS "chat_messages_select_app" ON chat_messages;
DROP POLICY IF EXISTS "chat_messages_insert_app" ON chat_messages;

CREATE POLICY "chat_messages_select_app" ON chat_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM chat_room_members
      WHERE chat_room_id = chat_messages.chat_room_id
        AND member_id = auth.uid()
    )
  );

CREATE POLICY "chat_messages_insert_app" ON chat_messages
  FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM chat_room_members
      WHERE chat_room_id = chat_messages.chat_room_id
        AND member_id = auth.uid()
    )
  );


-- ============================================================
-- STEP 5: 리뷰/신고
-- ============================================================

-- ── guardian_reviews ──────────────────────────────────────────
-- 전체 공개 조회, 본인 작성만 등록/수정
DROP POLICY IF EXISTS "guardian_reviews_select_app" ON guardian_reviews;
DROP POLICY IF EXISTS "guardian_reviews_insert_app" ON guardian_reviews;
DROP POLICY IF EXISTS "guardian_reviews_update_app" ON guardian_reviews;

CREATE POLICY "guardian_reviews_select_app" ON guardian_reviews
  FOR SELECT
  USING (true);

CREATE POLICY "guardian_reviews_insert_app" ON guardian_reviews
  FOR INSERT
  WITH CHECK (member_id = auth.uid());

CREATE POLICY "guardian_reviews_update_app" ON guardian_reviews
  FOR UPDATE
  USING (member_id = auth.uid())
  WITH CHECK (member_id = auth.uid());


-- ── kindergarten_reviews ─────────────────────────────────────
-- 전체 공개 조회, 본인 작성만 등록/수정
DROP POLICY IF EXISTS "kindergarten_reviews_select_app" ON kindergarten_reviews;
DROP POLICY IF EXISTS "kindergarten_reviews_insert_app" ON kindergarten_reviews;
DROP POLICY IF EXISTS "kindergarten_reviews_update_app" ON kindergarten_reviews;

CREATE POLICY "kindergarten_reviews_select_app" ON kindergarten_reviews
  FOR SELECT
  USING (true);

CREATE POLICY "kindergarten_reviews_insert_app" ON kindergarten_reviews
  FOR INSERT
  WITH CHECK (member_id = auth.uid());

CREATE POLICY "kindergarten_reviews_update_app" ON kindergarten_reviews
  FOR UPDATE
  USING (member_id = auth.uid())
  WITH CHECK (member_id = auth.uid());


-- ── reports ──────────────────────────────────────────────────
-- 본인 신고 건만 조회/등록
DROP POLICY IF EXISTS "reports_select_app" ON reports;
DROP POLICY IF EXISTS "reports_insert_app" ON reports;

CREATE POLICY "reports_select_app" ON reports
  FOR SELECT
  USING (reporter_id = auth.uid());

CREATE POLICY "reports_insert_app" ON reports
  FOR INSERT
  WITH CHECK (reporter_id = auth.uid());


-- ── noshow_records ───────────────────────────────────────────
-- 본인 노쇼 기록 조회/이의제기(UPDATE)
DROP POLICY IF EXISTS "noshow_records_select_app" ON noshow_records;
DROP POLICY IF EXISTS "noshow_records_update_app" ON noshow_records;

CREATE POLICY "noshow_records_select_app" ON noshow_records
  FOR SELECT
  USING (member_id = auth.uid());

CREATE POLICY "noshow_records_update_app" ON noshow_records
  FOR UPDATE
  USING (member_id = auth.uid())
  WITH CHECK (member_id = auth.uid());


-- ── feedbacks ────────────────────────────────────────────────
-- 본인 피드백 조회/등록
DROP POLICY IF EXISTS "feedbacks_select_app" ON feedbacks;
DROP POLICY IF EXISTS "feedbacks_insert_app" ON feedbacks;

CREATE POLICY "feedbacks_select_app" ON feedbacks
  FOR SELECT
  USING (member_id = auth.uid());

CREATE POLICY "feedbacks_insert_app" ON feedbacks
  FOR INSERT
  WITH CHECK (member_id = auth.uid());


-- ============================================================
-- STEP 6: 교육
-- ============================================================

-- ── education_topics ─────────────────────────────────────────
-- 전체 공개 조회 (교육 목록)
DROP POLICY IF EXISTS "education_topics_select_app" ON education_topics;

CREATE POLICY "education_topics_select_app" ON education_topics
  FOR SELECT
  USING (true);


-- ── education_quizzes ────────────────────────────────────────
-- 전체 공개 조회 (퀴즈 목록)
DROP POLICY IF EXISTS "education_quizzes_select_app" ON education_quizzes;

CREATE POLICY "education_quizzes_select_app" ON education_quizzes
  FOR SELECT
  USING (true);


-- ── education_completions ────────────────────────────────────
-- 본인 소유 유치원의 교육 이수 기록 조회/등록/수정
-- education_completions에는 member_id 없음, kindergarten_id로 소유자 확인
-- 수정5: 관리자 INSERT 불필요, 앱 사용자 INSERT만 추가
DROP POLICY IF EXISTS "education_completions_select_app" ON education_completions;
DROP POLICY IF EXISTS "education_completions_insert_app" ON education_completions;
DROP POLICY IF EXISTS "education_completions_update_app" ON education_completions;

CREATE POLICY "education_completions_select_app" ON education_completions
  FOR SELECT
  USING (kindergarten_id IN (
    SELECT id FROM kindergartens WHERE member_id = auth.uid()
  ));

CREATE POLICY "education_completions_insert_app" ON education_completions
  FOR INSERT
  WITH CHECK (kindergarten_id IN (
    SELECT id FROM kindergartens WHERE member_id = auth.uid()
  ));

CREATE POLICY "education_completions_update_app" ON education_completions
  FOR UPDATE
  USING (kindergarten_id IN (
    SELECT id FROM kindergartens WHERE member_id = auth.uid()
  ))
  WITH CHECK (kindergarten_id IN (
    SELECT id FROM kindergartens WHERE member_id = auth.uid()
  ));


-- ============================================================
-- STEP 7: 콘텐츠 (전체 공개 읽기 전용)
-- ============================================================

-- ── checklists ───────────────────────────────────────────────
DROP POLICY IF EXISTS "checklists_select_app" ON checklists;
CREATE POLICY "checklists_select_app" ON checklists
  FOR SELECT USING (true);

-- ── checklist_items ──────────────────────────────────────────
DROP POLICY IF EXISTS "checklist_items_select_app" ON checklist_items;
CREATE POLICY "checklist_items_select_app" ON checklist_items
  FOR SELECT USING (true);

-- ── pledges ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "pledges_select_app" ON pledges;
CREATE POLICY "pledges_select_app" ON pledges
  FOR SELECT USING (true);

-- ── pledge_items ─────────────────────────────────────────────
DROP POLICY IF EXISTS "pledge_items_select_app" ON pledge_items;
CREATE POLICY "pledge_items_select_app" ON pledge_items
  FOR SELECT USING (true);

-- ── banners ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "banners_select_app" ON banners;
CREATE POLICY "banners_select_app" ON banners
  FOR SELECT USING (true);

-- ── notices ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "notices_select_app" ON notices;
CREATE POLICY "notices_select_app" ON notices
  FOR SELECT USING (true);

-- ── faqs ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "faqs_select_app" ON faqs;
CREATE POLICY "faqs_select_app" ON faqs
  FOR SELECT USING (true);

-- ── terms ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "terms_select_app" ON terms;
CREATE POLICY "terms_select_app" ON terms
  FOR SELECT USING (true);

-- ── term_versions ────────────────────────────────────────────
DROP POLICY IF EXISTS "term_versions_select_app" ON term_versions;
CREATE POLICY "term_versions_select_app" ON term_versions
  FOR SELECT USING (true);

-- ── app_settings (수정1: 누락분 추가) ───────────────────────
-- 관리자 RLS가 기존에 없으므로 관리자용 + 앱 사용자용 모두 추가
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_settings_select_admin" ON app_settings;
DROP POLICY IF EXISTS "app_settings_all_admin" ON app_settings;
DROP POLICY IF EXISTS "app_settings_select_app" ON app_settings;

CREATE POLICY "app_settings_select_admin" ON app_settings
  FOR SELECT USING (public.is_admin());

CREATE POLICY "app_settings_all_admin" ON app_settings
  FOR ALL USING (public.is_admin());

CREATE POLICY "app_settings_select_app" ON app_settings
  FOR SELECT USING (true);


-- ============================================================
-- STEP 8: 신규 9개 테이블 (41_* 에서 생성)
-- ============================================================

-- ── fcm_tokens ───────────────────────────────────────────────
-- 본인 FCM 토큰 전체 관리
DROP POLICY IF EXISTS "fcm_tokens_select_app" ON fcm_tokens;
DROP POLICY IF EXISTS "fcm_tokens_insert_app" ON fcm_tokens;
DROP POLICY IF EXISTS "fcm_tokens_update_app" ON fcm_tokens;
DROP POLICY IF EXISTS "fcm_tokens_delete_app" ON fcm_tokens;

CREATE POLICY "fcm_tokens_select_app" ON fcm_tokens
  FOR SELECT USING (member_id = auth.uid());

CREATE POLICY "fcm_tokens_insert_app" ON fcm_tokens
  FOR INSERT WITH CHECK (member_id = auth.uid());

CREATE POLICY "fcm_tokens_update_app" ON fcm_tokens
  FOR UPDATE
  USING (member_id = auth.uid())
  WITH CHECK (member_id = auth.uid());

CREATE POLICY "fcm_tokens_delete_app" ON fcm_tokens
  FOR DELETE USING (member_id = auth.uid());


-- ── notifications ────────────────────────────────────────────
-- 본인 알림 조회/삭제만 (INSERT는 Edge Function SECURITY DEFINER)
DROP POLICY IF EXISTS "notifications_select_app" ON notifications;
DROP POLICY IF EXISTS "notifications_delete_app" ON notifications;

CREATE POLICY "notifications_select_app" ON notifications
  FOR SELECT USING (member_id = auth.uid());

CREATE POLICY "notifications_delete_app" ON notifications
  FOR DELETE USING (member_id = auth.uid());


-- ── pet_breeds ───────────────────────────────────────────────
-- 전체 공개 조회 (마스터 데이터)
DROP POLICY IF EXISTS "pet_breeds_select_app" ON pet_breeds;

CREATE POLICY "pet_breeds_select_app" ON pet_breeds
  FOR SELECT USING (true);


-- ── banks ────────────────────────────────────────────────────
-- 전체 공개 조회 (마스터 데이터)
DROP POLICY IF EXISTS "banks_select_app" ON banks;

CREATE POLICY "banks_select_app" ON banks
  FOR SELECT USING (true);


-- ── favorite_kindergartens ───────────────────────────────────
-- 본인 찜 목록 전체 관리
DROP POLICY IF EXISTS "favorite_kindergartens_select_app" ON favorite_kindergartens;
DROP POLICY IF EXISTS "favorite_kindergartens_insert_app" ON favorite_kindergartens;
DROP POLICY IF EXISTS "favorite_kindergartens_update_app" ON favorite_kindergartens;
DROP POLICY IF EXISTS "favorite_kindergartens_delete_app" ON favorite_kindergartens;

CREATE POLICY "favorite_kindergartens_select_app" ON favorite_kindergartens
  FOR SELECT USING (member_id = auth.uid());

CREATE POLICY "favorite_kindergartens_insert_app" ON favorite_kindergartens
  FOR INSERT WITH CHECK (member_id = auth.uid());

CREATE POLICY "favorite_kindergartens_update_app" ON favorite_kindergartens
  FOR UPDATE
  USING (member_id = auth.uid())
  WITH CHECK (member_id = auth.uid());

CREATE POLICY "favorite_kindergartens_delete_app" ON favorite_kindergartens
  FOR DELETE USING (member_id = auth.uid());


-- ── favorite_pets ────────────────────────────────────────────
-- 본인 찜 목록 전체 관리
DROP POLICY IF EXISTS "favorite_pets_select_app" ON favorite_pets;
DROP POLICY IF EXISTS "favorite_pets_insert_app" ON favorite_pets;
DROP POLICY IF EXISTS "favorite_pets_update_app" ON favorite_pets;
DROP POLICY IF EXISTS "favorite_pets_delete_app" ON favorite_pets;

CREATE POLICY "favorite_pets_select_app" ON favorite_pets
  FOR SELECT USING (member_id = auth.uid());

CREATE POLICY "favorite_pets_insert_app" ON favorite_pets
  FOR INSERT WITH CHECK (member_id = auth.uid());

CREATE POLICY "favorite_pets_update_app" ON favorite_pets
  FOR UPDATE
  USING (member_id = auth.uid())
  WITH CHECK (member_id = auth.uid());

CREATE POLICY "favorite_pets_delete_app" ON favorite_pets
  FOR DELETE USING (member_id = auth.uid());


-- ── chat_templates ───────────────────────────────────────────
-- 본인 커스텀 + 가이드 문구 조회, 본인 커스텀만 CUD
DROP POLICY IF EXISTS "chat_templates_select_app" ON chat_templates;
DROP POLICY IF EXISTS "chat_templates_insert_app" ON chat_templates;
DROP POLICY IF EXISTS "chat_templates_update_app" ON chat_templates;
DROP POLICY IF EXISTS "chat_templates_delete_app" ON chat_templates;

CREATE POLICY "chat_templates_select_app" ON chat_templates
  FOR SELECT
  USING (member_id = auth.uid() OR type IN ('guide_guardian', 'guide_kindergarten'));

CREATE POLICY "chat_templates_insert_app" ON chat_templates
  FOR INSERT
  WITH CHECK (member_id = auth.uid() AND type = 'custom');

CREATE POLICY "chat_templates_update_app" ON chat_templates
  FOR UPDATE
  USING (member_id = auth.uid() AND type = 'custom')
  WITH CHECK (member_id = auth.uid() AND type = 'custom');

CREATE POLICY "chat_templates_delete_app" ON chat_templates
  FOR DELETE
  USING (member_id = auth.uid() AND type = 'custom');


-- ── chat_room_members ────────────────────────────────────────
-- 본인 참여 정보만 조회/수정 (is_muted, last_read_message_id 등)
-- INSERT는 채팅방 생성 RPC(SECURITY DEFINER)에서 처리
DROP POLICY IF EXISTS "chat_room_members_select_app" ON chat_room_members;
DROP POLICY IF EXISTS "chat_room_members_update_app" ON chat_room_members;

CREATE POLICY "chat_room_members_select_app" ON chat_room_members
  FOR SELECT USING (member_id = auth.uid());

CREATE POLICY "chat_room_members_update_app" ON chat_room_members
  FOR UPDATE
  USING (member_id = auth.uid())
  WITH CHECK (member_id = auth.uid());


-- ── scheduler_history ────────────────────────────────────────
-- 앱 접근 정책 없음 (Edge Function SECURITY DEFINER 전용)
-- RLS 활성화 상태이므로 앱 사용자는 자동으로 접근 차단


-- ============================================================
-- STEP 9: 관리자 전용 테이블 (앱 정책 미추가)
-- ============================================================
-- 아래 테이블은 is_admin() 정책만 존재하며 앱 사용자 접근 불가:
--   report_logs, audit_logs, member_status_logs,
--   reservation_status_logs, settlement_info_logs,
--   kindergarten_status_logs, setting_change_logs,
--   scheduler_history
-- RLS 기본 차단 = 정책 없으면 접근 불가


-- ============================================================
-- 완료 알림
-- ============================================================

DO $$
DECLARE
  v_policy_count bigint;
BEGIN
  SELECT COUNT(*) INTO v_policy_count
  FROM pg_policies
  WHERE policyname LIKE '%_app';

  RAISE NOTICE '[43-1] 앱 사용자용 RLS 정책 적용 완료 — 총 %개 앱 정책 활성', v_policy_count;
END $$;
