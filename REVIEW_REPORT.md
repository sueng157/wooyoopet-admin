# APP_MIGRATION_GUIDE.md + APP_MIGRATION_CODE.md 전수 점검 결과

> **점검일**: 2026-04-18
> **점검 대상**: `APP_MIGRATION_GUIDE.md` (~2,804줄), `APP_MIGRATION_CODE.md` (~6,374줄)
> **교차 검증 원본**: `sql/41_*.sql` (DDL), `sql/44_*.sql` (RPC), `sql/10_test_data.sql` (실제 INSERT), `sql/43_01_app_rls_policies.sql` (RLS), `MIGRATION_PLAN.md` (Step 4 목록)
> **점검 방식**: 1차 순방향(API #1→#66) + 2차 횡단(패턴별 전수 비교)

---

## 점검 결과 요약

### 통계
- 총 점검 API: **67개** (66 API + #44b)
- 발견 이슈: **[치명] 3건**, **[중요] 2건**, **[경미] 3건**, **[제안] 4건**
- 수정 완료: **[치명] 3건 ✅**, **[중요] 2건 ✅** (I2는 오보로 판명되어 제거)

### 전체 평가

CODE.md는 67개 API 전체에 대해 **복사-붙여넣기 가능한** Before/After 코드를 제공하고 있으며, 추상적 안내("적절히 처리", "상황에 따라 분기" 등)나 `// TODO`, 빈 함수 body, 미완성 로직이 **전혀 없음**. import 패턴(`import { supabase } from '@/lib/supabase'`)이 64회 일관되게 사용되고, 에러 처리(try/catch + Alert.alert)도 전 코드에서 통일됨. 전반적으로 매우 높은 품질의 문서.

다만, 실제 DDL과 대조 시 **컬럼명 불일치 3건(치명)**이 발견되어 수정 필요.

---

## [치명] 이슈 목록

외주 개발자가 코드를 복붙했을 때 **런타임 에러** 또는 **데이터 무결성 문제** 발생.

| # | 위치 | 내용 | 수정 방향 |
|---|------|------|----------|
| C1 | CODE.md #62 (L5947~5996) | **`education_completions` 테이블에 `member_id`, `topic_id` 컬럼 미존재**. 실제 테이블은 유치원 단위 1행 구조(`kindergarten_id` + `topic_details` JSONB). | ✅ **수정 완료** (2026-04-18): After 코드를 Read-Modify-Write + UPSERT 패턴으로 전면 재작성. `topic_details` JSONB 배열에 주제 추가 → `completed_topics`/`progress_rate`/`completion_status` 재계산 → `upsert({ ... }, { onConflict: 'kindergarten_id' })`. GUIDE.md #62 설명도 동시 수정. |
| C2 | CODE.md #63 (L6016~6058) | **`banks` 테이블에 `is_active` 컬럼 미존재**. 실제 DDL 컬럼명은 **`use_yn`**(boolean). | ✅ **수정 완료** (2026-04-18): `.eq('is_active', true)` → `.eq('use_yn', true)` 교정. GUIDE.md #63 설명도 동시 수정. |
| C3 | CODE.md #43 (L4306~4327) | **`settlement_infos` UPSERT의 `onConflict: 'member_id'`가 실제 UNIQUE 제약과 불일치**. 실제 DB UNIQUE 제약은 `kindergarten_id`. | ✅ **수정 완료** (2026-04-18): `onConflict: 'member_id'` → `onConflict: 'kindergarten_id'` 교정. 변환 포인트 설명도 동시 수정. |

---

## [중요] 이슈 목록

코드는 동작하지만 **의도와 다른 결과**(잘못된 컬럼, 누락된 필터 등) 가능.

| # | 위치 | 내용 | 수정 방향 |
|---|------|------|----------|
| I1 | CODE.md #57 (L5540~5543) | **`term_versions` 임베디드 JOIN에서 `version` 컬럼 사용, 실제 컬럼명은 `version_number`**. `sql/10_test_data.sql`의 `INSERT INTO term_versions`에서 `version_number` 확인. `.select()` 내 `version` → `version_number`로 교정 필요. | ✅ **수정 완료** (2026-04-18): `version` → `version_number` 교정, 변환 포인트에 컬럼명 주의사항 추가 |
| ~~I2~~ | ~~CODE.md #57 (L5575)~~ | ~~`terms` 테이블의 `slug` 컬럼이 select에서 누락~~ | ❌ **오보 — 제거**: 실제 DDL/테스트 데이터 전수 검색 결과 `terms` 테이블에 `slug` 컬럼이 존재하지 않음. 오보로 판명되어 이슈 목록에서 제거 |
| I3 | CODE.md #42 (L4228~4241) | **`settlement_infos` 응답 매핑에서 `data.status` → `data.inicis_status` 등 키 변경 안내 부족**. `.select('*')` 사용 시 DB 컬럼명 그대로 반환되므로, 기존 앱 코드에서 `data.status`로 접근하던 부분을 `data.inicis_status`로 변경해야 하는데 이 사실이 변환 포인트에 명확히 안내되지 않았음. | ✅ **수정 완료** (2026-04-18): 변환 포인트에 Before/After 코드 예시 추가 (PHP 키 → Supabase DB 컬럼명 매핑), 응답 매핑 테이블에 `account_bank` 신규 추가 |

---

## [경미] 이슈 목록

동작에 영향 없지만 **일관성·가독성** 문제.

| # | 위치 | 내용 | 수정 방향 |
|---|------|------|----------|
| M1 | CODE.md #30 (L3030) | `chat_templates` `.select('id, content, sort_order, created_at')` — 실제 DDL 컬럼명은 `sort_order`로 **정확히 일치**함. 그러나 프롬프트의 테이블 스키마 목록에서는 `display_order`로 기재됨(프롬프트 오류). CODE.md가 DDL 기준으로 올바르게 `sort_order`를 사용 중이므로 코드 수정 불필요. 단, 문서 내 #53(banners)에서 `sort_order` → `display_order` 변경이라고 설명하는 부분(L5265)은 `banners` 테이블의 실제 컬럼이 `display_order`이므로 정확함 — 혼동 여지 참고. | 코드 변경 불필요. 프롬프트의 `chat_templates` 스키마 목록이 `display_order`로 기재된 것은 프롬프트 측 오류. |
| M2 | CODE.md #51 (L5079) | `notifications` SELECT에서 `.eq('member_id', ...)` 없이 RLS에 전적으로 의존. 변환 포인트(L5094)에서 "RLS가 `member_id = auth.uid()` 자동 필터 → `.eq('member_id', ...)` 불필요"라고 안내. 다른 대부분의 자동 API(#9, #15, #28, #29 등)에서는 **RLS + `.eq('member_id', user.id)` 이중 안전장치**를 사용하는데, #51만 `.eq()` 생략. 일관성 측면에서 통일하면 더 좋음. | 선호도 문제. `.eq('member_id', user.id)` 추가하면 일관성 향상. 단, 기능에 영향 없음 (RLS가 이미 처리). |
| M3 | CODE.md #53 (L5249) | `banners` SELECT에서 `.eq('visibility', '노출중')` 사용. 그런데 `banners`에는 `start_date`/`end_date` 컬럼도 있어서, `visibility='노출중'`이면서 현재 날짜가 범위 밖인 배너도 반환될 수 있음. 날짜 필터를 추가하면 더 정확하나, 이는 관리자가 `visibility`를 기간에 맞춰 관리한다는 전제 하에 불필요. | 변환 포인트에 "관리자가 기간 종료 시 visibility를 '종료'로 변경한다는 운영 전제" 주석 추가 권장. 또는 `.lte('start_date', 'now()').gte('end_date', 'now()')` 필터 추가. |

---

## [제안] 목록

개선하면 좋지만 현재 상태로도 문제없음.

| # | 위치 | 내용 | 개선 방향 |
|---|------|------|----------|
| S1 | CODE.md 부록 (L6283) | **Storage 업로드 공통 유틸** (`uploadImage`, `uploadImages`)이 부록에 잘 정리되어 있으나, #6, #7, #13, #14, #21, #45의 After 코드에서는 이 유틸을 사용하지 않고 각각 인라인으로 업로드 로직을 반복함. | 각 After 코드에 "이 업로드 로직은 부록의 `uploadImage` 유틸로 대체 가능" 주석을 추가하거나, After 코드 자체를 유틸 사용 버전으로 교체하면 중복이 줄어듬. |
| S2 | CODE.md 전반 | RPC 호출(#17~#20, #37~#38, #41, #44, #44b, #61)에서 `data?.success` 체크 후 `data.data.xxx` 형태로 접근하는 패턴이 일관적인데, RPC 응답의 래핑 구조(`{ success, data, error }`)에 대한 **TypeScript 제네릭 타입**이 문서에 없음. | GUIDE.md 또는 CODE.md 부록에 `interface RPCResponse<T> { success: boolean; data?: T; error?: string }` 공통 타입 정의를 추가하면 외주 개발자가 타입 안전하게 작업 가능. |
| S3 | CODE.md #3 (L266~290) | `convertBirthDate`와 `convertGender` 유틸리티 함수가 After 코드 블록 안에 인라인으로 정의됨. 변환 포인트(L358)에서 "별도 유틸 파일로 분리하거나 로컬 함수로 둘 수 있음"이라고 안내하지만, 외주 개발자는 어디에 두어야 할지 고민할 수 있음. | 부록에 `utils/convertMemberFields.ts` 전체 예시 파일을 추가하거나, #3 코드 블록에 명시적 파일 경로 주석 추가. |
| S4 | GUIDE.md + CODE.md 전반 | GUIDE.md §0-5에서 Phase A~D 전환 순서를 권장하지만, 각 Phase에 속하는 API 번호 목록이 산재됨. | GUIDE.md §0-5에 Phase별 API 번호 목록을 한눈에 보이는 표로 정리하면 외주 개발자의 작업 계획 수립에 도움. |

---

## 점검 1: 변환 코드 명확성 분석 결과

### 코드 완전성 (67개 API 전수 조사)

| 점검 항목 | 결과 |
|-----------|------|
| 모든 API에 Before/After 코드 존재 | **✅ 67/67** — 모든 API에 복사-붙여넣기 가능한 코드 블록 제공 |
| 추상적 안내만 있고 코드 누락 | **✅ 없음** — "이런 방식으로 작성하세요" 류 표현 0건 |
| `// TODO`, 빈 함수, 미완성 로직 | **✅ 없음** — grep 검색 0건 |
| 응답 매핑 테이블 존재 | **✅ 67/67** — 모든 API에 PHP→Supabase 필드 대응표 포함 |
| "적절히 처리", "상황에 따라" 등 모호 표현 | **✅ 없음** — grep 검색 0건 |

### API별 특이사항

- **#35 (`set_inicis_approval.php`)**: After 코드가 "함수 전체 삭제" 안내 + 주석 설명. 이는 해당 API가 `inicis-callback` EF에 흡수되어 앱 호출이 불필요해졌기 때문이며, 의도적으로 코드가 없는 것이 **정확**함.
- **#66 (`scheduler.php`)**: After 코드가 TypeScript가 아닌 SQL/bash 형태. 이는 스케줄러가 앱이 아닌 서버에서 실행되므로 **정확**함. 변환 포인트에 "앱 코드 변경 없음" 명시.
- **#8 (`kakao-address.php`)**: PHP 프록시 제거 + 앱에서 카카오 API 직접 호출. 보안 경고(API 키 노출) 상세 안내 포함.

---

## 점검 2: 코드 일관성 분석 결과

### 패턴별 횡단 비교

| 패턴 | 사용 횟수 | 일관성 | 비고 |
|------|----------|--------|------|
| **import 방식** `import { supabase } from '@/lib/supabase'` | 64회 | ✅ 완전 일관 | 다른 import 패턴 0건 |
| **에러 처리** `try/catch + Alert.alert('오류', ...)` | 67개 API 전체 | ✅ 완전 일관 | FCM 토큰(#50), 배너(#53)만 `console.warn` 사용 — 이는 UX 정책상 사용자에게 노출하지 않는 패턴으로 의도적 |
| **`.single()` 사용** (확정 1건 조회) | 15회 | ✅ 적절 | `members.upsert().select().single()`, `pets.select().single()`, `notices.select().single()` 등 |
| **`.maybeSingle()` 사용** (0~1건 조회) | 3회 | ✅ 적절 | `favorite_pets`(찜 여부), `settlement_infos`(미등록 가능), `member_blocks`(차단 여부) |
| **RPC 응답 체크** `data?.success` | 모든 RPC (15개) | ✅ 완전 일관 | `if (!data?.success)` 패턴 통일 |
| **EF 응답 체크** `data?.success` | 모든 EF (3개) | ✅ 완전 일관 | `supabase.functions.invoke` 후 동일 패턴 |
| **UPSERT `onConflict`** | 4회 | ✅ 전체 정확 | `settlement_infos`(C3 수정완료: `kindergarten_id`), `favorite_kindergartens`, `favorite_pets`, `fcm_tokens` |
| **RLS 보조 `.eq('member_id', user.id)`** | UPDATE/DELETE에서 | ✅ 대부분 일관 | M2(#51 notifications) 생략 — 경미 |
| **null/optional chaining** | 전반 | ✅ 일관 | `data?.name ?? ''`, `prev ? { ...prev, ... } : prev` 등 일관 사용 |
| **setState 패턴** | 전반 | ✅ 일관 | 목록: `setXxx(data)`, 삭제 후 필터: `setXxx(prev => prev.filter(...))`, 속성 갱신: `setXxx(prev => prev ? { ...prev, field: val } : prev)` |
| **query builder 체이닝** | 전반 | ✅ 일관 | 메서드별 줄바꿈, `.from()` → `.select()` → `.eq()` → `.order()` → `.range()` 순서 통일 |
| **RPC 파라미터** `p_` 접두사 | 모든 RPC | ✅ 완전 일관 | `p_kindergarten_id`, `p_member_id`, `p_page`, `p_per_page` 등 |

---

## 점검 3: DB 스키마 정합성 전수 조사

### 테이블명 검증 (총 27개 테이블/버킷 참조)

CODE.md `.from('테이블명')`에서 사용된 모든 테이블명을 실제 DB 테이블 목록(47개)과 대조:

| CODE.md 참조 | DB 존재 여부 | 비고 |
|-------------|-------------|------|
| `members` | ✅ | |
| `pets` | ✅ | |
| `pet_breeds` | ✅ | |
| `kindergartens` | ✅ | |
| `chat_messages` | ✅ | |
| `chat_rooms` | ✅ | |
| `chat_room_members` | ✅ | |
| `chat_templates` | ✅ | |
| `favorite_kindergartens` | ✅ | |
| `favorite_pets` | ✅ | |
| `member_blocks` | ✅ | |
| `settlement_infos` | ✅ | |
| `notifications` | ✅ | |
| `fcm_tokens` | ✅ | |
| `banners` | ✅ | |
| `notices` | ✅ | |
| `faqs` | ✅ | |
| `terms` | ✅ | |
| `guardian_reviews` | ✅ | |
| `kindergarten_reviews` | ✅ | |
| `education_completions` | ✅ | (컬럼 불일치 C1) |
| `banks` | ✅ | (컬럼 불일치 C2) |
| **Storage 버킷** | | |
| `member-images` | ✅ | 기존 profile-images에서 전환 (2026-05-08, sql/54_02~03) |
| `pet-images` | ✅ | |
| `kindergarten-images` | ✅ | |
| `chat-files` | ✅ | 코드에서는 미사용 (EF 내부 처리) |
| `review-images` | ✅ | |
| `address-docs` | ✅ | |

**결과**: 테이블명 전체 일치 (27/27). 존재하지 않는 테이블 참조 **0건**.

### 컬럼명 불일치 (치명/중요)

| 위치 | CODE.md 사용 | 실제 DDL | 심각도 |
|------|-------------|---------|--------|
| #62 `education_completions` | ~~`member_id`, `topic_id`~~ | `kindergarten_id`, `topic_details`(JSONB) 등 | **[치명] C1 ✅ 수정완료** |
| #63 `banks` | ~~`is_active`~~ | `use_yn` | **[치명] C2 ✅ 수정완료** |
| #43 `settlement_infos` UPSERT | ~~`onConflict: 'member_id'`~~ | UNIQUE on `kindergarten_id` | **[치명] C3 ✅ 수정완료** |
| #57 `term_versions` | ~~`version`~~ | `version_number` | **[중요] I1 ✅ 수정완료** |

### MariaDB 레거시 용어 잔존 검사

After 코드(실제 Supabase 호출 부분)에서 `mb_id`, `mb_no`, `wr_id`, `wr_subject`, `g5_*`, `partner`, `protector`, `animal`, `payment_request` 등 레거시 용어 검색 결과: **0건**. Before 코드 블록과 주석/설명/매핑 테이블에서만 참조용으로 사용되며, After 코드의 실제 Supabase 호출에는 레거시 용어가 완전히 제거됨.

### RPC 파라미터명 검증

| RPC 함수 | CODE.md 파라미터 | 실제 SQL 시그니처 | 일치 |
|----------|-----------------|------------------|------|
| `app_get_kindergarten_detail` | `p_kindergarten_id` | `p_kindergarten_id uuid` | ✅ |
| `app_get_kindergartens` | `p_latitude, p_longitude, p_limit` | `p_latitude double precision, p_longitude double precision, p_limit int` | ✅ |
| `app_get_guardian_detail` | `p_member_id` | `p_member_id uuid` | ✅ |
| `app_get_guardians` | `p_latitude, p_longitude, p_limit` | `p_latitude double precision, p_longitude double precision, p_limit int` | ✅ |
| `app_get_reservations_guardian` | `p_status, p_pet_id, p_page, p_per_page` | `p_status text, p_pet_id uuid, p_page int, p_per_page int` | ✅ |
| `app_get_reservations_kindergarten` | `p_status, p_pet_id, p_page, p_per_page` | `p_status text, p_pet_id uuid, p_page int, p_per_page int` | ✅ |
| `app_get_reservation_detail` | `p_reservation_id` | `p_reservation_id uuid` | ✅ |
| `app_withdraw_member` | `p_reason` | `p_reason text` | ✅ |
| `app_set_representative_pet` | `p_pet_id` | `p_pet_id uuid` | ✅ |
| `app_get_guardian_reviews` | `p_kindergarten_id, p_page, p_per_page` | `p_kindergarten_id uuid, p_page int, p_per_page int` | ✅ |
| `app_get_settlement_summary` | `p_start_date, p_end_date, p_page, p_per_page` | `p_start_date text, p_end_date text, p_page int, p_per_page int` | ✅ |
| `app_get_education_with_progress` | `p_kindergarten_id` | `p_kindergarten_id uuid` | ✅ |
| `app_get_kindergarten_reviews` | `p_pet_id, p_page, p_per_page` | `p_pet_id uuid, p_page int, p_per_page int` | ✅ |

**결과**: 구현 완료 13개 RPC 파라미터 전체 일치 (13/13).

---

## 점검 4: Step 4 함수 추적 결과

### CODE.md에서 호출하는 모든 RPC/EF 함수 vs 구현 상태

| 함수명 | 호출 유형 | CODE.md 호출 위치 | 구현 상태 | Step 4 등록 |
|--------|----------|------------------|----------|------------|
| `app_get_kindergarten_detail` | RPC | #17 | ✅ SQL 존재 (44_01) | — |
| `app_get_kindergartens` | RPC | #18 | ✅ SQL 존재 (44_02) | — |
| `app_get_guardian_detail` | RPC | #19 | ✅ SQL 존재 (44_03) | — |
| `app_get_guardians` | RPC | #20 | ✅ SQL 존재 (44_04) | — |
| `app_get_reservations_guardian` | RPC | #37 | ✅ SQL 존재 (44_05) | — |
| `app_get_reservations_kindergarten` | RPC | #37 | ✅ SQL 존재 (44_05b) | — |
| `app_get_reservation_detail` | RPC | #38 | ✅ SQL 존재 (44_06) | — |
| `app_withdraw_member` | RPC | #4 | ✅ SQL 존재 (44_07) | — |
| `app_set_representative_pet` | RPC | #16 | ✅ SQL 존재 (44_08) | — |
| `app_get_guardian_reviews` | RPC | #44 | ✅ SQL 존재 (44_09) | — |
| `app_get_settlement_summary` | RPC | #41 | ✅ SQL 존재 (44_10) | — |
| `app_get_education_with_progress` | RPC | #61 | ✅ SQL 존재 (44_11) | — |
| `app_get_kindergarten_reviews` | RPC | #44b | ✅ SQL 존재 (44_12) | — |
| `app_create_chat_room` | RPC | #22 | ⬜ 미구현 | ✅ 4-8 |
| `app_get_chat_rooms` | RPC | #23 | ⬜ 미구현 | ✅ 4-9 |
| `app_get_blocked_list` | RPC | #60 | ⬜ 미구현 | ✅ 4-10 |
| `send-chat-message` | EF | #25 | ⬜ 미구현 | ✅ 4-2 |
| `create-reservation` | EF | #36 | ⬜ 미구현 | ✅ 4-3 |
| `complete-care` | EF | #39 | ⬜ 미구현 | ✅ 4-4 |
| `inicis-callback` | EF | #34 (WebView URL) | ⬜ 미구현 | ✅ 4-1 |
| `send-alimtalk` | EF | #1 (Auth hook) | ⬜ 미구현 | ✅ 4-5 |
| `send-push` | EF | — (EF 내부 호출) | ⬜ 미구현 | ✅ 4-6 |
| `scheduler` | EF | #66 (cron) | ⬜ 미구현 | ✅ 4-7 |

### 유령 함수 검사

- CODE.md에서 호출하지만 어디에도 기록되지 않은 함수: **0건**
- Step 4 목록(10개)에 있지만 문서에서 전혀 언급되지 않는 항목: **0건**

### 완전성 판정

| 검증 항목 | 결과 |
|----------|------|
| CODE.md 호출 함수 ⊆ (구현 완료 13개 ∪ Step 4 예정 10개) | **✅ 완전 포함** |
| GUIDE.md 언급 RPC/EF ⊆ (구현 완료 ∪ Step 4) | **✅ 완전 포함** |
| Step 4 예정 10개 모두 문서에서 참조 | **✅ 전체 10/10 매칭** |
| 유령 함수 (미등록 함수) | **✅ 0건** |

---

## 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-04-18 | 초판 작성 — 4대 점검 완료, [치명] 3건 / [중요] 3건 / [경미] 3건 / [제안] 4건 |
| 2026-04-18 | **이슈 수정 적용** — C1(#62 education_completions UPSERT 전면 재작성), C2(#63 banks `use_yn` 교정), C3(#43 settlement_infos `onConflict` 교정), I1(#57 term_versions `version_number` 교정), I3(#42 응답 매핑 복붙가능 코드 추가). I2(오보) 제거. 이슈 재집계: [치명] 3건✅ / [중요] 2건✅ / [경미] 3건 / [제안] 4건 |
