# R3 라운드 리뷰 보고서

> **리뷰 대상**: `APP_MIGRATION_GUIDE.md` §11~§13, `APP_MIGRATION_CODE.md` §4·§6~§8·§13
> **리뷰 수행일**: 2026-04-18
> **리뷰어**: AI Reviewer (검토 전용, 직접 수정 없음)
> **기준 커밋**: `7eea34e` — `feat(docs): R3 본문 작성 — RPC 조회 10개 API (GUIDE §11~13 + CODE §4,§6~§8,§13)`
> **대조 문서**: `MIGRATION_PLAN.md`, `RPC_PHP_MAPPING.md`, `DB_MAPPING_REFERENCE.md`, `sql/44_01~44_12`

---

## 리뷰 요약

| 항목 | 결과 |
|------|------|
| **R3 범위 일치** | ✅ PASS — 10개 API (#17~#20, #37~#38, #41, #44, #44b, #61) 모두 작성 완료 |
| **§0 문서 규칙 준수** | ✅ PASS — 용어 매핑, 코드 표기, Before/After 형식, 응답 매핑 테이블 모두 준수 |
| **SQL 함수 시그니처 일치** | ✅ PASS — 10개 RPC 파라미터·반환 타입이 sql/44_01~44_12와 정확 일치 |
| **GUIDE↔CODE 교차참조** | ✅ PASS — 10개 API 모두 `📝 코드 예시: APP_MIGRATION_CODE.md #N 참조` 형태로 링크 |
| **TODO 잔여** | ✅ PASS — R3 대상 섹션에 TODO 0건 (전부 해소) |
| **크로스 문서 일관성** | ⚠️ 2건 발견 (아래 Issue 참조) |

**종합 판정**: ✅ **R3 본문 PASS** — 아래 2건의 Issue는 R3 대상 문서(GUIDE/CODE) 외부의 기존 문서(RPC_PHP_MAPPING.md, MIGRATION_PLAN.md)에서 발생한 것으로, R3 본문 자체는 정확합니다. 다음 라운드(R4) 시작 전에 외부 문서를 동기화하면 됩니다.

---

## 1. §0 문서 규칙 준수 검증

### §0-1 용어 매핑표 준수

| 규칙 | 검증 결과 |
|------|----------|
| `mb_id` → `auth.uid()` | ✅ R3 전체에서 `mb_id` 파라미터 완전 제거, `auth.uid()` 자동 추출로 전환 |
| `apiClient.post/get` → `supabase.rpc()` | ✅ RPC 대상 10개 API 모두 `supabase.rpc('app_*')` 패턴 사용 |
| `partner` → `kindergarten` | ✅ 코드·설명·응답 키 모두 `kindergarten` 사용 (예: `data.data.kindergarten`) |
| `protector` → `guardian` | ✅ 코드·설명·응답 키 모두 `guardian` 사용 (예: `data.data.guardian`, `fetchGuardian`) |
| `payment_request` → `reservation` | ✅ 예약 관련 모두 `reservation` 사용 (예: `setReservation()`, `data.data.reservations`) |
| `wr_*` → 의미 있는 컬럼명 | ✅ `wr_id→id(UUID)`, `wr_subject→name`, `wr_content→description`, `wr_2→prices.*` |

### §0-2 코드 표기 규칙 준수

| 규칙 | 검증 결과 |
|------|----------|
| import `@/lib/supabase` | ✅ 10개 API After 블록 모두 `import { supabase } from '@/lib/supabase'` |
| `try/catch` + `Alert.alert()` | ✅ 에러 처리 패턴 일관 적용 |
| optional chaining `?.` | ✅ `data?.success`, `data.data.resident_pets ?? []` 등 일관 사용 |
| 파일 경로 주석 | ✅ Before/After 모두 `// 파일: hooks/useXxx.ts` 형태 주석 포함 |

### §0-3 코드 블록 표기 형식 준수

| 항목 | 검증 결과 |
|------|----------|
| Before/After 구조 | ✅ 10개 API 모두 Before → After → 변환 포인트 → 응답 매핑 순서 |
| 응답 매핑 테이블 | ✅ 10개 API 모두 PHP↔Supabase 필드 매핑 테이블 포함 |
| API 헤더 형식 | ✅ `### API #N. {PHP파일} → {Supabase 대응}` + 전환 방식/난이도/관련 파일/대응 |

### §0-7 번호 체계 준수

| 검증 항목 | 결과 |
|----------|------|
| GUIDE API 번호 = MIGRATION_PLAN §5 번호 | ✅ #17~#20, #37~#38, #41, #44, #44b, #61 모두 일치 |
| CODE API 번호 = GUIDE 번호 | ✅ CODE 헤더의 `### API #N`이 GUIDE의 `> 📝 코드 예시: #N 참조`와 1:1 대응 |

### §0-8 문서 역할 분담 준수

| 규칙 | 검증 결과 |
|------|----------|
| GUIDE = 이해용 (코드 중복 없음) | ✅ GUIDE §11~13에 코드 블록 0개, 모두 `CODE.md #N 참조`로 위임 |
| CODE = 복붙용 (Before/After 전문) | ✅ CODE §4·§6~§8·§13에 10개 API Before/After 코드 전문 포함 |

---

## 2. SQL 함수 시그니처 ↔ 문서 대조

### 파라미터 대조 (10개 RPC)

| # | SQL 파라미터 | GUIDE/CODE 파라미터 | 일치 |
|---|-----------|-------------------|------|
| #17 | `p_kindergarten_id uuid` | `p_kindergarten_id: kindergartenId` | ✅ |
| #18 | `p_latitude double precision DEFAULT NULL, p_longitude double precision DEFAULT NULL, p_limit int DEFAULT 100` | `p_latitude: latitude ?? null, p_longitude: longitude ?? null, p_limit: limit` | ✅ |
| #19 | `p_member_id uuid` | `p_member_id: memberId` | ✅ |
| #20 | `p_latitude double precision DEFAULT NULL, p_longitude double precision DEFAULT NULL, p_limit int DEFAULT 100` | `p_latitude: latitude ?? null, p_longitude: longitude ?? null, p_limit: limit` | ✅ |
| #37 guardian | `p_status text DEFAULT NULL, p_pet_id uuid DEFAULT NULL, p_page int DEFAULT 1, p_per_page int DEFAULT 20` | `p_status: status ?? null, p_pet_id: petId ?? null, p_page: page, p_per_page: perPage` | ✅ |
| #37 kg | `p_status text DEFAULT NULL, p_pet_id uuid DEFAULT NULL, p_page int DEFAULT 1, p_per_page int DEFAULT 20` | (동일 파라미터, RPC 이름만 분기) | ✅ |
| #38 | `p_reservation_id uuid` | `p_reservation_id: reservationId` | ✅ |
| #41 | `p_start_date text DEFAULT NULL, p_end_date text DEFAULT NULL, p_page int DEFAULT 1, p_per_page int DEFAULT 20` | `p_start_date: startDate ?? null, p_end_date: endDate ?? null, p_page: page, p_per_page: perPage` | ✅ |
| #44 | `p_kindergarten_id uuid, p_page int DEFAULT 1, p_per_page int DEFAULT 20` | `p_kindergarten_id: kindergartenId, p_page: page, p_per_page: perPage` | ✅ |
| #44b | `p_pet_id uuid, p_page int DEFAULT 1, p_per_page int DEFAULT 20` | `p_pet_id: petId, p_page: page, p_per_page: perPage` | ✅ |
| #61 | `p_kindergarten_id uuid` | `p_kindergarten_id: kindergartenId` | ✅ |

### 응답 구조 대조 (핵심 키)

| # | SQL 반환 키 | CODE 주석/사용 | 일치 |
|---|----------|-------------|------|
| #17 | `kindergarten, operator, resident_pets, review_count, inicis_status, is_favorite` | `data.data.kindergarten`, `data.data.operator`, `data.data.resident_pets`, `data.data.review_count`, `data.data.is_favorite`, `data.data.inicis_status` | ✅ |
| #18 | `total_count, kindergartens[]` | `data.data.total_count`, `data.data.kindergartens` | ✅ |
| #19 | `guardian, pets[]` | `data.data.guardian`, `data.data.pets` | ✅ |
| #20 | `total_count, guardians[]` | `data.data.total_count`, `data.data.guardians` | ✅ |
| #37 | `reservations[], meta` | `data.data.reservations`, `data.data.meta` | ✅ |
| #38 | `reservation, pet, kindergarten, member, payment, refund` | `data.data.reservation`, `data.data.pet`, `data.data.kindergarten`, `data.data.member`, `data.data.payment`, `data.data.refund` | ✅ |
| #41 | `summary, next_settlement, period_summary, details[], meta` | `data.data.summary`, `data.data.next_settlement`, `data.data.period_summary`, `data.data.details`, `data.data.meta` | ✅ |
| #44 | `tags[], reviews[], meta` | `data.data.tags`, `data.data.reviews`, `data.data.meta` | ✅ |
| #44b | `tags[], reviews[], meta` | `data.data.tags`, `data.data.reviews`, `data.data.meta` | ✅ |
| #61 | `completion, topics[]` | `data.data.completion`, `data.data.topics` | ✅ |

### `{success, data}` 래퍼 패턴 검증

모든 10개 RPC의 After 코드에서 아래 패턴을 준수합니다:

```typescript
if (!data?.success) {
  Alert.alert('오류', data?.error ?? '...')
  return null
}
// data.data.xxx 사용
```

✅ 10/10 일치 — `data.success` 체크 후 `data.data` 접근 패턴 일관.

---

## 3. 비대칭 설계 검증

### 보호자 ↔ 유치원 비대칭

| 검증 항목 | GUIDE 설명 | CODE 반영 | 결과 |
|----------|----------|---------|------|
| #17 유치원 상세: prices, inicis_status, review_count 포함 | §11-2 ✅ | CODE #17 After: `setReviewCount`, `setInicisStatus` ✅ | ✅ |
| #19 보호자 상세: prices/inicis_status/review_count 제외 | §11-4 ✅ | CODE #19 After: `setGuardian`, `setPets`만 ✅ | ✅ |
| #17 유치원 찜: 유치원 단위 `is_favorite` | §11-2 ✅ | CODE #17: `setIsFavorite(data.data.is_favorite)` ✅ | ✅ |
| #19 보호자 찜: 반려동물 단위 `pets[].is_favorite` | §11-4 ✅ | CODE #19: `pets[].is_favorite` (응답 매핑 테이블) ✅ | ✅ |
| #20 보호자 목록: `distance_km` 반환 안 함 | §11-5 ✅ | CODE #20: 변환 포인트에 "정렬 전용, 반환하지 않음" 명시 ✅ | ✅ |
| #18 유치원 목록: `distance_km` 반환 | §11-3 ✅ | CODE #18: 응답 매핑 `distance_km (신규)` ✅ | ✅ |

### 예약 보호자/유치원 분리

| 검증 항목 | GUIDE §12 | CODE #37 | 결과 |
|----------|----------|---------|------|
| 보호자 RPC: `app_get_reservations_guardian` | §12-2 ✅ | `rpcName = 'app_get_reservations_guardian'` ✅ | ✅ |
| 유치원 RPC: `app_get_reservations_kindergarten` | §12-2 ✅ | `rpcName = 'app_get_reservations_kindergarten'` ✅ | ✅ |
| 보호자 응답: `kindergarten` 키 | §12-2 ✅ | 주석 `reservations[].kindergarten: { id, name, ... }` ✅ | ✅ |
| 유치원 응답: `member` 키 | §12-2 ✅ | 주석 `reservations[].member: { id, nickname, ... }` ✅ | ✅ |

### 리뷰 is_guardian_only 분기

| 검증 항목 | GUIDE §13-3 | CODE #44b | 결과 |
|----------|----------|---------|------|
| 보호자(pet 주인): 전체 후기 | ✅ | After 주석 "보호자는 전체 후기 표시" ✅ | ✅ |
| 그 외: `is_guardian_only=false`만 | ✅ | After 주석 "그 외 사용자: is_guardian_only=false 후기만" ✅ | ✅ |
| 태그 집계 정책: guardian_only 포함 | ✅ | 변환 포인트 "태그 카운트에 포함" ✅ | ✅ |

### 주소 노출 비대칭

| 대상 | 노출 범위 | GUIDE 확인 | CODE 확인 |
|------|---------|----------|---------|
| 유치원 (#17) | `address_road` + `address_complex` + `address_building_dong` (호수 제외) | §11-2 "호수 비공개" ✅ | #17 응답 매핑 "`partner_ho` → 제외" ✅ |
| 보호자 (#19) | `address_complex` + `address_building_dong`만 (`address_road` 제외) | §11-4 "`address_road` 제외" ✅ | #19 변환 포인트 "주소: `address_road` 비공개" ✅ |
| 정산 details (#41) | 보호자 `address_complex`만 | §13-1 "주소 비대칭 정책" ✅ | #41 변환 포인트 "비대칭 정책: `address_complex`만" ✅ |

---

## 4. 발견된 Issue

### Issue 1: `RPC_PHP_MAPPING.md` — RPC #5 함수명 불일치 (외부 문서)

**위치**: `RPC_PHP_MAPPING.md` 26행, 41행
**현상**: RPC #5를 `app_get_reservations`로 표기하고 있으나, 실제 SQL 함수명은 `app_get_reservations_guardian`

| 문서 | 표기 | 정확성 |
|------|------|--------|
| **sql/44_05** (구현) | `app_get_reservations_guardian` | ✅ 정본 |
| **APP_MIGRATION_GUIDE.md** §12 | `app_get_reservations_guardian` | ✅ 정확 |
| **APP_MIGRATION_CODE.md** #37 | `app_get_reservations_guardian` | ✅ 정확 |
| **MIGRATION_PLAN.md** Step 2.5 | `app_get_reservations` | ❌ 오래된 이름 |
| **RPC_PHP_MAPPING.md** #5 | `app_get_reservations` | ❌ 오래된 이름 |

**원인 추정**: RPC #5가 처음 설계될 때는 `app_get_reservations`(보호자 전용)였으나, 이후 `app_get_reservations_kindergarten`(#5b) 분리 시 보호자용에 `_guardian` 접미사가 추가됨. MIGRATION_PLAN.md와 RPC_PHP_MAPPING.md는 이 변경을 반영하지 못함.

**영향도**: 낮음 (R3 대상 문서인 GUIDE/CODE는 정확하며, 외주개발자가 실제 참조하는 코드 예시도 정확)

**권장 조치**: R4 시작 전 `RPC_PHP_MAPPING.md` 26행·41행과 `MIGRATION_PLAN.md` 155~156행·165행·185행·610행을 `app_get_reservations_guardian`으로 수정

### Issue 2: `RPC_PHP_MAPPING.md` — 태그 수 불일치 (외부 문서)

**위치**: `RPC_PHP_MAPPING.md` 31행 (#9), 34행 (#12)
**현상**: "6개 기본 태그"로 표기하고 있으나, 실제 SQL·GUIDE·CODE 모두 **7개** 태그

| 문서 | 태그 수 | 정확성 |
|------|--------|--------|
| **sql/44_09** (base_tags CTE) | 7개 (`ord 1~7`) | ✅ 정본 |
| **sql/44_12** (base_tags CTE) | 7개 (`ord 1~7`) | ✅ 정본 |
| **APP_MIGRATION_GUIDE.md** §13-2 | 7개 (목록 명시) | ✅ 정확 |
| **APP_MIGRATION_CODE.md** #44 | "태그 집계 7개" | ✅ 정확 |
| **MIGRATION_PLAN.md** | "태그 집계(7 positive)" | ✅ 정확 |
| **RPC_PHP_MAPPING.md** #9, #12 | "6개 기본 태그" | ❌ |

**원인 추정**: 초기 설계 시 6개였으나, 구현 과정에서 "다음에도 맡기고 싶어요" (7번째) 태그가 추가됨. RPC_PHP_MAPPING.md에 이 변경이 미반영됨.

**영향도**: 낮음 (GUIDE/CODE는 정확, RPC_PHP_MAPPING은 외주개발자용 참조 보조 문서)

**권장 조치**: R4 시작 전 `RPC_PHP_MAPPING.md` 31행·34행의 "6개 기본 태그"를 "7개 긍정 태그"로 수정

---

## 5. R3 범위 완성도 검증

### MIGRATION_PLAN.md 라운드 계획 대조

| 계획 | 실제 |
|------|------|
| R3 대상: Phase B RPC 조회 | ✅ 전체 Phase B 대상 API 작성 |
| GUIDE §11~§13 | ✅ 3개 장 모두 작성 (§11: 4 API, §12: 2 API, §13: 4 API) |
| CODE §4,§6~§8,§13 | ✅ 5개 섹션 모두 작성 |
| TODO ~14개 해소 | ✅ R3 대상 섹션 내 TODO 0건 (전부 실제 내용으로 교체) |

### API 커버리지 (10개)

| API # | PHP 원본 | RPC 함수 | GUIDE 위치 | CODE 위치 | 완성 |
|-------|---------|---------|----------|---------|------|
| #17 | get_partner.php | app_get_kindergarten_detail | §11-2 | §4 #17 | ✅ |
| #18 | get_partner_list.php | app_get_kindergartens | §11-3 | §4 #18 | ✅ |
| #19 | get_protector.php | app_get_guardian_detail | §11-4 | §4 #19 | ✅ |
| #20 | get_protector_list.php | app_get_guardians | §11-5 | §4 #20 | ✅ |
| #37 | get_payment_request.php | app_get_reservations_guardian / _kindergarten | §12-2 | §6 #37 | ✅ |
| #38 | get_payment_request_by_id.php | app_get_reservation_detail | §12-3 | §6 #38 | ✅ |
| #41 | get_settlement.php + get_settlement_list.php | app_get_settlement_summary | §13-1 | §7 #41 | ✅ |
| #44 | get_review.php (type=pet) | app_get_guardian_reviews | §13-2 | §8 #44 | ✅ |
| #44b | get_review.php (type=partner) | app_get_kindergarten_reviews | §13-3 | §8 #44b | ✅ |
| #61 | get_education.php | app_get_education_with_progress | §13-4 | §13 #61 | ✅ |

---

## 6. 품질 관찰 (칭찬 사항)

1. **보안 원칙 일관성**: 전 10개 API에서 `mb_id` 파라미터 완전 제거 → `auth.uid()` 전환. 보안 설명이 GUIDE에서 명확하고 CODE에서 주석으로 보강됨.

2. **비대칭 설계 명시화**: 유치원/보호자 간 응답 구조 차이(주소 노출, 찜 단위, 가격 포함 여부)가 GUIDE에서 비교 형식으로 깔끔하게 정리되어 있음. 외주개발자가 혼동할 여지가 적음.

3. **정산 2→1 통합**: #41에서 2개 PHP를 1개 RPC로 통합한 설계를 GUIDE가 4-파트 구조로 체계적으로 설명. CODE의 After 주석도 각 파트별 용도와 기간 필터 적용 여부를 명확히 기재.

4. **is_guardian_only 분기 설명**: GUIDE §13-3에서 "비공개는 '내용'이지 '통계'가 아님"이라는 태그 집계 정책 근거를 명시한 것이 좋음. 설계 의도가 투명하게 전달됨.

5. **응답 매핑 테이블 빠짐없음**: 10개 API 모두 PHP↔Supabase 필드 대응표를 포함. 신규 필드(`operator`, `distance_km`, `refund`, `completion` 등)도 "(신규)" 마킹으로 명확히 구분.

6. **변경 이력 정확**: GUIDE와 CODE 양쪽 변경 이력에 R3 내용이 정확하게 기록됨 (날짜, 대상 섹션, API 수, 핵심 포인트).

---

## 7. 결론

R3 라운드의 `APP_MIGRATION_GUIDE.md` §11~§13과 `APP_MIGRATION_CODE.md` §4·§6~§8·§13은 **설계 의도, SQL 구현, 문서 규칙 모두와 정확히 부합**합니다.

발견된 2건의 Issue는 모두 R3 대상 문서 **외부**(RPC_PHP_MAPPING.md, MIGRATION_PLAN.md)의 기존 표기가 최신 구현과 동기화되지 않은 문제이며, R3 본문 자체에는 오류가 없습니다.

**다음 단계 권장**:
1. Issue 1·2를 `RPC_PHP_MAPPING.md` + `MIGRATION_PLAN.md`에 반영 (R4 시작 전)
2. R4 라운드(채팅 Realtime — GUIDE §14 + CODE §5) 진행
