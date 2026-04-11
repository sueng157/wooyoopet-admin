# 우유펫 모바일 앱 백엔드 마이그레이션 설계서

> 최종 업데이트: 2026-04-11 (Step 1 전수 분석 완료)
> 목적: PHP/MariaDB → Supabase 전환을 위한 상세 설계 및 작업 추적
> 관련 문서: `HANDOVER.md` (Phase 5), `MOBILE_APP_ANALYSIS.md` (앱 소스 분석)

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
| 6 | Firebase 서비스 키 | JSON | ⚠️ 노출됨, 교체 필요 | wooyoopet-backend/firebase/ |
| 7 | Supabase 현행 스키마 | SQL 40개 | ✅ 운영 중 | sql/ 폴더 |

### 2-2. MariaDB 131테이블 분류

| 분류 | 수량 | 설명 | 마이그레이션 |
|------|------|------|-------------|
| 앱 커스텀 테이블 | 19개 | chat, payment_request, settlement_info 등 | 🎯 전환 대상 |
| 앱 데이터 테이블 (g5_write_/g5_wzb_) | 39개 | animal, partner, booking 등 | 🎯 전환 대상 |
| 그누보드 시스템 테이블 (g5_*) | 71개 | g5_config, g5_board 등 | ❌ 불필요 |
| 지리 데이터 테이블 | 2개 | apt_buildings, buildings | ❓ 검토 필요 |

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
| 1-5 | 누락 테이블·컬럼 식별 | ✅ 완료 | 섹션 6 (스키마 보강 목록 — 13개 신규 테이블) |
| 1-6 | Edge Functions 설계 | ✅ 완료 | 섹션 7 (Edge Functions 8개 상세 설계) |

### Step 2: Supabase 스키마 보강

**목표**: 모바일 앱이 사용할 수 있도록 Supabase에 누락된 테이블/컬럼을 추가하고, 앱 사용자용 RLS를 설정한다.

| # | 세부 작업 | 상태 | 산출물 |
|---|----------|------|--------|
| 2-1 | 누락 테이블 추가 SQL | ⬜ 예정 | sql/41_migration_*.sql |
| 2-2 | 기존 테이블 컬럼 추가/변경 SQL | ⬜ 예정 | sql/42_migration_*.sql |
| 2-3 | 앱 사용자용 RLS 정책 설계 | ⬜ 예정 | sql/43_app_rls_*.sql |
| 2-4 | 사장님이 Supabase에서 SQL 실행 | ⬜ 예정 | — |

### Step 3: 앱 API 전환 가이드 작성

**목표**: 외주 개발자가 모바일 앱 코드를 수정할 수 있도록 62개 API별 전환 지침서를 작성한다.

| # | 세부 작업 | 상태 | 산출물 |
|---|----------|------|--------|
| 3-1 | apiClient 교체 가이드 (FormData → Supabase JS) | ⬜ 예정 | 섹션 8 또는 별도 문서 |
| 3-2 | 인증 전환 가이드 (mb_id → Supabase Auth) | ⬜ 예정 | 섹션 9 또는 별도 문서 |
| 3-3 | 채팅 전환 가이드 (WebSocket → Realtime) | ⬜ 예정 | 섹션 10 또는 별도 문서 |
| 3-4 | 결제 전환 가이드 (PHP callback → Edge Functions) | ⬜ 예정 | 섹션 11 또는 별도 문서 |

### Step 4: Edge Functions 구현

**목표**: 앱에서 직접 처리할 수 없는 서버 사이드 로직을 Supabase Edge Functions로 구현한다.

| # | 기능 | 상태 | 난이도 | 이유 |
|---|------|------|--------|------|
| 4-1 | 이니시스 결제 콜백 | ⬜ 예정 | 중 | PG사 → 서버 직접 호출 |
| 4-2 | FCM 푸시 알림 발송 | ⬜ 예정 | 중 | Firebase Admin SDK 서버 전용 |
| 4-3 | 카카오 알림톡 발송 | ⬜ 예정 | 중 | API 키 보호 |
| 4-4 | 스케줄러 (자동 상태 변경) | ⬜ 예정 | 중 | scheduler.php 대체 |
| 4-5 | 카카오 주소 검색 프록시 | ⬜ 예정 | 쉬움 | API 키 보호 (또는 앱 직접 호출) |

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

### 4-2. 추가 필요한 테이블 (✅ 확정 — 13개)

| 신규 테이블 | MariaDB 원본 | 용도 | PHP API 참조 | 난이도 |
|------------|-------------|------|-------------|--------|
| **fcm_tokens** | fcm_token | FCM 토큰 저장 | fcm_token.php, chat.php (푸시 발송) | 쉬움 |
| **notifications** | notification | 앱 알림 내역 | get_notification, delete_notification, chat.php | 쉬움 |
| **animal_kinds** | animalKind | 품종 마스터 데이터 | get_animal_kind.php | 쉬움 |
| **banks** | bank | 은행 목록 (code, name) | get_bank_list.php, settlement 관련 | 쉬움 |
| **block_users** | block_user | 사용자 차단 | set_block_user, get_block_user, get_blocked_list | 쉬움 |
| **favorite_partners** | g5_favorite_partner | 유치원 즐겨찾기 | set_partner_favorite_add/remove, get_favorite_partner_list | 쉬움 |
| **favorite_animals** | g5_favorite_animal | 반려동물 즐겨찾기 | set_animal_favorite_add/remove, set_user_favorite_add/remove | 쉬움 |
| **message_templates** | message_template | 채팅 상용문구 | get_message_template, set_message_template | 쉬움 |
| **chat_room_members** | room_members | 채팅방 참여자 (mb_id, mb_5, last_read_message_id, is_muted) | chat.php (핵심), read_chat.php | 중간 |
| **address_verifications** | g5_address_verification | 주소 인증 서류 | set_address_verification.php | 쉬움 |
| **payment_request_rooms** | payment_request_has_room | 결제요청↔채팅방 연결 | set_payment_request (room_id 매핑) | 쉬움 |
| **scheduler_history** | scheduler_history | 스케줄러 실행 이력 | scheduler.php | 쉬움 |
| **chat_guides** | g5_write_chat_partner_guide, g5_write_chat_user_guide | 채팅 가이드 문구 | get_chat_partner_guide, get_chat_user_guide | 쉬움 |

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
| MariaDB 컬럼 | Supabase 컬럼 | 타입 | 비고 |
|-------------|--------------|------|------|
| mb_id (폰번호) | phone / id | text | Supabase Auth uid로 연결 |
| mb_name | name | text | |
| mb_nick | nickname | text | |
| mb_4 | apartment_name | text | 아파트명 |
| mb_5 | current_mode | text | '1'=보호자, '2'=유치원 |
| mb_9 | latitude | numeric | 위도 |
| mb_10 | longitude | numeric | 경도 |
| mb_profile1 | profile_image_url | text | Storage URL로 변경 |
| mb_addr1 | address | text | |
| mb_dong | dong | text | 동 정보 |
| mb_2 | birth_date | text | 주민번호 앞자리 |
| mb_language | language | text | 기본값 '한국어' |
| mb_app_version | app_version | text | |
| chat_notify | chat_notify | text | Y/N |
| reserve_notify | reserve_notify | text | Y/N |
| attendance_notify | attendance_notify | text | Y/N |
| review_notify | review_notify | text | Y/N |
| new_kinder_notify | new_kinder_notify | text | Y/N |

#### kindergartens (g5_write_partner → kindergartens)
| MariaDB 컬럼 | Supabase 컬럼 | 비고 |
|-------------|--------------|------|
| wr_subject | name | 유치원 이름 |
| wr_content | description | 소개 |
| wr_1 | has_own_pet | 자체 동물 여부 |
| wr_2 | pricing | 가격 (파이프 구분 문자열) |
| wr_3 | bank_name | 은행명 |
| wr_4 | bank_account | 계좌번호 |
| wr_5 | education_completed | 교육 이수 여부 |
| wr_6 | registration_status | 등록 상태 (temp 등) |
| partner_img1~10 | images (jsonb 또는 Storage) | 이미지 10개 |
| freshness | freshness | 신선도 |
| business_status | business_status | 사업자 상태 |
| settlement_ready | settlement_ready | 정산 준비 완료 |

#### reservations (payment_request → reservations)
| MariaDB 컬럼 | Supabase 컬럼 | 비고 |
|-------------|--------------|------|
| mb_id | guardian_id | 보호자 (요청자) |
| to_mb_id | kindergarten_id | 유치원 (수행자) |
| pet_id | pet_id | 반려동물 |
| start_date + start_time | start_datetime | 시작 일시 |
| end_date + end_time | end_datetime | 종료 일시 |
| walk_count | walk_count | 산책 횟수 |
| pickup_dropoff | pickup_dropoff | 픽업/드롭오프 |
| price | price | 금액 |
| penalty | penalty | 위약금 |
| status | status | pending→completed→care_completed |
| payment_approval_id | payment_id | 결제 연결 |
| is_review_written | is_review_written | 후기 작성 여부 |
| reject_reason | reject_reason | 거절 사유 |
| reminder_start_sent_at | reminder_start_sent_at | 등원 알림 발송 |
| reminder_end_sent_at | reminder_end_sent_at | 하원 알림 발송 |
| care_start_sent_at | care_start_sent_at | 돌봄시작 알림 |
| care_end_sent_at | care_end_sent_at | 돌봄종료 알림 |

---

## 5. API 전환 매핑표 (PHP → Supabase) ✅ 완료

### 전환 방식 분류 (확정)

| 전환 방식 | 설명 | 확정 수량 |
|----------|------|----------|
| **자동 API** | Supabase PostgREST 직접 호출 (단순 CRUD) | 37개 |
| **RPC** | Supabase RPC 함수 (복잡한 조회/JOIN/집계) | 10개 |
| **Edge Function** | 서버 사이드 필수 (결제, FCM, 외부 API, 파일 업로드) | 8개 |
| **Supabase Auth** | 인증 관련 (Phone OTP) | 2개 |
| **Supabase Realtime** | WebSocket 대체 (채팅) | 3개 |
| **제거** | toss_payment 등 | 2개 |
| **합계** | | **62개** |

### 5-1. 인증/회원 (7개)

| # | PHP API | 방식 | Supabase 대응 | DB 테이블 | 난이도 |
|---|---------|------|--------------|----------|--------|
| 1 | alimtalk.php | Edge Function | 카카오 알림톡 API → auth_phone_log INSERT | — (Supabase Auth) | 중 |
| 2 | auth_request.php | Supabase Auth | signInWithOtp() + verifyOtp() → members SELECT | members | 중 |
| 3 | set_join.php | 자동 API | Supabase Auth signUp() → members UPSERT | members | 쉬움 |
| 4 | set_member_leave.php | RPC | members UPDATE (탈퇴) + g5_member_leave 이력 → Edge Function으로 Auth 삭제 | members | 중 |
| 5 | set_mypage_mode_update.php | 자동 API | members UPDATE (current_mode) | members | 쉬움 |
| 6 | set_profile_update.php | 자동 API + Storage | members UPDATE + Storage 프로필 이미지 업로드 | members | 쉬움 |
| 7 | set_address_verification.php | 자동 API + Storage | address_verifications UPSERT + Storage 서류 업로드 | address_verifications | 쉬움 |

### 5-2. 반려동물 (8개)

| # | PHP API | 방식 | Supabase 대응 | 난이도 |
|---|---------|------|--------------|--------|
| 8 | get_my_animal.php | 자동 API | pets SELECT WHERE member_id=? AND deleted=false | 쉬움 |
| 9 | get_animal_by_id.php | 자동 API | pets SELECT WHERE id=? + favorite 조인 | 쉬움 |
| 10 | get_animal_by_mb_id.php | 자동 API | pets SELECT WHERE member_id=? | 쉬움 |
| 11 | get_animal_kind.php | 자동 API | animal_kinds SELECT WHERE name ILIKE ? | 쉬움 |
| 12 | set_animal_insert.php | 자동 API + Storage | pets INSERT + Storage 이미지 (최대 10개) + 4마리 제한 체크 | 쉬움 |
| 13 | set_animal_update.php | 자동 API + Storage | pets UPDATE + Storage 이미지 교체 | 쉬움 |
| 14 | set_animal_delete.php | 자동 API | pets UPDATE (soft delete: deleted=true) | 쉬움 |
| 15 | set_first_animal_set.php | RPC | pets BATCH UPDATE (기존 firstYN='N' → 선택 firstYN='Y') | 쉬움 |

### 5-3. 유치원/보호자 (5개)

| # | PHP API | 방식 | Supabase 대응 | 난이도 |
|---|---------|------|--------------|--------|
| 16 | get_partner.php | RPC | kindergartens SELECT + members JOIN + favorite JOIN + settlement JOIN + animal JOIN | 중 |
| 17 | get_partner_list.php | RPC | kindergartens SELECT 전체 + favorite JOIN + review COUNT | 중 |
| 18 | set_partner_update.php | 자동 API + Storage | kindergartens UPDATE + 이미지 + settlement_info UPSERT + 동물 UPSERT | 중 |
| 19 | set_partner_insert.php | 자동 API + Storage | kindergartens INSERT + 동물 BATCH INSERT | 중 |
| 20 | get_protector.php | RPC | members SELECT + pets JOIN + favorite JOIN (보호자 상세) | 중 |
| 21 | get_protector_list.php | RPC | members SELECT 전체 + pets JOIN + favorite JOIN (보호자 목록) | 중 |

### 5-4. 채팅 (8개) — **가장 복잡한 영역**

| # | PHP API | 방식 | Supabase 대응 | 난이도 |
|---|---------|------|--------------|--------|
| 22 | chat.php → create_room | RPC | chat_rooms INSERT + chat_room_members INSERT (2명, mb_5 역할 기반 매칭) | 상 |
| 23 | chat.php → get_rooms | RPC | chat_rooms SELECT + unread_count 서브쿼리 + last_message + members 관계 | 상 |
| 24 | chat.php → get_messages | 자동 API | chat_messages SELECT (room_id 필터, 페이징) + last_read_message_id UPDATE | 중 |
| 25 | chat.php → send_message | Edge Function | chat_messages INSERT + Storage 파일 + **Realtime 브로드캐스트** + FCM 푸시 + notification INSERT | 상 |
| 26 | chat.php → get_images | 자동 API | chat_messages SELECT WHERE file_path IS NOT NULL | 쉬움 |
| 27 | chat.php → leave_room | 자동 API | chat_rooms UPDATE (deleted_at=NOW()) | 쉬움 |
| 28 | chat.php → muted | 자동 API | chat_room_members UPDATE (is_muted) | 쉬움 |
| 29 | read_chat.php | 자동 API | chat_room_members UPDATE (last_read_message_id) | 쉬움 |

> **참고**: 구버전 채팅 API (get_chat_list.php, set_chat_insert.php)는 g5_chat 테이블 사용 → 폐기 대상.
> 현행 채팅은 chat.php (router 패턴) + room/chat/room_members 테이블 사용.

### 5-5. 결제 (5개)

| # | PHP API | 방식 | Supabase 대응 | 난이도 |
|---|---------|------|--------------|--------|
| 30 | inicis_payment.php | Edge Function | PG사 콜백 수신 → set_inicis_approval 호출 → WebView 결과 반환 | 상 |
| 31 | set_inicis_approval.php | Edge Function | payments UPSERT (oid 기준) + raw_response 저장 | 중 |
| 32 | set_payment_request.php | Edge Function | reservations INSERT/UPDATE + payments 연결 + chat_messages INSERT (system) + Realtime + FCM | 상 |
| 33 | get_payment_request.php | RPC | reservations SELECT + pets JOIN + kindergartens JOIN + members JOIN (목록) | 중 |
| 34 | get_payment_request_by_id.php | RPC | reservations SELECT (단건) + approval_info JOIN + pets + kindergartens + members | 중 |

### 5-6. 돌봄 상태 관리 (3개)

| # | PHP API | 방식 | Supabase 대응 | 난이도 |
|---|---------|------|--------------|--------|
| 35 | set_care_request.php | 자동 API | reservations UPDATE (status='completed') | 쉬움 |
| 36 | set_care_complete.php | Edge Function | reservations UPDATE + chat_messages INSERT (care_end, review) + Realtime + FCM | 상 |
| 37 | set_care_review.php | 자동 API | reservations UPDATE (is_review_written=true) | 쉬움 |

### 5-7. 정산 (5개)

| # | PHP API | 방식 | Supabase 대응 | 난이도 |
|---|---------|------|--------------|--------|
| 38 | get_settlement.php | RPC | reservations 집계 (settled/unsettled) + 기간 필터 + members JOIN | 중 |
| 39 | get_settlement_info.php | 자동 API | settlement_infos SELECT + kindergartens JOIN + members JOIN | 쉬움 |
| 40 | get_settlement_list.php | RPC | settlements SELECT + 월별 GROUP BY + 상세 내역 | 중 |
| 41 | set_settlement_info.php | 자동 API | settlement_infos UPSERT + 주민번호 뒷자리 암호화 (Edge Function) | 중 |
| 42 | set_settlement_admin_approve.php | 자동 API | settlement_infos UPDATE (status='active') — 관리자 전용 | 쉬움 |

### 5-8. 리뷰 (4개)

| # | PHP API | 방식 | Supabase 대응 | 난이도 |
|---|---------|------|--------------|--------|
| 43 | get_review.php | RPC | guardian_reviews/kindergarten_reviews SELECT + 태그 집계 (JSON 배열 파싱) + pets JOIN + kindergartens JOIN | 중 |
| 44 | get_review_string.php | 자동 API | (리뷰 문구 마스터) → 별도 테이블 or 앱 내장 | 쉬움 |
| 45 | set_review.php | 자동 API + Storage | reviews INSERT (type, tags JSON, images) + Storage 이미지 | 쉬움 |
| 46 | set_care_review.php | (5-6에서 처리) | reservations UPDATE (is_review_written) | 쉬움 |

### 5-9. 즐겨찾기 (6개)

| # | PHP API | 방식 | Supabase 대응 | 난이도 |
|---|---------|------|--------------|--------|
| 47 | set_animal_favorite_add.php | 자동 API | favorite_animals UPSERT (is_favorite='Y') — 유치원이 반려동물 찜 | 쉬움 |
| 48 | set_animal_favorite_remove.php | 자동 API | favorite_animals UPDATE (is_favorite='N') | 쉬움 |
| 49 | set_partner_favorite_add.php | 자동 API | favorite_partners UPSERT (is_favorite='Y') | 쉬움 |
| 50 | set_partner_favorite_remove.php | 자동 API | favorite_partners UPDATE (is_favorite='N') | 쉬움 |
| 51 | set_user_favorite_add.php | 자동 API | favorite_animals UPSERT — 보호자가 반려동물 찜 | 쉬움 |
| 52 | set_user_favorite_remove.php | 자동 API | favorite_animals UPDATE (is_favorite='N') | 쉬움 |

### 5-10. 알림/FCM (5개)

| # | PHP API | 방식 | Supabase 대응 | 난이도 |
|---|---------|------|--------------|--------|
| 53 | fcm_token.php | 자동 API | fcm_tokens UPSERT (mb_id + token 중복 체크) | 쉬움 |
| 54 | get_notification.php | 자동 API | notifications SELECT WHERE member_id=? ORDER BY created_at DESC | 쉬움 |
| 55 | delete_notification.php | 자동 API | notifications DELETE (전체 or 단건) | 쉬움 |
| 56 | get_notify_setting.php | 자동 API | members SELECT (chat_notify, reserve_notify 등 5개 컬럼) | 쉬움 |
| 57 | set_notify_setting_update.php | 자동 API | members UPDATE (5개 알림 설정 컬럼) | 쉬움 |

### 5-11. 콘텐츠/기타 조회 (8개)

| # | PHP API | 방식 | Supabase 대응 | 난이도 |
|---|---------|------|--------------|--------|
| 58 | get_banner.php | 자동 API | banners SELECT (페이징) | 쉬움 |
| 59 | get_notice.php | 자동 API | notices SELECT WHERE visible=true (페이징) | 쉬움 |
| 60 | get_notice_detail.php | 자동 API | notices SELECT WHERE id=? | 쉬움 |
| 61 | get_faq.php | 자동 API | faqs SELECT (검색, 페이징) | 쉬움 |
| 62 | get_policy.php | 자동 API | terms SELECT (카테고리 필터) | 쉬움 |
| 63 | get_guide.php | 자동 API | chat_guides SELECT (가이드) | 쉬움 |
| 64 | get_kakaolink.php | 자동 API | (카카오링크 마스터) → app_settings or 앱 내장 | 쉬움 |
| 65 | get_bank_list.php | 자동 API | banks SELECT WHERE use_yn=true ORDER BY sort_order | 쉬움 |

### 5-12. 차단 (4개)

| # | PHP API | 방식 | Supabase 대응 | 난이도 |
|---|---------|------|--------------|--------|
| 66 | set_block_user.php | 자동 API | block_users INSERT/DELETE (토글) | 쉬움 |
| 67 | set_block_user_add.php | 자동 API | block_users UPSERT (is_blocked='Y') | 쉬움 |
| 68 | set_block_user_remove.php | 자동 API | block_users UPDATE (is_blocked='N') | 쉬움 |
| 69 | get_block_user.php | 자동 API | block_users SELECT (차단 mb_id 목록) | 쉬움 |
| 70 | get_blocked_list.php | 자동 API | block_users SELECT + members JOIN (차단 상세) | 쉬움 |

### 5-13. 기타 (7개)

| # | PHP API | 방식 | Supabase 대응 | 난이도 |
|---|---------|------|--------------|--------|
| 71 | get_education.php | RPC | education_topics + quizzes JOIN + completions LEFT JOIN (풀이 여부) | 중 |
| 72 | get_educationN.php | 자동 API | (하드코딩 교육 데이터) → education_quizzes SELECT or 앱 내장 | 쉬움 |
| 73 | set_solved.php | 자동 API | education_completions INSERT (중복 체크) | 쉬움 |
| 74 | get_setting.php | 자동 API | members SELECT (language, app_version) + app_settings SELECT | 쉬움 |
| 75 | set_suggest_insert.php | 자동 API | feedbacks INSERT | 쉬움 |
| 76 | get_main_partner.php | RPC | kindergartens SELECT 전체 + members JOIN (메인 화면 목록) | 중 |
| 77 | get_message_template.php | 자동 API | message_templates SELECT WHERE member_id=? | 쉬움 |
| 78 | set_message_template.php | 자동 API | message_templates INSERT | 쉬움 |
| 79 | get_partner_status.php | RPC | members + kindergartens LEFT JOIN (파트너 상태 요약) | 쉬움 |
| 80 | get_partner_by_phone.php | RPC | members + kindergartens + pets JOIN (번호로 조회) | 쉬움 |
| 81 | get_favorite_animal_list.php | 자동 API | favorite_animals SELECT + pets JOIN (유치원이 찜한 반려동물) | 쉬움 |
| 82 | get_favorite_partner_list.php | 자동 API | favorite_partners SELECT + kindergartens JOIN (보호자가 찜한 유치원) | 쉬움 |
| 83 | scheduler.php | Edge Function | reservations 일괄 상태 변경 + FCM + Realtime (cron) | 상 |
| 84 | buildings.php | Edge Function | 네이버 역지오코딩 + apt_buildings DB 조회 | 중 |
| 85 | get_address.php | Edge Function | 행안부 주소 API 프록시 | 쉬움 |

### 5-14. 관리자 전용 (이미 Supabase 연결, 앱과 무관)

| PHP API | 현재 상태 | 비고 |
|---------|----------|------|
| get_admin_settlement_queue.php | 관리자 페이지에서 직접 Supabase RPC 사용 | 앱 전환 불필요 |
| get_admin_settlement_detail.php | 관리자 페이지에서 직접 Supabase RPC 사용 | 앱 전환 불필요 |

### 5-15. 제거 대상

| PHP API | 이유 |
|---------|------|
| toss_payment.php | 미구현, 사용 안 함 |
| toss_payment_approval.php | 미구현, 사용 안 함 |
| get_chat_list.php (구버전) | g5_chat 사용 → 폐기 (새 chat.php 사용 중) |
| set_chat_insert.php (구버전) | g5_chat 사용 → 폐기 |
| 백업 파일 14개 (*260111.php 등) | 구버전 |

---

## 6. 스키마 보강 목록 ✅ 완료

### 6-1. 신규 테이블 SQL (13개)

| SQL 파일 | 내용 | 상태 |
|---------|------|------|
| sql/41_app_fcm_tokens.sql | fcm_tokens 테이블 (member_id, token, created_at) | ⬜ 작성 필요 |
| sql/41_app_notifications.sql | notifications 테이블 (member_id, title, content, created_at) | ⬜ 작성 필요 |
| sql/41_app_animal_kinds.sql | animal_kinds 테이블 (id, name) + MariaDB 데이터 이관 | ⬜ 작성 필요 |
| sql/41_app_banks.sql | banks 테이블 (code, name, use_yn, sort_order) + 데이터 이관 | ⬜ 작성 필요 |
| sql/41_app_block_users.sql | block_users 테이블 (member_id, blocked_member_id, is_blocked, timestamps) | ⬜ 작성 필요 |
| sql/41_app_favorite_partners.sql | favorite_partners 테이블 (protector_id, partner_id, is_favorite, timestamps) | ⬜ 작성 필요 |
| sql/41_app_favorite_animals.sql | favorite_animals 테이블 (member_id, pet_id, is_favorite, timestamps) | ⬜ 작성 필요 |
| sql/41_app_message_templates.sql | message_templates 테이블 (member_id, template, timestamps, deleted_at) | ⬜ 작성 필요 |
| sql/41_app_chat_room_members.sql | chat_room_members 테이블 (room_id, member_id, role, last_read_message_id, is_muted) | ⬜ 작성 필요 |
| sql/41_app_address_verifications.sql | address_verifications 테이블 (member_id, status, document_url, timestamps) | ⬜ 작성 필요 |
| sql/41_app_payment_request_rooms.sql | payment_request_rooms 테이블 (reservation_id, chat_room_id) | ⬜ 작성 필요 |
| sql/41_app_scheduler_history.sql | scheduler_history 테이블 (started_at, finished_at) | ⬜ 작성 필요 |
| sql/41_app_chat_guides.sql | chat_guides 테이블 (type, title, content) | ⬜ 작성 필요 |

### 6-2. 기존 테이블 변경 SQL

| SQL 파일 | 내용 | 상태 |
|---------|------|------|
| sql/42_members_add_app_columns.sql | members에 알림 설정 5개 + language + app_version 컬럼 추가 | ⬜ 작성 필요 |
| sql/42_reservations_add_scheduler_columns.sql | reservations에 reminder_*_sent_at, care_*_sent_at 4개 컬럼 추가 | ⬜ 작성 필요 |
| sql/42_kindergartens_add_registration_columns.sql | kindergartens에 settlement_ready, business_status, freshness 등 추가 | ⬜ 작성 필요 |
| sql/42_pets_add_legacy_columns.sql | pets에 wr_1~wr_11 매핑 확인 (이미 있는 컬럼과 대조) | ⬜ 확인 필요 |

### 6-3. 앱 사용자용 RLS 정책

| SQL 파일 | 내용 | 상태 |
|---------|------|------|
| sql/43_app_rls_policies.sql | 인증된 앱 사용자(authenticated)용 RLS: 본인 데이터만 읽기/쓰기, 공개 데이터(배너/공지 등) 전체 읽기 | ⬜ 작성 필요 |
| sql/43_app_storage_policies.sql | Storage RLS: 프로필/반려동물/유치원/채팅/리뷰/주소인증 버킷별 정책 | ⬜ 작성 필요 |

---

## 7. Edge Functions 설계 ✅ 완료

### 7-1. 함수 목록 (8개)

| # | 함수명 | 용도 | PHP 원본 | 트리거 | 난이도 |
|---|--------|------|---------|--------|--------|
| 1 | **inicis-callback** | 이니시스 결제 콜백 → 결과를 DB 저장 → WebView HTML 반환 | inicis_payment.php | PG사 POST 호출 | 상 |
| 2 | **send-chat-message** | 채팅 메시지 저장 + Storage 파일 + Realtime 브로드캐스트 + FCM 푸시 | chat.php → send_message | 앱 호출 | 상 |
| 3 | **create-payment-request** | 결제 요청 생성 + 채팅방 자동 생성/연결 + system 메시지 + FCM | set_payment_request.php | 앱 호출 | 상 |
| 4 | **complete-care** | 돌봄 완료 처리 + care_end/review 시스템 메시지 + Realtime + FCM | set_care_complete.php, scheduler.php 일부 | 앱 호출 | 중 |
| 5 | **send-alimtalk** | 카카오 알림톡 SMS 발송 (인증번호) | alimtalk.php | 앱 호출 | 중 |
| 6 | **send-push** | FCM 푸시 알림 발송 (범용) | chat.php/scheduler.php 내부 | DB 트리거 or 다른 Edge Function에서 호출 | 중 |
| 7 | **scheduler** | 등원/하원 30분 전 알림 + 돌봄 시작/종료 자동 처리 | scheduler.php | pg_cron (5분 간격) or 외부 cron | 상 |
| 8 | **address-proxy** | 행안부 주소 API + 네이버 역지오코딩 프록시 | get_address.php, buildings.php, naver-address.php | 앱 호출 | 쉬움 |

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

#### 7-2-3. create-payment-request (결제 요청 생성)

```
입력: mb_id, to_mb_id, pet_id, start/end date/time, price, payment_approval_id, room_id(선택)
처리:
  1. reservations INSERT (status='pending')
  2. payments 연결 (payment_approval_id)
  3. room_id 없으면 채팅방 자동 생성 (create_room 로직 재현)
  4. payment_request_rooms INSERT
  5. chat_messages INSERT (message_type='payment_request')
  6. Realtime 브로드캐스트
  7. 상대방 FCM 푸시
  8. notifications INSERT
업데이트 모드: payment_request_id 있으면 UPDATE만 (status, reject_reason, penalty 등)
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
  5. scheduler_history 기록
```

---

## 8. 보안 사고 기록

### 2026-04-11: GitHub 저장소 키 노출

| 항목 | 내용 |
|------|------|
| 원인 | wooyoopet-backend 저장소를 Public 전환 시 민감 파일 포함 |
| 노출 정보 | Firebase 서비스 키 (6ad25285...), FTP 비밀번호, 서버 root 비밀번호, SSL 인증서 |
| 조치 | 즉시 Private 전환 완료 |
| 후속 필요 | Firebase 키 교체 (외주 개발자 협조), 서버 비밀번호 변경 |
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

---

## 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-04-11 | 최초 작성 — 프로젝트 개요, 수집 자료 현황, 작업 단계 설계, 테이블·API 매핑 프레임워크 |
| 2026-04-11 | **Step 1 전수 분석 완료** — PHP API 95개 전부 읽기 완료, 테이블 매핑표 확정 (24기존+13신규), API 전환 매핑 85개 확정, Edge Functions 8개 상세 설계, 스키마 보강 목록 확정 |
