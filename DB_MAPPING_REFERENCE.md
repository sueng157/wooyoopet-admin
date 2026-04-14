# 기존 DB ↔ 신규 DB 전체 매핑 대조표

> 최종 업데이트: 2026-04-13 (테이블·컬럼명 전수 교정 + 매니저 검토 반영 완료)
> 목적: MariaDB(기존 PHP 서버) → Supabase(신규) 테이블/컬럼 1:1 대조
> 사용법: Step 2 SQL 작성 전, 매니저와 함께 검토하여 빠진 것/잘못된 것 확인

---

## 1. 전체 테이블 매핑 한눈에 보기

### 1-1. 이미 Supabase에 존재하는 테이블 (24개)

| # | 기존 MariaDB 테이블 | 신규 Supabase 테이블 | 용도 | 비고 |
|---|---------------------|---------------------|------|------|
| 1 | g5_member (82컬럼) | **members** | 회원 (보호자+유치원) | 82→31컬럼으로 축소 + 신규 10컬럼 추가 예정 |
| 2 | g5_write_partner (63컬럼) | **kindergartens** | 유치원(돌봄 파트너) 정보 | 63→35컬럼으로 축소 + 신규 3컬럼 추가 예정 |
| 3 | g5_write_animal (55컬럼) | **pets** | 반려동물 | 55→14컬럼으로 축소 |
| 4 | payment_request (23컬럼) | **reservations** | 돌봄 예약(결제요청) | 컬럼명 변경, 기존 21컬럼 + 신규 4컬럼 추가 예정 |
| 5 | inicis_payments (18컬럼) | **payments** | 결제 정보 | 구조 변경됨 (Supabase가 더 상세) |
| 6 | (payment_request.penalty 필드) | **refunds** | 환불/위약금 | MariaDB에는 별도 테이블 없었음 → Supabase에서 신규 생성 |
| 7 | settlement_info (15컬럼) | **settlement_infos** | 정산 계좌/사업자 정보 | 구조 유사 |
| 8 | g5_write_payment (16컬럼) | **settlements** | 정산 내역(건별) | 구조 변경됨 |
| 9 | room (4컬럼) | **chat_rooms** | 채팅방 | Supabase가 더 상세 (guardian_id, kindergarten_id FK) |
| 10 | chat (8컬럼) | **chat_messages** | 채팅 메시지 | 구조 유사 |
| 11 | review (type='pet') | **guardian_reviews** | 보호자→유치원 후기 | MariaDB는 하나의 review 테이블, Supabase는 2개로 분리 |
| 12 | review (type='partner') | **kindergarten_reviews** | 유치원→보호자 후기 | 위와 같음 |
| 13 | g5_write_education (40컬럼) | **education_topics** | 교육 주제 | 구조 완전 변경 |
| 14 | g5_write_education.wr_content (JSON) | **education_quizzes** | 교육 퀴즈 | MariaDB에서는 JSON 안에 포함 |
| 15 | g5_quiz_solved (4컬럼) | **education_completions** | 교육 이수 기록 | 구조 변경됨 |
| 16 | g5_shop_banner (14컬럼) | **banners** | 배너 | 구조 유사 |
| 17 | g5_write_notice (40컬럼) | **notices** | 공지사항 | 40→10컬럼으로 축소 |
| 18 | g5_write_faq (40컬럼) | **faqs** | FAQ | 40→8컬럼으로 축소 |
| 19 | g5_content (13컬럼) | **terms** | 약관/정책 | 구조 변경됨 |
| 20 | g5_app_version (6컬럼) | **app_settings** | 앱 버전/설정 | — |
| 21 | (별도 관리) | **admin_accounts** | 관리자 계정 | MariaDB에 없었음 |
| 22 | g5_write_opinion (40컬럼) | **feedbacks** | 피드백/개선의견 | 40→15컬럼으로 축소 |
| 23 | (별도 관리) | **reports** | 신고 | MariaDB에 없었음 |
| 24 | (별도 관리) | **report_logs** | 신고 처리이력 | MariaDB에 없었음 |

### 1-2. 추가 필요한 테이블 (✅ 확정 — 9개)

> 검토 결과 삭제된 항목:
> - ~~address_verifications~~ → `members.address_doc_urls` 컬럼으로 대체
> - ~~block_users~~ → `member_blocks` 테이블 이미 존재 (동일 기능)
> - ~~payment_request_rooms~~ → `chat_room_reservations` 테이블 이미 존재 (동일 기능)
> - ~~animal_kinds_x~~ → `pet_breeds` 테이블에 `type` 컬럼으로 통합 (dog/cat)

| # | 기존 MariaDB 테이블 | 신규 Supabase 테이블 | 용도 | 비고 |
|---|---------------------|---------------------|------|------|
| 25 | fcm_token (4컬럼) | **fcm_tokens** | FCM 푸시 토큰 | 구조 유사 |
| 26 | notification (5컬럼) | **notifications** | 알림 내역 | 구조 유사 |
| 27 | animalKind + animalKindX (각 2컬럼) | **pet_breeds** | 견종/묘종 목록 (type 컬럼으로 구분, 현재 dog만 운영) | 이름변경: animal_kinds → pet_breeds |
| 28 | bank (6컬럼) | **banks** | 은행 목록 (마스터) | 구조 유사 + 데이터 이관 필요 |
| 29 | g5_favorite_partner (7컬럼) | **favorite_kindergartens** | 유치원 즐겨찾기 | 이름변경: favorite_partners → favorite_kindergartens |
| 30 | g5_favorite_animal (7컬럼) | **favorite_pets** | 반려동물 즐겨찾기 | 이름변경: favorite_animals → favorite_pets |
| 31 | message_template + g5_write_chat_*_guide (각 40컬럼) | **chat_templates** | 채팅 상용문구 + 가이드 (type 컬럼으로 구분) | 이름변경+통합: message_templates + chat_guides → chat_templates |
| 32 | room_members (5컬럼) | **chat_room_members** | 채팅방 참여자 (읽음 위치, 알림 차단) | 구조 유사 |
| 33 | scheduler_history (3컬럼) | **scheduler_history** | 스케줄러 실행 이력 | 구조 동일 |

### 1-3. Supabase에만 있는 테이블 (관리자 페이지 전용, MariaDB에 없었음)

| # | Supabase 테이블 | 용도 | 비고 |
|---|----------------|------|------|
| A | admin_login_logs | 관리자 로그인 이력 | 관리자 전용 |
| B | audit_logs | 감사 로그 (관리자 행동 기록) | 관리자 전용 |
| C | member_status_logs | 회원 상태 변경 로그 | 관리자 전용 |
| D | reservation_status_logs | 예약 상태 변경 로그 | 관리자 전용 |
| E | settlement_info_logs | 정산 정보 변경 로그 | 관리자 전용 |
| F | kindergarten_status_logs | 유치원 상태 변경 로그 | 관리자 전용 |
| G | setting_change_logs | 설정 변경 로그 | 관리자 전용 |
| H | member_blocks | 회원 차단 | 관리자 + 앱 (기존 block_users 대체) |
| I | noshow_records | 노쇼 기록 | 관리자 전용 |
| J | member_term_agreements | 약관 동의 이력 | 관리자 + 앱 |
| K | term_versions | 약관 버전 관리 | 관리자 전용 |
| L | kindergarten_resident_pets | 유치원 상주 반려동물 | 관리자 + 앱 |
| M | chat_room_reservations | 채팅방↔예약 연결 | 관리자 + 앱 (기존 payment_request_rooms 대체) |
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

### 2-1. 회원 — g5_member (82컬럼) → members (31+10컬럼)

> 기존 82개 컬럼 중 앱에서 실제 사용하는 것만 Supabase에 매핑.
> 그누보드 전용 컬럼(mb_zip1, mb_zip2, mb_recommend, mb_point 등)은 제외.

| # | MariaDB 컬럼 | MariaDB 타입 | Supabase 컬럼 | Supabase 타입 | 상태 | 비고 |
|---|-------------|-------------|--------------|--------------|------|------|
| 1 | mb_no (PK, auto) | int | id (PK) | uuid | ✅ 존재 | Supabase Auth uid |
| 2 | mb_id | varchar(20) | phone | text | ✅ 존재 | 폰번호가 ID (핵심!) |
| 3 | mb_name | varchar(255) | name | text | ✅ 존재 | |
| 4 | mb_nick | varchar(255) | nickname | text | ✅ 존재 | |
| 5 | — | — | nickname_tag | text | ✅ 존재 | Supabase 신규 (#1001 형식) |
| 6 | mb_profile1 | varchar(255) | profile_image | text | ✅ 존재 | 파일명 → Storage URL |
| 7 | mb_2 | varchar(255) | birth_date | date | ✅ 존재 | 주민번호 앞자리 → 생년월일 |
| 8 | mb_sex | char(1) | gender | text | ✅ 존재 | 남/여 → 남성/여성 |
| 9 | mb_hp | varchar(255) | — | — | ❌ 불필요 | mb_id와 동일, 별도 저장 안 함 |
| 10 | mb_4 | varchar(255) | address_complex | text | ✅ 존재 | 아파트/단지명 |
| 11 | mb_addr1 | varchar(255) | address_road | text | ✅ 존재 | 도로명주소 |
| 12 | dong | varchar(20) | address_building_dong | text | ✅ 존재 | 동 |
| 13 | ho | varchar(10) | address_building_ho | text | ✅ 존재 | 호 |
| 14 | mb_5 | varchar(255) | current_mode | text | ✅ 존재 | '1'→'보호자', '2'→'유치원' |
| 15 | mb_1 | varchar(255) | carrier | text | ✅ 존재 | 통신사 코드 |
| 16 | — | — | identity_verified | bool | ✅ 존재 | 본인인증 여부 |
| 17 | — | — | identity_method | text | ✅ 존재 | 인증 방법 |
| 18 | — | — | identity_carrier | text | ✅ 존재 | 인증 통신사 |
| 19 | — | — | identity_verified_at | timestamptz | ✅ 존재 | 인증 일시 |
| 20 | — | — | address_auth_status | text | ✅ 존재 | 주소인증 상태 |
| 21 | — | — | address_auth_date | timestamptz | ✅ 존재 | 주소인증 일시 |
| 22 | mb_join_status / mb_leave_status | | status | text | ✅ 존재 | 정상/탈퇴/정지 |
| 23 | — | — | noshow_count | int | ✅ 존재 | 노쇼 횟수 |
| 24 | — | — | noshow_sanction | text | ✅ 존재 | 노쇼 제재 상태 |
| 25 | — | — | noshow_sanction_end | timestamptz | ✅ 존재 | 노쇼 제재 종료일 |
| 26 | — | — | suspend_start | timestamptz | ✅ 존재 | 정지 시작일 |
| 27 | — | — | suspend_end | timestamptz | ✅ 존재 | 정지 종료일 |
| 28 | — | — | suspend_reason | text | ✅ 존재 | 정지 사유 |
| 29 | mb_leave_reason | varchar(255) | withdraw_reason | text | ✅ 존재 | 탈퇴 사유 |
| 30 | mb_leave_date | | withdrawn_at | timestamptz | ✅ 존재 | 탈퇴 일시 |
| 31 | — | — | created_at | timestamptz | ✅ 존재 | |
| 32 | mb_9 | varchar(255) | latitude | numeric | 🆕 추가 | 위도 (위치 기반 유치원 검색) |
| 33 | mb_10 | varchar(255) | longitude | numeric | 🆕 추가 | 경도 |
| 34 | mb_language | varchar(50) | language | text | 🆕 추가 | 앱 언어 (기본값 '한국어') |
| 35 | mb_app_version | varchar(10) | app_version | text | 🆕 추가 | 앱 버전 |
| 36 | chat_notify | varchar(1) | chat_notify | text | 🆕 추가 | 채팅 알림 ON/OFF |
| 37 | reserve_notify | varchar(1) | reservation_notify | text | 🆕 추가 | 예약 알림 ON/OFF |
| 38 | attendance_notify | varchar(1) | checkinout_notify | text | 🆕 추가 | 등하원 알림 ON/OFF |
| 39 | review_notify | varchar(1) | review_notify | text | 🆕 추가 | 후기 알림 ON/OFF |
| 40 | new_kinder_notify | varchar(1) | new_kindergarten_notify | text | 🆕 추가 | 신규 유치원 알림 ON/OFF |
| 41 | direct | varchar(100) | address_direct | text | 🆕 추가 | 직접입력 주소 |
| 42 | — | — | address_doc_urls | text[] | ✅ 존재 | 주소 인증 서류 이미지 URL (DB에 이미 존재) |

**불필요 컬럼 (Supabase에 매핑하지 않음):**
- mb_6 (찜한 강아지수) → favorite_pets 실시간 COUNT 조회로 대체
- mb_7 (찜한 유치원수) → favorite_kindergartens 실시간 COUNT 조회로 대체
- mb_8 → 용도 불명 (앱에서 미사용)
- partner_name → kindergartens.name으로 대체
- is_completed, is_educated, is_progress → kindergartens/education_completions에서 관리
- degree → kindergartens.freshness_current

---

### 2-2. 유치원 — g5_write_partner (63컬럼) → kindergartens (35+3컬럼)

| # | MariaDB 컬럼 | Supabase 컬럼 | 타입 | 상태 | 비고 |
|---|-------------|--------------|------|------|------|
| 1 | wr_id (PK) | id | uuid | ✅ 존재 | |
| 2 | mb_id | member_id (FK→members) | uuid | ✅ 존재 | 폰번호→uuid 참조 |
| 3 | wr_subject | name | text | ✅ 존재 | 유치원 이름 |
| 4 | wr_content | description | text | ✅ 존재 | 유치원 소개 |
| 5 | wr_2 | price_small_1h ~ price_large_walk (12개) | integer | ✅ 존재 | 파이프 구분→12개 개별 컬럼 |
| 6 | partner_img1~10 | photo_urls | text[] | ✅ 존재 | 개별 10개→배열 1개 |
| 7 | freshness | freshness_current | integer | ✅ 존재 | 현재 신선도 |
| 8 | — | freshness_initial | integer | ✅ 존재 | 초기 신선도 |
| 9 | business_status | business_status | text | ✅ 존재 | 영업중/방학중 |
| 10 | settlement_ready | settlement_status | text | ✅ 존재 | 0/1 → 작성중/제출됨/승인/거절 |
| 11 | mb_addr1 | address_road | text | ✅ 존재 | 도로명주소 |
| 12 | mb_4 | address_complex | text | ✅ 존재 | 단지명 |
| 13 | — | address_jibun | text | ✅ 존재 | 지번주소 |
| 14 | mb_dong | address_building_dong | text | ✅ 존재 | 동 |
| 15 | mb_ho | address_building_ho | text | ✅ 존재 | 호수 |
| 16 | auth_status | address_auth_status | text | ✅ 존재 | 인증상태 |
| 17 | — | address_auth_date | timestamptz | ✅ 존재 | 인증일시 |
| 18 | — | inicis_status | text | ✅ 존재 | 이니시스 등록상태 |
| 19 | — | inicis_submall_code | text | ✅ 존재 | 서브몰 코드 |
| 20 | — | seller_id | text | ✅ 존재 | 판매자 ID |
| 21 | — | noshow_count | int | ✅ 존재 | 노쇼 횟수 |
| 22 | — | noshow_sanction | text | ✅ 존재 | 노쇼 제재 |
| 23 | — | address_doc_urls | text[] | ✅ 존재 | 주소 인증 서류 (members와 동기화 트리거 예정 — Step 2에서 처리) |
| 24 | — | created_at | timestamptz | ✅ 존재 | |
| 25 | mb_9 | latitude | numeric | 🆕 추가 | 유치원 위도 |
| 26 | mb_10 | longitude | numeric | 🆕 추가 | 유치원 경도 |
| 27 | wr_6 | registration_status | text | 🆕 추가 | 등록 상태 (temp=임시저장) |

**검토 결과 불필요로 판단된 매핑:**
- wr_1 (`has_own_pet`) → `kindergarten_resident_pets` 테이블로 판단 가능
- wr_3 (`bank_name`) → `settlement_infos.account_bank` 에 존재
- wr_4 (`bank_account`) → `settlement_infos.account_number` 에 존재
- wr_5 (`education_completed`) → `education_completions` 테이블로 판단 가능

**주요 변경점:**
- 가격이 `wr_2` 하나에 파이프(`|`)로 저장 → 12개 개별 컬럼으로 분리
- 이미지 10개 개별 컬럼 → `text[]` 배열
- 은행/계좌 → `settlement_infos` 테이블로 분리
- 이니시스 관련 → Supabase에서 신규 추가

---

### 2-3. 반려동물 — g5_write_animal (55컬럼) → pets (16컬럼)

| # | MariaDB 컬럼 | MariaDB 용도 (확인) | Supabase 컬럼 | 상태 | 비고 |
|---|-------------|------|--------------|------|------|
| 1 | wr_id (PK) | ID | id | ✅ 존재 | uuid |
| 2 | mb_id | 소유자 | member_id (FK) | ✅ 존재 | 폰번호→uuid |
| 3 | wr_subject | 이름 | name | ✅ 존재 | |
| 4 | wr_content | 소개 | description | ✅ 존재 | |
| 5 | wr_1 | 이름 (중복) | name | ✅ 존재 | wr_subject와 동일값, 무시 |
| 6 | wr_2 | 성별 | gender | ✅ 존재 | 수컷/암컷 |
| 7 | wr_3 | 중성화 여부 | is_neutered | ✅ 존재 | bool |
| 8 | wr_4 | 품종 | breed | ✅ 존재 | |
| 9 | wr_5 | 생년월일 | birth_date | ✅ 존재 | date 타입 |
| 10 | wr_6 | 생일 체크 여부 | is_birth_date_unknown | 🆕 추가 | bool DEFAULT false (sql/42_06) |
| 11 | wr_7 | 몸무게 | weight | ✅ 존재 | numeric |
| 12 | wr_8 | 백신 접종 여부 | is_vaccinated | ✅ 존재 | bool |
| 13 | wr_9 | (미사용) | — | — | 제외 |
| 14 | wr_10 | 임시저장 여부 | is_draft | 🆕 추가 | bool DEFAULT false (sql/42_06) |
| 15 | wr_11 | 믹스 체크 여부 | — | — | breed='믹스견'으로 처리, 별도 컬럼 불필요 |
| 16 | animal_kind_mix | 믹스 여부 | — | — | breed에 포함 (위 wr_11과 동일 역할) |
| 17 | firstYN | 대표 동물 | is_representative | ✅ 존재 | bool |
| 18 | deleteYN | 삭제 여부 | — | — | soft delete 방식 |
| 19 | animal_img1~10 | 이미지 10개 | photo_urls | ✅ 존재 | text[] 배열 |
| 20 | — | — | size_class | ✅ 존재 | 소형/중형/대형 (트리거 자동 계산) |

**✅ 외주 개발자 확인 완료 (2026-04-14)**: wr_1~wr_11 용도 전부 확정. 기존 매핑 순서 전면 교정됨.

---

### 2-4. 돌봄 예약 — payment_request (23컬럼) → reservations (21+4컬럼)

| # | MariaDB 컬럼 | Supabase 컬럼 | 타입 | 상태 | 비고 |
|---|-------------|--------------|------|------|------|
| 1 | id (PK, auto) | id | uuid | ✅ 존재 | |
| 2 | mb_id | member_id (FK) | uuid | ✅ 존재 | 보호자 (요청자) |
| 3 | to_mb_id | kindergarten_id (FK) | uuid | ✅ 존재 | 유치원 → kindergartens 참조 |
| 4 | pet_id | pet_id (FK) | uuid | ✅ 존재 | |
| 5 | start_date + start_time | checkin_scheduled | timestamptz | ✅ 존재 | 2개 문자열 → 1개 timestamp |
| 6 | end_date + end_time | checkout_scheduled | timestamptz | ✅ 존재 | 위와 동일 |
| 7 | — | checkin_actual | timestamptz | ✅ 존재 | 실제 등원시간 |
| 8 | — | checkout_actual | timestamptz | ✅ 존재 | 실제 하원시간 |
| 9 | walk_count | walk_count | int | ✅ 존재 | 산책 횟수 |
| 10 | pickup_dropoff | pickup_requested | bool | ✅ 존재 | tinyint→bool |
| 11 | status | status | text | ✅ 존재 | 수락대기/예약확정/돌봄진행중/돌봄완료 등 |
| 12 | reject_reason | reject_reason | text | ✅ 존재 | 거절 사유 |
| 13 | — | reject_detail | text | ✅ 존재 | 거절 상세 |
| 14 | — | rejected_at | timestamptz | ✅ 존재 | 거절 일시 |
| 15 | — | requested_at | timestamptz | ✅ 존재 | 요청 일시 |
| 16 | — | guardian_checkout_confirmed | bool | ✅ 존재 | 보호자 하원 확인 |
| 17 | — | kg_checkout_confirmed | bool | ✅ 존재 | 유치원 하원 확인 |
| 18 | — | guardian_checkout_confirmed_at | timestamptz | ✅ 존재 | 보호자 하원 확인 시각 |
| 19 | — | kg_checkout_confirmed_at | timestamptz | ✅ 존재 | 유치원 하원 확인 시각 |
| 20 | — | auto_complete_scheduled_at | timestamptz | ✅ 존재 | 자동 완료 예정 시각 (스케줄러 Edge Function에서 사용) |
| 21 | created_at | created_at | timestamptz | ✅ 존재 | |
| 22 | reminder_start_sent_at | reminder_start_sent_at | timestamptz | 🆕 추가 | 등원 알림 발송 시각 (스케줄러) |
| 23 | reminder_end_sent_at | reminder_end_sent_at | timestamptz | 🆕 추가 | 하원 알림 발송 시각 |
| 24 | care_start_sent_at | care_start_sent_at | timestamptz | 🆕 추가 | 돌봄시작 알림 발송 시각 |
| 25 | care_end_sent_at | care_end_sent_at | timestamptz | 🆕 추가 | 돌봄종료 알림 발송 시각 |

**검토 결과 불필요로 판단된 매핑:**
- `price` → `payments.amount` 에 존재
- `penalty` → `refunds.penalty_amount` 에 존재
- `payment_approval_id` → `payments.reservation_id` 로 역참조
- `is_review_written` → `guardian_reviews`/`kindergarten_reviews` JOIN으로 판단
- `is_settled` → `settlements` 테이블에서 관리

---

### 2-5. 결제 — inicis_payments (18컬럼) → payments (20컬럼)

| # | MariaDB 컬럼 | Supabase 컬럼 | 상태 | 비고 |
|---|-------------|--------------|------|------|
| 1 | id (PK) | id | ✅ 존재 | uuid |
| 2 | payment_request_id | reservation_id (FK) | ✅ 존재 | |
| 3 | oid | pg_transaction_id | ✅ 존재 | 주문번호 |
| 4 | amount | amount | ✅ 존재 | |
| 5 | status | status | ✅ 존재 | |
| 6 | pay_type | payment_method | ✅ 존재 | |
| 7 | auth_dt | paid_at | ✅ 존재 | 승인일시 |
| 8 | auth_no | approval_number | ✅ 존재 | 승인번호 |
| 9 | card_num | card_number | ✅ 존재 | |
| 10 | card_name | card_company | ✅ 존재 | |
| 11 | — | member_id (FK) | ✅ 존재 | Supabase 신규 (결제자) |
| 12 | — | kindergarten_id (FK) | ✅ 존재 | Supabase 신규 |
| 13 | — | pet_id (FK) | ✅ 존재 | Supabase 신규 |
| 14 | — | care_fee, walk_fee, pickup_fee | ✅ 존재 | Supabase 신규 (수수료 분리) |
| 15 | — | submall_id | ✅ 존재 | Supabase 신규 (이니시스 서브몰) |
| 16 | — | payment_type | ✅ 존재 | Supabase 신규 (돌봄결제/위약금) |
| 17 | — | cancel_reason (text) | ✅ 존재 | 결제 취소 사유 |
| 18 | — | created_at | ✅ 존재 | |

---

### 2-6. 채팅 — room/chat/room_members → chat_rooms/chat_messages/chat_room_members

#### chat_rooms (room → chat_rooms)

| MariaDB room | Supabase chat_rooms | 상태 | 비고 |
|-------------|-------------------|------|------|
| id (auto) | id (uuid) | ✅ 존재 | |
| name | — | — | 'mb_id-mb_id' 형식 → guardian_id + kindergarten_id FK로 대체 |
| created_at | created_at | ✅ 존재 | |
| deleted_at | — | — | status로 관리 (활성/비활성) |
| — | guardian_id (FK) | ✅ 존재 | Supabase 신규 |
| — | kindergarten_id (FK) | ✅ 존재 | Supabase 신규 |
| — | status | ✅ 존재 | 활성/비활성 |
| — | last_message | ✅ 존재 | 마지막 메시지 |
| — | last_message_at | ✅ 존재 | 마지막 메시지 시각 |
| — | total_message_count | ✅ 존재 | 총 메시지 수 |
| — | has_report | ✅ 존재 | 신고 여부 |

#### chat_messages (chat → chat_messages)

| MariaDB chat | Supabase chat_messages | 상태 | 비고 |
|-------------|----------------------|------|------|
| id (auto) | id (uuid) | ✅ 존재 | |
| room_id (FK) | chat_room_id (FK) | ✅ 존재 | |
| mb_id | sender_id (FK) | ✅ 존재 | 폰번호→uuid |
| — | sender_type | ✅ 존재 | 보호자/유치원/시스템 |
| message_type | message_type | ✅ 존재 | 텍스트/이미지/시스템 등 |
| content | content | ✅ 존재 | 텍스트 + 이미지 URL 포함 |
| file_path | — | — | image_urls 컬럼으로 대체됨 |
| file_type | — | — | message_type으로 구분 |
| created_at | created_at | ✅ 존재 | |
| — | image_urls (jsonb) | ✅ 존재 | 채팅 이미지 URL 배열 (file_path 대체) |
| — | is_read (bool) | ✅ 존재 | Supabase 신규 |

#### chat_room_members (room_members → 신규 생성 필요)

| MariaDB room_members | Supabase chat_room_members | 비고 |
|---------------------|--------------------------|------|
| room_id | room_id (FK) | |
| mb_id | member_id (FK) | |
| mb_5 | role | '1'→보호자, '2'→유치원 |
| last_read_message_id | last_read_message_id | 안 읽은 메시지 수 계산용 |
| is_muted | is_muted | 알림 차단 여부 |

---

### 2-7. 정산 — settlement_info (15컬럼) → settlement_infos (21컬럼)

| MariaDB settlement_info | Supabase settlement_infos | 상태 | 비고 |
|------------------------|--------------------------|------|------|
| id | id | ✅ 존재 | uuid |
| mb_id (PK) | member_id (FK) | ✅ 존재 | |
| has_business / business_type | business_type | ✅ 존재 | 개인사업자/법인사업자/비사업자 |
| — | business_name | ✅ 존재 | 사업자명 |
| — | business_category | ✅ 존재 | 업종 |
| business_reg_no | business_reg_number | ✅ 존재 | |
| settlement_email | operator_email | ✅ 존재 | |
| account_number | account_number | ✅ 존재 | |
| account_holder | account_holder | ✅ 존재 | |
| — | account_bank | ✅ 존재 | 은행명 직접 저장 |
| status | inicis_status | ✅ 존재 | |
| rrn_front_enc + rrn_back_enc | operator_ssn_masked | ✅ 존재 | 암호화→마스킹 |
| — | kindergarten_id (FK) | ✅ 존재 | Supabase 신규 |
| — | operator_name | ✅ 존재 | |
| — | operator_birth_date | ✅ 존재 | |
| — | operator_phone | ✅ 존재 | |
| — | inicis_seller_id | ✅ 존재 | |
| — | inicis_requested_at | ✅ 존재 | |
| — | inicis_completed_at | ✅ 존재 | |
| — | submall_code | ✅ 존재 | |
| — | created_at | ✅ 존재 | |

---

### 2-8. 기타 소형 테이블

#### review (9컬럼) → guardian_reviews + kindergarten_reviews (각 11컬럼)

| MariaDB review | Supabase guardian_reviews / kindergarten_reviews | 비고 |
|---------------|------------------------------------------------|------|
| id | id | |
| type | (테이블 분리로 불필요) | 'pet'→guardian_reviews, 'partner'→kindergarten_reviews |
| partner_id | kindergarten_id (FK) | |
| protector_id | member_id (FK) | |
| pet_id | pet_id (FK) | |
| content | content | |
| images | image_urls (jsonb) | JSON 문자열→jsonb 배열 |
| tags | selected_tags (jsonb) | JSON 문자열→jsonb 배열 |
| created_at | created_at / written_at | |
| — | satisfaction | Supabase 신규 (최고예요/좋았어요/아쉬워요) |
| — | reservation_id (FK) | Supabase 신규 |
| — | is_hidden | Supabase 신규 (관리자 숨김) |
| — | is_guardian_only (bool) | ✅ 존재 | '보호자에게만 보이는 후기' 필터링 |

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

## 3. 검토 완료 사항

### 3-1. 해결된 중복 검토 (✅)

| 주제 | 결론 |
|------|------|
| 사용자 차단: member_blocks vs block_users | **member_blocks만 사용**. block_users 신규 생성 불필요 |
| 채팅방↔예약: chat_room_reservations vs payment_request_rooms | **chat_room_reservations만 사용**. payment_request_rooms 신규 생성 불필요 |
| 품종 목록: animal_kinds + animal_kinds_x | **pet_breeds** 하나로 통합 (type 컬럼: dog/cat, 현재 dog만 운영) |
| 채팅 가이드: chat_guides + message_templates | **chat_templates** 하나로 통합 (type 컬럼으로 구분) |

### 3-2. 앱에서 필요하여 신규 추가 확정된 컬럼 (17개)

> members.address_doc_urls와 kindergartens.address_doc_urls는 이미 DB에 존재하므로 아래 목록에서 제외.
> 실제 신규 추가 대상은 **17개** (members 10 + kindergartens 3 + reservations 4)

| 테이블 | 추가 컬럼 | 용도 |
|--------|----------|------|
| members | latitude, longitude | 위치 기반 유치원 검색 |
| members | language, app_version | 앱 설정 |
| members | chat_notify, reservation_notify, checkinout_notify, review_notify, new_kindergarten_notify | 알림 ON/OFF 설정 (5개) |
| members | address_direct | 직접입력 주소 |
| kindergartens | latitude, longitude | 유치원 위치 (지도 검색) |
| kindergartens | registration_status | 등록 상태 (임시저장 등) |
| reservations | reminder_start_sent_at, reminder_end_sent_at | 등하원 알림 발송 시각 (스케줄러 중복 방지) |
| reservations | care_start_sent_at, care_end_sent_at | 돌봄 시작/종료 알림 발송 시각 |

### 3-3. 매니저 검토 시 추가 확인된 기존 컬럼

| 테이블 | 컬럼 | 타입 | 상태 | 비고 |
|--------|------|------|------|------|
| payments | cancel_reason | text | ✅ 존재 | 결제 취소 사유 (향후 앱 취소 기능 추가 예정) |
| kindergarten_reviews | is_guardian_only | bool | ✅ 존재 | '보호자에게만 보이는 후기' 필터링 |
| chat_messages | image_urls | jsonb | ✅ 존재 | 채팅 이미지 URL 배열 (file_path 대체) |
| reservations | guardian_checkout_confirmed_at | timestamptz | ✅ 존재 | 보호자 하원 확인 시각 |
| reservations | kg_checkout_confirmed_at | timestamptz | ✅ 존재 | 유치원 하원 확인 시각 |
| reservations | auto_complete_scheduled_at | timestamptz | ✅ 존재 | 자동 완료 예정 시각 (스케줄러 Edge Function에서 사용) |

### 3-4. 반려동물 wr_1 ~ wr_11 매핑 — ✅ 확인 완료

외주 개발자 확인 완료 (2026-04-14). 기존 추정이 전면 틀렸으며 아래가 정확한 매핑:

| MariaDB | 용도 (확정) | Supabase 컬럼 | 상태 |
|---------|-----------|--------------|------|
| wr_1 | 이름 | name | ✅ 존재 (wr_subject와 중복) |
| wr_2 | 성별 | gender | ✅ 존재 |
| wr_3 | 중성화 여부 | is_neutered | ✅ 존재 |
| wr_4 | 품종 | breed | ✅ 존재 |
| wr_5 | 생년월일 | birth_date | ✅ 존재 |
| wr_6 | 생일 체크 여부 | is_birth_date_unknown | 🆕 추가 (sql/42_06) |
| wr_7 | 몸무게 | weight | ✅ 존재 |
| wr_8 | 백신 접종 여부 | is_vaccinated | ✅ 존재 |
| wr_9 | (미사용) | — | 제외 |
| wr_10 | 임시저장 여부 | is_draft | 🆕 추가 (sql/42_06) |
| wr_11 | 믹스 체크 여부 | — | breed='믹스견'으로 처리 |

---

## 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-04-11 | 최초 작성 — 매니저 검토용 전체 매핑 대조표 |
| 2026-04-13 | **전수 교정** — 실제 Supabase DB와 대조하여 85개 불일치 수정: 테이블명 7개 교정 (pet_breeds, favorite_kindergartens, favorite_pets, chat_templates 등), 컬럼명 15개 교정 (address_complex, profile_image, checkin_scheduled 등), 불필요 매핑 8개 삭제, 누락 컬럼 49개 보완, 신규 추가 컬럼 18개 확정 |
| 2026-04-13 | **매니저 검토 반영** — members.address_doc_urls → ✅ 존재로 변경 (신규 18→17개), kindergartens.address_doc_urls 추가 (✅ 존재), reservations 3개 컬럼 추가 (guardian_checkout_confirmed_at, kg_checkout_confirmed_at, auto_complete_scheduled_at), payments.cancel_reason 추가, kindergarten_reviews.is_guardian_only 추가, chat_messages.image_urls 추가, 테이블별 컬럼 수 정정 |
| 2026-04-14 | **외주 개발자 확인 반영** — g5_write_animal wr_1~wr_11 매핑 전면 교정 (기존 추정 순서 전부 틀림), 신규 컬럼 2개 추가 (is_birth_date_unknown ← wr_6, is_draft ← wr_10), pets 14→16컬럼, 섹션 2-3 매핑표 재작성, 섹션 3-4 미확인→확인완료로 변경 |
