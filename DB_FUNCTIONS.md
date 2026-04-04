# 우유펫(WOOYOOPET) DB 함수 목록

> 최종 업데이트: 2026-04-04

---

## 1. 대시보드 관련

| 함수명 | 용도 | 반환타입 | 참조 테이블 및 컬럼 | 비고 |
|--------|------|----------|---------------------|------|
| `get_dashboard_today_stats` | 오늘의 주요 지표 (신규가입, 신규예약, 등원예정, 돌봄진행중, 결제총액, 취소환불) | `json` | `members(created_at)`, `reservations(created_at, checkin_scheduled, status)`, `payments(paid_at, amount, status)`, `refunds(requested_at)` | — |
| `get_dashboard_monthly_sales` | 이번 달 매출 현황 (돌봄결제, 위약금, 플랫폼 수수료, 유치원 정산, 전월 대비 증감률) | `json` | `payments(amount, paid_at, status)`, `refunds(penalty_amount, refund_amount, requested_at, status)` | **플랫폼 수수료율 20% 하드코딩** — 수수료율 변경 시 함수 수정 필요 |
| `get_dashboard_pending_counts` | 관리자 처리 대기 건수 (주소심사, 정산등록, 환불대기, 신고, 정산보류, 피드백) | `json` | `members(address_auth_status)`, `settlement_infos(inicis_status)`, `refunds(status)`, `reports(status)`, `settlements(status)`, `feedbacks(is_confirmed)` | — |
| `get_dashboard_recent_activity` | 최근 활동 내역 5건 (신규가입, 예약접수, 결제완료, 취소요청, 신고접수) | `json` | `members(created_at, name, current_mode, id)`, `reservations(created_at) JOIN members, kindergartens`, `payments(paid_at) JOIN members`, `refunds(requested_at) JOIN members`, `reports(created_at)` | — |

## 2. 권한 관련

| 함수명 | 용도 | 반환타입 | 참조 테이블 및 컬럼 | 비고 |
|--------|------|----------|---------------------|------|
| `is_admin` | 현재 사용자가 관리자인지 확인 | `boolean` | `admin_accounts(auth_user_id)` | `auth.uid()` 기반 조회 |
| `is_superadmin` | 현재 사용자가 최고관리자인지 확인 | `boolean` | `admin_accounts(auth_user_id, role)` | **`role = '최고관리자'` 문자열 비교** — 역할명 변경 시 함수 수정 필요 |

## 3. 검색 관련

| 함수명 | 용도 | 반환타입 | 참조 테이블 및 컬럼 | 비고 |
|--------|------|----------|---------------------|------|
| `search_reservations` | 돌봄예약 통합 검색 (날짜유형, 기간, 상태, 크기, 검색어 필터 + 페이지네이션) | `json` | `reservations(id, status, requested_at, created_at, checkin_scheduled, checkout_scheduled, walk_count, pickup_requested)`, `members(name, nickname, phone)`, `pets(name, size_class)`, `kindergartens(name, address_complex, address_building_dong)`, `payments(id, amount, status, paid_at)` | **SECURITY DEFINER + `is_admin()` 권한 체크 포함.** 모바일 앱과 DB 공유 환경에서 일반 사용자 호출 방어용. 파라미터: `p_date_type`, `p_date_from`, `p_date_to`, `p_status`, `p_size_class`, `p_search_type`, `p_search_keyword`, `p_page`, `p_per_page`. 반환: `{data: [...], count: N}` |
| `search_payments` | 결제내역 통합 검색 (결제일 기간, 결제수단, 결제상태, 금액 범위, 결제유형, 검색어 필터 + 페이지네이션) | `json` | `payments(id, pg_transaction_id, paid_at, created_at, amount, payment_method, status, reservation_id, payment_type)`, `members(nickname, phone)`, `pets(name)`, `kindergartens(name)` | **SECURITY DEFINER + `is_admin()` 권한 체크 포함.** JOIN 구조: payments(p) → members(m), LEFT JOIN pets(pt), LEFT JOIN kindergartens(k). 파라미터: `p_date_from`, `p_date_to`, `p_payment_method`, `p_status`, `p_search_type`, `p_search_keyword`, `p_amount_min`, `p_amount_max`, `p_page`, `p_per_page`, **`p_payment_type`** (DEFAULT `'돌봄'`). 검색 매핑: 보호자 닉네임→m.nickname, 유치원명→k.name, PG 거래번호→p.pg_transaction_id, 보호자 연락처→m.phone. 반환: `{data: [...], count: N}`. **변경(Phase A):** `p_payment_type` 파라미터 추가, `payment_type` 컬럼 반환. 기존 10 params 시그니처 DROP 후 11 params로 재생성 (`sql/21_rpc_payment_type_update.sql`) |
| `search_refunds` | 환불/위약금 통합 검색 (요청일 기간, 처리상태, 요청자, 검색어 필터 + 페이지네이션) | `json` | `refunds(id, requested_at, requester, refund_amount, penalty_amount, status, completed_at, payment_id, penalty_payment_id)`, `members(nickname, phone)`, `kindergartens(name)`, `reservations(pet_id)`, `pets(name)`, **`payments AS pp (penalty_payment 객체)`** | **SECURITY DEFINER + `is_admin()` 권한 체크 포함.** JOIN 구조: refunds(rf) → members(m), LEFT JOIN kindergartens(k), LEFT JOIN reservations(rv), LEFT JOIN pets(pt) via rv.pet_id, **LEFT JOIN payments(pp) ON pp.id = rf.penalty_payment_id**. 파라미터: `p_date_from`, `p_date_to`, `p_status`, `p_requester`, `p_search_type`, `p_search_keyword`, `p_page`, `p_per_page`. 검색 매핑: 보호자 닉네임→m.nickname, 보호자 연락처→m.phone, 유치원명→k.name, **위약금 결제번호→pp.pg_transaction_id** ILIKE. 반환: `{data: [..., penalty_payment: {id, pg_transaction_id, amount, payment_method, status, paid_at} | null], count: N}`. **변경(Phase A):** `penalty_payment_id`로 payments LEFT JOIN 추가, 위약금 결제번호 검색 가능 (`sql/21_rpc_payment_type_update.sql`) |
| `search_guardian_reviews` | 보호자 후기 통합 검색 (작성일 기간, 만족도, 이미지, 검색어 필터 + 페이지네이션) | `json` | `guardian_reviews(id, written_at, satisfaction, selected_tags, content, image_urls, is_hidden, reservation_id)`, `members(nickname)`, `kindergartens(name)`, `pets(name)` | **SECURITY DEFINER + `is_admin()` 권한 체크 포함.** JOIN 구조: guardian_reviews(gr) → members(m), kindergartens(kg), LEFT JOIN pets(p). 파라미터: `p_date_from`, `p_date_to`, `p_satisfaction`, `p_image_filter`, `p_search_type`, `p_search_keyword`, `p_page`, `p_per_page`. 검색 매핑: 보호자 닉네임→m.nickname, 유치원명→kg.name, 반려동물 이름→p.name. 이미지 필터: `jsonb_array_length(image_urls)`. 반환: `{data: [...], count: N}` |
| `search_kindergarten_reviews` | 유치원 후기 통합 검색 (작성일 기간, 만족도, 보호자 전용, 검색어 필터 + 페이지네이션) | `json` | `kindergarten_reviews(id, written_at, satisfaction, selected_tags, content, is_guardian_only, is_hidden, reservation_id)`, `members(nickname)`, `kindergartens(name)`, `pets(name)` | **SECURITY DEFINER + `is_admin()` 권한 체크 포함.** JOIN 구조: kindergarten_reviews(kr) → members(m), kindergartens(kg), LEFT JOIN pets(p). 파라미터: `p_date_from`, `p_date_to`, `p_satisfaction`, `p_guardian_only`, `p_search_type`, `p_search_keyword`, `p_page`, `p_per_page`. 검색 매핑: 유치원명→kg.name, 보호자 닉네임→m.nickname, 반려동물 이름→p.name. 보호자 전용 필터: `is_guardian_only` boolean. 이미지 기능 없음. 반환: `{data: [...], count: N}` |

## 4. 시스템 자동화

| 함수명 | 용도 | 반환타입 | 참조 테이블 및 컬럼 | 비고 |
|--------|------|----------|---------------------|------|
| `update_updated_at` | 레코드 수정 시 `updated_at` 자동 갱신 | `trigger` | 연결된 모든 테이블의 `updated_at` 컬럼 | **거의 모든 테이블에 트리거로 연결됨** (아래 트리거 현황 참조) |
| `set_pet_size_class` | 반려동물 등록/수정 시 `size_class` 자동 계산 | `trigger` | `pets(weight, size_class)` | **weight 기준 자동 계산** — 10kg 미만 = 소형, 10~25kg = 중형, 25kg 이상 = 대형. weight가 NULL이면 size_class도 NULL |
| `rls_auto_enable` | public 스키마에 테이블 생성 시 RLS 자동 활성화 | `event_trigger` | — | **`CREATE TABLE` 이벤트 트리거.** public 스키마에 테이블 생성 시 자동으로 RLS enable |

---

## 트리거 연결 현황

### `update_updated_at` 트리거 (BEFORE UPDATE)

| 트리거명 | 테이블명 |
|----------|----------|
| `trg_admin_accounts_updated` | `admin_accounts` |
| `trg_app_settings_updated` | `app_settings` |
| `trg_banners_updated` | `banners` |
| `trg_chat_rooms_updated` | `chat_rooms` |
| `trg_education_completions_updated` | `education_completions` |
| `trg_education_quizzes_updated` | `education_quizzes` |
| `trg_education_topics_updated` | `education_topics` |
| `trg_faqs_updated` | `faqs` |
| `trg_feedbacks_updated` | `feedbacks` |
| `trg_guardian_reviews_updated` | `guardian_reviews` |
| `trg_kindergarten_reviews_updated` | `kindergarten_reviews` |
| `trg_kindergartens_updated` | `kindergartens` |
| `trg_members_updated` | `members` |
| `trg_notices_updated` | `notices` |
| `trg_payments_updated` | `payments` |
| `trg_pets_updated` | `pets` |
| `trg_refunds_updated` | `refunds` |
| `trg_reports_updated` | `reports` |
| `trg_reservations_updated` | `reservations` |
| `trg_settlement_infos_updated` | `settlement_infos` |
| `trg_settlements_updated` | `settlements` |
| `trg_terms_updated` | `terms` |

### `set_pet_size_class` 트리거 (BEFORE INSERT / BEFORE UPDATE OF weight)

| 트리거명 | 테이블명 |
|----------|----------|
| `trg_set_pet_size_class` | `pets` |

### `rls_auto_enable` 이벤트 트리거

| 트리거 유형 | 이벤트 |
|-------------|--------|
| `event_trigger` | `CREATE TABLE` (public 스키마) |

---

## 변경 이력

| 날짜 | 내용 | 관련 SQL 파일 |
|------|------|---------------|
| 2026-03-29 | 문서 최초 작성 | — |
| 2026-03-29 | `search_reservations` 함수 추가 | `sql/13_search_reservations.sql` |
| 2026-03-29 | `set_pet_size_class` 트리거 함수 추가 | `sql/14_pets_size_class_sync.sql` |
| 2026-03-29 | `search_reservations` 유치원 주소 반환 필드 변경 (`address_road` → `address_complex` + `address_building_dong`) | `sql/13_search_reservations.sql` |
| 2026-03-29 | payments 테이블에 금액 내역 컬럼 3개 추가 (`care_fee`, `walk_fee`, `pickup_fee`) | `sql/15_payments_fee_columns.sql` |
| 2026-03-29 | reservations 테이블 상태 CHECK 제약조건에 `'관리자취소'` 추가 (8→9개 상태) | `sql/16_add_admin_cancel_status.sql` |
| 2026-03-30 | `search_payments` 함수 추가 — 결제내역 통합 검색 RPC (결제일/수단/상태/금액/검색어 필터 + 페이지네이션) | `sql/17_search_payments.sql` |
| 2026-03-30 | payments 테이블 status CHECK 제약 변경: `결제완료/취소완료/부분취소` → `결제완료/결제취소` (부분취소 삭제 — 위약금은 별도 건 처리, 기존 결제는 전액 취소 방식) | `sql/18_payments_status_check_update.sql` |
| 2026-03-30 | `search_refunds` 함수 추가 — 환불/위약금 통합 검색 RPC (요청일/처리상태/요청자/검색어 필터 + 페이지네이션). JOIN: refunds → members, kindergartens, reservations → pets | `sql/19_search_refunds.sql` |
| 2026-03-31 | **Phase A 결제 리팩터링 완료** — `search_payments`에 `p_payment_type` 파라미터 추가 (기존 시그니처 DROP), `search_refunds`에 penalty_payment JOIN 추가, `get_dashboard_monthly_sales`/`get_dashboard_today_stats` 돌봄/위약금 분리, `get_settlement_summary` 기간 필터 + 기존 시그니처 DROP | `sql/21_rpc_payment_type_update.sql` |
| 2026-04-04 | `search_guardian_reviews` 함수 추가 — 보호자 후기 통합 검색 RPC (작성일/만족도/이미지/검색어 필터 + 페이지네이션). LEFT JOIN pets (pet_id nullable) | `sql/32_search_guardian_reviews.sql` |
| 2026-04-04 | `search_kindergarten_reviews` 함수 추가 — 유치원 후기 통합 검색 RPC (작성일/만족도/보호자전용/검색어 필터 + 페이지네이션). 이미지 기능 없음. LEFT JOIN pets | `sql/33_search_kindergarten_reviews.sql` |
