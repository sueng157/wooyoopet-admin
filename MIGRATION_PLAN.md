# 우유펫 모바일 앱 백엔드 마이그레이션 설계서

> 최종 업데이트: 2026-04-11
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
| 2 | PHP API 소스코드 | 현행 95파일, 11,245줄 | 🔄 일부 읽음 (~8파일), 전수 분석 필요 | uploaded_files/api_extracted/ |
| 3 | MariaDB 스키마 | 131테이블 (146KB) | 🔄 분류 완료, 상세 매핑 필요 | legacy_mariadb_schema.sql |
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
| 1-1 | PHP API 95개 전수 읽기 | ⬜ 예정 | API별 입출력·DB쿼리·비즈니스 로직 정리 |
| 1-2 | MariaDB 핵심 테이블 58개 상세 분석 | ⬜ 예정 | 컬럼 매핑표 |
| 1-3 | MariaDB ↔ Supabase 테이블 매핑 | ⬜ 예정 | 섹션 4 (테이블 매핑표) |
| 1-4 | PHP API → Supabase 전환 매핑 | ⬜ 예정 | 섹션 5 (API 전환 매핑표) |
| 1-5 | 누락 테이블·컬럼 식별 | ⬜ 예정 | 섹션 6 (스키마 보강 목록) |
| 1-6 | Edge Functions 설계 | ⬜ 예정 | 섹션 7 (Edge Functions 목록) |

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

## 4. 테이블 매핑표 (MariaDB → Supabase)

> Step 1-3 완료 후 작성 예정

### 4-1. 이미 Supabase에 존재하는 테이블

| Supabase 테이블 | 용도 | 관리자 페이지 사용 |
|-----------------|------|-------------------|
| members | 회원 | ✅ |
| kindergartens | 유치원 | ✅ |
| pets | 반려동물 | ✅ |
| reservations | 돌봄예약 | ✅ |
| payments | 결제 | ✅ |
| refunds | 환불/위약금 | ✅ |
| settlement_infos | 정산 계좌정보 | ✅ |
| settlements | 정산 내역 | ✅ |
| chat_rooms | 채팅방 | ✅ |
| chat_messages | 채팅 메시지 | ✅ |
| reports | 신고 | ✅ |
| report_logs | 신고 처리이력 | ✅ |
| guardian_reviews | 보호자 후기 | ✅ |
| kindergarten_reviews | 유치원 후기 | ✅ |
| education_topics | 교육 주제 | ✅ |
| education_quizzes | 교육 퀴즈 | ✅ |
| education_completions | 교육 이수 | ✅ |
| banners | 배너 | ✅ |
| notices | 공지사항 | ✅ |
| faqs | FAQ | ✅ |
| terms | 약관 | ✅ |
| app_settings | 앱 설정 | ✅ |
| admin_accounts | 관리자 계정 | ✅ |
| feedbacks | 피드백 | ✅ |

### 4-2. 추가 필요한 테이블 (예상)

> Step 1 분석 완료 후 확정 예정

| 예상 테이블 | MariaDB 원본 | 용도 | 비고 |
|------------|-------------|------|------|
| fcm_tokens | fcm_token | FCM 토큰 저장 | 앱 전용 |
| notifications | notification (g5_write_ 계열) | 알림 내역 | 앱 전용 |
| animal_kinds | animalKind, animalKindX | 품종 마스터 데이터 | 조회 전용 |
| bank_list | bank | 은행 목록 | 정산용 |
| block_users | block_user | 사용자 차단 | 앱 전용 |
| favorite_partners | g5_favorite_partner | 유치원 즐겨찾기 | 앱 전용 |
| favorite_animals | g5_favorite_animal | 반려동물 즐겨찾기 | 앱 전용 |
| message_templates | (PHP에서 관리) | 상용문구 | 채팅용 |
| auth_phone_log | auth_phone_log | 인증 로그 | Supabase Auth로 대체 가능성 |
| chat_room_members | room_members | 채팅방 참여자 | 기존 chat_rooms와 관계 확인 필요 |
| inicis_payments | inicis_payments | 이니시스 원시 데이터 | 결제용 |
| address_verifications | g5_address_verification | 주소 인증 | 앱 전용 |

### 4-3. 컬럼 매핑 상세

> Step 1 분석 완료 후 테이블별 상세 컬럼 매핑 작성 예정

---

## 5. API 전환 매핑표 (PHP → Supabase)

> Step 1-4 완료 후 작성 예정

### 전환 방식 분류

| 전환 방식 | 설명 | 예상 수량 |
|----------|------|----------|
| **자동 API** | Supabase PostgREST로 직접 대체 (단순 CRUD) | ~35개 |
| **RPC** | Supabase RPC 함수 호출 (복잡한 조회/비즈니스 로직) | ~15개 |
| **Edge Function** | 서버 사이드 처리 필수 (결제, FCM, 외부 API) | ~7개 |
| **Supabase Auth** | 인증 관련 (Phone OTP로 대체) | ~3개 |
| **제거** | 토스 결제 등 불필요 항목 | ~2개 |

### 5-1. 인증/회원 (7개)

| # | PHP API | 전환 방식 | Supabase 대응 | 상태 |
|---|---------|----------|--------------|------|
| 1 | auth_request.php | Supabase Auth | Phone OTP verifyOtp() | ⬜ |
| 2 | alimtalk.php | Edge Function | 카카오 알림톡 API 호출 | ⬜ |
| 3 | set_join.php | 자동 API | members UPSERT | ⬜ |
| 4 | set_member_leave.php | 자동 API | members UPDATE + Auth 삭제 | ⬜ |
| 5 | set_mypage_mode_update.php | 자동 API | members UPDATE (current_mode) | ⬜ |
| 6 | set_profile_update.php | 자동 API | members UPDATE | ⬜ |
| 7 | set_address_verification.php | 자동 API | address_verifications INSERT | ⬜ |

### 5-2. 주소/지도 (1개)

| # | PHP API | 전환 방식 | Supabase 대응 | 상태 |
|---|---------|----------|--------------|------|
| 8 | kakao-address.php | Edge Function 또는 앱 직접 | 카카오 주소 API 호출 | ⬜ |

### 5-3. 반려동물 (7개)

| # | PHP API | 전환 방식 | Supabase 대응 | 상태 |
|---|---------|----------|--------------|------|
| 9 | get_my_animal.php | 자동 API | pets SELECT (member_id 필터) | ⬜ |
| 10 | get_animal_by_id.php | 자동 API | pets SELECT (id 필터) | ⬜ |
| 11 | get_animal_by_mb_id.php | 자동 API | pets SELECT (member_id 필터) | ⬜ |
| 12 | get_animal_kind.php | 자동 API | animal_kinds SELECT (검색) | ⬜ |
| 13 | set_animal_insert.php | 자동 API | pets INSERT | ⬜ |
| 14 | set_animal_update.php | 자동 API | pets UPDATE | ⬜ |
| 15 | set_animal_delete.php | 자동 API | pets DELETE | ⬜ |
| 16 | set_first_animal_set.php | 자동 API | pets UPDATE (is_default) | ⬜ |

### 5-4~5-14. 나머지 API

> Step 1 분석 완료 후 위와 동일한 형식으로 작성 예정
> 카테고리: 유치원(3), 보호자(2), 채팅(6), 결제(6), 정산(3), 리뷰(4), 즐겨찾기(6), 알림/FCM(3), 콘텐츠(5), 차단(3), 기타(5)

---

## 6. 스키마 보강 목록

> Step 1-5 완료 후 확정 예정

### 6-1. 신규 테이블 SQL

| SQL 파일 | 내용 | 상태 |
|---------|------|------|
| sql/41_*.sql | 예정 | ⬜ |

### 6-2. 기존 테이블 변경 SQL

| SQL 파일 | 내용 | 상태 |
|---------|------|------|
| sql/42_*.sql | 예정 | ⬜ |

### 6-3. 앱 사용자용 RLS 정책

| SQL 파일 | 내용 | 상태 |
|---------|------|------|
| sql/43_*.sql | 예정 | ⬜ |

---

## 7. Edge Functions 설계

> Step 1-6 완료 후 상세 설계 예정

### 7-1. 함수 목록

| 함수명 | 용도 | PHP 원본 | 트리거 | 상태 |
|--------|------|---------|--------|------|
| inicis-callback | 이니시스 결제 콜백 처리 | inicis_payment.php | PG사 HTTP 호출 | ⬜ |
| inicis-approval | 이니시스 승인 저장 | set_inicis_approval.php | 앱 호출 | ⬜ |
| send-push | FCM 푸시 알림 발송 | (chat.php 내부) | DB 트리거 또는 앱 호출 | ⬜ |
| send-alimtalk | 카카오 알림톡 발송 | alimtalk.php | 앱 호출 | ⬜ |
| scheduler | 자동 상태 변경 (예약 만료 등) | scheduler.php | Cron 또는 pg_cron | ⬜ |
| kakao-address | 카카오 주소 검색 프록시 | kakao-address.php | 앱 호출 | ⬜ |

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
