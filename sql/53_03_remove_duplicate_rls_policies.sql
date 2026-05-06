-- ============================================================
-- PART 3: 중복 RLS 정책 제거 (안전한 것만)
-- 
-- 실행 순서: 3번째 (인덱스 생성 + ANALYZE 이후 실행)
-- 
-- ⚠️ 중요: 아래 테이블은 _all_admin(FOR ALL) + _select_admin(FOR SELECT)
--    2종이 존재합니다. _all_admin이 SELECT를 이미 포함하므로
--    _select_admin만 제거하면 중복 is_admin() 호출이 줄어듭니다.
--    _all_admin은 반드시 유지해야 관리자 INSERT/UPDATE/DELETE가 보장됩니다.
--    
--    _all_admin이 없는 테이블(members, kindergartens, pets, reservations,
--    payments, chat_rooms 등)은 _select_admin을 지우면
--    관리자가 해당 테이블을 조회할 수 없게 되므로 제거하지 않습니다.
--
-- 대상 테이블 (_all_admin + _select_admin 2종 모두 존재하는 것만):
--   banners, app_settings, checklist_items, checklists,
--   education_topics, education_quizzes, faqs, notices,
--   pledges, pledge_items, terms, term_versions
-- ============================================================

-- ────────────────────────────────────────
-- _select_admin 제거 (_all_admin(FOR ALL)이 SELECT를 이미 커버)
-- ────────────────────────────────────────
DROP POLICY IF EXISTS "app_settings_select_admin" ON app_settings;
DROP POLICY IF EXISTS "banners_select_admin" ON banners;
DROP POLICY IF EXISTS "checklist_items_select_admin" ON checklist_items;
DROP POLICY IF EXISTS "checklists_select_admin" ON checklists;
DROP POLICY IF EXISTS "education_topics_select_admin" ON education_topics;
DROP POLICY IF EXISTS "education_quizzes_select_admin" ON education_quizzes;
DROP POLICY IF EXISTS "faqs_select_admin" ON faqs;
DROP POLICY IF EXISTS "notices_select_admin" ON notices;
DROP POLICY IF EXISTS "pledges_select_admin" ON pledges;
DROP POLICY IF EXISTS "pledge_items_select_admin" ON pledge_items;
DROP POLICY IF EXISTS "terms_select_admin" ON terms;
DROP POLICY IF EXISTS "term_versions_select_admin" ON term_versions;
