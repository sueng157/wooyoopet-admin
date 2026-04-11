# 기존 DB ↔ 신규 DB 전체 매핑 대조표

> 최종 업데이트: 2026-04-11
> 목적: MariaDB(기존 PHP 서버) → Supabase(신규) 테이블/컬럼 1:1 대조
> 사용법: Step 2 SQL 작성 전, 사장님과 함께 검토하여 빠진 것/잘못된 것 확인

---

## 1. 전체 테이블 매핑 한눈에 보기

### 1-1. 이미 Supabase에 존재하는 테이블 (24개)

| # | 기존 MariaDB 테이블 | 신규 Supabase 테이블 | 용도 | 비고 |
|---|---------------------|---------------------|------|------|
| 1 | g5_member (82컬럼) | **members** | 회원 (보호자+유치원) | 핵심 테이블. 82→30컬럼으로 축소 (그누보드 불필요 컬럼 제거) |
| 2 | g5_write_partner (63컬럼) | **kindergartens** | 유치원(돌봄 파트너) 정보 | 63→30+컬럼으로 축소 |
| 3 | g5_write_animal (55컬럼) | **pets** | 반려동물 | 55→15컬럼으로 축소 |
| 4 | payment_request (23컬럼) | **reservations** | 돌봄 예약(결제요청) | 컬럼명 한글화, 구조 유사 |
| 5 | inicis_payments (18컬럼) | **payments** | 결제 정보 | 구조 변경됨 (Supabase가 더 상세) |
| 6 | (payment_request.penalty 필드) | **refunds** | 환불/위약금 | MariaDB에는 별도 테이블 없었음 → Supabase에서 신규 생성 |
| 7 | settlement_info (15컬럼) | **settlement_infos** | 정산 계좌/사업자 정보 | 구조 유사 |
| 8 | g5_write_payment (16컬럼) | **settlements** | 정산 내역(건별) | 구조 변경됨 |
| 9 | room (4컬럼) | **chat_rooms** | 채팅방 | Supabase가 더 상세 (guardian_id, kindergarten_id FK) |
| 10 | chat (8컬럼) | **chat_messages** | 채팅 메시지 | 구조 유사 |
| 11 | review (type='pet') | **guardian_reviews** | 보호자→유치원 후기 | MariaDB는 하나의 review 테이블, Supabase는 2개로 분리 |
| 12 | review (type='partner') | **kindergarten_reviews** | 유치원→보호자 후기 | 위와 같음 |
| 13 | g5_write_education (40컬럼) | **education_topics** | 교육 주제 | 구조 완전 변경 (wr_content JSON → 별도 컬럼) |
| 14 | g5_write_education.wr_content (JSON 내부) | **education_quizzes** | 교육 퀴즈 | MariaDB에서는 JSON 안에 포함, Supabase에서 별도 테이블 |
| 15 | g5_quiz_solved (4컬럼) | **education_completions** | 교육 이수 기록 | 구조 변경됨 (유치원 단위 → 집계) |
| 16 | g5_shop_banner (14컬럼) | **banners** | 배너 | 구조 유사 |
| 17 | g5_write_notice (40컬럼) | **notices** | 공지사항 | 40→10컬럼으로 축소 |
| 18 | g5_write_faq (40컬럼) | **faqs** | FAQ | 40→8컬럼으로 축소 |
| 19 | g5_content (13컬럼) | **terms** | 약관/정책 | 구조 변경됨 |
| 20 | g5_app_version (6컬럼) | **app_settings** (또는 members 내) | 앱 버전/설정 | 관리 방식 검토 필요 |
| 21 | (별도 관리) | **admin_accounts** | 관리자 계정 | MariaDB에 없었음. Supabase 신규 |
| 22 | g5_write_opinion (40컬럼) | **feedbacks** | 피드백/개선의견 | 40→15컬럼으로 축소 |
| 23 | (별도 관리) | **reports** | 신고 | MariaDB에 없었음 → Supabase 신규 |
| 24 | (별도 관리) | **report_logs** | 신고 처리이력 | MariaDB에 없었음 → Supabase 신규 |

### 1-2. 추가 필요한 테이블 (12개) — Step 2에서 SQL 작성 예정

> ~~address_verifications~~ → 제거. members.address_doc_urls 컬럼으로 대체

| # | 기존 MariaDB 테이블 | 신규 Supabase 테이블 | 용도 | 비고 |
|---|---------------------|---------------------|------|------|
| 25 | fcm_token (4컬럼) | **fcm_tokens** | FCM 푸시 토큰 | 구조 유사 |
| 26 | notification (5컬럼) | **notifications** | 알림 내역 | 구조 유사 |
| 27 | animalKind (2컬럼) | **animal_kinds** | 품종 목록 (마스터) | 구조 유사 + 데이터 이관 필요 |
| 28 | bank (6컬럼) | **banks** | 은행 목록 (마스터) | 구조 유사 + 데이터 이관 필요 |
| 29 | block_user (6컬럼) | **block_users** | 사용자 차단 | Supabase에 member_blocks 이미 있으나, 앱 호환용 별도 테이블 검토 필요 |
| 30 | g5_favorite_partner (7컬럼) | **favorite_partners** | 유치원 즐겨찾기 | 구조 유사 |
| 31 | g5_favorite_animal (7컬럼) | **favorite_animals** | 반려동물 즐겨찾기 | 구조 유사 |
| 32 | message_template (6컬럼) | **message_templates** | 채팅 상용문구 | 구조 유사 |
| 33 | room_members (5컬럼) | **chat_room_members** | 채팅방 참여자 | 구조 유사 |
| 34 | payment_request_has_room (2컬럼) | **payment_request_rooms** | 결제요청↔채팅방 연결 | Supabase에 chat_room_reservations 이미 있으나, 호환성 검토 필요 |
| 35 | scheduler_history (3컬럼) | **scheduler_history** | 스케줄러 실행 이력 | 구조 동일 |
| 36 | g5_write_chat_partner_guide + g5_write_chat_user_guide (각 40컬럼) | **chat_guides** | 채팅 가이드 문구 | 2개 테이블 → 1개로 통합 (type 컬럼으로 구분) |

### 1-3. Supabase에만 있는 테이블 (관리자 페이지 전용, MariaDB에 없었음)

이 테이블들은 관리자 페이지를 만들면서 새로 설계한 것들입니다. 기존 MariaDB에는 대응 테이블이 없습니다.

| # | Supabase 테이블 | 용도 | 비고 |
|---|----------------|------|------|
| A | admin_login_logs | 관리자 로그인 이력 | 관리자 전용 |
| B | audit_logs | 감사 로그 (관리자 행동 기록) | 관리자 전용 |
| C | member_status_logs | 회원 상태 변경 로그 | 관리자 전용 |
| D | reservation_status_logs | 예약 상태 변경 로그 | 관리자 전용 |
| E | settlement_info_logs | 정산 정보 변경 로그 | 관리자 전용 |
| F | kindergarten_status_logs | 유치원 상태 변경 로그 | 관리자 전용 |
| G | setting_change_logs | 설정 변경 로그 | 관리자 전용 |
| H | member_blocks | 회원 차단 (관리자용) | ⚠️ block_users와 중복? 아래 검토 |
| I | noshow_records | 노쇼 기록 | 관리자 전용 |
| J | member_term_agreements | 약관 동의 이력 | 관리자 + 앱 |
| K | term_versions | 약관 버전 관리 | 관리자 전용 |
| L | kindergarten_resident_pets | 유치원 상주 반려동물 | 관리자 + 앱 |
| M | chat_room_reservations | 채팅방↔예약 연결 | ⚠️ payment_request_rooms와 중복? 아래 검토 |
| N | checklists + checklist_items | 체크리스트 | 관리자 전용 |
| O | pledges + pledge_items | 서약서 | 관리자 전용 |
| P | app_settings | 앱 설정 | 관리자 전용 |

### 1-4. 기존 MariaDB에만 있고, Supabase 불필요한 테이블

| 분류 | 수량 | 예시 | 이유 |
|------|------|------|------|
| 그누보드 시스템 | ~71개 | g5_config, g5_board, g5_point, g5_login | PHP CMS 프레임워크 전용 |
| 그누보드 쇼핑몰 | ~25개 | g5_shop_*, g5_wzb_* | 미사용 쇼핑몰/예약 모듈 |
| SMS 모듈 | 6개 | sms5_* | 카카오 알림톡으로 대체 |
| 레거시 채팅 | 1개 | g5_chat | 구버전 채팅. 새 chat 테이블 사용 중 |
| 건물 데이터 | 2개 | apt_buildings, buildings | 대용량. 별도 방안 필요 |
| 기타 미사용 | ~10개 | g5_write_mapv2, g5_write_gallery 등 | 앱에서 미참조 |

---

## 2. 주요 테이블별 컬럼 상세 대조

### 2-1. 회원 — g5_member (82컬럼) → members (30+컬럼)

> 기존 82개 컬럼 중 앱에서 실제 사용하는 것만 Supabase에 매핑.
> 그누보드 전용 컬럼(mb_zip1, mb_zip2, mb_recommend, mb_point 등)은 제외.

| # | MariaDB 컬럼 | MariaDB 타입 | Supabase 컬럼 | Supabase 타입 | 비고 |
|---|-------------|-------------|--------------|--------------|------|
| 1 | mb_no (PK, auto) | int | id (PK) | uuid | Supabase Auth uid |
| 2 | mb_id | varchar(20) | phone | text | 폰번호가 ID (핵심!) |
| 3 | mb_name | varchar(255) | name | text | |
| 4 | mb_nick | varchar(255) | nickname | text | |
| 5 | — | — | nickname_tag | text | Supabase 신규 (#1001 형식) |
| 6 | mb_profile1 | varchar(255) | profile_image | text | 파일명 → Storage URL |
| 7 | mb_2 | varchar(255) | birth_date | date | 주민번호 앞자리 → 생년월일 |
| 8 | mb_sex | char(1) | gender | text | 남/여 → 남성/여성 |
| 9 | mb_hp | varchar(255) | — | — | mb_id와 동일, 별도 저장 안 함 |
| 10 | mb_4 | varchar(255) | address_complex | text | 아파트/단지명 |
| 11 | mb_addr1 | varchar(255) | address_road | text | 도로명주소 |
| 12 | dong | varchar(20) | address_building_dong | text | 동 |
| 13 | ho | varchar(10) | address_building_ho | text | 호 |
| 14 | mb_5 | varchar(255) | current_mode | text | '1'→'보호자', '2'→'유치원' |
| 15 | mb_6 | varchar(255) | — | — | 찜한 강아지수 → 실시간 COUNT 조회로 대체 |
| 16 | mb_7 | varchar(255) | — | — | 찜한 유치원수 → 실시간 COUNT 조회로 대체 |
| 17 | mb_8 | varchar(255) | — | — | 용도 불명 (앱에서 미사용) |
| 18 | mb_9 | varchar(255) | — | — | 위도 (members에는 없고 kindergartens에 있음) |
| 19 | mb_10 | varchar(255) | — | — | 경도 (위와 동일) |
| 20 | mb_language | varchar(50) | — | — | ⚠️ Supabase에 아직 없음. **추가 필요?** |
| 21 | mb_app_version | varchar(10) | — | — | ⚠️ Supabase에 아직 없음. **추가 필요?** |
| 22 | chat_notify | varchar(1) | — | — | ⚠️ Supabase에 아직 없음. **추가 필요** |
| 23 | reserve_notify | varchar(1) | — | — | ⚠️ 위와 동일 |
| 24 | attendance_notify | varchar(1) | — | — | ⚠️ 위와 동일 |
| 25 | review_notify | varchar(1) | — | — | ⚠️ 위와 동일 |
| 26 | new_kinder_notify | varchar(1) | — | — | ⚠️ 위와 동일 |
| 27 | partner_name | varchar(255) | — | — | kindergartens.name으로 대체 |
| 28 | is_completed | varchar(1) | — | — | kindergartens 필드로 이동 가능 |
| 29 | is_educated | varchar(1) | — | — | education_completions에서 계산 |
| 30 | is_progress | varchar(1) | — | — | kindergartens 필드로 이동 가능 |
| 31 | degree | int | — | — | kindergartens.freshness_current |
| 32 | mb_join_status | int | status | text | 1→'정상' |
| 33 | mb_leave_status | varchar(1) | status | text | 'Y'→'탈퇴' |
| 34 | mb_leave_reason | varchar(255) | withdraw_reason | text | |
| 35 | — | — | carrier | text | Supabase 신규 (통신사) |
| 36 | — | — | identity_verified | bool | Supabase 신규 (본인인증) |
| 37 | — | — | address_auth_status | text | Supabase 신규 (주소인증 상태) |
| 38 | — | — | address_doc_urls | text[] | Supabase 신규 (주소인증 서류 이미지) |
| 39 | — | — | noshow_count | int | Supabase 신규 (노쇼 횟수) |
| 40 | — | — | noshow_sanction | text | Supabase 신규 (노쇼 제재) |

**⚠️ 추가 필요 컬럼 (Step 2에서 ALTER TABLE):**
- `language` (기본값 '한국어')
- `app_version` (기본값 '1.0')
- `chat_notify` (기본값 'Y')
- `reserve_notify` (기본값 'Y')
- `attendance_notify` (기본값 'Y')
- `review_notify` (기본값 'Y')
- `new_kinder_notify` (기본값 'Y')

---

### 2-2. 유치원 — g5_write_partner (63컬럼) → kindergartens (30+컬럼)

| # | MariaDB 컬럼 | Supabase 컬럼 | 비고 |
|---|-------------|--------------|------|
| 1 | wr_id (PK) | id | uuid로 변경 |
| 2 | mb_id | member_id (FK→members) | 폰번호→uuid 참조 |
| 3 | wr_subject | name | 유치원 이름 |
| 4 | wr_content | description | 유치원 소개 |
| 5 | wr_1 | — | has_own_pet (자체 동물) → kindergarten_resident_pets 테이블로 분리 |
| 6 | wr_2 | price_small_1h ~ price_large_pickup (12개 컬럼) | 파이프(|) 구분 문자열 → 12개 숫자 컬럼으로 분리 |
| 7 | wr_3 | — | 은행명 → settlement_infos.account_bank |
| 8 | wr_4 | — | 계좌번호 → settlement_infos.account_number |
| 9 | wr_5 | — | 교육이수 → education_completions에서 관리 |
| 10 | wr_6 | — | 등록상태(temp) → 별도 관리 or settlement_status |
| 11 | partner_img1~10 | photo_urls (text[]) | 개별 컬럼 10개 → 배열 1개 |
| 12 | freshness | freshness_current | 신선도 |
| 13 | business_status | business_status | 영업중/방학중 |
| 14 | settlement_ready | settlement_status | 0/1 → 작성중/제출됨/승인/거절 |
| 15 | mb_addr1 | address_road | 유치원 주소 |
| 16 | mb_4 | address_complex | 유치원 아파트/단지명 |
| 17 | mb_9 | — (관리자: address에서 계산) | 위도 |
| 18 | mb_10 | — | 경도 |
| 19 | mb_dong | address_building_dong | 동 |
| 20 | mb_ho | address_building_ho | 호수 |
| 21 | auth_status | address_auth_status | 인증상태 |
| 22 | — | inicis_status | Supabase 신규 (이니시스 등록상태) |
| 23 | — | inicis_submall_code | Supabase 신규 |
| 24 | — | seller_id | Supabase 신규 |

**주요 변경점:**
- 가격이 `wr_2` 하나에 파이프(`|`)로 저장 → 12개 개별 컬럼으로 분리
- 이미지 10개 개별 컬럼 → `text[]` 배열
- 은행/계좌 → `settlement_infos` 테이블로 분리
- 교육 → `education_completions` 테이블로 분리
- 이니시스 관련 → Supabase에서 신규 추가

---

### 2-3. 반려동물 — g5_write_animal (55컬럼) → pets (15컬럼)

| # | MariaDB 컬럼 | MariaDB 용도 (추정) | Supabase 컬럼 | 비고 |
|---|-------------|------|--------------|------|
| 1 | wr_id (PK) | ID | id | uuid |
| 2 | mb_id | 소유자 | member_id (FK) | 폰번호→uuid |
| 3 | wr_subject | 이름 | name | |
| 4 | wr_content | 소개 | description | |
| 5 | wr_1 | 성별 | gender | 수컷/암컷 |
| 6 | wr_2 | 품종 | breed | |
| 7 | wr_3 | 종류(분류) | — | breed에 통합? |
| 8 | wr_4 | 생년월일 | birth_date | date 타입 |
| 9 | animal_kind_mix | 믹스 여부 | — | 별도 관리 or breed에 포함 |
| 10 | wr_5 | 체중 | weight | numeric |
| 11 | wr_6 | 중성화 여부 (Y/N) | is_neutered | bool |
| 12 | wr_7 | 예방접종 여부 | is_vaccinated | bool |
| 13 | wr_8 | — (미상) | — | 용도 확인 필요 |
| 14 | wr_9 | — (미상) | — | 용도 확인 필요 |
| 15 | wr_10 | — (미상) | — | 용도 확인 필요 |
| 16 | wr_11 | — (미상) | — | 용도 확인 필요 |
| 17 | firstYN | 대표 동물 | is_representative | bool |
| 18 | deleteYN | 삭제 여부 | — | soft delete 방식 |
| 19 | animal_img1~10 | 이미지 10개 | photo_urls (text[]) | 개별 컬럼→배열 |
| 20 | — | — | size_class | 소형/중형/대형 (Supabase 신규) |

**⚠️ 확인 필요: wr_3, wr_8~wr_11의 정확한 용도** → 외주 개발자에게 확인 or 앱 코드에서 역추적

---

### 2-4. 돌봄 예약 — payment_request (23컬럼) → reservations (25+컬럼)

| # | MariaDB 컬럼 | Supabase 컬럼 | 비고 |
|---|-------------|--------------|------|
| 1 | id (PK, auto) | id | uuid |
| 2 | mb_id | member_id (FK) | 보호자 (요청자) |
| 3 | to_mb_id | kindergarten_id (FK) | 유치원 (수행자) → kindergartens 참조 |
| 4 | pet_id | pet_id (FK) | |
| 5 | start_date + start_time | checkin_scheduled | 2개 문자열 → 1개 timestamp |
| 6 | end_date + end_time | checkout_scheduled | 위와 동일 |
| 7 | price | — | payments 테이블로 이동 |
| 8 | status | status | pending→수락대기 등 한글화 |
| 9 | payment_approval_id | — | payments 테이블에서 FK로 연결 |
| 10 | reject_reason | reject_reason | |
| 11 | is_settled | — | settlements 테이블에서 관리 |
| 12 | is_review_written | — | guardian_reviews 존재 여부로 판단 |
| 13 | walk_count | walk_count | |
| 14 | pickup_dropoff | pickup_requested | tinyint→bool |
| 15 | penalty | — | refunds 테이블로 분리 |
| 16 | reminder_start_sent_at | — | ⚠️ Supabase에 아직 없음. **추가 필요** |
| 17 | reminder_end_sent_at | — | ⚠️ 위와 동일 |
| 18 | care_start_sent_at | — | ⚠️ 위와 동일 |
| 19 | care_end_sent_at | — | ⚠️ 위와 동일 |
| 20 | created_at | created_at | |
| 21 | updated_at | updated_at | |
| 22 | — | requested_at | Supabase 신규 |
| 23 | — | checkin_actual | Supabase 신규 (실제 등원시간) |
| 24 | — | checkout_actual | Supabase 신규 (실제 하원시간) |
| 25 | — | rejected_at | Supabase 신규 |

**주요 변경점:**
- 날짜+시간 분리 → 하나의 timestamp로 통합
- price, penalty → payments, refunds 테이블로 분리
- 상태값 영문 → 한글 (pending→수락대기, completed→예약확정...)
- **스케줄러용 4개 컬럼(reminder_*_sent_at, care_*_sent_at)** → 추가 필요

---

### 2-5. 결제 — inicis_payments (18컬럼) → payments (25+컬럼)

| # | MariaDB 컬럼 | Supabase 컬럼 | 비고 |
|---|-------------|--------------|------|
| 1 | id (PK) | id | uuid |
| 2 | payment_request_id | reservation_id (FK) | |
| 3 | mid | — | Supabase에서 직접 참조 안 함 |
| 4 | oid | pg_transaction_id | 주문번호 |
| 5 | tid | — | 거래번호 (raw 응답에 포함) |
| 6 | amount | amount | |
| 7 | status | status | |
| 8 | pay_type | payment_method | |
| 9 | auth_dt | paid_at | 승인일시 |
| 10 | auth_no | approval_number | 승인번호 |
| 11 | card_num | card_number | |
| 12 | card_name | card_company | |
| 13 | uname | — | members에서 JOIN |
| 14 | mode | — | 앱 내부용 |
| 15 | room_id | — | chat_room_reservations로 이동 |
| 16 | raw_response | — | 별도 저장 검토 |
| 17 | — | member_id (FK) | Supabase 신규 (결제자) |
| 18 | — | kindergarten_id (FK) | Supabase 신규 |
| 19 | — | pet_id (FK) | Supabase 신규 |
| 20 | — | care_fee, walk_fee, pickup_fee | Supabase 신규 (수수료 분리) |
| 21 | — | submall_id | Supabase 신규 (이니시스 서브몰) |
| 22 | — | payment_type | Supabase 신규 (돌봄결제/위약금) |

---

### 2-6. 채팅 — room/chat/room_members → chat_rooms/chat_messages/chat_room_members

#### chat_rooms (room → chat_rooms)

| MariaDB room | Supabase chat_rooms | 비고 |
|-------------|-------------------|------|
| id (auto) | id (uuid) | |
| name | — | MariaDB: 'mb_id-mb_id' 형식. Supabase: guardian_id + kindergarten_id FK로 대체 |
| created_at | created_at | |
| deleted_at | — | status로 관리 (활성/비활성) |
| — | guardian_id (FK) | Supabase 신규 |
| — | kindergarten_id (FK) | Supabase 신규 |
| — | status | Supabase 신규 (활성/비활성) |
| — | last_message | Supabase 신규 |
| — | last_message_at | Supabase 신규 |
| — | total_message_count | Supabase 신규 |

#### chat_messages (chat → chat_messages)

| MariaDB chat | Supabase chat_messages | 비고 |
|-------------|----------------------|------|
| id (auto) | id (uuid) | |
| room_id (FK) | chat_room_id (FK) | |
| mb_id | sender_id (FK) | 폰번호→uuid |
| — | sender_type | Supabase 신규 (보호자/유치원/시스템) |
| message_type | message_type | 유사 (텍스트/이미지/시스템 등) |
| content | content | |
| file_path | image_urls (jsonb) | 파일경로→Storage URL 배열 |
| file_type | — | image_urls에 포함 |
| created_at | created_at | |
| — | is_read (bool) | Supabase 신규 |

#### chat_room_members (room_members → 신규 생성 필요)

| MariaDB room_members | Supabase chat_room_members | 비고 |
|---------------------|--------------------------|------|
| room_id | room_id (FK) | |
| mb_id | member_id (FK) | |
| mb_5 | role | '1'→보호자, '2'→유치원 |
| last_read_message_id | last_read_message_id | |
| is_muted | is_muted | |

---

### 2-7. 정산 — settlement_info (15컬럼) → settlement_infos (25+컬럼)

| MariaDB settlement_info | Supabase settlement_infos | 비고 |
|------------------------|--------------------------|------|
| mb_id (PK) | member_id (FK) | |
| has_business | business_type | tinyint→'개인사업자'/'법인사업자'/'비사업자' |
| business_type | business_type | 위와 통합 |
| business_reg_no | business_reg_number | |
| settlement_email | operator_email | |
| bank_code | — | banks 테이블 참조 |
| account_number | account_number | |
| account_holder | account_holder | |
| status | — | inicis_status로 변경 |
| memo | — | 별도 관리 |
| rrn_front_enc | operator_ssn_masked | 암호화 방식 변경 |
| rrn_back_enc | operator_ssn_masked | 위와 통합 (마스킹) |
| — | kindergarten_id (FK) | Supabase 신규 |
| — | operator_name | Supabase 신규 |
| — | operator_birth_date | Supabase 신규 |
| — | operator_phone | Supabase 신규 |
| — | account_bank | Supabase 신규 (은행명 직접) |
| — | inicis_seller_id | Supabase 신규 |
| — | submall_code | Supabase 신규 |

---

### 2-8. 기타 소형 테이블

#### review (9컬럼) → guardian_reviews + kindergarten_reviews (각 15+컬럼)

| MariaDB review | Supabase guardian_reviews / kindergarten_reviews | 비고 |
|---------------|------------------------------------------------|------|
| id | id | |
| type | (테이블 분리로 불필요) | 'pet'→guardian_reviews, 'partner'→kindergarten_reviews |
| partner_id | kindergarten_id (FK) | |
| protector_id | member_id (FK) | |
| pet_id | pet_id (FK) | |
| content | content | |
| images | image_urls (jsonb) | JSON 문자열→jsonb |
| tags | selected_tags (jsonb) | JSON 문자열→jsonb |
| created_at | created_at | |
| — | satisfaction | Supabase 신규 (최고예요/좋았어요/아쉬워요) |
| — | reservation_id (FK) | Supabase 신규 |
| — | is_hidden | Supabase 신규 (관리자 숨김) |

#### notification (5컬럼) → notifications (동일 구조)

| MariaDB | Supabase | 비고 |
|---------|---------|------|
| id | id | |
| mb_id | member_id | |
| title | title | |
| content | content | |
| created_at | created_at | |

#### fcm_token (4컬럼) → fcm_tokens (동일 구조)

| MariaDB | Supabase | 비고 |
|---------|---------|------|
| id | id | |
| mb_id | member_id | |
| token | token | |
| created_at | created_at | |

---

## 3. 검토 필요 사항 (⚠️)

### 3-1. 중복 가능성 검토

| 주제 | 기존 Supabase | 신규 추가 예정 | 판단 필요 |
|------|-------------|-------------|----------|
| 사용자 차단 | **member_blocks** (blocker_id, blocked_id) | **block_users** (mb_id, block_mb_id) | 동일 기능. member_blocks만 사용? 또는 앱 호환용으로 둘 다? |
| 채팅방↔예약 | **chat_room_reservations** (chat_room_id, reservation_id) | **payment_request_rooms** (reservation_id, chat_room_id) | 동일 기능. chat_room_reservations만 사용하면 됨 |

### 3-2. 앱에서 필요하지만 Supabase에 아직 없는 컬럼

| 테이블 | 추가 필요 컬럼 | 용도 | PHP API 참조 |
|--------|-------------|------|-------------|
| members | language | 앱 언어 설정 | get_setting.php |
| members | app_version | 앱 버전 | get_setting.php |
| members | chat_notify | 채팅 알림 설정 (Y/N) | get/set_notify_setting.php |
| members | reserve_notify | 예약 알림 (Y/N) | 위와 동일 |
| members | attendance_notify | 등하원 알림 (Y/N) | 위와 동일 |
| members | review_notify | 리뷰 알림 (Y/N) | 위와 동일 |
| members | new_kinder_notify | 신규 유치원 알림 (Y/N) | 위와 동일 |
| reservations | reminder_start_sent_at | 등원 알림 발송 시각 | scheduler.php |
| reservations | reminder_end_sent_at | 하원 알림 발송 시각 | scheduler.php |
| reservations | care_start_sent_at | 돌봄시작 알림 시각 | scheduler.php |
| reservations | care_end_sent_at | 돌봄종료 알림 시각 | scheduler.php |

### 3-3. 반려동물 wr_3 ~ wr_11 용도 미확인

g5_write_animal 테이블의 wr_3, wr_8, wr_9, wr_10, wr_11 컬럼의 정확한 용도를 앱 코드 또는 외주 개발자에게 확인 필요.

현재 추정:
- wr_1 = 성별 (수컷/암컷)
- wr_2 = 품종
- wr_3 = 종류 (대형/중형/소형?)
- wr_4 = 생년월일
- wr_5 = 체중
- wr_6 = 중성화 (Y/N)
- wr_7 = 예방접종
- wr_8~wr_11 = **용도 미확인**

---

## 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-04-11 | 최초 작성 — 사장님 검토용 전체 매핑 대조표 |
