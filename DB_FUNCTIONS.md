# 우유펫(WOOYOOPET) DB 함수 목록

> 최종 업데이트: 2026-03-29

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
