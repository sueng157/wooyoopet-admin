# 우유펫 모바일 앱 백엔드 마이그레이션 설계서

> 최종 업데이트: 2026-04-14 (Step 2.5 앱용 RPC 설계 + API 매핑 교정 — 미사용 19개 제거, 누락 3개 추가, Edge Functions 8→7개, 총 API 62→~47개)
> 목적: PHP/MariaDB → Supabase 전환을 위한 상세 설계 및 작업 추적
> 관련 문서: `HANDOVER.md` (Phase 5), `MOBILE_APP_ANALYSIS.md` (앱 소스 분석), `DB_MAPPING_REFERENCE.md` (컬럼 매핑)

---

## 1. 프로젝트 개요

### 1-1. 목표

현재 모바일 앱(wooyoopet-app)이 사용하는 **PHP API + MariaDB + 카페24 채팅 서버**를 **Supabase (PostgreSQL + 자동 API + Realtime + Edge Functions)**로 전환하여, 기존 서버(스마일서브 + 카페24)를 해지하고 월 ₩135,000 고정비를 절감한다.

### 1-2. 전환 전후 비교

```
[현재]
모바일 앱 → PHP API (woo1020.iwinv.net) → MariaDB (같은 서버)
         → WebSocket (wooyoopet.store)   → 채팅 서버 (카페24)
         → Firebase FCM                  → 푸시 알림

[전환 후]
모바일 앱 → Supabase 자동 API (PostgREST) → PostgreSQL
         → Supabase Realtime              → 채팅
         → Supabase Edge Functions         → 결제 콜백, FCM, 알림톡
         → Supabase Storage               → 파일 업로드
         → Supabase Auth                  → 인증 (Phone OTP)
```

### 1-3. 역할 분담

| 역할 | 담당 | 작업 내용 |
|------|------|----------|
| 마이그레이션 설계 | AI (본 문서) | 분석, 매핑, SQL, 가이드 문서 작성 |
| Supabase SQL 실행 | 사장님 | Supabase SQL Editor에서 제공된 SQL 실행 |
| 모바일 앱 코드 수정 | 외주 개발자 | apiClient 교체, 인증 전환, 채팅 전환 등 |
| Edge Functions 배포 | 사장님 or 외주 개발자 | Supabase Dashboard에서 배포 |
| 통합 테스트 | 전원 | 앱 + 관리자 페이지 동시 동작 확인 |

---

## 2. 수집 자료 현황

### 2-1. 보유 자료 목록

| # | 자료 | 규모 | 분석 상태 | 위치 |
|---|------|------|----------|------|
| 1 | 모바일 앱 소스코드 | 175파일, 31,342줄 | ✅ 분석 완료 | wooyoopet-app (Private) |
| 2 | PHP API 소스코드 | 현행 95파일, 11,245줄 | ✅ 전수 분석 완료 (95파일 모두 읽음) | uploaded_files/api_extracted/ |
| 3 | MariaDB 스키마 | 131테이블 (146KB) | ✅ 분류 완료 + API에서 참조하는 테이블 확인 완료 | legacy_mariadb_schema.sql |
| 4 | WebSocket 채팅 서버 | server.py (61줄) + Docker | ✅ 분석 완료 | wooyoopet-backend/websocket/ |
| 5 | 카카오 알림톡 | alimtalk.php | ✅ 수령 완료 | uploaded_files/api_extracted/ |
| 6 | Firebase 서비스 키 | JSON | ✅ 교체 완료 + Supabase Secret 등록 완료 (2026-04-14) | Supabase Secrets |
| 7 | Supabase 현행 스키마 | SQL 40개 | ✅ 운영 중 | sql/ 폴더 |

### 2-2. MariaDB 131테이블 분류

| 분류 | 수량 | 설명 | 마이그레이션 |
|------|------|------|-------------|
| 앱 커스텀 테이블 | 19개 | chat, payment_request, settlement_info 등 | 🎯 전환 대상 |
| 앱 데이터 테이블 (g5_write_/g5_wzb_) | 39개 | animal, partner, booking 등 | 🎯 전환 대상 |
| 그누보드 시스템 테이블 (g5_*) | 71개 | g5_config, g5_board 등 | ❌ 불필요 |
| 지리 데이터 테이블 | 2개 | apt_buildings, buildings | ❌ 불필요 (카카오 주소 API로 대체, 앱에서 직접 호출) |

### 2-3. PHP API 분류 (현행 95파일)

| 분류 | 파일 수 | 설명 |
|------|--------|------|
| GET (조회) | ~45개 | get_partner.php, get_animal_by_id.php 등 |
| SET/POST (등록/수정/삭제) | ~40개 | set_join.php, set_payment_request.php 등 |
| 결제 연동 | 3개 | inicis_payment.php, set_inicis_approval.php, toss_payment.php |
| 외부 서비스 | 3개 | alimtalk.php, kakao-address.php, scheduler.php |
| 백업/구버전 | 14개 | *260111.php, *260209.php 등 → 제외 |

---

## 3. 작업 단계 상세

### Step 1: 전수 분석 & 매핑 설계 (현재 단계)

**목표**: PHP API 95개와 MariaDB 58개 핵심 테이블을 전부 읽고, Supabase 전환 매핑표를 완성한다.

| # | 세부 작업 | 상태 | 산출물 |
|---|----------|------|--------|
| 1-1 | PHP API 95개 전수 읽기 | ✅ 완료 | API별 입출력·DB쿼리·비즈니스 로직 정리 (섹션 5) |
| 1-2 | MariaDB 핵심 테이블 분석 | ✅ 완료 | API에서 참조하는 테이블·컬럼 전부 확인 |
| 1-3 | MariaDB ↔ Supabase 테이블 매핑 | ✅ 완료 | 섹션 4 (테이블 매핑표) |
| 1-4 | PHP API → Supabase 전환 매핑 | ✅ 완료 | 섹션 5 (API 전환 매핑표 — 62개 전체) |
| 1-5 | 누락 테이블·컬럼 식별 | ✅ 완료 | 섹션 6 (스키마 보강 목록 — 9개 신규 테이블) |
| 1-6 | Edge Functions 설계 | ✅ 완료 | 섹션 7 (Edge Functions 8개 상세 설계) |

### Step 2: Supabase 스키마 보강 ✅ 완료

**목표**: 모바일 앱이 사용할 수 있도록 Supabase에 누락된 테이블/컬럼을 추가하고, 앱 사용자용 RLS를 설정한다.

| # | 세부 작업 | 상태 | 산출물 |
|---|----------|------|--------|
| 2-1 | 누락 테이블 추가 SQL (9개) | ✅ 완료 | sql/41_01~41_09 (Supabase 실행 완료) |
| 2-2 | 기존 테이블 컬럼 추가/변경 SQL (6개) | ✅ 완료 | sql/42_01~42_06 (Supabase 실행 완료) |
| 2-3 | 앱 사용자용 RLS + Storage 정책 | ✅ 완료 | sql/43_01 (RLS 79개) + sql/43_02 (Storage 버킷 6개 + 정책 20개) |
| 2-4 | 사장님이 Supabase에서 SQL 실행 | ✅ 완료 | 17개 파일 전체 실행 확인 (PR #123) |

### Step 2.5: 앱용 RPC 함수 생성 ⬜ 예정

**목표**: 모바일 앱에서 복잡한 JOIN/집계가 필요한 조회를 위해 PostgreSQL RPC 함수를 생성한다.
현재 Supabase에는 관리자용 search_* 함수(SECURITY DEFINER)만 존재하며, 앱용 RPC 함수는 0개이다.

| # | 세부 작업 | 상태 | 산출물 |
|---|----------|------|--------|
| 2.5-1 | 앱용 RPC 함수 SQL 작성 (11개) | ⬜ 예정 | sql/44_01~44_11 |
| 2.5-2 | 사장님이 Supabase에서 SQL 실행 | ⬜ 예정 | — |

**생성할 RPC 함수 (11개, 전부 SECURITY INVOKER + app_ 접두어)**:

| # | 함수명 | PHP 원본 | 용도 | 난이도 |
|---|--------|---------|------|--------|
| 1 | app_get_kindergarten_detail | get_partner.php | 유치원 상세 (members + favorite + settlement + pets JOIN) | 중 |
| 2 | app_get_kindergartens | get_partner_list.php | 유치원 목록 (favorite + review COUNT) | 중 |
| 3 | app_get_guardian_detail | get_protector.php | 보호자 상세 (pets + favorite JOIN) | 중 |
| 4 | app_get_guardians | get_protector_list.php | 보호자 목록 (pets + favorite JOIN) | 중 |
| 5 | app_get_reservations | get_payment_request.php | 돌봄예약 목록 (pets + kindergartens + members JOIN, 페이징) | 중 |
| 6 | app_get_reservation_detail | get_payment_request_by_id.php | 돌봄예약 상세 (approval + pets + kindergartens + members JOIN) | 중 |
| 7 | app_withdraw_member | set_member_leave.php | 회원 탈퇴 (members UPDATE + 관련 데이터 정리) | 중 |
| 8 | app_set_representative_pet | set_first_animal_set.php | 대표 반려동물 설정 (pets BATCH UPDATE) | 쉬움 |
| 9 | app_get_reviews | get_review.php | 리뷰 목록 (태그 집계 + pets/kindergartens JOIN) | 중 |
| 10 | app_get_settlement_summary | get_settlement.php + get_settlement_list.php | 정산 요약 (reservations 집계 + 기간 필터) | 중 |
| 11 | app_get_education_with_progress | get_education.php | 교육 목록 + 퀴즈 수 + 이수 여부 (3테이블 JOIN) | 중 |

### Step 3: 앱 API 전환 가이드 작성

**목표**: 외주 개발자가 모바일 앱 코드를 수정할 수 있도록, 실제 사용되는 약 46개 API별 전환 지침서를 작성한다.
**전제 조건**: Step 2.5 (앱용 RPC 함수) 완료 후 진행
**산출물**: APP_MIGRATION_GUIDE.md (설명) + APP_MIGRATION_CODE.md (실행 코드)

| # | 세부 작업 | 상태 | 산출물 |
|---|----------|------|--------|
| 3-1 | apiClient 교체 가이드 (FormData → Supabase JS) | ⬜ 예정 | GUIDE 섹션 1~3 |
| 3-2 | 인증 전환 가이드 (mb_id → Supabase Auth Phone OTP) | ⬜ 예정 | GUIDE 섹션 4 |
| 3-3 | CRUD API 전환 가이드 (~25개) | ⬜ 예정 | GUIDE 섹션 5 + CODE |
| 3-4 | RPC API 전환 가이드 (7개) | ⬜ 예정 | GUIDE 섹션 6 + CODE |
| 3-5 | 채팅 전환 가이드 (WebSocket → Realtime) | ⬜ 예정 | GUIDE 섹션 7 |
| 3-6 | 결제/예약 전환 가이드 (PHP callback → Edge Functions) | ⬜ 예정 | GUIDE 섹션 8 |
| 3-7 | Edge Function 인터페이스 정의 (7개, 호출 방법만) | ⬜ 예정 | GUIDE 섹션 9 |

**작업 순서**: 인증 → CRUD → RPC → 채팅 → 결제/예약 → Edge Function 인터페이스
**코드 수준**: 패턴별 대표 API는 완전한 Before/After 코드 제공, 나머지는 변환 테이블 + "동일 패턴 적용" 안내
**Edge Function**: 앱에서 `supabase.functions.invoke()`로 호출하는 인터페이스만 정의. 실제 Deno 구현은 Step 4. <!-- Step 4 구현 후 확정 마커 -->
**주의**: Step 4 완료 후 Step 3 문서를 재검수하고, 확정 후 외주 개발자에게 전달.

### Step 4: Edge Functions 구현

**목표**: 앱에서 직접 처리할 수 없는 서버 사이드 로직을 Supabase Edge Functions로 구현한다.
**변경 사항** (2026-04-14): address-proxy 제거 (앱에서 카카오 주소 API 직접 호출), create-payment-request → create-reservation 이름 변경, 총 8→7개.

| # | 기능 | Edge Function명 | 상태 | 난이도 | 이유 |
|---|------|----------------|------|--------|------|
| 4-1 | 이니시스 결제 콜백 | inicis-callback | ⬜ 예정 | 상 | PG사 → 서버 직접 호출 |
| 4-2 | 채팅 메시지 전송 | send-chat-message | ⬜ 예정 | 상 | Storage + Realtime + FCM 연동 |
| 4-3 | 돌봄예약 생성/변경 | create-reservation | ⬜ 예정 | 상 | 채팅방 연결 + 시스템 메시지 + FCM |
| 4-4 | 돌봄 완료 처리 | complete-care | ⬜ 예정 | 중 | 상태 변경 + 시스템 메시지 + FCM |
| 4-5 | 카카오 알림톡 발송 | send-alimtalk | ⬜ 예정 | 중 | API 키 보호 (Secret 등록 완료) |
| 4-6 | FCM 푸시 알림 발송 | send-push | ⬜ 예정 | 중 | Firebase Admin SDK 서버 전용 (Secret 등록 완료) |
| 4-7 | 스케줄러 (자동 상태 변경) | scheduler | ⬜ 예정 | 상 | scheduler.php 대체 (pg_cron 5분 간격) |

> **제거된 항목**: ~~address-proxy~~ — 카카오 주소 검색은 앱에서 JavaScript API를 직접 호출하므로 서버 프록시 불필요. 네이버 역지오코딩(buildings.php)은 앱에서 직접 카카오 지도 API로 대체.
> **이름 변경**: create-payment-request → **create-reservation** (레거시 용어 통일)

### Step 5: 통합 테스트

**목표**: 전환된 앱과 기존 관리자 페이지가 같은 Supabase DB에서 동시에 정상 동작하는지 확인한다.

| # | 확인 항목 | 상태 |
|---|----------|------|
| 5-1 | 관리자 페이지 기존 기능 정상 동작 | ⬜ 예정 |
| 5-2 | 앱 회원가입/로그인 (Supabase Auth) | ⬜ 예정 |
| 5-3 | 앱 CRUD (조회/등록/수정/삭제) | ⬜ 예정 |
| 5-4 | 앱 채팅 (Supabase Realtime) | ⬜ 예정 |
| 5-5 | 앱 결제 (이니시스 테스트) | ⬜ 예정 |
| 5-6 | 앱 푸시 알림 (FCM) | ⬜ 예정 |

---

## 4. 테이블 매핑표 (MariaDB → Supabase) ✅ 완료

### 4-1. 이미 Supabase에 존재하는 테이블 (관리자 페이지용, 24개)

| Supabase 테이블 | MariaDB 원본 | 용도 | PHP API 참조 |
|-----------------|-------------|------|-------------|
| members | g5_member | 회원 | auth_request, set_join, 거의 모든 API에서 JOIN |
| kindergartens | g5_write_partner | 유치원(돌봄 파트너) | get_partner, set_partner_update/insert |
| pets | g5_write_animal | 반려동물 | get_my_animal, set_animal_insert/update/delete |
| reservations | payment_request | 돌봄예약(결제요청) | set_payment_request, get_payment_request |
| payments | inicis_payments | 이니시스 결제 원시 데이터 | set_inicis_approval, inicis_payment |
| refunds | (payment_request penalty 필드) | 환불/위약금 | set_payment_request (status update) |
| settlement_infos | settlement_info | 정산 계좌정보 | set_settlement_info, get_settlement_info |
| settlements | g5_write_payment | 정산 내역 | get_settlement_list |
| chat_rooms | room | 채팅방 | chat.php (create_room, get_rooms) |
| chat_messages | chat | 채팅 메시지 | chat.php (send_message, get_messages) |
| reports | (별도 관리) | 신고 | — |
| report_logs | (별도 관리) | 신고 처리이력 | — |
| guardian_reviews | review (type='pet') | 보호자 후기 | get_review, set_review |
| kindergarten_reviews | review (type='partner') | 유치원 후기 | get_review, set_review |
| education_topics | g5_write_education | 교육 주제 | get_education |
| education_quizzes | (wr_content JSON) | 교육 퀴즈 | get_education (JSON 파싱) |
| education_completions | g5_quiz_solved | 교육 이수 | set_solved |
| banners | g5_shop_banner | 배너 | get_banner |
| notices | g5_write_notice | 공지사항 | get_notice, get_notice_detail |
| faqs | g5_write_faq | FAQ | get_faq |
| terms | g5_content | 약관/정책 | get_policy |
| app_settings | g5_app_version + g5_member | 앱 설정 | get_setting |
| admin_accounts | (별도 관리) | 관리자 계정 | — |
| feedbacks | g5_write_opinion | 피드백/개선의견 | set_suggest_insert |

### 4-2. 추가 필요한 테이블 (✅ 확정 — 9개)

> 검토 결과 삭제된 항목:
> - ~~address_verifications~~ → `members.address_doc_urls` 컬럼으로 대체
> - ~~block_users~~ → `member_blocks` 테이블 이미 존재 (동일 기능)
> - ~~payment_request_rooms~~ → `chat_room_reservations` 테이블 이미 존재 (동일 기능)

| 신규 테이블 | MariaDB 원본 | 용도 | PHP API 참조 | 난이도 |
|------------|-------------|------|-------------|--------|
| **fcm_tokens** | fcm_token | FCM 토큰 저장 | fcm_token.php, chat.php (푸시 발송) | 쉬움 |
| **notifications** | notification | 앱 알림 내역 | get_notification, delete_notification, chat.php | 쉬움 |
| **pet_breeds** | animalKind | 견종/묘종 목록 (type 컬럼으로 구분, 현재 dog만 운영) | get_animal_kind.php | 쉬움 |
| **banks** | bank | 은행 목록 (code, name) | get_bank_list.php, settlement 관련 | 쉬움 |
| **favorite_kindergartens** | g5_favorite_partner | 유치원 즐겨찾기 | set_partner_favorite_add/remove, get_favorite_partner_list | 쉬움 |
| **favorite_pets** | g5_favorite_animal | 반려동물 즐겨찾기 | set_animal_favorite_add/remove, set_user_favorite_add/remove | 쉬움 |
| **chat_templates** | message_template + g5_write_chat_partner_guide + g5_write_chat_user_guide | 채팅 상용문구 + 가이드 문구 (type 컬럼으로 구분) | get_message_template, set_message_template, get_chat_partner_guide, get_chat_user_guide | 쉬움 |
| **chat_room_members** | room_members | 채팅방 참여자 (읽음 위치 추적, 알림 차단) | chat.php (핵심), read_chat.php | 중간 |
| **scheduler_history** | scheduler_history | 스케줄러 실행 이력 | scheduler.php | 쉬움 |

### 4-3. 불필요한 테이블 (전환 제외)

| 분류 | 수량 | 예시 | 이유 |
|------|------|------|------|
| 그누보드 시스템 | ~71개 | g5_config, g5_board, g5_point, g5_login | CMS 프레임워크 전용 |
| 그누보드 쇼핑몰 | ~25개 | g5_shop_*, g5_wzb_* | 미사용 쇼핑몰/예약 모듈 |
| SMS 모듈 | 6개 | sms5_* | 카카오 알림톡으로 대체 |
| 레거시 채팅 | 1개 | g5_chat | 구버전 채팅 (새 chat 테이블 사용 중) |
| 기타 미사용 | ~10개 | g5_write_mapv2, g5_write_gallery 등 | 앱에서 미참조 |

### 4-4. 주요 컬럼 매핑 (MariaDB → Supabase)

#### members (g5_member → members)

> 기존 31개 컬럼 + 신규 추가 10개 = 총 41개

| MariaDB 컬럼 | Supabase 컬럼 | 타입 | 상태 | 비고 |
|-------------|--------------|------|------|------|
| mb_no (PK, auto) | id | uuid | ✅ 존재 | Supabase Auth uid |
| mb_id | phone | text | ✅ 존재 | 폰번호가 ID |
| mb_name | name | text | ✅ 존재 | |
| mb_nick | nickname | text | ✅ 존재 | |
| — | nickname_tag | text | ✅ 존재 | Supabase 신규 (#1001 형식) |
| mb_profile1 | profile_image | text | ✅ 존재 | Storage URL |
| mb_2 | birth_date | date | ✅ 존재 | 주민번호 앞자리 → 생년월일 |
| mb_sex | gender | text | ✅ 존재 | |
| mb_4 | address_complex | text | ✅ 존재 | 아파트/단지명 |
| mb_addr1 | address_road | text | ✅ 존재 | 도로명주소 |
| dong | address_building_dong | text | ✅ 존재 | 동 |
| ho | address_building_ho | text | ✅ 존재 | 호 |
| mb_5 | current_mode | text | ✅ 존재 | '1'→보호자, '2'→유치원 |
| mb_1 | carrier | text | ✅ 존재 | 통신사 |
| — | identity_verified | bool | ✅ 존재 | 본인인증 여부 |
| — | identity_method | text | ✅ 존재 | 인증 방법 |
| — | identity_carrier | text | ✅ 존재 | 인증 통신사 |
| — | identity_verified_at | timestamptz | ✅ 존재 | 인증 일시 |
| — | address_auth_status | text | ✅ 존재 | 주소인증 상태 |
| — | address_auth_date | timestamptz | ✅ 존재 | 주소인증 일시 |
| mb_join_status / mb_leave_status | status | text | ✅ 존재 | 정상/탈퇴/정지 |
| — | noshow_count | int | ✅ 존재 | 노쇼 횟수 |
| — | noshow_sanction | text | ✅ 존재 | 노쇼 제재 상태 |
| — | noshow_sanction_end | timestamptz | ✅ 존재 | 노쇼 제재 종료일 |
| — | suspend_start | timestamptz | ✅ 존재 | 정지 시작일 |
| — | suspend_end | timestamptz | ✅ 존재 | 정지 종료일 |
| — | suspend_reason | text | ✅ 존재 | 정지 사유 |
| mb_leave_reason | withdraw_reason | text | ✅ 존재 | 탈퇴 사유 |
| mb_leave_date | withdrawn_at | timestamptz | ✅ 존재 | 탈퇴 일시 |
| — | created_at | timestamptz | ✅ 존재 | |
| mb_9 | latitude | numeric | 🆕 추가 | 위도 (위치 기반 유치원 검색) |
| mb_10 | longitude | numeric | 🆕 추가 | 경도 |
| mb_language | language | text | 🆕 추가 | 앱 언어 (기본값 '한국어') |
| mb_app_version | app_version | text | 🆕 추가 | 앱 버전 (강제 업데이트 체크) |
| chat_notify | chat_notify | boolean | 🆕 추가 | 채팅 알림 DEFAULT true |
| reserve_notify | reservation_notify | boolean | 🆕 추가 | 예약 알림 DEFAULT true |
| attendance_notify | checkinout_notify | boolean | 🆕 추가 | 등하원 알림 DEFAULT true |
| review_notify | review_notify | boolean | 🆕 추가 | 후기 알림 DEFAULT true |
| new_kinder_notify | new_kindergarten_notify | boolean | 🆕 추가 | 신규 유치원 알림 DEFAULT true |
| direct | address_direct | text | 🆕 추가 | 직접입력 주소 |
| — | address_doc_urls | text[] | ✅ 존재 | 주소 인증 서류 이미지 URL |

#### kindergartens (g5_write_partner → kindergartens)

> 기존 35개 컬럼 + 신규 추가 3개 = 총 38개

| MariaDB 컬럼 | Supabase 컬럼 | 타입 | 상태 | 비고 |
|-------------|--------------|------|------|------|
| wr_id (PK) | id | uuid | ✅ 존재 | |
| mb_id | member_id (FK) | uuid | ✅ 존재 | members 참조 |
| wr_subject | name | text | ✅ 존재 | 유치원 이름 |
| wr_content | description | text | ✅ 존재 | 유치원 소개 |
| wr_2 | price_small_1h ~ price_large_walk (12개) | integer | ✅ 존재 | 파이프 구분 → 12개 개별 컬럼 |
| partner_img1~10 | photo_urls | text[] | ✅ 존재 | 개별 10개 → 배열 1개 |
| freshness | freshness_current | integer | ✅ 존재 | 현재 신선도 |
| — | freshness_initial | integer | ✅ 존재 | 초기 신선도 |
| business_status | business_status | text | ✅ 존재 | 영업중/방학중 |
| settlement_ready | settlement_status | text | ✅ 존재 | 0/1 → 작성중/제출됨/승인/거절 |
| mb_addr1 | address_road | text | ✅ 존재 | 도로명주소 |
| mb_4 | address_complex | text | ✅ 존재 | 단지명 |
| — | address_jibun | text | ✅ 존재 | 지번주소 |
| mb_dong | address_building_dong | text | ✅ 존재 | 동 |
| mb_ho | address_building_ho | text | ✅ 존재 | 호 |
| auth_status | address_auth_status | text | ✅ 존재 | 인증상태 |
| — | address_auth_date | timestamptz | ✅ 존재 | 인증일시 |
| — | inicis_status | text | ✅ 존재 | 이니시스 등록상태 |
| — | inicis_submall_code | text | ✅ 존재 | 서브몰 코드 |
| — | seller_id | text | ✅ 존재 | 판매자 ID |
| — | noshow_count | int | ✅ 존재 | 노쇼 횟수 |
| — | noshow_sanction | text | ✅ 존재 | 노쇼 제재 |
| — | address_doc_urls | ARRAY | ✅ 존재 | 주소 인증 서류 (members와 동기화 트리거 예정 — Step 2에서 처리) |
| — | created_at | timestamptz | ✅ 존재 | |
| mb_9 | latitude | numeric | 🆕 추가 | 유치원 위도 |
| mb_10 | longitude | numeric | 🆕 추가 | 유치원 경도 |
| wr_6 | registration_status | text | 🆕 추가 | 등록 상태 (temp=임시저장) |

> **검토 결과 불필요로 삭제된 매핑:**
> - wr_1 (`has_own_pet`) → `kindergarten_resident_pets` 테이블로 판단 가능
> - wr_3 (`bank_name`) → `settlement_infos.account_bank` 에 존재
> - wr_4 (`bank_account`) → `settlement_infos.account_number` 에 존재
> - wr_5 (`education_completed`) → `education_completions` 테이블로 판단 가능

#### reservations (payment_request → reservations)

> 기존 21개 컬럼 + 신규 추가 4개 = 총 25개

| MariaDB 컬럼 | Supabase 컬럼 | 타입 | 상태 | 비고 |
|-------------|--------------|------|------|------|
| id (PK, auto) | id | uuid | ✅ 존재 | |
| mb_id | member_id (FK) | uuid | ✅ 존재 | 보호자 (요청자) |
| to_mb_id | kindergarten_id (FK) | uuid | ✅ 존재 | 유치원 |
| pet_id | pet_id (FK) | uuid | ✅ 존재 | 반려동물 |
| start_date + start_time | checkin_scheduled | timestamptz | ✅ 존재 | 등원 예정 |
| end_date + end_time | checkout_scheduled | timestamptz | ✅ 존재 | 하원 예정 |
| — | checkin_actual | timestamptz | ✅ 존재 | 실제 등원 |
| — | checkout_actual | timestamptz | ✅ 존재 | 실제 하원 |
| walk_count | walk_count | int | ✅ 존재 | 산책 횟수 |
| pickup_dropoff | pickup_requested | bool | ✅ 존재 | tinyint→bool |
| status | status | text | ✅ 존재 | 수락대기/예약확정/돌봄진행중/돌봄완료 등 |
| reject_reason | reject_reason | text | ✅ 존재 | 거절 사유 |
| — | reject_detail | text | ✅ 존재 | 거절 상세 |
| — | rejected_at | timestamptz | ✅ 존재 | 거절 일시 |
| — | requested_at | timestamptz | ✅ 존재 | 요청 일시 |
| — | guardian_checkout_confirmed | bool | ✅ 존재 | 보호자 하원 확인 |
| — | kg_checkout_confirmed | bool | ✅ 존재 | 유치원 하원 확인 |
| — | guardian_checkout_confirmed_at | timestamptz | ✅ 존재 | 보호자 하원 확인 시각 |
| — | kg_checkout_confirmed_at | timestamptz | ✅ 존재 | 유치원 하원 확인 시각 |
| — | auto_complete_scheduled_at | timestamptz | ✅ 존재 | 자동 완료 예정 시각 (스케줄러 Edge Function에서 사용) |
| created_at | created_at | timestamptz | ✅ 존재 | |
| reminder_start_sent_at | reminder_start_sent_at | timestamptz | 🆕 추가 | 등원 알림 발송 시각 (스케줄러 중복 방지) |
| reminder_end_sent_at | reminder_end_sent_at | timestamptz | 🆕 추가 | 하원 알림 발송 시각 |
| care_start_sent_at | care_start_sent_at | timestamptz | 🆕 추가 | 돌봄시작 알림 발송 시각 |
| care_end_sent_at | care_end_sent_at | timestamptz | 🆕 추가 | 돌봄종료 알림 발송 시각 |

> **검토 결과 불필요로 삭제된 매핑:**
> - `price` → `payments.amount` 에 존재
> - `penalty` → `refunds.penalty_amount` 에 존재
> - `payment_id` → `payments.reservation_id` 로 역참조
> - `is_review_written` → `guardian_reviews`/`kindergarten_reviews` JOIN으로 판단
> - `is_settled` → `settlements` 테이블에서 관리

#### 기타 매핑 참고 (매니저 검토 추가분)

| 테이블 | 컬럼 | 타입 | 상태 | 비고 |
|--------|------|------|------|------|
| payments | cancel_reason | text | ✅ 존재 | 결제 취소 사유 (향후 앱 취소 기능 추가 예정) |
| kindergarten_reviews | is_guardian_only | bool | ✅ 존재 | '보호자에게만 보이는 후기' 필터링 |
| chat_messages | image_urls | jsonb | ✅ 존재 | 채팅 이미지 URL 배열 (file_path 대체) |

---

## 5. API 전환 매핑표 (PHP → Supabase) ✅ 교정 완료 (2026-04-14)

> **교정 사항 (2026-04-14)**: 앱 소스코드 실사 결과 실제 호출되는 PHP API 60개 확인. 기존 매핑표 85개 중 미사용 19개 제거, 누락 3개 추가. Edge Functions 8→7개 (address-proxy 제거). RPC 10→7개 (get_main_partner, get_partner_status, get_partner_by_phone 은 자동 API로 재분류 또는 제거). 총 62→~47개.

### 전환 방식 분류 (교정 확정)

| 전환 방식 | 설명 | 교정 전 | 교정 후 | 변동 |
|----------|------|--------|--------|------|
| **자동 API** | Supabase PostgREST 직접 호출 (단순 CRUD) | 37개 | ~25개 | -12 |
| **RPC** | Supabase RPC 함수 (복잡한 조회/JOIN/집계, app_ 접두어) | 10개 | 7개 | -3 |
| **Edge Function** | 서버 사이드 필수 (결제, FCM, 채팅 메시지) | 8개 | 7개 | -1 |
| **Supabase Auth** | 인증 관련 (Phone OTP) | 2개 | 2개 | 0 |
| **Supabase Realtime** | WebSocket 대체 (채팅 수신) | 3개 | 3개 | 0 |
| **제거** | toss_payment, 미사용 API 등 | 2개 | 3개 | +1 |
| **합계** | | **62개** | **~47개** | -15 |

### 5-1. 인증/회원 (7개)

| # | PHP API | 방식 | Supabase 대응 | DB 테이블 | 난이도 |
|---|---------|------|--------------|----------|--------|
| 1 | alimtalk.php | Edge Function | send-alimtalk: 카카오 알림톡 API → 인증번호 발송 | — (Supabase Auth) | 중 |
| 2 | auth_request.php | Supabase Auth | signInWithOtp() + verifyOtp() → members SELECT | members | 중 |
| 3 | set_join.php | 자동 API | Supabase Auth signUp() → members UPSERT | members | 쉬움 |
| 4 | set_member_leave.php | RPC | app_withdraw_member: members UPDATE (탈퇴) + 관련 데이터 정리 | members | 중 |
| 5 | set_mypage_mode_update.php | 자동 API | members UPDATE (current_mode) | members | 쉬움 |
| 6 | set_profile_update.php | 자동 API + Storage | members UPDATE + Storage 프로필 이미지 업로드 | members | 쉬움 |
| 7 | set_address_verification.php | 자동 API + Storage | members UPDATE (address_doc_urls) + Storage 서류 업로드 | members | 쉬움 |

### 5-2. 반려동물 (7개)

| # | PHP API | 방식 | Supabase 대응 | 난이도 |
|---|---------|------|--------------|--------|
| 8 | get_my_animal.php | 자동 API | pets SELECT WHERE member_id=auth.uid() AND deleted=false | 쉬움 |
| 9 | get_animal_by_id.php | 자동 API | pets SELECT WHERE id=? + favorite_pets 조인 | 쉬움 |
| 10 | get_animal_kind.php | 자동 API | pet_breeds SELECT WHERE name ILIKE ? | 쉬움 |
| 11 | set_animal_insert.php | 자동 API + Storage | pets INSERT + Storage 이미지 (최대 10개) + 4마리 제한 체크 | 쉬움 |
| 12 | set_animal_update.php | 자동 API + Storage | pets UPDATE + Storage 이미지 교체 | 쉬움 |
| 13 | set_animal_delete.php | 자동 API | pets UPDATE (soft delete: deleted=true) | 쉬움 |
| 14 | set_first_animal_set.php | RPC | app_set_representative_pet: pets BATCH UPDATE (기존 is_representative=false → 선택 is_representative=true) | 쉬움 |

> **제거**: get_animal_by_mb_id.php — get_my_animal.php와 동일 기능 (member_id로 반려동물 조회), 앱에서 미호출 확인

### 5-3. 유치원/보호자 (6개)

| # | PHP API | 방식 | Supabase 대응 | 난이도 |
|---|---------|------|--------------|--------|
| 15 | get_partner.php | RPC | app_get_kindergarten_detail: kindergartens + members + favorite + settlement + pets JOIN | 중 |
| 16 | get_partner_list.php | RPC | app_get_kindergartens: kindergartens 목록 + favorite + review COUNT | 중 |
| 17 | set_partner_update.php | 자동 API + Storage | kindergartens UPDATE + 이미지 + settlement_info UPSERT + pets UPSERT | 중 |
| 18 | set_partner_insert.php | 자동 API + Storage | kindergartens INSERT + pets BATCH INSERT | 중 |
| 19 | get_protector.php | RPC | app_get_guardian_detail: members + pets + favorite JOIN (보호자 상세) | 중 |
| 20 | get_protector_list.php | RPC | app_get_guardians: members 목록 + pets + favorite JOIN (보호자 목록) | 중 |

### 5-4. 채팅 (7개) — **가장 복잡한 영역**

| # | PHP API | 방식 | Supabase 대응 | 난이도 |
|---|---------|------|--------------|--------|
| 21 | chat.php → create_room | 자동 API | chat_rooms INSERT + chat_room_members INSERT (2건) — 앱에서 트랜잭션 처리 | 중 |
| 22 | chat.php → get_rooms | 자동 API | chat_rooms SELECT + chat_room_members 관계 조회 + last_message 서브쿼리 | 중 |
| 23 | chat.php → get_messages | 자동 API | chat_messages SELECT (room_id 필터, 페이징) + last_read_message_id UPDATE | 중 |
| 24 | chat.php → send_message | Edge Function | send-chat-message: chat_messages INSERT + Storage 파일 + **Realtime 브로드캐스트** + FCM 푸시 + notification INSERT | 상 |
| 25 | chat.php → get_images | 자동 API | chat_messages SELECT WHERE image_urls IS NOT NULL | 쉬움 |
| 26 | chat.php → leave_room / muted | 자동 API | chat_room_members UPDATE (is_left=true / is_muted=true) | 쉬움 |
| 27 | read_chat.php | 자동 API | chat_room_members UPDATE (last_read_message_id) | 쉬움 |

> **참고**: 구버전 채팅 API (get_chat_list.php, set_chat_insert.php)는 g5_chat 테이블 사용 → 폐기 대상.
> 현행 채팅은 chat.php (router 패턴) + room/chat/room_members 테이블 사용.
> 채팅방 생성(create_room)과 메시지 목록(get_rooms)은 기존 RPC에서 자동 API로 재분류 — Supabase PostgREST의 관계 조회(embed)로 충분.

### 5-5. 결제/예약 (5개)

| # | PHP API | 방식 | Supabase 대응 | 난이도 |
|---|---------|------|--------------|--------|
| 28 | inicis_payment.php | Edge Function | inicis-callback: PG사 콜백 수신 → payments UPSERT → WebView 결과 반환 | 상 |
| 29 | set_inicis_approval.php | Edge Function | inicis-callback 내부 처리: payments UPSERT (oid 기준) + raw_response 저장 | 중 |
| 30 | set_payment_request.php | Edge Function | create-reservation: reservations INSERT/UPDATE + 채팅방 연결 + 시스템 메시지 + FCM | 상 |
| 31 | get_payment_request.php | RPC | app_get_reservations: reservations + pets + kindergartens + members JOIN (목록) | 중 |
| 32 | get_payment_request_by_id.php | RPC | app_get_reservation_detail: reservations (단건) + payments + pets + kindergartens + members | 중 |

### 5-6. 돌봄 상태 관리 (3개)

| # | PHP API | 방식 | Supabase 대응 | 난이도 |
|---|---------|------|--------------|--------|
| 33 | set_care_request.php | 자동 API | reservations UPDATE (status 변경) | 쉬움 |
| 34 | set_care_complete.php | Edge Function | complete-care: reservations UPDATE + 시스템 메시지 + Realtime + FCM | 상 |
| 35 | set_care_review.php | 자동 API | guardian_reviews/kindergarten_reviews INSERT (후기 작성) | 쉬움 |

### 5-7. 정산 (4개)

| # | PHP API | 방식 | Supabase 대응 | 난이도 |
|---|---------|------|--------------|--------|
| 36 | get_settlement.php + get_settlement_list.php | RPC | app_get_settlement_summary: reservations 집계 (settled/unsettled) + 기간 필터 + 월별 GROUP BY | 중 |
| 37 | get_settlement_info.php | 자동 API | settlement_infos SELECT + kindergartens 관계 조회 | 쉬움 |
| 38 | set_settlement_info.php | 자동 API | settlement_infos UPSERT (계좌 정보 등록/수정) | 중 |
| 39 | set_settlement_admin_approve.php | 자동 API | settlement_infos UPDATE (status='active') — 관리자 전용 | 쉬움 |

> **통합**: get_settlement.php와 get_settlement_list.php를 app_get_settlement_summary RPC로 통합 (5→4개)

### 5-8. 리뷰 (3개)

> 참고: set_care_review.php는 5-6 돌봄 상태 관리 35번에서 처리 (후기 작성). 중복 제거.

| # | PHP API | 방식 | Supabase 대응 | 난이도 |
|---|---------|------|--------------|--------|
| 40 | get_review.php | RPC | app_get_reviews: guardian_reviews/kindergarten_reviews + 태그 집계 + pets/kindergartens JOIN + is_guardian_only 필터 | 중 |
| 41 | get_review_string.php | 자동 API | (리뷰 문구 마스터) → 별도 테이블 or 앱 내장 | 쉬움 |
| 42 | set_review.php | 자동 API + Storage | guardian_reviews 또는 kindergarten_reviews INSERT + Storage 이미지 | 쉬움 |

### 5-9. 즐겨찾기 (4개)

| # | PHP API | 방식 | Supabase 대응 | 난이도 |
|---|---------|------|--------------|--------|
| 43 | set_partner_favorite_add.php | 자동 API | favorite_kindergartens INSERT (member_id, kindergarten_id) | 쉬움 |
| 44 | set_partner_favorite_remove.php | 자동 API | favorite_kindergartens DELETE | 쉬움 |
| 45 | set_user_favorite_add.php / set_animal_favorite_add.php | 자동 API | favorite_pets INSERT (member_id, pet_id) — 보호자·유치원 동일 테이블 | 쉬움 |
| 46 | set_user_favorite_remove.php / set_animal_favorite_remove.php | 자동 API | favorite_pets DELETE | 쉬움 |

> **통합**: set_animal_favorite_add/remove와 set_user_favorite_add/remove는 동일 테이블(favorite_pets) 대상 — 기능 동일하므로 각각 1개 API로 통합 (6→4개)

### 5-10. 알림/FCM (5개)

| # | PHP API | 방식 | Supabase 대응 | 난이도 |
|---|---------|------|--------------|--------|
| 47 | fcm_token.php | 자동 API | fcm_tokens UPSERT (member_id + device_id 중복 체크) | 쉬움 |
| 48 | get_notification.php | 자동 API | notifications SELECT WHERE member_id=auth.uid() ORDER BY created_at DESC | 쉬움 |
| 49 | delete_notification.php | 자동 API | notifications DELETE (전체 or 단건) | 쉬움 |
| 50 | get_notify_setting.php | 자동 API | members SELECT (chat_notify, reservation_notify, checkinout_notify, review_notify, new_kindergarten_notify) | 쉬움 |
| 51 | set_notify_setting_update.php | 자동 API | members UPDATE (5개 알림 설정 컬럼) | 쉬움 |

### 5-11. 콘텐츠/기타 조회 (8개)

| # | PHP API | 방식 | Supabase 대응 | 난이도 |
|---|---------|------|--------------|--------|
| 52 | get_banner.php | 자동 API | banners SELECT (페이징) | 쉬움 |
| 53 | get_notice.php | 자동 API | notices SELECT WHERE visible=true (페이징) | 쉬움 |
| 54 | get_notice_detail.php | 자동 API | notices SELECT WHERE id=? | 쉬움 |
| 55 | get_faq.php | 자동 API | faqs SELECT (검색, 페이징) | 쉬움 |
| 56 | get_policy.php | 자동 API | terms SELECT (카테고리 필터) | 쉬움 |
| 57 | get_guide.php | 자동 API | chat_templates SELECT WHERE type='guide' (가이드) | 쉬움 |
| 58 | get_kakaolink.php | 자동 API | app_settings or 앱 내장 (카카오링크 설정) | 쉬움 |
| 59 | get_bank_list.php | 자동 API | banks SELECT WHERE is_active=true ORDER BY sort_order | 쉬움 |

### 5-12. 차단 (3개)

| # | PHP API | 방식 | Supabase 대응 | 난이도 |
|---|---------|------|--------------|--------|
| 60 | set_block_user_add.php | 자동 API | member_blocks INSERT (blocker_id, blocked_id) | 쉬움 |
| 61 | set_block_user_remove.php | 자동 API | member_blocks DELETE or UPDATE (unblocked_at=NOW()) | 쉬움 |
| 62 | get_block_user.php / get_blocked_list.php | 자동 API | member_blocks SELECT + members 관계 조회 (차단 목록) | 쉬움 |

> **통합/제거**: set_block_user.php (토글)은 set_block_user_add/remove로 분리되어 중복 → 제거. get_block_user.php와 get_blocked_list.php는 동일 기능 → 1개로 통합 (5→3개)

### 5-13. 기타 (10개)

| # | PHP API | 방식 | Supabase 대응 | 난이도 |
|---|---------|------|--------------|--------|
| 63 | get_education.php | RPC | app_get_education_with_progress: education_topics + quizzes + completions JOIN (이수 여부) | 중 |
| 64 | set_solved.php | 자동 API | education_completions INSERT (중복 체크) | 쉬움 |
| 65 | get_setting.php | 자동 API | members SELECT (language, app_version) + app_settings SELECT | 쉬움 |
| 66 | set_suggest_insert.php | 자동 API | feedbacks INSERT | 쉬움 |
| 67 | get_message_template.php | 자동 API | chat_templates SELECT WHERE member_id=auth.uid() AND type='custom' | 쉬움 |
| 68 | set_message_template.php | 자동 API | chat_templates INSERT (type='custom') | 쉬움 |
| 69 | delete_message_template.php | 자동 API | chat_templates DELETE WHERE id=? AND member_id=auth.uid() | 쉬움 |
| 70 | update_message_template.php | 자동 API | chat_templates UPDATE WHERE id=? AND member_id=auth.uid() | 쉬움 |
| 71 | get_favorite_animal_list.php | 자동 API | favorite_pets SELECT + pets 관계 조회 (유치원이 찜한 반려동물) | 쉬움 |
| 72 | get_favorite_partner_list.php | 자동 API | favorite_kindergartens SELECT + kindergartens 관계 조회 (보호자가 찜한 유치원) | 쉬움 |

> **제거된 API (미사용 확인)**:
> - get_educationN.php — 하드코딩 교육 데이터, get_education.php로 통합
> - get_main_partner.php — get_partner_list.php (app_get_kindergartens)와 동일 기능
> - get_partner_status.php — 앱 소스에서 미호출 확인
> - get_partner_by_phone.php — 앱 소스에서 미호출 확인
> - buildings.php — 네이버 역지오코딩, 앱에서 카카오 지도 API로 대체
> - get_address.php — 행안부 주소 API, 앱에서 카카오 주소 API 직접 호출로 대체
> - scheduler.php — Edge Function scheduler로 이관 (Step 4-7에서 처리)
>
> **추가된 API (누락 발견)**:
> - kakao-address.php → 앱에서 카카오 주소 JavaScript API 직접 호출로 대체 (서버 프록시 불필요)
> - delete_message_template.php → 자동 API (chat_templates DELETE)
> - update_message_template.php → 자동 API (chat_templates UPDATE)

### 5-14. 관리자 전용 (이미 Supabase 연결, 앱 전환 불필요)

| PHP API | 현재 상태 | 비고 |
|---------|----------|------|
| get_admin_settlement_queue.php | 관리자 페이지 Supabase RPC 사용 | 앱 전환 불필요 |
| get_admin_settlement_detail.php | 관리자 페이지 Supabase RPC 사용 | 앱 전환 불필요 |

### 5-15. 제거 대상

| PHP API | 이유 |
|---------|------|
| toss_payment.php | 미구현, 사용 안 함 ⚠️ 레거시: 앱 코드에 toss_payment.php 호출 흔적이 있으나 실제 결제 플로우에서 미사용. 이니시스만 운영 중 |
| toss_payment_approval.php | 미구현, 사용 안 함 |
| get_chat_list.php (구버전) | g5_chat 사용 → 폐기 (새 chat.php 사용 중) |
| set_chat_insert.php (구버전) | g5_chat 사용 → 폐기 |
| get_animal_by_mb_id.php | get_my_animal.php와 동일 기능, 앱에서 미호출 |
| set_block_user.php | set_block_user_add/remove로 분리되어 중복 |
| get_blocked_list.php | get_block_user.php와 동일 기능 |
| get_educationN.php | 하드코딩 교육 데이터, get_education.php에 통합 |
| get_main_partner.php | get_partner_list.php와 동일 기능 |
| get_partner_status.php | 앱 소스에서 미호출 확인 |
| get_partner_by_phone.php | 앱 소스에서 미호출 확인 |
| buildings.php | 카카오 지도 API로 대체 |
| get_address.php | 카카오 주소 API 직접 호출로 대체 |
| kakao-address.php | 앱에서 카카오 주소 JavaScript API 직접 호출로 대체 |
| 백업 파일 14개 (*260111.php 등) | 구버전 |

> **미사용 19개 API 제거 요약**: 위 표의 항목 중 기존 매핑표에 포함되어 있었으나 앱 소스코드 실사에서 미호출로 확인된 API들을 정리. 원래 85개 매핑 → 66개 유효 → 통합/제거 후 ~47개 전환 대상.

---

## 6. 스키마 보강 목록 ✅ 완료

### 6-1. 신규 테이블 SQL (9개)

> 검토 결과 삭제: ~~block_users~~ (→ member_blocks 존재), ~~payment_request_rooms~~ (→ chat_room_reservations 존재), ~~address_verifications~~ (→ members.address_doc_urls)

| SQL 파일 | 내용 | 상태 |
|---------|------|------|
| sql/41_01_app_fcm_tokens.sql | fcm_tokens 테이블 (member_id, device_id, token, platform) | ✅ 실행 완료 |
| sql/41_02_app_notifications.sql | notifications 테이블 (member_id, type, title, content) | ✅ 실행 완료 |
| sql/41_03_app_pet_breeds.sql | pet_breeds 테이블 (type, name) + 초기 데이터 72건 | ✅ 실행 완료 |
| sql/41_04_app_banks.sql | banks 테이블 (code, name, is_active, sort_order) + 초기 데이터 24건 | ✅ 실행 완료 |
| sql/41_05_app_favorite_kindergartens.sql | favorite_kindergartens 테이블 (member_id, kindergarten_id) | ✅ 실행 완료 |
| sql/41_06_app_favorite_pets.sql | favorite_pets 테이블 (member_id, pet_id) | ✅ 실행 완료 |
| sql/41_07_app_chat_templates.sql | chat_templates 테이블 (type, member_id, title, content) — 상용문구+가이드 통합 | ✅ 실행 완료 |
| sql/41_08_app_chat_room_members.sql | chat_room_members 테이블 (room_id, member_id, role, last_read_message_id, is_muted) | ✅ 실행 완료 |
| sql/41_09_app_scheduler_history.sql | scheduler_history 테이블 (started_at, finished_at, status) | ✅ 실행 완료 |

### 6-2. 기존 테이블 변경 SQL

| SQL 파일 | 내용 | 상태 |
|---------|------|------|
| sql/42_01_members_add_app_columns.sql | members에 10개 컬럼 추가 (latitude, longitude, language, app_version, chat_notify, reservation_notify, checkinout_notify, review_notify, new_kindergarten_notify, address_direct) — 알림 5개는 boolean DEFAULT true | ✅ 실행 완료 |
| sql/42_02_kindergartens_add_columns.sql | kindergartens에 3개 컬럼 추가 (latitude, longitude, registration_status) | ✅ 실행 완료 |
| sql/42_03_reservations_add_scheduler_columns.sql | reservations에 4개 컬럼 추가 (reminder_start_sent_at, reminder_end_sent_at, care_start_sent_at, care_end_sent_at) + 4개 partial index | ✅ 실행 완료 |
| sql/42_04_pets_verify_columns.sql | pets wr_1~wr_11 매핑 검증 (DDL 변경 없음, 14개 컬럼 확인) | ✅ 실행 완료 |
| sql/42_05_address_doc_urls_sync_trigger.sql | members → kindergartens address_doc_urls 동기화 트리거 + 일괄 동기화 | ✅ 실행 완료 |
| sql/42_06_pets_add_draft_birth_columns.sql | pets에 2개 컬럼 추가 (is_birth_date_unknown, is_draft) + idx_pets_draft 인덱스 | ✅ 실행 완료 |

### 6-3. 앱 사용자용 RLS 정책

| SQL 파일 | 내용 | 상태 |
|---------|------|------|
| sql/43_01_app_rls_policies.sql | 앱 사용자 RLS 79개 정책 (39테이블, 661줄): owner CRUD 12, read/update 8, public-select 13, subquery 5, admin-only 8개 제외. auth.uid() 직접 사용 | ✅ 실행 완료 |
| sql/43_02_app_storage_policies.sql | Storage 버킷 6개 생성 (profile-images, pet-images, kindergarten-images, chat-files, review-images, address-docs) + 정책 20개 + education-images admin 전용 전환 (318줄) | ✅ 실행 완료 |

---

## 7. Edge Functions 설계 ✅ 교정 완료 (2026-04-14)

> **변경 사항 (2026-04-14)**: address-proxy 제거 (앱에서 카카오 API 직접 호출), create-payment-request → create-reservation 이름 변경, 총 8→7개.

### 7-1. 함수 목록 (7개)

| # | 함수명 | 용도 | PHP 원본 | 트리거 | 난이도 |
|---|--------|------|---------|--------|--------|
| 1 | **inicis-callback** | 이니시스 결제 콜백 → 결과를 DB 저장 → WebView HTML 반환 | inicis_payment.php, set_inicis_approval.php | PG사 POST 호출 | 상 |
| 2 | **send-chat-message** | 채팅 메시지 저장 + Storage 파일 + Realtime 브로드캐스트 + FCM 푸시 | chat.php → send_message | 앱 호출 | 상 |
| 3 | **create-reservation** | 돌봄예약 생성/변경 + 채팅방 연결 + 시스템 메시지 + FCM | set_payment_request.php | 앱 호출 | 상 |
| 4 | **complete-care** | 돌봄 완료 처리 + care_end/review 시스템 메시지 + Realtime + FCM | set_care_complete.php, scheduler.php 일부 | 앱 호출 | 중 |
| 5 | **send-alimtalk** | 카카오 알림톡 SMS 발송 (인증번호) | alimtalk.php | 앱 호출 | 중 |
| 6 | **send-push** | FCM 푸시 알림 발송 (범용) | chat.php/scheduler.php 내부 | 다른 Edge Function에서 내부 호출 | 중 |
| 7 | **scheduler** | 등원/하원 30분 전 알림 + 돌봄 시작/종료 자동 처리 | scheduler.php | pg_cron (5분 간격) or 외부 cron | 상 |

> **제거**: ~~address-proxy~~ — 카카오 주소 검색은 앱에서 JavaScript API 직접 호출. 네이버 역지오코딩은 카카오 지도 API로 대체. 관련 Secrets (JUSO_CONFM_KEY, NAVER_MAP_CLIENT_ID/SECRET)는 미사용 처리.
> **이름 변경**: create-payment-request → **create-reservation** — 레거시 용어(payment_request) 통일

### 7-2. 상세 설계

#### 7-2-1. inicis-callback (이니시스 결제 콜백)

```
입력: PG사 POST (P_STATUS, P_OID, P_TID, P_AMT, P_NOTI 등)
처리:
  1. P_NOTI JSON 파싱 → mode, roomId, paymentRequestId 추출
  2. payments 테이블 UPSERT (oid 기준)
  3. 성공/실패 판단 후 HTML 페이지 반환 (ReactNativeWebView.postMessage)
출력: HTML (앱 WebView에서 결과 수신)
주의: P_OID 빈 경우 P_TID로 대체, raw_response 전체 저장
```

#### 7-2-2. send-chat-message (채팅 메시지 전송)

```
입력: room_id, mb_id, content, message_type, file(선택)
처리:
  1. 채팅방 멤버 검증
  2. 파일 있으면 Storage 업로드 → URL 획득
  3. chat_messages INSERT
  4. Supabase Realtime 채널로 브로드캐스트
  5. 상대방 FCM 토큰 조회 → 푸시 발송 (is_muted 체크)
  6. notifications INSERT
출력: 성공/실패
```

#### 7-2-3. create-reservation (돌봄예약 생성/변경) — 이전 이름: create-payment-request

```
입력: member_id, kindergarten_id, pet_id, checkin_scheduled, checkout_scheduled, walk_count, pickup_requested, payment_id, room_id(선택)
처리:
  1. reservations INSERT (status='pending')
  2. payments 연결 (payment_id)
  3. room_id 없으면 채팅방 자동 생성 (create_room 로직 재현)
  4. chat_room_reservations INSERT
  5. chat_messages INSERT (message_type='reservation_request')
  6. Realtime 브로드캐스트
  7. 상대방 FCM 푸시 (send-push 내부 호출)
  8. notifications INSERT
업데이트 모드: reservation_id 있으면 UPDATE만 (status, reject_reason 등)
  - status='canceled'/'completed' 시 시스템 메시지 + FCM 추가 발송
```

#### 7-2-4. scheduler (자동 상태 변경)

```
실행 주기: 5분 간격 (pg_cron 또는 외부 cron)
처리:
  1. 등원 30분 전 알림 (reminder_start_sent_at IS NULL)
  2. 하원 30분 전 알림 (reminder_end_sent_at IS NULL)
  3. 돌봄 시작 시점: chat_messages INSERT (care_start) + Realtime
  4. 돌봄 종료 시점: chat_messages INSERT (care_end + review) + Realtime + FCM + status='care_completed'
  5. 자동 완료: auto_complete_scheduled_at 도달 시 자동으로 돌봄완료 처리
     (양측 모두 하원확인을 안 한 경우 일정 시간 후 자동 완료)
  6. scheduler_history 기록
```

---

## 8. 보안 사고 기록

### 2026-04-11: GitHub 저장소 키 노출

| 항목 | 내용 |
|------|------|
| 원인 | wooyoopet-backend 저장소를 Public 전환 시 민감 파일 포함 |
| 노출 정보 | Firebase 서비스 키 (6ad25285...), FTP 비밀번호, 서버 root 비밀번호, SSL 인증서 |
| 조치 | 즉시 Private 전환 완료 → 저장소 삭제 완료 (2026-04-14) |
| 후속 조치 완료 | ✅ Firebase 키 교체 완료 (2026-04-14), ✅ wooyoopet-backend 저장소 삭제 완료 |
| 후속 조치 예정 | 기존 서버(스마일서브) 해지 시 비밀번호 문제 자동 해소 (Phase 6) |
| 피해 | 노출 시간 극히 짧아 실피해 가능성 낮음, GitHub 자동 스캔이 감지 |

---

## 9. 주의사항 및 원칙

### 9-1. 관리자 페이지와 DB 공유

모바일 앱과 관리자 페이지는 **같은 Supabase DB**를 사용한다. 따라서:
- 테이블 구조 변경 시 관리자 페이지 JS 코드에도 영향이 있는지 확인
- RLS 정책은 관리자(admin)와 앱 사용자(authenticated)를 분리
- 관리자 전용 RPC 함수는 `SECURITY DEFINER + is_admin()` 체크 유지

### 9-2. 앱 코드 수정 범위 최소화

외주 개발자의 작업량을 줄이기 위해:
- Supabase 자동 API로 대체 가능한 건 자동 API 사용 (앱에서 `supabase.from('table').select()` 호출)
- PHP에서만 가능한 서버 로직은 Edge Functions로 구현 (앱에서 `supabase.functions.invoke()` 호출)
- DB 구조를 가능한 한 PHP 응답 형태와 유사하게 맞춰서 앱 UI 코드 변경을 최소화

### 9-3. 단계적 전환

한 번에 모든 API를 전환하지 않고, 영역별로 나누어 진행:
1. 단순 CRUD (조회/등록/수정) → 가장 먼저
2. 인증 (Supabase Auth) → CRUD 이후
3. 채팅 (Supabase Realtime) → 인증 이후
4. 결제 (Edge Functions) → 마지막

### 9-4. 민감 정보 관리

- 비밀번호, API 키, 서비스 키는 **절대 GitHub에 업로드하지 않음**
- .gitignore에 JSON 키 파일, .env 파일 등록
- 키·비밀번호는 카카오톡·이메일 등 안전한 채널로만 전달
- 저장소 Public 전환 전 민감 파일 유무 반드시 확인

### 9-5. Supabase Edge Function Secrets 관리

Edge Functions에서 사용하는 외부 API 키는 Supabase Secrets에 저장하고, 코드에서는 `Deno.env.get('SECRET_NAME')`으로 참조한다.

#### 등록 완료 (2026-04-14)

| Secret Name | 용도 | 사용하는 Edge Function | 등록일 |
|-------------|------|----------------------|--------|
| `KAKAO_ALIMTALK_API_KEY` | 카카오 알림톡 API 키 (루나소프트) | send-alimtalk | 2026-04-14 |
| `KAKAO_ALIMTALK_USER_ID` | 카카오 알림톡 사용자 ID | send-alimtalk | 2026-04-14 |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | FCM 푸시 알림용 Firebase 서비스 계정 (JSON 전체) | send-push, send-chat-message, create-reservation, complete-care, scheduler | 2026-04-14 |
| ~~`JUSO_CONFM_KEY`~~ | ~~행안부 주소 API 승인키~~ | ~~address-proxy~~ ❌ 미사용 (address-proxy 제거) | 2026-04-14 |
| ~~`NAVER_MAP_CLIENT_ID`~~ | ~~네이버 역지오코딩 API Client ID (NCP)~~ | ~~address-proxy~~ ❌ 미사용 (address-proxy 제거) | 2026-04-14 |
| ~~`NAVER_MAP_CLIENT_SECRET`~~ | ~~네이버 역지오코딩 API Client Secret (NCP)~~ | ~~address-proxy~~ ❌ 미사용 (address-proxy 제거) | 2026-04-14 |
| `INICIS_MID` | 이니시스 상점 ID (`wooyoope79`) | inicis-callback | 2026-04-14 |

> **참고**:
> - `SUPABASE_URL`과 `SUPABASE_ANON_KEY`는 Supabase가 기본 제공하므로 별도 등록 불필요.
> - `INICIS_SIGN_KEY`는 불필요. 기존 PHP 코드에서 signKey/hashKey를 사용하지 않았으며, 모바일 결제(INIpay Mobile)의 hashKey는 앱 클라이언트 측에서 생성하는 값이므로 서버 Secret이 아님. 이니시스 PEM 파일(mcert.pem, mpriv.pem)은 PC 웹결제(INIpay Standard) 전용이므로 보관만 하면 됨.
> - ❌ `JUSO_CONFM_KEY`, `NAVER_MAP_CLIENT_ID`, `NAVER_MAP_CLIENT_SECRET` 3개는 address-proxy Edge Function 제거로 미사용. Supabase Secrets에서 삭제해도 무방하나, 향후 필요 시 재등록 가능하므로 보관만 해도 됨. 실사용 Secret 수: 8→5개.

#### Edge Function 코드에서의 사용 예시

```typescript
// send-alimtalk Edge Function
const apiKey = Deno.env.get('KAKAO_ALIMTALK_API_KEY');
const userId = Deno.env.get('KAKAO_ALIMTALK_USER_ID');

// send-push / send-chat-message / create-reservation / complete-care / scheduler
const firebaseJson = JSON.parse(Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON')!);

// inicis-callback Edge Function
const inicisMid = Deno.env.get('INICIS_MID');

// ❌ 아래 3개는 address-proxy 제거로 미사용
// const jusoKey = Deno.env.get('JUSO_CONFM_KEY');
// const naverClientId = Deno.env.get('NAVER_MAP_CLIENT_ID');
// const naverClientSecret = Deno.env.get('NAVER_MAP_CLIENT_SECRET');
```

---

## 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-04-11 | 최초 작성 — 프로젝트 개요, 수집 자료 현황, 작업 단계 설계, 테이블·API 매핑 프레임워크 |
| 2026-04-11 | **Step 1 전수 분석 완료** — PHP API 95개 전부 읽기 완료, 테이블 매핑표 확정, API 전환 매핑 85개 확정, Edge Functions 8개 상세 설계 |
| 2026-04-11 | **Step 1 검토 반영** — address_verifications 테이블 제거 (members.address_doc_urls로 대체) → 신규 테이블 13→12개, DB_MAPPING_REFERENCE.md 전체 대조표 별도 작성 |
| 2026-04-13 | **테이블·컬럼명 전수 교정** — 실제 Supabase DB와 대조하여 85개 불일치 수정: 신규 테이블 12→09개 (이름변경 4, 삭제 3), 컬럼명 오류 15개 수정, 불필요 매핑 8개 제거, 누락 컬럼 49개 보완, 신규 추가 컬럼 18개 확정 (members 11 + kindergartens 3 + reservations 4) |
| 2026-04-13 | **매니저 검토 반영** — 실제 DB 대조 후 누락 컬럼 추가 (reservations 3개, payments 1개, kindergartens 1개, chat_messages 1개), members.address_doc_urls 상태 ✅ 존재로 변경 (신규 추가 18→17개), 섹션 번호 수량 오류 4건 수정, set_care_review.php 중복 제거, 오탈자 교정, 변경 이력 날짜순 정렬, address_doc_urls 동기화 트리거 작업 추가 |
| 2026-04-14 | **Step 2 Supabase 스키마 보강 완료** — 신규 테이블 9개(sql/41_01~41_09) 생성, 기존 테이블 컬럼 추가 6개(sql/42_01~42_06), 앱 사용자 RLS 79개(sql/43_01, 39테이블), Storage 버킷 6개 + 정책 20개(sql/43_02) 작성·실행 완료. members 알림 컬럼 text→boolean DEFAULT true 변경, education-images 정책 admin 전용 전환, pets 테이블에 is_birth_date_unknown/is_draft 2개 컬럼 추가(14→16), DB_MAPPING_REFERENCE.md wr_1~wr_11 매핑 확정 (PR #123) |
| 2026-04-14 | **보안 조치 완료** — wooyoopet-backend 저장소 삭제, Firebase 서비스 키 교체 완료, Supabase Secrets 3개 등록 (KAKAO_ALIMTALK_API_KEY, KAKAO_ALIMTALK_USER_ID, FIREBASE_SERVICE_ACCOUNT_JSON), 추가 등록 필요 Secret 5개 식별, 섹션 9-5 Secrets 관리 가이드 추가 |
| 2026-04-14 | **Supabase Secrets 전체 등록 완료 (8개)** — JUSO_CONFM_KEY + NAVER_MAP_CLIENT_ID/SECRET + INICIS_MID 추가 등록. INICIS_SIGN_KEY는 기존 PHP에서 미사용 확인되어 불필요 판단 (모바일 결제 hashKey는 앱 클라이언트에서 생성). PEM 파일은 PC 웹결제 전용으로 보관만 |
| 2026-04-14 | **Step 2.5 설계 + API 매핑 전면 교정** — (1) Step 2.5 삽입: 앱용 RPC 함수 11개 설계 (app_ 접두어, SECURITY INVOKER). (2) Step 3 교체: 외주 가이드 outline 7개 task (3-1~3-7), 산출물 APP_MIGRATION_GUIDE.md + APP_MIGRATION_CODE.md. (3) Step 4 수정: address-proxy 제거, create-payment-request→create-reservation 이름변경, 8→7개. (4) 섹션 5 API 매핑 교정: 앱 소스 실사로 미사용 19개 API 제거 + 누락 3개 추가 (kakao-address→앱 직접호출, delete/update_message_template 추가), 번호 재배정, 자동API 37→~25, RPC 10→7, Edge Functions 8→7, 총 62→~47. (5) 섹션 7 Edge Functions 목록 8→7개 갱신. (6) 섹션 9-5 Secrets: address-proxy 관련 3개 미사용 표시, 실사용 8→5개. (7) 섹션 2-2 geodata 테이블 ❌ 불필요 표시. (8) toss_payment.php 레거시 메모 추가, 헤더 날짜/요약 갱신 |
