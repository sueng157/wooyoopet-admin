# 우유펫 모바일 앱 백엔드 마이그레이션 설계서

> 최종 업데이트: 2026-04-18 (Step 3 완료 + R6 리뷰 반영 — #60 RPC 전환 확인, Step 4 표 4-10 추가, RPC 16개)
> 목적: PHP/MariaDB → Supabase 전환을 위한 상세 설계 및 작업 추적
> 관련 문서: `HANDOVER.md` (Phase 5), `MOBILE_APP_ANALYSIS.md` (앱 소스 분석), `DB_MAPPING_REFERENCE.md` (테이블 대조표)

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
| 지리 데이터 테이블 | 2개 | apt_buildings, buildings | ❌ 마이그레이션 불필요 (앱에서 카카오 주소 API 직접 호출, 네이버 역지오코딩 미사용 확인) |

### 2-3. PHP API 분류 (현행 95파일)

> **2026-04-14 전수조사 결과**: 앱 소스코드(React Native)에서 실제 호출되는 PHP API는 **60개**. 기존 매핑표 85개 중 19개는 앱에서 미사용(레거시/관리자 전용), 3개는 누락 확인. 최종 전환 대상 **~47개**.

| 분류 | 파일 수 | 설명 |
|------|--------|------|
| GET (조회) | ~45개 | get_partner.php, get_animal_by_id.php 등 |
| SET/POST (등록/수정/삭제) | ~40개 | set_join.php, set_payment_request.php 등 |
| 결제 연동 | 3개 | inicis_payment.php, set_inicis_approval.php, toss_payment.php |
| 외부 서비스 | 3개 | alimtalk.php, kakao-address.php, scheduler.php |
| 백업/구버전 | 14개 | *260111.php, *260209.php 등 → 제외 |

---

## 3. 작업 단계 상세

### Step 1: 전수 분석 & 매핑 설계 ✅ 완료

**목표**: PHP API 95개와 MariaDB 58개 핵심 테이블을 전부 읽고, Supabase 전환 매핑표를 완성한다.

| # | 세부 작업 | 상태 | 산출물 |
|---|----------|------|--------|
| 1-1 | PHP API 95개 전수 읽기 | ✅ 완료 | API별 입출력·DB쿼리·비즈니스 로직 정리 (섹션 5) |
| 1-2 | MariaDB 핵심 테이블 분석 | ✅ 완료 | API에서 참조하는 테이블·컬럼 전부 확인 |
| 1-3 | MariaDB ↔ Supabase 테이블 매핑 | ✅ 완료 | 섹션 4 (테이블 매핑표) |
| 1-4 | PHP API → Supabase 전환 매핑 | ✅ 완료 | 섹션 5 (API 전환 매핑표 — 전수조사 후 ~47개로 교정) |
| 1-5 | 누락 테이블·컬럼 식별 | ✅ 완료 | 섹션 6 (스키마 보강 목록 — 9개 신규 테이블) |
| 1-6 | Edge Functions 설계 | ✅ 완료 | 섹션 7 (Edge Functions 7개 상세 설계) |

### Step 2: Supabase 스키마 보강 ✅ 완료

**목표**: 모바일 앱이 사용할 수 있도록 Supabase에 누락된 테이블/컬럼을 추가하고, 앱 사용자용 RLS를 설정한다.

| # | 세부 작업 | 상태 | 산출물 |
|---|----------|------|--------|
| 2-1 | 누락 테이블 추가 SQL (9개) | ✅ 완료 | sql/41_01~41_09 (Supabase 실행 완료) |
| 2-2 | 기존 테이블 컬럼 추가/변경 SQL (6개) | ✅ 완료 | sql/42_01~42_06 (Supabase 실행 완료) |
| 2-3 | 앱 사용자용 RLS + Storage 정책 | ✅ 완료 | sql/43_01 (RLS 79개) + sql/43_02 (Storage 버킷 6개 + 정책 20개) |
| 2-4 | 사장님이 Supabase에서 SQL 실행 | ✅ 완료 | 17개 파일 전체 실행 확인 (PR #123) |

### Step 2.5: 앱용 RPC 함수 생성 ✅ 완료

> **추가 배경**: Step 2 완료 후 전수조사에서 Supabase에 존재하는 RPC 함수가 **관리자 페이지 전용(`get_dashboard_*`, `get_admin_*` 등)**뿐이며, **모바일 앱이 호출할 RPC 함수가 하나도 없음**을 확인했다. 섹션 5 API 매핑표에서 `RPC`로 분류된 API(유치원 상세, 보호자 목록, 예약 조회 등)가 실제로 동작하려면 앱용 RPC 함수를 먼저 생성해야 한다. 따라서 Step 3(앱 전환 가이드) 작업 전에 Step 2.5를 선행한다.

**목표**: 모바일 앱에서 복잡한 JOIN/집계가 필요한 조회를 처리할 수 있도록 Supabase RPC 함수 **13개** + 공개 VIEW **3개**를 작성하고 실행한다.

| # | 세부 작업 | 상태 | 산출물 |
|---|----------|------|--------|
| 2.5-0 | 공개 VIEW 3개 생성 (RLS 충돌 해결) | ✅ 완료 | sql/44_00_app_public_views.sql |
| 2.5-0a | DDL ALTER (pets.deleted + kindergartens CHECK) | ✅ 완료 | sql/44_00a_ddl_alter_tables.sql |
| 2.5-1 | 앱용 RPC 함수 SQL 작성 (13개) | ✅ 13/13 완료 | sql/44_01~44_12 + 44_05b — PR #133(4개), #135(6개), #136(2개+리팩터링), #137(1개+DDL) |
| 2.5-1a | 외주개발자 PHP 용도 확인 | ✅ 확인 완료 | `RPC_PHP_MAPPING.md` 전달 → 확인 완료 (2026-04-17). 확인 항목: ① 앱 화면 매핑 정확성 ✅, ② #3·#4 보호자 상세/목록 실제 호출 위치 ✅, ③ #2 지도 클러스터링 처리 주체 ✅ |
| 2.5-2 | 사장님이 Supabase에서 SQL 실행 | ✅ 완료 | 15개 SQL 파일 (VIEW 1 + DDL 1 + RPC 13) 실행 완료 |

#### 공통 RLS 충돌 해결 — 방안 A (VIEW 방식) ✅ 확정

> **결정 (2026-04-15)**: 9개 RPC 함수에서 타 회원 데이터를 JOIN할 때, 원본 테이블의 RLS 정책(`members.id = auth.uid()`, `pets.member_id = auth.uid()`, `settlement_infos.member_id = auth.uid()`)이 접근을 차단하는 문제가 있다.
>
> - **방안 A (VIEW) — 채택**: 공개 VIEW를 만들어 필요한 컬럼만 안전하게 노출. RPC는 `SECURITY INVOKER` 유지.
> - ~~방안 B (SECURITY DEFINER 예외) — 제외~~: 한번 예외를 허용하면 9개 함수 전부가 예외가 되어 SECURITY INVOKER 규칙 자체가 무의미해진다.
>
> VIEW는 `security_invoker = false` (= SECURITY DEFINER)로 생성되어 기저 테이블 RLS를 우회하지만, 노출 컬럼을 최소화하여 개인정보를 보호한다. 원본 테이블에 공개 SELECT 정책을 직접 추가하지 않는다.
>
> **보안 강화 (internal 스키마)**: VIEW를 `public` 스키마가 아닌 `internal` 스키마에 생성한다. Supabase PostgREST는 `public` 스키마만 REST API endpoint로 노출하므로, `internal` 스키마의 VIEW는 API endpoint가 생성되지 않는다. → 로그인한 사용자가 Postman/curl로 VIEW를 직접 조회하는 것이 구조적으로 불가능. RPC 함수 내부에서만 `internal.members_public_profile` 등으로 참조 가능.

| VIEW 이름 | 스키마 | 기저 테이블 | 노출 컬럼 수 | 제외 항목 | SQL 파일 |
|-----------|--------|-----------|------------|----------|---------|
| `internal.members_public_profile` | internal | members | 9 (id, nickname, profile_image, current_mode, address_complex, address_building_dong, latitude, longitude, status) | 전화번호, 상세주소(ho), 생년월일, 성별, 통신사, 본인인증, 노쇼제재, 정지/탈퇴 사유, 알림설정, 앱설정, name, nickname_tag, created_at | sql/44_00 |
| `internal.pets_public_info` | internal | pets | 15 (+ `WHERE deleted=false`) | deleted, created_at, updated_at | sql/44_00 |
| `internal.settlement_infos_public` | internal | settlement_infos | 4 (id, member_id, kindergarten_id, inicis_status) | 사업자정보, 계좌정보, 주민번호, 개인정보 전체 | sql/44_00 |

#### RPC 함수 설계 규칙

- 파일명: `sql/44_00_app_public_views.sql` (VIEW) + `sql/44_00a_ddl_alter_tables.sql` (DDL) + `sql/44_01_app_rpc_[함수명].sql` ~ `sql/44_12_app_rpc_[함수명].sql` (+ `sql/44_05b_*`)
- 함수명: `app_` 접두어 (관리자용 `get_admin_*`/`get_dashboard_*`와 구분)
- 보안: `SECURITY INVOKER` + `SET search_path = public` (RLS 자동 적용)
- 타 회원 데이터 JOIN: 원본 테이블 대신 **internal 스키마 VIEW** 사용 (`internal.members_public_profile`, `internal.pets_public_info`, `internal.settlement_infos_public`)
- 인자: `p_` 접두어 (예: `p_member_id`, `p_page`)
- 반환: `json` 또는 `TABLE` (앱에서 파싱 용이하게)
- 페이지네이션: `p_page int DEFAULT 1`, `p_per_page int DEFAULT 20`
- 거리 계산: PostGIS 미사용, Haversine 순수 SQL 구현
- 오류 처리: `EXCEPTION` 블록 포함
- 주석: 원본 PHP 파일명 명시 (예: `-- 원본: get_partner.php`)

#### 앱용 RPC 함수 목록 (13개) — 리뷰 2개 분리 + 예약 목록 2개 분리

> **변경 (2026-04-15)**: 기존 #9 `app_get_reviews` (guardian + kindergarten 통합)를 2개로 분리.
> → #9 `app_get_guardian_reviews`, #12 `app_get_kindergarten_reviews`
>
> **변경 (2026-04-16)**: #5 `app_get_reservations_guardian`를 보호자/유치원 2개로 분리.
> → #5 `app_get_reservations_guardian` (보호자용), #5b `app_get_reservations_kindergarten` (유치원용)
> 총 RPC 12→13개.

| # | SQL 파일 | 함수명 | 원본 PHP | 용도 | 핵심 로직 | VIEW 사용 | 상태 |
|---|---------|--------|---------|------|----------|----------|------|
| 1 | sql/44_01 | `app_get_kindergarten_detail` | get_partner.php | 유치원 상세 | kindergartens + members + favorite + settlement_infos + pets JOIN | ✅ 3개 모두 | ✅ 완료 |
| 2 | sql/44_02 | `app_get_kindergartens` | get_partner_list.php | 유치원 목록 | kindergartens + review COUNT + Haversine 거리 정렬 + p_limit safety cap | ✅ members | ✅ 완료 |
| 3 | sql/44_03 | `app_get_guardian_detail` | get_protector.php | 보호자 상세 | members + pets + favorite JOIN | ✅ members, pets | ✅ 완료 |
| 4 | sql/44_04 | `app_get_guardians` | get_protector_list.php | 보호자 목록 | members + pets JOIN + 페이지네이션 | ✅ members, pets | ✅ 완료 |
| 5 | sql/44_05 | `app_get_reservations_guardian` | get_payment_request.php | 예약 목록 (보호자) | reservations + pets + kindergartens + members JOIN + 상태 필터 | ✅ members, pets | ✅ 완료 |
| 5b | sql/44_05b | `app_get_reservations_kindergarten` | get_payment_request.php | 예약 목록 (유치원) | reservations + pets + members JOIN + 유치원 운영자 시점 | ✅ members, pets | ✅ 완료 |
| 6 | sql/44_06 | `app_get_reservation_detail` | get_payment_request_by_id.php | 예약 상세 | reservations + payments + refunds + pets + kindergartens + members JOIN | ✅ members, pets | ✅ 완료 |
| 7 | sql/44_07 | `app_withdraw_member` | set_member_leave.php | 회원 탈퇴 | members UPDATE (soft delete: status→'탈퇴') + pets.deleted=true + kindergartens.registration_status='withdrawn'. Auth 삭제는 Edge Function | ❌ | ✅ 완료 |
| 8 | sql/44_08 | `app_set_representative_pet` | set_first_animal_set.php | 대표 반려동물 지정 | pets BATCH UPDATE (is_representative) | ❌ | ✅ 완료 |
| 9 | sql/44_09 | `app_get_guardian_reviews` | get_review.php (type=pet) | 보호자 후기 | guardian_reviews + 태그 집계(7 positive) + pets + members JOIN | ✅ members, pets | ✅ 완료 |
| 10 | sql/44_10 | `app_get_settlement_summary` | get_settlement.php + get_settlement_list.php | 정산 요약 | settlements 집계 (정산완료/예정/보류) + 기간별 period_summary + details 페이지네이션 | ✅ members | ✅ 완료 |
| 11 | sql/44_11 | `app_get_education_with_progress` | get_education.php | 교육 + 이수현황 | education_topics + quizzes + completions LEFT JOIN | ❌ | ✅ 완료 |
| 12 | sql/44_12 | `app_get_kindergarten_reviews` | get_review.php (type=partner) | 유치원 후기 | kindergarten_reviews + is_guardian_only 필터 + 태그 집계(7 positive) + pets + members + kindergartens JOIN | ✅ members, pets | ✅ 완료 |

#### 작업 순서 (난이도/의존성 기반)

> **원칙**: PHP 소스가 있는 함수(유치원 그룹)를 먼저, PHP 소스가 없는 함수(보호자 그룹)는 나중에.

| 순서 | # | 함수명 | 난이도 | PHP소스 | 비고 |
|------|---|--------|--------|---------|------|
| 1 | 8 | `app_set_representative_pet` | ★☆☆ | ✅ | ✅ 완료 — 워밍업, RLS 충돌 없음 |
| 2 | 11 | `app_get_education_with_progress` | ★★☆ | ✅ | ✅ 완료 — education 테이블만, RLS 충돌 없음 |
| 3 | 1 | `app_get_kindergarten_detail` | ★★★ | ✅ | ✅ 완료 — 7테이블/VIEW, internal VIEW 3개 모두 사용 |
| 4 | 2 | `app_get_kindergartens` | ★★★ | ✅ | ✅ 완료 — 목록, Haversine 거리, p_limit safety cap, settlement_infos VIEW 불필요 |
| 5 | 5 | `app_get_reservations_guardian` | ★★★ | ✅ | ✅ 완료 — 보호자용, 4테이블 JOIN, 상태 필터 |
| 5b | 5b | `app_get_reservations_kindergarten` | ★★★ | ✅ | ✅ 완료 — 유치원용, #5에서 분리 (보호자/유치원 비대칭) |
| 6 | 6 | `app_get_reservation_detail` | ★★★ | ✅ | ✅ 완료 — 단건 + payments + refunds JOIN |
| 7 | 9 | `app_get_guardian_reviews` | ★★★ | ✅ | ✅ 완료 — 태그 집계(7 positive), json_agg ORDER BY ord |
| 8 | 12 | `app_get_kindergarten_reviews` | ★★★ | ✅ | ✅ 완료 — is_guardian_only 필터, 태그 집계(7 positive) |
| 9 | 10 | `app_get_settlement_summary` | ★★☆ | ✅ | ✅ 완료 — 정산 집계 + period_summary + RLS 보강 |
| 10 | 3 | `app_get_guardian_detail` | ★★☆ | ❌ | ✅ 완료 — PHP 소스 없음, 구조 추론 → 외주개발자 확인 완료 |
| 11 | 4 | `app_get_guardians` | ★★☆ | ❌ | ✅ 완료 — PHP 소스 없음, 목록 버전 |
| 12 | 7 | `app_withdraw_member` | ★★★ | ✅ | ✅ 완료 — soft delete + DDL ALTER + 데이터 정리 |

### Step 3: 앱 API 전환 가이드 작성 ✅ 완료

**목표**: 외주 개발자가 모바일 앱(React Native/Expo) 코드를 PHP→Supabase로 전환할 수 있도록 66개 API별 전환 지침서를 작성한다.

> **전제 조건**: Step 2.5(앱용 RPC 함수 13개)가 Supabase에 배포된 상태여야 한다. ✅ 충족 (PR #133~#137)

#### 산출물 2개 — 문서 역할 분담

| 문서 | 역할 | 내용 |
|------|------|------|
| **APP_MIGRATION_GUIDE.md** | **이해용** (읽고 파악) | §0 규칙/표기법, 용어 매핑 18항, 코드 표기 12항, `lib/supabase.ts` MMKV 어댑터, 마이그레이션 Phase A→D 순서, 16개 장별 개념 설명·Before/After 흐름·전환 포인트, 부록(타입 정의·env 체크리스트). **각 API에 #1~#66 번호를 부여하고, CODE.md에서 동일 번호로 코드를 참조하도록 안내.** |
| **APP_MIGRATION_CODE.md** | **복붙용** (코드 참조) | GUIDE.md가 부여한 API 번호(#1~#66)를 **코드 블록 주석에 그대로 명시**하여, 개발자가 GUIDE→CODE 순서로 번호를 추적하며 실제 코드를 복사·적용할 수 있도록 구성. 13개 분류 섹션, 각 API별 마이그레이션 방식·난이도·Before/After 코드 블록·전환 포인트, 부록(공통 스토리지 업로드 패턴·6개 버킷 매핑) |

> 두 문서는 동일한 API 번호 체계(MIGRATION_PLAN.md §5 #1~#66)를 공유한다.
> GUIDE.md에서 개념을 이해한 뒤, CODE.md에서 해당 번호의 실제 코드를 복사하여 적용하는 흐름이다.

#### 세부 작업 — 라운드(R1~R6) 기준

> 세부 작업 번호(3-0~3-6)를 본문 작성 라운드(R1~R6)와 1:1 대응시켜,
> **각 라운드 완료 = 해당 세부 작업 ✅** 로 추적할 수 있도록 구성했다.

| # | 라운드 | 세부 작업 | 상태 | 산출물 |
|---|--------|----------|------|--------|
| 3-0 | — | 문서 뼈대 초안 (§0 규칙, 전체 목차, API 번호 부여, placeholder) | ✅ 완료 | GUIDE.md + CODE.md (PR #139) |
| 3-1 | R1 | 인증 + apiClient 교체 (mb_id → Supabase Auth, FormData → Supabase JS) | ✅ 완료 | GUIDE §1~2 + CODE §1~2 |
| 3-2 | R2 | 단순 CRUD 핵심 (반려동물·유치원·보호자·주소·회원·채팅템플릿) | ✅ 완료 | GUIDE §3~10 + CODE §3~4 |
| 3-3 | R3 | RPC 조회 (10개) | ✅ 완료 | GUIDE §11~13 + CODE §4,§6~8,§13 |
| 3-4 | R4 | 채팅 Realtime (WebSocket → Realtime) | ✅ 완료 | GUIDE §14 + CODE §5 |
| 3-5 | R5 | 결제/예약 + Edge Functions (7개 EF 인터페이스 포함) | ✅ 완료 | GUIDE §15~16 + CODE §6 |
| 3-6 | R6 | 나머지 CRUD + 부록 + 교차검증 (즐겨찾기·알림·콘텐츠·차단·기타) | ✅ 완료 | CODE §9~12, 부록 A·B |

#### 본문 작성 계획 — 6라운드

TODO placeholder 112개(GUIDE 45 + CODE 67)를 실제 내용으로 채우는 작업.
각 라운드는 Phase A→D 순서를 따르며, GUIDE + CODE를 동시에 작성한다.

| 라운드 | 세부작업 | Phase | 대상 | GUIDE 장 | CODE 섹션 | TODO 수 | 핵심 내용 | 주요 참조 |
|--------|----------|-------|------|----------|-----------|---------|-----------|-----------|
| **R1** | 3-1 | A (기반) | 인증 + apiClient 교체 | 1, 2장 | §1 인증/회원, §2 주소 | ~20개 | Supabase Auth 흐름, apiClient→supabase 5패턴, MMKV 세션, mb_id 제거 | MOBILE_APP_ANALYSIS.md §인증, DB_MAPPING_REFERENCE.md members |
| **R2** | 3-2 | A (CRUD) | 단순 CRUD 핵심 | 3~10장 | §3 반려동물, §4 유치원/보호자 | ~16개 | 44개 자동 API 패턴, wr_1~wr_11 컬럼 매핑, Storage 업로드 | MOBILE_APP_ANALYSIS.md §API, DB_MAPPING_REFERENCE.md 전체 |
| **R3** | 3-3 | B | RPC 조회 | 11~13장 | §7 정산, §8 리뷰, §13 기타 | ~14개 | supabase.rpc() 호출, 파라미터·응답 매핑, 보호자/유치원 분기 | RPC_PHP_MAPPING.md, sql/44_01~44_12 |
| **R4** | 3-4 | C | 채팅 Realtime | 14장 | §5 채팅 | ~19개 | WebSocket→Realtime 전환, 채팅방 구독, 메시지 CRUD, 파일 전송 | MOBILE_APP_ANALYSIS.md §채팅 |
| **R5** | 3-5 | D | 결제/예약 + Edge Functions | 15, 16장 | §6 결제/돌봄 | ~25개 | Edge Function 7개 인터페이스, 이니시스 콜백, 예약 생성 흐름 | MIGRATION_PLAN.md §7, MOBILE_APP_ANALYSIS.md §결제 |
| **R6** | 3-6 | 마무리 | 나머지 + 부록 + 교차검증 | 부록 A,B | §9~§12, 부록 | ~18개 | 즐겨찾기·알림·콘텐츠·차단, 타입 정의, env/패키지 체크리스트, 문서 간 일관성 검증 | 전체 문서 교차검증 |

> **작업 방식**: 각 라운드는 **별도 채팅방**에서 진행한다. GUIDE.md + CODE.md를 같은 라운드에서 동시에 채우며, 라운드 완료 시마다 `genspark_ai_developer` 브랜치에 커밋→푸시→리뷰 후 다음 라운드로 진행한다.
>
> **새 채팅방 프롬프트 템플릿**:
> ```
> R{N} 라운드 문서 작성해줘.
> APP_MIGRATION_GUIDE.md + APP_MIGRATION_CODE.md를 같은 라운드에서 동시에 채우는 형태로 작업 진행.
>
> ■ 필수 선행:
>   1. APP_MIGRATION_GUIDE.md의 "0. 문서 규칙 및 표기법" (§0-1 ~ §0-8)을 먼저 읽고,
>      그 규칙(용어 매핑, 코드 표기, Before/After 형식, 응답 매핑 등)을 반드시 준수하여 작성할 것.
>   2. MIGRATION_PLAN.md의 Step 3 "본문 작성 계획" 표에서 R{N}의 대상 범위를 확인할 것.
>
> ■ 참조 문서: MIGRATION_PLAN.md, MOBILE_APP_ANALYSIS.md, DB_MAPPING_REFERENCE.md, RPC_PHP_MAPPING.md
> ■ 작업 브랜치: genspark_ai_developer (main 절대 금지, PR은 별도 요청 시에만)
> ```
>
> **완료**: R1~R6 본문 작성 + 전체 리뷰 반영 완료. GUIDE §1~16 + 부록 A·B + CODE §1~§13 전체 확정. 66개 API 전환 코드 완성, RPC 16개 확정 (Step 2.5: 13개 + Step 4 추가: 3개).

#### 전환 권장 순서 (외주 개발자 실제 작업 순서)

```
Phase A: 인증 + 단순 CRUD (가장 먼저, 영향도 낮음)
  → auth_request, set_join, 자동 API 25개

Phase B: RPC 조회 (Step 2.5 함수 사용)
  → get_partner, get_protector, get_payment_request 등 7개

Phase C: 채팅 (Realtime 전환, 복잡도 높음)
  → chat.php 관련 8개

Phase D: 결제/예약 + Edge Functions (가장 마지막, 위험도 높음)
  → inicis_payment, set_payment_request, set_care_complete 등
```

### Step 4: Edge Functions 구현 ⬜ 예정

**목표**: 앱에서 직접 처리할 수 없는 서버 사이드 로직을 Supabase Edge Functions로 구현한다.

| # | 기능 | 상태 | 난이도 | 이유 |
|---|------|------|--------|------|
| 4-1 | inicis-callback (이니시스 결제 콜백) | ⬜ 예정 | 상 | PG사 → 서버 직접 호출 |
| 4-2 | send-chat-message (채팅 메시지 전송) | ⬜ 예정 | 상 | Storage + Realtime + FCM 복합 |
| 4-3 | create-reservation (예약 생성) | ⬜ 예정 | 상 | 예약 + 채팅방 + 시스템 메시지 + FCM |
| 4-4 | complete-care (돌봄 완료) | ⬜ 예정 | 중 | 상태 변경 + 시스템 메시지 + FCM |
| 4-5 | send-alimtalk (카카오 알림톡) | ⬜ 예정 | 중 | 외부 API 키 보호 |
| 4-6 | send-push (FCM 푸시) | ⬜ 예정 | 중 | Firebase Admin SDK 서버 전용 |
| 4-7 | scheduler (스케줄러) | ⬜ 예정 | 상 | 자동 상태 변경 + 알림 (cron) |
| 4-8 | app_create_chat_room (채팅방 생성 RPC) | ⬜ 예정 | 상 | `SECURITY DEFINER` — `chat_room_members` INSERT에 RLS 정책 없음 (RPC 전용 설계), 중복 방 검사·나간 방 복원 로직 포함. §9-1 SECURITY DEFINER 예외 사유 참조 |
| 4-9 | app_get_chat_rooms (채팅방 목록 RPC) | ⬜ 예정 | 상 | 미읽음 카운트 서브쿼리 (`created_at` 타임스탬프 비교, UUID v4 순서 미보장 → `cm.id >` 비교 사용 금지), 상대방 프로필 JOIN, `chat_room_reservations` COUNT |
| 4-10 | app_get_blocked_list (차단 목록 RPC) | ⬜ 예정 | 하 | `members` 테이블 RLS(`id = auth.uid()`)로 임베디드 JOIN 시 타인 프로필 `null` 반환 → `SECURITY DEFINER` RPC + `internal.members_public_profile` VIEW 필수. #17, #19, #23, #41과 동일 패턴 |

> **변경 사항 (2026-04-14)**:
> - ~~address-proxy~~ 삭제: 앱에서 카카오 주소 API를 직접 호출하고 있으며(`kakao-address.php`는 단순 프록시), 네이버 역지오코딩은 앱에서 미사용 확인. 카카오 주소 검색은 앱 클라이언트에서 JavaScript API로 직접 처리 가능.
> - `create-payment-request` → `create-reservation`으로 이름 변경 (Supabase 테이블명 `reservations`와 일치시킴)

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
| 지리 데이터 | 2개 | apt_buildings, buildings | 앱에서 카카오 주소 API 직접 호출, 네이버 역지오코딩 미사용 |
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

## 5. API 전환 매핑표 (PHP → Supabase) ✅ 교정 완료

> **2026-04-14 전수조사 교정**: React Native 앱 소스코드에서 실제 호출되는 PHP API 60개를 grep으로 전수 추출하여 기존 매핑표와 대조. 미사용 19개 제거, 누락 3개 추가, 번호 재정렬 완료.

### 전환 방식 분류 (교정 후 확정)

| 전환 방식 | 설명 | 확정 수량 |
|----------|------|----------|
| **자동 API** | Supabase PostgREST 직접 호출 (단순 CRUD + Storage 업로드) | 44개 |
| **RPC** | Supabase RPC 함수 (복잡한 조회/JOIN/집계) — Step 2.5에서 생성 (12개, 리뷰 2분리) + 채팅 RPC (2개) | 14개 |
| **Edge Function** | 서버 사이드 필수 (결제, FCM, 외부 API, 파일 업로드) | 7개 |
| **Supabase Auth** | 인증 관련 (Phone OTP) | 1개 |
| **앱 직접 호출** | 서버 경유 불필요 (카카오 주소 API 등) | 1개 |
| **합계** | | **66개** |

> **참고**: 기존 85개 PHP API에서 미사용 19개를 제거하고, 누락 3개를 추가하면 앱 전환 대상 66개. 여기서 관리자 전용 3개와 제거 대상 5개(toss_payment 등)를 빼면 **실제 앱 코드 수정 대상은 ~58개**. 그 중 자동 API 44개는 비교적 단순 변환이므로, 핵심 작업은 RPC 13개 + Edge Function 7개 = **20개**에 집중된다.

> **제거된 미사용 API 19개** (앱 소스에서 호출되지 않음):
> `get_main_partner.php` (get_partner_list로 대체), `get_partner_status.php`, `get_partner_by_phone.php`, `set_partner_insert.php` (set_partner_update로 통합), `set_block_user_add.php` (set_block_user로 통합), `set_block_user_remove.php` (set_block_user로 통합), `get_notify_setting.php` (앱 로컬 상태만 사용), `set_notify_setting_update.php` (앱 로컬 상태만 사용), `get_setting.php`, `get_guide.php`, `get_kakaolink.php`, `set_suggest_insert.php` (UI만 존재, API 연결 없음), `get_educationN.php` (하드코딩 데이터), `get_review_string.php`, `set_animal_favorite_add.php` (set_user_favorite_add로 통합), `set_animal_favorite_remove.php` (set_user_favorite_remove로 통합), `buildings.php` (앱 미호출), `get_address.php` (테스트 코드), `set_care_request.php` (주석에만 존재)

> **추가된 누락 API 3개** (앱에서 호출하나 기존 매핑표에 없었음):
> `kakao-address.php`, `delete_message_template.php`, `update_message_template.php`

### 5-1. 인증/회원 (6개)

| # | PHP API | 방식 | Supabase 대응 | DB 테이블 | 난이도 |
|---|---------|------|--------------|----------|--------|
| 1 | alimtalk.php | Edge Function | 카카오 알림톡 API → auth_phone_log INSERT | — (Supabase Auth) | 중 |
| 2 | auth_request.php | Supabase Auth | signInWithOtp() + verifyOtp() → members SELECT | members | 중 |
| 3 | set_join.php | 자동 API | Supabase Auth signUp() → members UPSERT | members | 쉬움 |
| 4 | set_member_leave.php | RPC | `app_withdraw_member` — members UPDATE (탈퇴) + Auth 삭제 | members | 중 |
| 5 | set_mypage_mode_update.php | 자동 API | members UPDATE (current_mode) | members | 쉬움 |
| 6 | set_profile_update.php | 자동 API + Storage | members UPDATE + Storage 프로필 이미지 업로드 | members | 쉬움 |

### 5-2. 주소 인증 (2개)

| # | PHP API | 방식 | Supabase 대응 | 난이도 |
|---|---------|------|--------------|--------|
| 7 | set_address_verification.php | 자동 API + Storage | members UPDATE (address_doc_urls) + Storage 서류 업로드 | 쉬움 |
| 8 | kakao-address.php | 앱 직접 호출 | 카카오 주소 검색 JavaScript API → 앱 클라이언트에서 직접 처리 (Edge Function 불필요) | 쉬움 |

### 5-3. 반려동물 (8개)

| # | PHP API | 방식 | Supabase 대응 | 난이도 |
|---|---------|------|--------------|--------|
| 9 | get_my_animal.php | 자동 API | pets SELECT WHERE member_id=? AND deleted=false | 쉬움 |
| 10 | get_animal_by_id.php | 자동 API | pets SELECT WHERE id=? + favorite 조인 | 쉬움 |
| 11 | get_animal_by_mb_id.php | 자동 API | pets SELECT WHERE member_id=? | 쉬움 |
| 12 | get_animal_kind.php | 자동 API | pet_breeds SELECT WHERE name ILIKE ? | 쉬움 |
| 13 | set_animal_insert.php | 자동 API + Storage | pets INSERT + Storage 이미지 (최대 10개) + 4마리 제한 체크 | 쉬움 |
| 14 | set_animal_update.php | 자동 API + Storage | pets UPDATE + Storage 이미지 교체 | 쉬움 |
| 15 | set_animal_delete.php | 자동 API | pets UPDATE (soft delete: deleted=true) | 쉬움 |
| 16 | set_first_animal_set.php | RPC | `app_set_representative_pet` — pets BATCH UPDATE (is_representative: 기존 true→false, 선택→true) | 쉬움 |

### 5-4. 유치원/보호자 (4개)

| # | PHP API | 방식 | Supabase 대응 | 난이도 |
|---|---------|------|--------------|--------|
| 17 | get_partner.php | RPC | `app_get_kindergarten_detail` — kindergartens + members + favorite + settlement + pets JOIN | 중 |
| 18 | get_partner_list.php | RPC | `app_get_kindergartens` — kindergartens + review COUNT + 거리 정렬 | 중 |
| 19 | get_protector.php | RPC | `app_get_guardian_detail` — members + pets + favorite JOIN | 중 |
| 20 | get_protector_list.php | RPC | `app_get_guardians` — members + pets JOIN + 페이지네이션 | 중 |

> **변경**: `set_partner_update.php`는 앱에서 호출되지만 단순 자동 API로 처리 가능 (kindergartens UPDATE). `set_partner_insert.php`는 앱에서 미호출 (set_partner_update가 UPSERT로 처리).

### 5-5. 유치원 프로필 관리 (1개)

| # | PHP API | 방식 | Supabase 대응 | 난이도 |
|---|---------|------|--------------|--------|
| 21 | set_partner_update.php | 자동 API + Storage | kindergartens UPDATE + 이미지 + settlement_info UPSERT | 중 |

### 5-6. 채팅 (9개) — **가장 복잡한 영역**

| # | PHP API | 방식 | Supabase 대응 | 난이도 |
|---|---------|------|--------------|--------|
| 22 | chat.php → create_room | RPC | chat_rooms INSERT + chat_room_members INSERT (2명, mb_5 역할 기반 매칭) | 상 |
| 23 | chat.php → get_rooms | RPC | chat_rooms SELECT + unread_count 서브쿼리 + last_message + members 관계 | 상 |
| 24 | chat.php → get_messages | 자동 API | chat_messages SELECT (room_id 필터, 페이징) + last_read_message_id UPDATE | 중 |
| 25 | chat.php → send_message | Edge Function | chat_messages INSERT + Storage 파일 + **Realtime 브로드캐스트** + FCM 푸시 + notification INSERT | 상 |
| 26 | chat.php → get_images | 자동 API | chat_messages SELECT WHERE image_urls IS NOT NULL | 쉬움 |
| 27 | chat.php → leave_room | 자동 API | chat_rooms UPDATE (deleted_at=NOW()) | 쉬움 |
| 28 | chat.php → muted | 자동 API | chat_room_members UPDATE (is_muted) | 쉬움 |
| 29 | read_chat.php | 자동 API | chat_room_members UPDATE (last_read_message_id) | 쉬움 |
| 30 | get_message_template.php | 자동 API | chat_templates SELECT WHERE member_id=? AND type='custom' | 쉬움 |

> **참고**: 구버전 채팅 API (get_chat_list.php, set_chat_insert.php)는 g5_chat 테이블 사용 → 폐기 대상.
> 현행 채팅은 chat.php (router 패턴) + room/chat/room_members 테이블 사용.

### 5-7. 채팅 템플릿 (3개)

| # | PHP API | 방식 | Supabase 대응 | 난이도 |
|---|---------|------|--------------|--------|
| 31 | set_message_template.php | 자동 API | chat_templates INSERT (type='custom') | 쉬움 |
| 32 | update_message_template.php | 자동 API | chat_templates UPDATE WHERE id=? AND member_id=? | 쉬움 |
| 33 | delete_message_template.php | 자동 API | chat_templates DELETE WHERE id=? AND member_id=? | 쉬움 |

### 5-8. 결제 (5개)

| # | PHP API | 방식 | Supabase 대응 | 난이도 |
|---|---------|------|--------------|--------|
| 34 | inicis_payment.php | Edge Function | PG사 콜백 수신 → set_inicis_approval 호출 → WebView 결과 반환 | 상 |
| 35 | set_inicis_approval.php | Edge Function | payments UPSERT (oid 기준) + raw_response 저장 | 중 |
| 36 | set_payment_request.php | Edge Function | reservations INSERT/UPDATE + payments 연결 + chat_messages INSERT (system) + Realtime + FCM | 상 |
| 37 | get_payment_request.php | RPC | `app_get_reservations_guardian` — reservations + pets + kindergartens + members JOIN (목록) | 중 |
| 38 | get_payment_request_by_id.php | RPC | `app_get_reservation_detail` — reservations (단건) + approval_info + pets + kindergartens + members | 중 |

### 5-9. 돌봄 상태 관리 (2개)

| # | PHP API | 방식 | Supabase 대응 | 난이도 |
|---|---------|------|--------------|--------|
| 39 | set_care_complete.php | Edge Function | reservations UPDATE + chat_messages INSERT (care_end, review) + Realtime + FCM | 상 |
| 40 | set_care_review.php | 자동 API | guardian_reviews/kindergarten_reviews INSERT (후기 작성) | 쉬움 |

### 5-10. 정산 (3개)

| # | PHP API | 방식 | Supabase 대응 | 난이도 |
|---|---------|------|--------------|--------|
| 41 | get_settlement.php + get_settlement_list.php | RPC | `app_get_settlement_summary` — settlements 집계 (정산완료/예정/보류) + next_settlement + period_summary (기간별 합산) + details (페이지네이션 + 보호자 정보). get_settlement_list.php의 월별 집계·세부 명세를 period_summary + details로 흡수 | 중 |
| 42 | get_settlement_info.php | 자동 API | settlement_infos SELECT + kindergartens JOIN + members JOIN | 쉬움 |
| 43 | set_settlement_info.php | 자동 API | settlement_infos UPSERT + 주민번호 뒷자리 암호화 (Edge Function) | 중 |

### 5-11. 리뷰 (3개) — RPC 2개 분리

> **변경 (2026-04-15)**: 기존 `app_get_reviews` 1개를 `app_get_guardian_reviews` + `app_get_kindergarten_reviews` 2개로 분리. 총 RPC 11→12개.

| # | PHP API | 방식 | Supabase 대응 | 난이도 |
|---|---------|------|--------------|--------|
| 44 | get_review.php (type=pet) | RPC | `app_get_guardian_reviews` — guardian_reviews + 태그 집계 + pets + members JOIN | 중 |
| 44b | get_review.php (type=partner) | RPC | `app_get_kindergarten_reviews` — kindergarten_reviews + is_guardian_only 필터 + 태그 집계 + pets + members JOIN | 중 |
| 45 | set_review.php | 자동 API + Storage | guardian_reviews 또는 kindergarten_reviews INSERT + Storage 이미지 | 쉬움 |

### 5-12. 즐겨찾기 (4개)

| # | PHP API | 방식 | Supabase 대응 | 난이도 |
|---|---------|------|--------------|--------|
| 46 | set_partner_favorite_add.php | 자동 API | favorite_kindergartens UPSERT (is_favorite='Y') | 쉬움 |
| 47 | set_partner_favorite_remove.php | 자동 API | favorite_kindergartens UPDATE (is_favorite='N') | 쉬움 |
| 48 | set_user_favorite_add.php | 자동 API | favorite_pets UPSERT — 보호자가 반려동물 찜 | 쉬움 |
| 49 | set_user_favorite_remove.php | 자동 API | favorite_pets UPDATE (is_favorite='N') | 쉬움 |

### 5-13. 알림/FCM (3개)

| # | PHP API | 방식 | Supabase 대응 | 난이도 |
|---|---------|------|--------------|--------|
| 50 | fcm_token.php | 자동 API | fcm_tokens UPSERT (mb_id + token 중복 체크) | 쉬움 |
| 51 | get_notification.php | 자동 API | notifications SELECT WHERE member_id=? ORDER BY created_at DESC | 쉬움 |
| 52 | delete_notification.php | 자동 API | notifications DELETE (전체 or 단건) | 쉬움 |

### 5-14. 콘텐츠 조회 (5개)

| # | PHP API | 방식 | Supabase 대응 | 난이도 |
|---|---------|------|--------------|--------|
| 53 | get_banner.php | 자동 API | banners SELECT (페이징) | 쉬움 |
| 54 | get_notice.php | 자동 API | notices SELECT WHERE visible=true (페이징) | 쉬움 |
| 55 | get_notice_detail.php | 자동 API | notices SELECT WHERE id=? | 쉬움 |
| 56 | get_faq.php | 자동 API | faqs SELECT (검색, 페이징) | 쉬움 |
| 57 | get_policy.php | 자동 API | terms SELECT (카테고리 필터) | 쉬움 |

### 5-15. 차단 (3개)

| # | PHP API | 방식 | Supabase 대응 | 난이도 |
|---|---------|------|--------------|--------|
| 58 | set_block_user.php | 자동 API | member_blocks INSERT/DELETE (토글) | 쉬움 |
| 59 | get_block_user.php | 자동 API | member_blocks SELECT (차단 여부 확인) | 쉬움 |
| 60 | get_blocked_list.php | 자동 API | member_blocks SELECT + members JOIN (차단 목록) | 쉬움 |

### 5-16. 기타 (5개)

| # | PHP API | 방식 | Supabase 대응 | 난이도 |
|---|---------|------|--------------|--------|
| 61 | get_education.php | RPC | `app_get_education_with_progress` — education_topics + quizzes + completions LEFT JOIN | 중 |
| 62 | set_solved.php | 자동 API | education_completions INSERT (중복 체크) | 쉬움 |
| 63 | get_bank_list.php | 자동 API | banks SELECT WHERE use_yn=true ORDER BY sort_order | 쉬움 |
| 64 | get_favorite_animal_list.php | 자동 API | favorite_pets SELECT + pets JOIN (유치원이 찜한 반려동물) | 쉬움 |
| 65 | get_favorite_partner_list.php | 자동 API | favorite_kindergartens SELECT + kindergartens JOIN (보호자가 찜한 유치원) | 쉬움 |

### 5-17. 서버 전용 (1개)

| # | PHP API | 방식 | Supabase 대응 | 난이도 |
|---|---------|------|--------------|--------|
| 66 | scheduler.php | Edge Function | reservations 일괄 상태 변경 + FCM + Realtime (cron) | 상 |

### 5-18. 관리자 전용 (이미 Supabase 연결, 앱과 무관)

| PHP API | 현재 상태 | 비고 |
|---------|----------|------|
| get_admin_settlement_queue.php | 관리자 페이지에서 직접 Supabase RPC 사용 | 앱 전환 불필요 |
| get_admin_settlement_detail.php | 관리자 페이지에서 직접 Supabase RPC 사용 | 앱 전환 불필요 |
| set_settlement_admin_approve.php | 관리자 페이지에서 직접 Supabase 자동 API 사용 | 앱 전환 불필요 |

### 5-19. 제거 대상

| PHP API | 이유 |
|---------|------|
| toss_payment.php | 앱 코드에 레거시 호출 존재 (`app/payment/approval.tsx:43`), 실제로는 이니시스만 사용. 앱 전환 시 이니시스로 통합하고 해당 호출 제거 |
| toss_payment_approval.php | 미구현 |
| get_chat_list.php (구버전) | g5_chat 사용 → 폐기 (새 chat.php 사용 중) |
| set_chat_insert.php (구버전) | g5_chat 사용 → 폐기 |
| 백업 파일 14개 (*260111.php 등) | 구버전 |

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

## 7. Edge Functions 설계 ✅ 교정 완료

### 7-1. 함수 목록 (7개)

> **2026-04-14 교정**: `address-proxy` 삭제 (앱에서 카카오 주소 API 직접 호출, 네이버 역지오코딩 미사용), `create-payment-request` → `create-reservation`으로 이름 변경.

| # | 함수명 | 용도 | PHP 원본 | 트리거 | 난이도 |
|---|--------|------|---------|--------|--------|
| 1 | **inicis-callback** | 이니시스 결제 콜백 → 결과를 DB 저장 → WebView HTML 반환 | inicis_payment.php | PG사 POST 호출 | 상 |
| 2 | **send-chat-message** | 채팅 메시지 저장 + Storage 파일 + Realtime 브로드캐스트 + FCM 푸시 | chat.php → send_message | 앱 호출 | 상 |
| 3 | **create-reservation** | 예약 생성 + 채팅방 자동 생성/연결 + system 메시지 + FCM | set_payment_request.php | 앱 호출 | 상 |
| 4 | **complete-care** | 돌봄 완료 처리 + care_end/review 시스템 메시지 + Realtime + FCM | set_care_complete.php, scheduler.php 일부 | 앱 호출 | 중 |
| 5 | **send-alimtalk** | 카카오 알림톡 SMS 발송 (인증번호) | alimtalk.php | 앱 호출 | 중 |
| 6 | **send-push** | FCM 푸시 알림 발송 (범용) | chat.php/scheduler.php 내부 | DB 트리거 or 다른 Edge Function에서 호출 | 중 |
| 7 | **scheduler** | 등원/하원 30분 전 알림 + 돌봄 시작/종료 자동 처리 | scheduler.php | pg_cron (5분 간격) or 외부 cron | 상 |

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
입력: room_id, member_id, content, message_type, file(선택)
처리:
  1. 채팅방 멤버 검증
  2. 파일 있으면 Storage 업로드 → URL 획득
  3. chat_messages INSERT
  4. Supabase Realtime 채널로 브로드캐스트
  5. 상대방 FCM 토큰 조회 → 푸시 발송 (is_muted 체크)
  6. notifications INSERT
출력: 성공/실패
```

#### 7-2-3. create-reservation (예약 생성)

```
입력: member_id, kindergarten_id, pet_id, start/end date/time, price, payment_approval_id, room_id(선택)
처리:
  1. reservations INSERT (status='pending')
  2. payments 연결 (payment_approval_id)
  3. room_id 없으면 채팅방 자동 생성 (create_room 로직 재현)
  4. chat_room_reservations INSERT
  5. chat_messages INSERT (message_type='payment_request')
  6. Realtime 브로드캐스트
  7. 상대방 FCM 푸시
  8. notifications INSERT
업데이트 모드: reservation_id 있으면 UPDATE만 (status, reject_reason, penalty 등)
  - status='canceled'/'completed' 시 시스템 메시지 + FCM 추가 발송
```

#### 7-2-4. complete-care (돌봄 완료)

```
입력: reservation_id, member_id
처리:
  1. reservations UPDATE (status='care_completed', checkout_actual=NOW())
  2. chat_messages INSERT (message_type='care_end') + Realtime 브로드캐스트
  3. chat_messages INSERT (message_type='review') — 후기 작성 유도 메시지
  4. FCM 푸시 (상대방에게 돌봄 완료 알림)
  5. notifications INSERT
출력: 성공/실패
```

#### 7-2-5. send-alimtalk (카카오 알림톡)

```
입력: phone, template_code, variables
처리:
  1. 루나소프트 API 호출 (KAKAO_ALIMTALK_API_KEY, KAKAO_ALIMTALK_USER_ID)
  2. 발송 결과 로깅
출력: 성공/실패
```

#### 7-2-6. send-push (FCM 푸시)

```
입력: member_id (또는 member_ids), title, body, data(선택)
처리:
  1. fcm_tokens에서 대상 토큰 조회
  2. Firebase Admin SDK로 멀티캐스트 발송
  3. 실패 토큰 정리 (expired/invalid → 삭제)
출력: 발송 결과 (성공/실패 수)
```

#### 7-2-7. scheduler (자동 상태 변경)

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
- 앱용 RPC 함수는 `SECURITY INVOKER` 사용 (RLS 자동 적용)
  - **예외: `app_create_chat_room`** (R4 리뷰 Issue 3) — 이 RPC만 `SECURITY DEFINER`를 사용한다. 이유: 채팅방 생성 시 `chat_room_members`에 상대방(본인이 아닌 회원) 행도 INSERT해야 하나, `chat_room_members`의 INSERT 정책이 없음(RPC 전용 INSERT 설계). 또한 중복 채팅방 검사(`guardian_id` + `kindergarten_id` 조합) 시 상대방의 `chat_rooms` 행에 대한 SELECT가 필요하여 RLS가 이를 차단한다. 따라서 `SECURITY DEFINER + auth.uid()` 수동 검증으로 구현하며, `is_admin()` 체크 대신 인증 사용자 확인(`auth.uid() IS NOT NULL`)과 본인이 guardian 또는 kindergarten 소유자인지 파라미터 검증을 내부에서 수행한다.

### 9-2. 앱 코드 수정 범위 최소화

외주 개발자의 작업량을 줄이기 위해:
- Supabase 자동 API로 대체 가능한 건 자동 API 사용 (앱에서 `supabase.from('table').select()` 호출)
- PHP에서만 가능한 서버 로직은 Edge Functions로 구현 (앱에서 `supabase.functions.invoke()` 호출)
- 복잡한 JOIN/집계는 RPC 함수로 구현 (앱에서 `supabase.rpc('app_함수명', { params })` 호출)
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

| Secret Name | 용도 | 사용하는 Edge Function | 상태 | 등록일 |
|-------------|------|----------------------|------|--------|
| `KAKAO_ALIMTALK_API_KEY` | 카카오 알림톡 API 키 (루나소프트) | send-alimtalk | ✅ 활성 | 2026-04-14 |
| `KAKAO_ALIMTALK_USER_ID` | 카카오 알림톡 사용자 ID | send-alimtalk | ✅ 활성 | 2026-04-14 |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | FCM 푸시 알림용 Firebase 서비스 계정 (JSON 전체) | send-push, send-chat-message, create-reservation, complete-care, scheduler | ✅ 활성 | 2026-04-14 |
| `INICIS_MID` | 이니시스 상점 ID (`wooyoope79`) | inicis-callback | ✅ 활성 | 2026-04-14 |
| `JUSO_CONFM_KEY` | 행안부 주소 API 승인키 | ~~address-proxy~~ | ⚠️ 미사용 (보관) | 2026-04-14 |
| `NAVER_MAP_CLIENT_ID` | 네이버 역지오코딩 API Client ID (NCP) | ~~address-proxy~~ | ⚠️ 미사용 (보관) | 2026-04-14 |
| `NAVER_MAP_CLIENT_SECRET` | 네이버 역지오코딩 API Client Secret (NCP) | ~~address-proxy~~ | ⚠️ 미사용 (보관) | 2026-04-14 |

> **참고**:
> - `SUPABASE_URL`과 `SUPABASE_ANON_KEY`는 Supabase가 기본 제공하므로 별도 등록 불필요.
> - `INICIS_SIGN_KEY`는 불필요. 기존 PHP 코드에서 signKey/hashKey를 사용하지 않았으며, 모바일 결제(INIpay Mobile)의 hashKey는 앱 클라이언트 측에서 생성하는 값이므로 서버 Secret이 아님. 이니시스 PEM 파일(mcert.pem, mpriv.pem)은 PC 웹결제(INIpay Standard) 전용이므로 보관만 하면 됨.
> - `JUSO_CONFM_KEY`, `NAVER_MAP_CLIENT_ID`, `NAVER_MAP_CLIENT_SECRET`은 address-proxy Edge Function 삭제로 현재 미사용. 향후 필요 시 활성화할 수 있도록 Supabase Secrets에 보관만 한다. 삭제하지 않는 이유: Secret 삭제 후 재등록 시 키값을 다시 확인해야 하므로.

#### Edge Function 코드에서의 사용 예시

```typescript
// send-alimtalk Edge Function
const apiKey = Deno.env.get('KAKAO_ALIMTALK_API_KEY');
const userId = Deno.env.get('KAKAO_ALIMTALK_USER_ID');

// send-push Edge Function
const firebaseJson = JSON.parse(Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON')!);

// inicis-callback Edge Function
const inicisMid = Deno.env.get('INICIS_MID');
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
| 2026-04-14 | **앱 API 전수조사 + Step 2.5 설계** — React Native 소스에서 실제 호출 PHP API 60개 grep 추출, 기존 매핑 85개와 대조: 미사용 19개 제거 + 누락 3개(kakao-address, delete_message_template, update_message_template) 추가. Supabase RPC 함수가 관리자 전용뿐임을 확인 → Step 2.5(앱용 RPC 11개) 신규 삽입. Edge Functions 8→7개(address-proxy 삭제, create-reservation 이름변경). 섹션 2-2 지리 데이터 테이블 마이그레이션 불필요 확정. toss_payment.php 앱 레거시 호출 확인. Secrets 3개(JUSO/NAVER) 미사용 표기 |
| 2026-04-15 | **Step 2.5 진행 시작** — 공개 VIEW 3개(members_public_profile, pets_public_info, settlement_infos_public) 생성(sql/44_00), RPC #8 app_set_representative_pet 완료(sql/44_08). RLS 충돌 해결 방안 A(VIEW) 확정, 방안 B(SECURITY DEFINER) 제외. 리뷰 RPC 2개 분리(app_get_guardian_reviews + app_get_kindergarten_reviews) → 총 RPC 11→12개 |
| 2026-04-16 | **Step 2.5 RPC 대량 완성 (10/13)** — #5 app_get_reservations_guardian(보호자 예약목록), #5b app_get_reservations_kindergarten(유치원 예약목록, 신규 분리), #6 app_get_reservation_detail(예약상세 + payments + refunds), #9 app_get_guardian_reviews(보호자 후기 + 태그 집계 7개), #12 app_get_kindergarten_reviews(유치원 후기 + is_guardian_only 필터 + 태그 집계 7개), #10 app_get_settlement_summary(정산 요약 + period_summary + details) 완료. settlements RLS 보강(kindergarten_id 운영자 조건 추가, sql/43_01). #10은 get_settlement_list.php 기능 흡수. 총 RPC 12→13개(#5b 추가). 미완료 3개: #3, #4, #7 |
| 2026-04-17 | **Step 2.5 완료 (13/13)** — #3 app_get_guardian_detail + #4 app_get_guardians 완료(VIEW/RPC 일괄 리팩터링: members_public_profile 11→9컬럼, owner→operator 키 변경, PR #136). #7 app_withdraw_member 완료(soft delete: members.status→'탈퇴', pets.deleted=true, kindergartens.registration_status='withdrawn', DDL ALTER sql/44_00a, PR #137). 외주개발자 RPC_PHP_MAPPING.md 확인 완료 반영. 문서 일괄 업데이트(RPC_PHP_MAPPING, DB_FUNCTIONS, MIGRATION_PLAN, HANDOVER, DB_MAPPING_REFERENCE) |
| 2026-04-17 | **Step 3 R1 본문 작성 완료** — APP_MIGRATION_GUIDE.md §1 인증 전환 (1-1~1-6: 인증 흐름 다이어그램, API #1~#3 설명, userAtom 변경, 영향 범위) + §2 apiClient 교체 (2-1~2-5: 5패턴 비교, 점진적 전환 전략, 에러 처리 통합, 삭제 체크리스트). APP_MIGRATION_CODE.md §1 인증/회원 (#1~#6: Before/After 코드 + 응답 매핑 테이블) + §2 주소 인증 (#7~#8: Before/After 코드 + 응답 매핑 테이블). TODO 20개 해소, 8개 API 전환 코드 완성 |
| 2026-04-17 | **Step 3 R1 리뷰 반영 (Issue 2~8)** — GUIDE: §2-2 Auth API 수량 보충 설명(Issue 2), §0-5 Phase A #4 RPC 예외 주석(Issue 8). CODE: §1 #4~#6 선행 작성 사유 노트(Issue 3), #3 convertBirthDate/convertGender 유틸 추가+CHECK 제약 명시(Issue 4,5), #8 카카오 API 키 보안 경고 강조 박스(Issue 6). 양쪽 문서 변경 이력 업데이트(Issue 7) |
| 2026-04-17 | **Step 3 R2 본문 작성 완료** — GUIDE §3~10 (8개 장) + CODE §3~§13 (26개 API) 완성. 대상: 반려동물 CRUD(#9~#16), 유치원 프로필(#21), 채팅 자동 API(#24,#26~#29), 채팅 템플릿(#30~#33), 돌봄 후기(#40), 정산(#42~#43), 리뷰(#45), 기타(#62~#65). Storage 공통 유틸 작성 |
| 2026-04-17 | **Step 3 R2 리뷰 반영 (Issue 1~3)** — Issue 1: CODE #21 & GUIDE §9-3 가격 컬럼 `price_*_add` 3개 → `price_*_24h` + `price_*_pickup` 6개로 교정 (총 12개 컬럼 정확 반영). Issue 2: CODE #11 RLS 안내 명확화 (본인 전용 API, 타인 반려동물은 RPC `app_get_guardian_detail` 사용 안내). Issue 3: CODE #10 `!inner` JOIN → 별도 2회 조회 패턴 교정 (찜하지 않은 반려동물 404 방지) |
| 2026-04-18 | **Step 3 R3 본문 작성 완료** — GUIDE §11~13 (3개 장) + CODE §4,§6~8,§13 (10개 API) 완성. 대상: 유치원/보호자 RPC(#17~#20: 상세+목록, 거리순 정렬, internal VIEW, 주소 비대칭 정책), 예약 조회 RPC(#37~#38: 보호자/유치원 2개 분리, LATERAL JOIN 결제, refunds 분리), 정산 RPC(#41: 2개 PHP 통합, 4파트 구조, 날짜 검증), 리뷰 RPC(#44/#44b: 태그 집계 7개, is_guardian_only 분기), 교육 RPC(#61: topics+quiz+completion 통합, 기본값 자동) |
| 2026-04-18 | **Step 3 R3 리뷰 완료 (Issue 1~2 반영)** — 10개 API 전수 PASS. Issue 1: RPC #5 함수명 `app_get_reservations` → `app_get_reservations_guardian` 동기화 (RPC_PHP_MAPPING.md + MIGRATION_PLAN.md 전체 5개소). Issue 2: 리뷰 태그 수 교정 `6개 기본 태그` → `7개 긍정 태그` (RPC_PHP_MAPPING.md #9, #12) |
| 2026-04-18 | **Step 3 R4 본문 작성 완료** — GUIDE §14 (채팅 전환 10개 하위 섹션) + CODE §5 (#22, #23, #25 — 3개 API) 완성. 대상: 채팅방 생성 RPC(#22: SECURITY DEFINER, 중복 방지, 방 복원), 채팅방 목록 RPC(#23: 미읽음 서브쿼리, 상대방 프로필 JOIN), 메시지 전송 Edge Function(#25: Storage+Realtime+FCM 복합, Realtime postgres_changes 구독/해제, WebSocket 코드 전면 교체). 아키텍처 가이드(WebSocket↔Realtime 비교 다이어그램, useChat.ts 리팩터링 가이드, Storage chat-files 연동, 읽음 처리 미읽음 카운트, ChatRoomType/MessageType 변경 요약). CODE #28/#29 FK 교정(room_id → chat_room_id, sql/41_08 스키마 동기화) |
| 2026-04-18 | **Step 3 R4 리뷰 반영 (Issue 1~4)** — Issue 1: RPC_PHP_MAPPING.md 채팅 RPC 2개 추가·제목 13→15개 (R4 작성 시 선행 반영). Issue 2: DB_MAPPING_REFERENCE.md `chat_room_members.room_id` → `chat_room_id (FK)` 교정 (sql/41_08 동기화). Issue 3: §9-1에 `app_create_chat_room` SECURITY DEFINER 예외 사유 상세 추가 (chat_room_members INSERT RLS 부재·중복 방 검사 시 타 회원 행 SELECT 필요 → SECURITY DEFINER + auth.uid() 수동 검증). Issue 4: GUIDE §14-8 미읽음 카운트 SQL `cm.id >` → `cm.created_at >` 타임스탬프 서브쿼리 비교 교정 + UUID v4 경고 노트, Step 4 표에 채팅 RPC 2행(4-8 app_create_chat_room, 4-9 app_get_chat_rooms) ⬜ 예정 추가 |
| 2026-04-18 | **Step 3 R5 리뷰 반영 (Issue 1~2)** — Issue 1: GUIDE §15 헤더 관련 API 수량 `#34~#39 (6개)` → `#34~#36, #39 (4개)` 교정 + TOC §15 행 동기화 (#37~#38은 §12 참조 안내). Issue 2: GUIDE §15-5 complete-care 출력 필드 테이블 3→5행 확장 — `data.guardian_checkout_confirmed` (boolean), `data.kg_checkout_confirmed` (boolean) 추가, `data.status`/`error` 설명 보강 |
| 2026-04-18 | **Step 3 R5 본문 작성 완료** — GUIDE §15 결제/예약 전환 (15-1~15-7: 현재↔전환 후 결제 흐름 비교 다이어그램, #34 WebView P_RETURN_URL 변경, #35 inicis-callback 내부 흡수·앱 호출 삭제, #36 create-reservation EF 생성/업데이트 모드, #39 complete-care EF 양측 하원 확인, WebView 콜백 URL 상세, 테스트/상용 MID 전환) + §16 Edge Function 인터페이스 (16-1~16-8: 7개 EF 입출력 스펙·앱 호출/서버 전용 분류·공통 호출 패턴·에러 코드·pg_cron 설정). CODE §6 결제/돌봄 (#34, #35, #36, #39 — 4개 API Before/After + 응답 매핑) + §13 기타 (#66 변환 포인트). 총 4개 API 코드 완성, 1개 변환 포인트 완성, 7개 EF 인터페이스 확정 |
| 2026-04-18 | **Step 3 R6 본문 작성 완료 (Step 3 전체 완료)** — GUIDE 부록 A 타입 정의 변경 총정리 7종 (UserType·PetType·KindergartenType·ReservationType·ChatRoomType/ChatMessageType·SettlementSummaryResponse·GuardianReviewsResponse/KindergartenReviewsResponse) + 부록 B 환경변수/패키지 체크리스트 완성 (env 6개·패키지 4개·삭제 파일 3개·신규 파일 3개·전환 검증 15항목). CODE §9~12 (15개 API Before/After 코드 완성 — 즐겨찾기 #46~#49 UPSERT/UPDATE 패턴, 알림 #50~#52 FCM/notifications CRUD, 콘텐츠 #53~#57 공개 읽기+임베디드 JOIN, 차단 #58~#60 INSERT/DELETE 토글+maybeSingle). GUIDE §6 banners/notices 컬럼명 교정 (visible→visibility). **전체 66개 API 전환 코드 확정, 0개 TODO 잔존** |
| 2026-04-18 | **Step 3 R6 리뷰 반영** — #60 `get_blocked_list.php` 임베디드 JOIN → RPC `app_get_blocked_list` 전환 필수 확인 (`members` RLS `id=auth.uid()` 제약으로 타인 프로필 null 반환). Step 4 표에 4-10 행 추가 (SECURITY DEFINER + internal.members_public_profile VIEW, 난이도 하). RPC_PHP_MAPPING.md #15 행 추가 (15→16개). DB_MAPPING_REFERENCE.md member_blocks 컬럼 상세 추가. GUIDE/CODE Phase A/B API 수 교정 (44→43, 14→15) |
