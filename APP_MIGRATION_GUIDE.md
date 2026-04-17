# 우유펫 모바일 앱 API 전환 가이드

> **작성일**: 2026-04-17
> **최종 업데이트**: 2026-04-17 (R2 리뷰 반영 — Issue 1~3 수정)
> **대상 독자**: 외주 개발자 (React Native/Expo 앱 코드 수정 담당)
> **전제 조건**: Supabase 프로젝트 설정 완료, Step 2.5 RPC 13개 배포 완료
> **관련 문서**: `MIGRATION_PLAN.md` (설계서), `APP_MIGRATION_CODE.md` (코드 예시), `RPC_PHP_MAPPING.md` (RPC 매핑), `DB_MAPPING_REFERENCE.md` (테이블 대조표)

---

## 0. 문서 규칙 및 표기법

> 이 섹션은 본 문서(`APP_MIGRATION_GUIDE.md`)와 코드 예시 문서(`APP_MIGRATION_CODE.md`) 전체에 적용되는 규칙입니다.
> 문서 작성자뿐 아니라 코드를 수정하는 개발자도 반드시 숙지해야 합니다.

### 0-1. 용어 매핑표

기존 PHP/MariaDB 코드에서 사용하던 용어를 Supabase 전환 후의 용어로 통일합니다.

| 기존 용어 (PHP/MariaDB) | 전환 후 용어 (Supabase) | 설명 |
|------------------------|----------------------|------|
| `mb_id` (폰번호 문자열) | `auth.uid()` (UUID) | 사용자 식별자. Supabase Auth JWT에서 자동 추출 |
| `mb_no` (정수 PK) | `members.id` (UUID) | 회원 테이블 PK |
| `apiClient.post()` / `apiClient.get()` | `supabase.from().select()` / `.insert()` / `.update()` / `.delete()` | 자동 API 호출 |
| `apiClient.post('api/xxx.php')` (RPC 대상) | `supabase.rpc('app_함수명', { params })` | RPC 호출 |
| `apiClient.post('api/xxx.php')` (EF 대상) | `supabase.functions.invoke('함수명', { body })` | Edge Function 호출 |
| `FormData` | JSON `body` 또는 Supabase query builder | 요청 형식 |
| `partner` (PHP 변수명) | `kindergarten` | 유치원 (돌봄 파트너) |
| `protector` (PHP 변수명) | `guardian` | 보호자 (반려동물 주인) |
| `payment_request` (PHP 테이블) | `reservation` / `reservations` | 돌봄 예약 |
| `inicis_payments` (PHP 테이블) | `payments` | 결제 |
| `settlement_info` (PHP 테이블) | `settlement_infos` | 정산 계좌 정보 |
| `g5_write_partner` (MariaDB) | `kindergartens` | 유치원 테이블 |
| `g5_write_animal` (MariaDB) | `pets` | 반려동물 테이블 |
| `g5_member` (MariaDB) | `members` | 회원 테이블 |
| `wr_id` (MariaDB PK) | `id` (UUID) | 각 테이블 PK |
| `wr_subject`, `wr_content` 등 | 의미 있는 컬럼명 (`name`, `description` 등) | 컬럼명 정규화 |
| `WebSocket (wss://...)` | Supabase Realtime | 실시간 통신 |
| `PHP callback (inicis_payment.php)` | Edge Function (`inicis-callback`) | PG 결제 콜백 |

### 0-2. 코드 표기 규칙

| 항목 | 규칙 | 예시 |
|------|------|------|
| **import 경로** | `@/` 별칭 사용 (tsconfig paths) | `import { supabase } from '@/lib/supabase'` |
| **Supabase 클라이언트 위치** | `lib/supabase.ts` (신규 생성) | — |
| **타입 정의 위치** | `types/` 디렉토리 (기존 구조 유지) | `types/petType.ts` |
| **hook 파일 위치** | `hooks/` 디렉토리 (기존 구조 유지) | `hooks/usePetList.ts` |
| **유틸리티 위치** | `utils/` 디렉토리 (기존 구조 유지) | `utils/fetchPartnerList.ts` |
| **상태 관리** | Jotai atom + MMKV 유지 | `states/userAtom.ts` |
| **타입 선언** | `interface` 사용 (기존 앱 코드 관례) | `interface PetType { ... }` |
| **에러 처리** | `try/catch` + `Alert.alert()` (기존 패턴 유지) | — |
| **환경 변수 접두사** | `EXPO_PUBLIC_` (Expo 규칙) | `EXPO_PUBLIC_SUPABASE_URL` |
| **null/undefined 처리** | optional chaining (`?.`) + nullish coalescing (`??`) | `data?.name ?? ''` |
| **함수 선언** | hook 내부: `const fn = useCallback(async () => { ... }, [deps])` | 기존 패턴 유지 |
| **날짜 처리** | `Date` 객체 또는 기존 `handleDate.ts` 유틸리티 | `calculateAge(birthDay)` |
| **Supabase 쿼리 체이닝** | 한 줄이 길어지면 메서드별 줄바꿈 | `.from('pets')` → `.select('*')` → `.eq('member_id', userId)` |
| **단건 조회** | 결과가 1건인 경우 반드시 `.single()` 사용 | 배열 대신 객체로 반환. 빠뜨리면 앱 크래시 |

### 0-3. 코드 블록 표기 형식

문서 전체에서 코드 비교는 아래 형식을 따릅니다.

**모든 API에 응답 매핑 테이블을 작성한다.** 외주 개발자가 Supabase에 익숙하지 않으므로, 복사-붙여넣기만으로 작업할 수 있도록 모든 API의 응답 필드 대응표를 빠짐없이 제공한다.

각 API 섹션의 구조:

---

#### API #N. {PHP 파일명} → {Supabase 대응}

**전환 방식**: 자동 API / RPC / Edge Function / Supabase Auth / 앱 직접 호출
**난이도**: 쉬움 / 중 / 상
**관련 파일**: `hooks/useXxx.ts`, `app/xxx/index.tsx`
**Supabase 테이블**: `table_name`

**Before** (현재 PHP API 호출):

```typescript
// 파일: utils/apiClient.ts 또는 hooks/useXxx.ts
const response = await apiClient.post('api/xxx.php', { ... });
```

**After** (Supabase 전환 후):

```typescript
// 파일: hooks/useXxx.ts (수정) 또는 lib/supabase.ts (신규)
const { data, error } = await supabase.from('table').select('*');
```

**변환 포인트**:
- 포인트 1
- 포인트 2

**응답 매핑**:

| PHP 응답 필드 | Supabase 응답 필드 | 변환 필요 |
|---|---|---|
| `result.field` | `data.column` | 예/아니오 |

---

### 0-4. Supabase 클라이언트 초기화 (공통)

전환 후 앱 전체에서 사용할 Supabase 클라이언트 설정입니다.

```typescript
// 파일: lib/supabase.ts (신규 생성)
import 'react-native-url-polyfill/auto'
import { createClient } from '@supabase/supabase-js'
import { storage } from '@/storage/storage'  // 기존 MMKV storage 인스턴스

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!

// MMKV → Supabase Auth storage 어댑터
// Supabase Auth는 웹 표준(localStorage) 인터페이스를 요구하지만,
// MMKV는 getString/set/delete 메서드를 사용하므로 이름을 변환해준다.
const mmkvStorageAdapter = {
  getItem: (key: string) => storage.getString(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: mmkvStorageAdapter,  // MMKV 어댑터 사용
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,    // React Native에서는 false
  },
})
```

```
// .env 변경 사항
// 삭제:
EXPO_PUBLIC_API_URL=https://woo1020.iwinv.net
EXPO_PUBLIC_WEBSOCKET_URL=wss://wooyoopet.store/ws

// 추가:
EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
```

### 0-5. 전환 순서 권장 사항

```
Phase A: 인증 + 단순 CRUD (가장 먼저, 영향도 낮음)
  → 1장 인증 + 3장~10장 자동 API (44개)
  → apiClient.ts 와 supabase.ts 공존 가능 (점진적 전환)
  → ※ #4 set_member_leave.php는 RPC(app_withdraw_member)이지만
       인증 흐름과 밀접하므로 Phase A에서 함께 전환 권장

Phase B: RPC 조회 (Step 2.5 함수 사용)
  → 11장 유치원/보호자 + 12장 예약 조회 + 13장 리뷰/정산/교육 (13개 RPC)
  → 기존 hook 파일에서 apiClient → supabase.rpc() 교체

Phase C: 채팅 (Realtime 전환, 복잡도 높음)
  → 14장 채팅 시스템 전체 (9개 API)
  → useChat.ts 대규모 리팩터링 필요

Phase D: 결제/예약 + Edge Functions (가장 마지막, 위험도 높음)
  → 15장 결제/예약 (5개) + 16장 Edge Function 인터페이스 (7개)
  → WebView 결제 흐름 변경 + Edge Function 연동
```

### 0-6. 패키지 의존성 변경

```
// 추가 설치 필요
yarn add @supabase/supabase-js react-native-url-polyfill

// 제거 가능 (전환 완료 후)
yarn remove react-use-websocket   // WebSocket → Supabase Realtime
// @tosspayments/widget-sdk-react-native  // 이미 미사용, 제거 권장
```

### 0-7. 번호 체계

본 문서의 API 번호는 `MIGRATION_PLAN.md §5 API 전환 매핑표`의 번호(#1~#66)와 **동일**합니다.
`APP_MIGRATION_CODE.md`의 코드 블록 번호도 같은 번호를 사용합니다.

### 0-8. 문서 역할 분담

| 문서 | 역할 | 내용 |
|------|------|------|
| `APP_MIGRATION_GUIDE.md` (본 문서) | **이해용** | 도메인별 개요 설명, 아키텍처 변경 설명, 주의사항, 타입 변경 요약. 개별 API 코드를 반복하지 않고 CODE.md를 참조 |
| `APP_MIGRATION_CODE.md` | **복붙용** | API별 Before/After 코드 전문, 변환 포인트, 응답 매핑 테이블. 외주 개발자가 복사-붙여넣기로 바로 적용 가능 |

- GUIDE.md의 각 API 섹션에서는 "무엇이 바뀌고 왜 바뀌는지"를 설명하고, 코드 예시는 `> 📝 코드 예시: APP_MIGRATION_CODE.md #N 참조` 형태로 링크한다.
- CODE.md에 코드 전문이 있으므로, GUIDE.md에서 동일 코드를 중복 작성하지 않는다.

---

## 목차

| 장 | 제목 | 작성 라운드 | API 수 | 상태 |
|----|------|-----------|--------|------|
| 0 | 문서 규칙 및 표기법 | 3-0 (완료) | — | ✅ 확정 |
| 1 | 인증 전환 (mb_id → Supabase Auth) | 3-1 / R1 | 3개 (#1~#3) | ✅ 완료 |
| 2 | apiClient 교체 (FormData → Supabase JS) | 3-1 / R1 | — (공통) | ✅ 완료 |
| 3 | 반려동물 CRUD | 3-2 / R2 | 8개 (#9~#16) | ✅ 완료 |
| 4 | 즐겨찾기 CRUD | 3-2 / R2 (CODE: R6) | 4개 (#46~#49) | ✅ 완료 |
| 5 | 알림/FCM | 3-2 / R2 (CODE: R6) | 3개 (#50~#52) | ✅ 완료 |
| 6 | 콘텐츠 조회 | 3-2 / R2 (CODE: R6) | 5개 (#53~#57) | ✅ 완료 |
| 7 | 차단/신고 | 3-2 / R2 (CODE: R6) | 3개 (#58~#60) | ✅ 완료 |
| 8 | 채팅 템플릿 | 3-2 / R2 | 4개 (#30~#33) | ✅ 완료 |
| 9 | 주소 인증 / 프로필 / 회원 관리 | 3-2 / R2 | 6개 (#4~#8, #21) | ✅ 완료 |
| 10 | 기타 자동 API | 3-2 / R2 | 12개 (#24, #26~#29, #40, #42~#43, #45, #62~#65) | ✅ 완료 |
| 11 | 유치원/보호자 RPC | 3-3 / R3 | 4개 (#17~#20) | ⬜ 예정 |
| 12 | 예약 조회 RPC | 3-3 / R3 | 2개 (#37, #38) | ⬜ 예정 |
| 13 | 리뷰/정산/교육 RPC | 3-3 / R3 | 4개 (#41, #44, #44b, #61) | ⬜ 예정 |
| 14 | 채팅 전환 (WebSocket → Realtime) | 3-4 / R4 | 9개 (#22~#30) | ⬜ 예정 |
| 15 | 결제/예약 전환 | 3-5 / R5 | 5개 (#34~#38) | ⬜ 예정 |
| 16 | Edge Function 인터페이스 | 3-5 / R5 | 7개 (#25, #34~#36, #39, #1, #66) | ⬜ 예정 |
| A | 부록: 타입 정의 변경 총정리 | 3-6 / R6 | — | ⬜ 예정 |
| B | 부록: 환경 변수 / 패키지 체크리스트 | 3-6 / R6 | — | ⬜ 예정 |

> **참고**: 일부 API는 여러 장에서 다룹니다 (예: #37~#38은 12장 RPC + 15장 결제 양쪽에서 참조).
> 해당 API의 코드 예시는 `APP_MIGRATION_CODE.md`에서 한 번만 작성하고, 이 문서에서는 교차 참조합니다.

---

## 1. 인증 전환 (mb_id → Supabase Auth)

> **작성 라운드**: 3-1 / R1
> **관련 API**: #1 alimtalk.php, #2 auth_request.php, #3 set_join.php
> **핵심 변경**: 폰번호 기반 수동 인증 → Supabase Phone OTP
> **영향 범위**: 모든 API 호출의 사용자 식별 방식 변경

### 1-1. 현재 인증 흐름 vs 전환 후 흐름

**현재 흐름 (PHP/MariaDB)**:

```
┌─────────┐   ① 폰번호 입력    ┌─────────────────┐
│  앱 화면  │ ──────────────→ │ alimtalk.php     │  ← 카카오 알림톡으로 6자리 인증번호 발송
│          │                  │ (GET)            │
│          │   ② 인증번호 입력  │                  │
│          │ ──────────────→ │ auth_request.php │  ← 인증번호 일치 확인 (DB 대조)
│          │                  │ (GET)            │     → 일치 시 {"result":"Y"} 반환
│          │   ③ 회원정보 저장  │                  │
│          │ ──────────────→ │ set_join.php     │  ← members UPSERT (가입/주소 업데이트)
│          │                  │ (POST, FormData) │
│          │   ④ 로그인 완료   │                  │
│          │ ←────────────── │ {"result":"Y"}   │  → userAtom에 mb_id(폰번호) 저장 (MMKV)
└─────────┘                  └─────────────────┘

⚠️ 문제점:
  - 인증 후 JWT 토큰이 없음 → mb_id(폰번호)만으로 모든 API 호출
  - mb_id를 알면 누구나 타인의 API 호출 가능 (Authorization 헤더 없음)
  - 세션/리프레시 토큰 없음 → 만료/갱신 개념 자체가 없음
```

**전환 후 흐름 (Supabase Auth)**:

```
┌─────────┐   ① 폰번호 입력      ┌──────────────────────────┐
│  앱 화면  │ ──────────────→   │ Supabase Auth             │
│          │                    │ signInWithOtp({ phone })  │  ← Supabase가 자체 OTP 발송
│          │   ② OTP 입력       │                            │     (※ 카카오 알림톡 사용 시
│          │ ──────────────→   │ verifyOtp({ phone, token })│      send-alimtalk EF 연동)
│          │                    │                            │
│          │   ③ JWT 세션 수신   │                            │
│          │ ←────────────────  │ { session, user }          │  → access_token + refresh_token
│          │                    │                            │     MMKV에 자동 저장 (어댑터)
│          │   ④ 회원정보 확인   │                            │
│          │ ──────────────→   │ members UPSERT             │  ← 신규 회원이면 INSERT
│          │                    │ (자동 API, JWT 포함)        │     기존 회원이면 SELECT
└─────────┘                    └──────────────────────────┘

✅ 개선사항:
  - 모든 API 호출에 JWT access_token이 자동 포함 (Authorization 헤더)
  - RLS(Row Level Security)로 본인 데이터만 접근 가능
  - refresh_token으로 세션 자동 갱신 (autoRefreshToken: true)
  - mb_id 파라미터가 완전히 제거됨 → auth.uid()가 서버에서 자동 추출
```

> **핵심 차이**: 기존에는 `mb_id`(폰번호)를 **매 요청마다 파라미터로 전달**했지만, 전환 후에는 Supabase가 **JWT에서 `auth.uid()`를 자동 추출**합니다. 앱 코드에서 `mb_id` 파라미터를 일일이 전달하는 코드를 **모두 제거**해야 합니다.

### 1-2. API #1. alimtalk.php → Edge Function `send-alimtalk`

**전환 방식**: Edge Function | **난이도**: 중

기존 `alimtalk.php`는 카카오 알림톡(루나소프트 API)을 통해 SMS 인증번호를 발송하는 PHP 서버 로직입니다.

**Supabase Auth의 Phone OTP를 사용하면 인증번호 발송이 Supabase 내부에서 처리**되므로, 앱에서 `alimtalk.php`를 직접 호출하던 코드는 제거됩니다. 다만, Supabase Phone OTP가 카카오 알림톡을 발송 채널로 사용하려면 커스텀 SMS 훅을 설정해야 합니다.

- **Supabase 기본 SMS**: Twilio 등 해외 SMS 프로바이더 사용 → 한국 사용자에게 부적합
- **커스텀 훅 방식**: Supabase Auth → `send-alimtalk` Edge Function → 루나소프트 API → 카카오 알림톡 발송

따라서 `send-alimtalk` Edge Function은 Supabase Auth의 SMS 훅으로 동작하며, **앱 코드에서 직접 호출하지 않습니다**.

**변환 포인트**:
- 앱에서 `apiClient.get('api/alimtalk.php', { ... })` 호출 코드 **삭제**
- `supabase.auth.signInWithOtp({ phone })` 한 줄로 대체 (인증번호 발송이 Supabase Auth 내부에서 자동 처리)
- 루나소프트 API 키는 Supabase Secrets에 등록됨 (앱 코드에 노출 안 됨)
- Edge Function `send-alimtalk`은 Step 4에서 구현 예정 (앱 개발자는 신경 쓸 필요 없음)

> 📝 코드 예시: `APP_MIGRATION_CODE.md` #1 참조

### 1-3. API #2. auth_request.php → Supabase Auth `signInWithOtp` + `verifyOtp`

**전환 방식**: Supabase Auth | **난이도**: 중

기존 `auth_request.php`는 두 가지 역할을 수행합니다:
1. **인증번호 발송 요청** (`type=send`): `alimtalk.php`를 내부 호출하여 SMS 발송
2. **인증번호 확인** (`type=verify`): DB에 저장된 인증번호와 비교

전환 후에는 이 두 역할이 Supabase Auth의 두 메서드로 분리됩니다:

| 기존 역할 | 기존 호출 | 전환 후 호출 |
|-----------|----------|------------|
| 인증번호 발송 | `apiClient.get('api/alimtalk.php', { phone, code })` | `supabase.auth.signInWithOtp({ phone })` |
| 인증번호 확인 | `apiClient.get('api/auth_request.php', { mb_id, auth_no })` | `supabase.auth.verifyOtp({ phone, token, type: 'sms' })` |

**변환 포인트**:
- 기존: 인증번호 발송과 확인이 별도 PHP 파일 → 전환 후: `signInWithOtp` / `verifyOtp` 2개 메서드로 명확히 분리
- 기존: 인증 성공 시 `{"result":"Y"}` 반환 → 전환 후: `{ data: { session, user }, error }` 반환
- 전환 후 `verifyOtp` 성공 시 **즉시 JWT 세션이 발급**됨 (기존에는 인증 확인 후 별도로 `set_join.php`를 호출해야 했음)
- 전화번호 포맷: Supabase Auth는 국제번호 형식 필요 (`+821012345678`). 기존 `01012345678` → `+82` 접두사 추가 필요

> 📝 코드 예시: `APP_MIGRATION_CODE.md` #2 참조

### 1-4. API #3. set_join.php → Supabase Auth + members UPSERT

**전환 방식**: 자동 API | **난이도**: 쉬움

기존 `set_join.php`는 회원가입 + 주소 업데이트를 FormData POST로 처리합니다. 전환 후에는 `verifyOtp` 성공 시 Supabase Auth에 사용자가 자동 생성되므로, 앱에서는 `members` 테이블에 추가 프로필 정보를 UPSERT하면 됩니다.

**주의**: Supabase Auth의 `auth.users` 테이블과 `public.members` 테이블은 별도입니다.
- `auth.users`: Supabase Auth가 관리 (phone, 인증 메타데이터). 앱에서 직접 조회/수정 불가
- `public.members`: 앱 프로필 정보 (name, nickname, address, mode 등). RLS로 보호
- `members.id`는 `auth.users.id`와 동일한 UUID를 사용 (FK 관계)

**변환 포인트**:
- 기존: `apiClient.post('api/set_join.php', formData)` → 전환 후: `supabase.from('members').upsert({ ... })`
- 기존: FormData에 `mb_id`(폰번호)로 식별 → 전환 후: JWT의 `auth.uid()`로 자동 식별 (RLS)
- 기존: PHP에서 가입/업데이트 분기 → 전환 후: `.upsert()` 한 줄로 통합 (있으면 UPDATE, 없으면 INSERT)
- `mb_5` → `current_mode`: 값도 변경 (`'1'` → `'보호자'`, `'2'` → `'유치원'`)
- `mb_2` (주민번호 앞 6자리) → `birth_date` (date 타입): 포맷 변환 필요

> 📝 코드 예시: `APP_MIGRATION_CODE.md` #3 참조

### 1-5. 인증 상태 관리 (userAtom 변경)

기존 앱은 `userAtom` (Jotai atom + MMKV)에 `mb_id`(폰번호)를 저장하고, 앱 재시작 시 MMKV에서 복원하여 자동 로그인합니다.

전환 후에는 **Supabase Auth 세션이 MMKV에 자동 저장**됩니다 (§0-4의 MMKV 어댑터).

**기존 userAtom 구조** (추정):

```typescript
// states/userAtom.ts (기존)
interface UserState {
  mb_id: string          // 폰번호 (핵심 식별자)
  mb_no: number          // 회원 번호 (정수 PK)
  mb_name: string        // 이름
  mb_nick: string        // 닉네임
  mb_5: string           // '1'=보호자, '2'=유치원
  mb_profile1: string    // 프로필 이미지 파일명
  // ... 기타 필드
}
```

**전환 후 userAtom 구조**:

```typescript
// states/userAtom.ts (전환 후)
import { Session } from '@supabase/supabase-js'

interface UserState {
  session: Session | null   // Supabase Auth 세션 (access_token, refresh_token 포함)
  id: string                // UUID (= auth.uid())
  phone: string             // 폰번호
  name: string              // 이름
  nickname: string          // 닉네임
  nickname_tag: string      // '#1001' 형식 태그
  current_mode: string      // '보호자' | '유치원'
  profile_image: string     // Storage URL (전체 URL)
  // ... 기타 필드 (members 테이블 컬럼에 맞춤)
}
```

**onAuthStateChange 리스너** — 앱 루트(`_layout.tsx` 등)에 설정:

```typescript
// app/_layout.tsx (또는 적절한 루트 컴포넌트)
import { supabase } from '@/lib/supabase'

useEffect(() => {
  // Supabase Auth 상태 변화 감지 (로그인, 로그아웃, 토큰 갱신)
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        // members 테이블에서 프로필 조회 → userAtom 업데이트
        const { data: member } = await supabase
          .from('members')
          .select('*')
          .eq('id', session.user.id)
          .single()

        setUser({
          session,
          id: session.user.id,
          phone: session.user.phone ?? '',
          name: member?.name ?? '',
          nickname: member?.nickname ?? '',
          nickname_tag: member?.nickname_tag ?? '',
          current_mode: member?.current_mode ?? '보호자',
          profile_image: member?.profile_image ?? '',
        })
      } else if (event === 'SIGNED_OUT') {
        setUser(null)  // userAtom 초기화
      }
      // 'TOKEN_REFRESHED' 이벤트는 자동 처리됨 (별도 로직 불필요)
    }
  )

  return () => subscription.unsubscribe()
}, [])
```

**변환 포인트**:
- `mb_id` → `id` (UUID): 모든 곳에서 폰번호 대신 UUID 사용
- `mb_5` → `current_mode`: 값 형태도 변경 (`'1'`→`'보호자'`, `'2'`→`'유치원'`)
- `mb_profile1` (파일명) → `profile_image` (Storage 전체 URL)
- `mb_no` (정수) → `id` (UUID): PK 타입 자체가 변경
- 기존에는 MMKV에 직접 `mb_id`를 저장/복원했으나, 전환 후에는 Supabase Auth 세션이 MMKV 어댑터를 통해 자동 관리됨

### 1-6. 인증 전환 후 영향 범위

인증 전환은 **앱 전체에 영향**을 미칩니다. 모든 API 호출에서 `mb_id` 파라미터가 제거되고, Supabase RLS가 `auth.uid()`를 자동 적용합니다.

**제거해야 하는 패턴**:

```typescript
// ❌ 기존: 매 API 호출마다 mb_id를 수동으로 전달
const response = await apiClient.get('api/get_my_animal.php', {
  mb_id: user.mb_id,  // ← 이 줄 제거
})

// ✅ 전환 후: mb_id 전달 불필요 (JWT에서 auth.uid() 자동 추출)
const { data, error } = await supabase
  .from('pets')
  .select('*')
  .eq('member_id', user.id)  // user.id = UUID (auth.uid()와 동일)
  .eq('deleted', false)
```

**영향 범위 요약**:

| 항목 | 기존 | 전환 후 | 영향도 |
|------|------|--------|--------|
| 사용자 식별 | `mb_id` (폰번호) 파라미터 전달 | JWT `auth.uid()` 자동 적용 | **모든 API** |
| API 호출 라이브러리 | `apiClient.get/post` | `supabase.from/rpc/functions` | **모든 API** |
| 인증 헤더 | 없음 | `Authorization: Bearer <access_token>` 자동 포함 | **자동** |
| 데이터 접근 제어 | 없음 (mb_id만 알면 접근 가능) | RLS 정책으로 본인 데이터만 접근 | **자동** |
| 세션 만료 | 없음 (영구) | access_token 1시간 → refresh_token으로 자동 갱신 | **자동** |
| 로그아웃 | MMKV에서 mb_id 삭제 | `supabase.auth.signOut()` | 로그아웃 화면 |
| 앱 재시작 | MMKV에서 mb_id 복원 | MMKV 어댑터가 세션 자동 복원 | **자동** |

> **작업 순서 권장**: 인증 전환(§1)과 apiClient 교체(§2)를 가장 먼저 완료하면, 이후 모든 API 전환 작업에서 `supabase` 클라이언트를 사용할 수 있습니다. 이 두 작업은 `apiClient.ts`와 `lib/supabase.ts`가 공존하는 형태로 점진적 전환이 가능합니다 (§2-3 참조).

---

## 2. apiClient 교체 (FormData → Supabase JS)

> **작성 라운드**: 3-1 / R1
> **핵심 변경**: `utils/apiClient.ts` → `lib/supabase.ts`
> **전환 전략**: 점진적 교체 (공존 → 전체 전환 → apiClient.ts 삭제)

### 2-1. 현재 apiClient 구조

기존 `utils/apiClient.ts`의 구조와 특징:

```typescript
// utils/apiClient.ts (기존 — 분석 결과)
const BASE_URL = process.env.EXPO_PUBLIC_API_URL
// → https://woo1020.iwinv.net

// GET 요청: query string 방식
apiClient.get(endpoint, payload)
// → GET https://woo1020.iwinv.net/{endpoint}?key1=value1&key2=value2
// → 응답: JSON

// POST 요청: FormData 방식 (JSON body가 아님!)
apiClient.post(endpoint, payload)
// → POST https://woo1020.iwinv.net/{endpoint}
// → Content-Type: multipart/form-data
// → body: FormData (key-value 쌍, 파일 포함 가능)
// → 응답: JSON
```

**주요 특징**:
- 모든 POST는 `FormData`로 전송 (JSON body 아님)
- 인증 헤더(`Authorization`) 없음
- `mb_id`(폰번호)를 매번 파라미터에 포함하여 사용자 식별
- 에러 처리: try/catch에서 `Alert.alert()` 호출 (기존 패턴 유지)
- 파일 업로드: FormData에 이미지 파일을 직접 append

### 2-2. Supabase JS 호출 패턴 요약

Supabase JS 클라이언트(`lib/supabase.ts`)는 5가지 호출 패턴을 제공합니다. 기존 `apiClient`의 모든 역할을 대체합니다.

| # | 패턴 | 용도 | 대응하는 기존 코드 | API 수 |
|---|------|------|-------------------|--------|
| ① | `supabase.from('table').select/insert/update/delete()` | 단순 CRUD (자동 API) | `apiClient.get/post('api/get_*.php')` | 44개 |
| ② | `supabase.rpc('function_name', { params })` | 복잡한 조회/JOIN/집계 (RPC) | `apiClient.get('api/get_partner.php')` 등 | 14개 |
| ③ | `supabase.functions.invoke('edge-fn', { body })` | 서버 로직 필수 (Edge Function) | `apiClient.post('api/inicis_payment.php')` 등 | 7개 |
| ④ | `supabase.storage.from('bucket').upload/getPublicUrl()` | 파일 업로드/다운로드 | FormData의 이미지 파일 append | Storage용 |
| ⑤ | `supabase.auth.signInWithOtp/verifyOtp/signOut()` | 인증 | `apiClient.get('api/auth_request.php')` | 1개 (※) |

> **※ ⑤번 Auth 패턴 수량 보충**: 표에서 "1개"로 표시한 것은 **Supabase Auth 메서드를 직접 호출하는 API가 1개 흐름**(OTP 발송→확인)이라는 의미입니다. 실제 전환 대상 PHP API는 #1 `alimtalk.php`, #2 `auth_request.php`, #3 `set_join.php`의 **3개**입니다. 이 3개가 Supabase Auth `signInWithOtp` + `verifyOtp` + `members.upsert()` 조합으로 대체됩니다 (§1 참조). `alimtalk.php`는 Supabase Auth 내부 SMS 훅이 대체하고, `set_join.php`는 ①번 자동 API 패턴(`members.upsert`)으로 분류되므로, 순수 Auth 패턴 호출은 `signInWithOtp` + `verifyOtp` = **1개 흐름**입니다.

**패턴 ①: 자동 API (가장 많이 사용)**

```typescript
// 조회 (SELECT)
const { data, error } = await supabase
  .from('pets')
  .select('*')                      // 전체 컬럼 또는 'id, name, breed'
  .eq('member_id', user.id)         // WHERE member_id = ?
  .eq('deleted', false)             // AND deleted = false
  .order('created_at', { ascending: false })  // ORDER BY

// 등록 (INSERT)
const { data, error } = await supabase
  .from('pets')
  .insert({ member_id: user.id, name: '멍멍이', breed: '말티즈' })
  .select()                         // INSERT 후 결과 반환

// 수정 (UPDATE)
const { data, error } = await supabase
  .from('pets')
  .update({ name: '새이름' })
  .eq('id', petId)
  .eq('member_id', user.id)         // RLS 보조 (본인 데이터만)
  .select()

// 삭제 (DELETE 또는 soft delete)
const { error } = await supabase
  .from('pets')
  .update({ deleted: true })        // soft delete
  .eq('id', petId)

// UPSERT (있으면 UPDATE, 없으면 INSERT)
const { data, error } = await supabase
  .from('members')
  .upsert({
    id: user.id,  // PK 기준으로 중복 판단
    name: '홍길동',
    current_mode: '보호자',
  })
  .select()
```

**패턴 ②: RPC**

```typescript
const { data, error } = await supabase.rpc('app_get_kindergarten_detail', {
  p_kindergarten_member_id: memberId,
})
```

**패턴 ③: Edge Function**

```typescript
const { data, error } = await supabase.functions.invoke('create-reservation', {
  body: {
    kindergarten_id: kgId,
    pet_id: petId,
    checkin_scheduled: startDate,
    checkout_scheduled: endDate,
  },
})
```

**패턴 ④: Storage**

```typescript
// 업로드
const filePath = `${user.id}/${Date.now()}.jpg`
const { data, error } = await supabase.storage
  .from('pet-images')       // 버킷명
  .upload(filePath, file, {
    contentType: 'image/jpeg',
    upsert: true,            // 같은 경로면 덮어쓰기
  })

// 공개 URL 획득
const { data: { publicUrl } } = supabase.storage
  .from('pet-images')
  .getPublicUrl(filePath)
```

### 2-3. 점진적 전환 전략

`apiClient.ts`와 `lib/supabase.ts`는 **공존 가능**합니다. 모든 API를 한 번에 전환하지 않고, Phase별로 점진적으로 교체합니다.

```
Phase A: lib/supabase.ts 생성 + 인증 전환 + 단순 CRUD
  ├─ apiClient.ts: 아직 사용 중 (전환 안 된 API)
  └─ lib/supabase.ts: 새로 전환된 API에서 사용

Phase B ~ D: 나머지 API 전환
  ├─ apiClient.ts: 점점 사용 감소
  └─ lib/supabase.ts: 점점 사용 증가

Phase 완료: apiClient.ts 삭제
  └─ lib/supabase.ts: 모든 API 호출 담당
```

**import 가이드**:

```typescript
// 기존 (전환 전)
import { apiClient } from '@/utils/apiClient'

// 전환 후 (supabase 사용)
import { supabase } from '@/lib/supabase'

// 전환 중 (두 파일 공존 가능 — 같은 파일에서 양쪽 import 가능)
import { apiClient } from '@/utils/apiClient'  // 아직 전환 안 된 API용
import { supabase } from '@/lib/supabase'       // 전환 완료된 API용
```

**주의사항**:
- 한 API를 전환할 때, 관련된 hook 파일 전체에서 해당 API 호출을 교체
- 예: `hooks/usePetList.ts`에서 `fetchPets()`만 전환하고 `deletePet()`은 남겨두면 안 됨 → 같은 hook 안의 모든 API를 한 번에 전환 권장
- 전환 시 기존 `apiClient` 호출부를 주석 처리하지 말고 **삭제** (주석이 쌓이면 혼란)

### 2-4. 에러 처리 통합

**기존 apiClient 에러 형식**:

```typescript
// 기존: try/catch + HTTP 에러
try {
  const response = await apiClient.get('api/get_my_animal.php', { mb_id })
  if (response.result !== 'Y') {
    Alert.alert('오류', response.message ?? '요청 실패')
    return
  }
  // 성공 처리
} catch (error) {
  Alert.alert('오류', '서버와 통신할 수 없습니다')
}
```

**Supabase 에러 형식**:

```typescript
// Supabase: { data, error } 패턴 (예외를 throw하지 않음!)
const { data, error } = await supabase
  .from('pets')
  .select('*')
  .eq('member_id', user.id)

if (error) {
  // error.message: 'Row level security policy violation'
  // error.code: '42501' (PostgreSQL 에러 코드)
  // error.details: 상세 정보
  Alert.alert('오류', error.message)
  return
}
// data: 성공 결과 (배열 또는 객체)
```

**공통 에러 핸들러** (선택사항 — 기존 Alert.alert 패턴 유지 가능):

```typescript
// utils/handleSupabaseError.ts (신규 생성 — 선택사항)
import { Alert } from 'react-native'
import { PostgrestError } from '@supabase/supabase-js'

export const handleSupabaseError = (
  error: PostgrestError | null,
  context?: string
): boolean => {
  if (!error) return false  // 에러 없음

  const message = (() => {
    switch (error.code) {
      case '42501': return '접근 권한이 없습니다'
      case '23505': return '이미 존재하는 데이터입니다'
      case '23503': return '참조하는 데이터가 존재하지 않습니다'
      case 'PGRST116': return '데이터를 찾을 수 없습니다'
      default: return error.message
    }
  })()

  Alert.alert('오류', context ? `${context}: ${message}` : message)
  return true  // 에러 있었음
}

// 사용 예시:
const { data, error } = await supabase.from('pets').select('*')
if (handleSupabaseError(error, '반려동물 조회')) return
```

**핵심 차이점 요약**:

| 항목 | 기존 apiClient | Supabase |
|------|---------------|----------|
| 에러 전달 방식 | `throw` (try/catch 필요) | `{ error }` 객체 반환 (throw 안 함) |
| 성공 판단 | `response.result === 'Y'` | `error === null` |
| 에러 상세 | `response.message` (PHP에서 설정) | `error.message`, `error.code` (PostgreSQL 표준) |
| 네트워크 에러 | catch 블록 | catch 블록 (네트워크 단절 시에만) |

### 2-5. apiClient.ts 제거 시점

모든 API 전환이 완료되면 `utils/apiClient.ts`를 삭제합니다.

**삭제 전 체크리스트**:

- [ ] **Phase A**: 인증 (#1~#3) + 단순 CRUD (#4~#16, #21, #24~#33, #40, #42~#43, #45~#65) 전환 완료
- [ ] **Phase B**: RPC (#17~#20, #37~#38, #41, #44, #44b, #61) 전환 완료
- [ ] **Phase C**: 채팅 (#22~#29) Realtime 전환 완료
- [ ] **Phase D**: 결제/예약 (#34~#36, #39, #66) Edge Function 전환 완료
- [ ] 전체 소스에서 `apiClient` import 검색 → **0건** 확인
- [ ] 전체 소스에서 `EXPO_PUBLIC_API_URL` 참조 검색 → **0건** 확인
- [ ] 전체 소스에서 `EXPO_PUBLIC_WEBSOCKET_URL` 참조 검색 → **0건** 확인 (채팅 Realtime 전환 후)
- [ ] `utils/apiClient.ts` 파일 삭제
- [ ] `.env`에서 `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_WEBSOCKET_URL` 제거
- [ ] `package.json`에서 `react-use-websocket` 제거 (채팅 Realtime 전환 후)
- [ ] 빌드 테스트 통과 확인

---

## 3. 반려동물 CRUD

> **작성 라운드**: 3-2 / R2
> **관련 API**: #9~#16 (8개)
> **Supabase 테이블**: `pets`, `pet_breeds`, `favorite_pets`
> **관련 파일**: `hooks/usePetList.ts`, `types/petType.ts`

### 3-1. 아키텍처 변경 요약

**기존**: `apiClient.get/post('api/get_my_animal.php', { mb_id })` → PHP에서 `g5_write_animal` 테이블 조회, `wr_1`~`wr_11` 같은 난독화된 컬럼명 사용.

**전환 후**: `supabase.from('pets').select(...)` → 직접 `pets` 테이블 조회, 정규 컬럼명 (`name`, `breed`, `gender` 등) 사용. 이미지는 10개 개별 컬럼(`animal_img1`~`10`) 대신 `photo_urls` (text[]) 배열 1개로 통합.

**핵심 변경 3가지**:
1. **컬럼명 전면 교체**: `wr_*` → 의미 있는 이름 (아래 §3-9 매핑표)
2. **이미지 구조**: 개별 10컬럼 → `text[]` 배열 + Storage 버킷 (`pet-images`)
3. **boolean 변환**: `'Y'`/`'N'` 문자열 → `true`/`false` boolean

### 3-2. API #9~#11 — 반려동물 조회 (3개)

| # | PHP API | Supabase 대응 | 핵심 변경 |
|---|---------|--------------|----------|
| #9 | `get_my_animal.php` | `pets SELECT WHERE member_id=? AND deleted=false` | `mb_id` → `member_id` (UUID), `deleted=false` 필터 추가 |
| #10 | `get_animal_by_id.php` | `pets SELECT WHERE id=?` + `favorite_pets` 별도 조회 | 찜 여부: PHP 응답 내장 → 별도 쿼리 분리 |
| #11 | `get_animal_by_mb_id.php` | `pets SELECT WHERE member_id=?` | 타인 반려동물 조회 시 RLS 주의 |

#9 (내 반려동물 목록)가 가장 기본이 되는 패턴이며, #10~#11은 파라미터만 다른 변형입니다.

> 📝 코드 예시: `APP_MIGRATION_CODE.md` #9, #10, #11 참조

### 3-3. API #12 — 품종 검색

`get_animal_kind.php` → `pet_breeds SELECT`. MariaDB의 `animalKind` 테이블이 `pet_breeds`로 통합되었으며, `type` 컬럼(`'dog'`/`'cat'`)으로 구분합니다. 현재 `dog`만 운영 중이므로 `.eq('type', 'dog')` 필터를 사용합니다.

> 📝 코드 예시: `APP_MIGRATION_CODE.md` #12 참조

### 3-4. API #13~#14 — 반려동물 등록/수정

| # | PHP API | Supabase 대응 | 핵심 변경 |
|---|---------|--------------|----------|
| #13 | `set_animal_insert.php` | Storage `pet-images` 업로드 → `pets INSERT` | FormData 이미지 → Storage + `photo_urls[]`, 4마리 제한 체크 |
| #14 | `set_animal_update.php` | Storage 이미지 교체 → `pets UPDATE` | 기존 URL 유지 + 새 이미지 추가 방식 |

**Storage 업로드 패턴**: 두 API 모두 이미지 업로드가 포함됩니다. 기존 PHP는 FormData로 이미지를 한 번에 전송했지만, Supabase에서는 **Step 1: Storage 업로드** → **Step 2: DB INSERT/UPDATE** 2단계로 분리됩니다. 공통 업로드 유틸리티는 `APP_MIGRATION_CODE.md` 부록 참조.

**4마리 제한 체크** (#13): `.select('*', { count: 'exact', head: true })`로 현재 등록 수를 먼저 확인합니다. `head: true`는 데이터 본문 없이 count만 반환하여 효율적입니다.

> 📝 코드 예시: `APP_MIGRATION_CODE.md` #13, #14 참조

### 3-5. API #15 — 반려동물 삭제 (soft delete)

`set_animal_delete.php` → `pets UPDATE (deleted=true)`. **실제 행 삭제가 아닌 soft delete** 방식입니다. `deleted=true`로 설정된 반려동물은 모든 조회 쿼리에서 `.eq('deleted', false)` 필터로 제외됩니다. `internal.pets_public_info` VIEW에도 동일 필터가 적용되어 있습니다.

> 📝 코드 예시: `APP_MIGRATION_CODE.md` #15 참조

### 3-6. API #16 — 대표 반려동물 설정 (RPC)

`set_first_animal_set.php` → `supabase.rpc('app_set_representative_pet', { p_pet_id })`. 이 API는 **자동 API가 아닌 RPC**입니다. 이유: 기존 대표 해제(전체 `is_representative=false`) → 새 대표 설정(`is_representative=true`) 2단계를 **트랜잭션 안전하게** 처리해야 하기 때문입니다.

RPC 내부에서 `p_pet_id` 존재 여부를 먼저 검증하여, "모든 반려동물이 비대표가 되는" 버그를 원천 차단합니다.

> 📝 코드 예시: `APP_MIGRATION_CODE.md` #16 참조

### 3-7. PetType 인터페이스 변경 요약

| 기존 필드 (wr_*) | 전환 후 필드 | 타입 변경 | 비고 |
|---|---|---|---|
| `wr_id` (정수) | `id` (UUID) | `number` → `string` | PK |
| `mb_id` (폰번호) | `member_id` (UUID) | `string` → `string` | FK, 값 형태 변경 |
| `wr_subject` | `name` | — | |
| `wr_content` | `description` | — | |
| `wr_2` | `gender` | — | |
| `wr_3` (`'Y'`/`'N'`) | `is_neutered` | `string` → `boolean` | |
| `wr_4` | `breed` | — | |
| `wr_5` | `birth_date` | — | date 타입 |
| `wr_6` (`'Y'`/`'N'`) | `is_birth_date_unknown` | `string` → `boolean` | |
| `wr_7` (문자열) | `weight` | `string` → `number` | numeric 타입 |
| `wr_8` (`'Y'`/`'N'`) | `is_vaccinated` | `string` → `boolean` | |
| `wr_10` (`'Y'`/`'N'`) | `is_draft` | `string` → `boolean` | |
| `firstYN` (`'Y'`/`'N'`) | `is_representative` | `string` → `boolean` | |
| `deleteYN` (`'Y'`/`'N'`) | `deleted` | `string` → `boolean` | |
| `animal_img1`~`10` | `photo_urls` | 10개 `string` → `string[]` | 배열 통합 |
| — | `size_class` | — (신규) | 트리거 자동 계산 |
| — | `created_at` | — (신규) | timestamptz |

---

## 4. 즐겨찾기 CRUD

> **작성 라운드**: 3-2 / R2 (CODE: 3-6 / R6)
> **관련 API**: #46~#49 (4개)
> **Supabase 테이블**: `favorite_kindergartens`, `favorite_pets`
> **관련 파일**: `utils/handleFavorite.ts`

### 4-1. 아키텍처 변경 요약

기존 PHP에서는 즐겨찾기 추가/삭제가 별도 PHP 파일(4개)로 분리되어 있었습니다. Supabase에서는 `favorite_kindergartens`과 `favorite_pets` 2개 테이블로 관리하며, `is_favorite` boolean 컬럼으로 활성/비활성을 토글합니다.

**주요 변경**: 기존에는 행 INSERT/DELETE 방식이었으나, Supabase에서는 **UPSERT + `is_favorite` 플래그** 방식으로 전환합니다. 즐겨찾기 해제 시 행을 삭제하지 않고 `is_favorite=false`로 UPDATE하여 히스토리를 보존합니다.

| # | PHP API | Supabase 대응 | 방식 |
|---|---------|--------------|------|
| #46 | `set_partner_favorite_add.php` | `favorite_kindergartens UPSERT (is_favorite=true)` | UPSERT |
| #47 | `set_partner_favorite_remove.php` | `favorite_kindergartens UPDATE (is_favorite=false)` | UPDATE |
| #48 | `set_user_favorite_add.php` | `favorite_pets UPSERT (is_favorite=true)` | UPSERT |
| #49 | `set_user_favorite_remove.php` | `favorite_pets UPDATE (is_favorite=false)` | UPDATE |

> 📝 코드 예시: `APP_MIGRATION_CODE.md` #46~#49 참조 (R6에서 코드 작성 예정)

---

## 5. 알림/FCM

> **작성 라운드**: 3-2 / R2 (CODE: 3-6 / R6)
> **관련 API**: #50~#52 (3개)
> **Supabase 테이블**: `fcm_tokens`, `notifications`
> **관련 파일**: `hooks/useFcmToken.ts`, `hooks/useNotification.ts`

### 5-1. 아키텍처 변경 요약

FCM 토큰 저장과 알림 CRUD는 기존 PHP와 구조가 거의 동일합니다. MariaDB의 `fcm_token` → Supabase `fcm_tokens`, `notification` → `notifications`로 테이블명만 변경됩니다.

**핵심 변경**: `mb_id` → `member_id` (UUID). FCM 토큰 저장 시 기기별 중복 체크를 위해 `device_id` 컬럼이 추가되었습니다.

| # | PHP API | Supabase 대응 | 비고 |
|---|---------|--------------|------|
| #50 | `fcm_token.php` | `fcm_tokens UPSERT` | `member_id` + `device_id` 기준 UPSERT |
| #51 | `get_notification.php` | `notifications SELECT` | 최신순 정렬 |
| #52 | `delete_notification.php` | `notifications DELETE` | 단건 or 전체 삭제 |

> 📝 코드 예시: `APP_MIGRATION_CODE.md` #50~#52 참조 (R6에서 코드 작성 예정)

---

## 6. 콘텐츠 조회

> **작성 라운드**: 3-2 / R2 (CODE: 3-6 / R6)
> **관련 API**: #53~#57 (5개)
> **Supabase 테이블**: `banners`, `notices`, `faqs`, `terms`

### 6-1. 아키텍처 변경 요약

콘텐츠 조회(배너, 공지사항, FAQ, 약관)는 모두 **공개 읽기** 패턴입니다. 인증 없이도 조회 가능하며, RLS에서 `FOR SELECT TO authenticated` 또는 `FOR SELECT TO anon` 정책이 적용되어 있습니다.

기존 MariaDB의 `g5_write_notice` (40컬럼), `g5_write_faq` (40컬럼)이 Supabase에서는 `notices` (10컬럼), `faqs` (8컬럼)으로 대폭 축소되었습니다.

| # | PHP API | Supabase 대응 | 핵심 변경 |
|---|---------|--------------|----------|
| #53 | `get_banner.php` | `banners SELECT WHERE visible=true` | 정렬: `sort_order` |
| #54 | `get_notice.php` | `notices SELECT WHERE visible=true` | 최신순, 페이지네이션 |
| #55 | `get_notice_detail.php` | `notices SELECT WHERE id=? .single()` | **`.single()` 필수** (단건 조회) |
| #56 | `get_faq.php` | `faqs SELECT` | 검색: `.ilike('question', '%keyword%')` |
| #57 | `get_policy.php` | `terms SELECT WHERE category=?` | 카테고리 필터 |

**주의**: 단건 조회(#55)에서는 반드시 `.single()`을 사용해야 합니다. 빠뜨리면 배열(`[]`)로 반환되어 앱에서 `data.title` 등 접근 시 크래시가 발생합니다.

> 📝 코드 예시: `APP_MIGRATION_CODE.md` #53~#57 참조 (R6에서 코드 작성 예정)

---

## 7. 차단/신고

> **작성 라운드**: 3-2 / R2 (CODE: 3-6 / R6)
> **관련 API**: #58~#60 (3개)
> **Supabase 테이블**: `member_blocks`
> **관련 파일**: `hooks/useBlock.ts`

### 7-1. 아키텍처 변경 요약

기존 PHP에서는 `set_block_user_add.php` + `set_block_user_remove.php`가 별도였으나, 앱에서는 `set_block_user.php` 하나로 통합 호출합니다. Supabase에서는 `member_blocks` 테이블 (이미 존재)을 사용합니다.

| # | PHP API | Supabase 대응 | 핵심 변경 |
|---|---------|--------------|----------|
| #58 | `set_block_user.php` | `member_blocks INSERT/DELETE` (토글) | 차단 여부에 따라 INSERT 또는 DELETE |
| #59 | `get_block_user.php` | `member_blocks SELECT` | `blocker_id` + `blocked_id` 조합 확인 |
| #60 | `get_blocked_list.php` | `member_blocks SELECT + members JOIN` | 임베디드 JOIN으로 차단 대상 프로필 포함 |

**차단 토글 패턴** (#58): 차단 상태를 먼저 확인 → 이미 차단이면 DELETE(해제), 미차단이면 INSERT(차단). 또는 앱 UI에서 차단/해제 버튼을 분리하여 각각 호출합니다.

> 📝 코드 예시: `APP_MIGRATION_CODE.md` #58~#60 참조 (R6에서 코드 작성 예정)

---

## 8. 채팅 템플릿

> **작성 라운드**: 3-2 / R2
> **관련 API**: #30~#33 (4개, #30 get + #31 insert + #32 update + #33 delete)
> **Supabase 테이블**: `chat_templates`

### 8-1. 아키텍처 변경 요약

기존에는 `message_template` + `g5_write_chat_partner_guide` + `g5_write_chat_user_guide` 3개 테이블이 Supabase에서 `chat_templates` 1개로 통합되었습니다. `type` 컬럼으로 구분합니다:

| type | 용도 | 소유자 |
|------|------|--------|
| `custom` | 개인 상용문구 (사용자 등록) | `member_id` (FK) |
| `guide_guardian` | 보호자 가이드 문구 (관리자 등록) | NULL |
| `guide_kindergarten` | 유치원 가이드 문구 (관리자 등록) | NULL |

앱에서 #30~#33은 **`type='custom'` 개인 상용문구만** CRUD합니다. 가이드 문구는 관리자 페이지에서 관리합니다.

### 8-2. API 목록 (4개)

| # | PHP API | Supabase 대응 | 핵심 변경 |
|---|---------|--------------|----------|
| #30 | `get_message_template.php` | `chat_templates SELECT WHERE type='custom'` | `type='custom'` 필터 필수 |
| #31 | `set_message_template.php` | `chat_templates INSERT (type='custom')` | `type`, `member_id` 명시 |
| #32 | `update_message_template.php` | `chat_templates UPDATE` | `.eq('member_id', user.id)` RLS 보조 |
| #33 | `delete_message_template.php` | `chat_templates DELETE` | hard delete (복구 불필요) |

4개 API 모두 단순 CRUD 패턴이며, `member_id`로 본인 데이터만 접근합니다 (RLS 자동 적용).

> 📝 코드 예시: `APP_MIGRATION_CODE.md` #30, #31, #32, #33 참조

---

## 9. 주소 인증 / 프로필 / 회원 관리

> **작성 라운드**: 3-2 / R2
> **관련 API**: #4~#8, #21 (6개)
> **Supabase 테이블**: `members`, `kindergartens`
> **관련 파일**: `utils/updateJoin.ts`, 프로필/주소 관련 화면

### 9-1. 아키텍처 변경 요약

이 장의 API들은 회원 프로필, 주소 인증, 모드 전환, 회원 탈퇴, 유치원 프로필 등 **회원 관리 전반**을 다룹니다. #4~#8은 R1에서 코드가 작성되었으며, #21은 R2에서 추가됩니다.

| # | PHP API | 전환 방식 | Supabase 대응 | 코드 작성 라운드 |
|---|---------|----------|--------------|---------------|
| #4 | `set_member_leave.php` | **RPC** | `app_withdraw_member` — soft delete | R1 ✅ |
| #5 | `set_mypage_mode_update.php` | 자동 API | `members UPDATE (current_mode)` | R1 ✅ |
| #6 | `set_profile_update.php` | 자동 API + Storage | `members UPDATE + profile-images` | R1 ✅ |
| #7 | `set_address_verification.php` | 자동 API + Storage | `members UPDATE + address-docs` | R1 ✅ |
| #8 | `kakao-address.php` | 앱 직접 호출 | 카카오 REST API 직접 호출 | R1 ✅ |
| #21 | `set_partner_update.php` | 자동 API + Storage | `kindergartens UPDATE + kindergarten-images` | **R2** |

### 9-2. API #4~#8 — R1에서 작성 완료

#4~#8의 설명은 §1 인증 전환, §2 apiClient 교체에서 다루었습니다.

> 📝 코드 예시: `APP_MIGRATION_CODE.md` #4, #5, #6, #7, #8 참조

### 9-3. API #21. set_partner_update.php → kindergartens UPDATE + Storage

**전환 방식**: 자동 API + Storage | **난이도**: 중

기존 `set_partner_update.php`는 유치원 정보 등록/수정을 FormData로 처리합니다. 전환 후에는 `kindergartens` 테이블을 직접 UPDATE합니다.

**핵심 변경**:
- **가격 구조 전면 변경**: 기존 `wr_2` 컬럼에 파이프(`|`) 구분으로 저장된 가격 문자열(`'10000|12000|...'`)이 12개 개별 integer 컬럼으로 분리됨:
  - 소형: `price_small_1h`, `price_small_24h`, `price_small_walk`, `price_small_pickup`
  - 중형: `price_medium_1h`, `price_medium_24h`, `price_medium_walk`, `price_medium_pickup`
  - 대형: `price_large_1h`, `price_large_24h`, `price_large_walk`, `price_large_pickup`
- **이미지**: `partner_img1~10` → Storage `kindergarten-images` 버킷 + `photo_urls` (text[])
- **주소 컬럼**: `mb_addr1` → `address_road`, `mb_4` → `address_complex` 등 (§0-1 용어 매핑표 참조)
- **이름/소개**: `wr_subject` → `name`, `wr_content` → `description`

> 📝 코드 예시: `APP_MIGRATION_CODE.md` #21 참조

---

## 10. 기타 자동 API

> **작성 라운드**: 3-2 / R2
> **관련 API**: #24, #26~#29, #40, #42~#43, #45, #62~#65 (12개)

### 10-1. 채팅 관련 자동 API (5개)

채팅 시스템(§14)의 전체 Realtime 전환은 R4에서 다루지만, 채팅 관련 API 중 **자동 API로 처리 가능한 5개**는 이 장에서 다룹니다. 이 API들은 채팅 Realtime 전환과 독립적으로 작업할 수 있습니다.

| # | PHP API | Supabase 대응 | 핵심 변경 |
|---|---------|--------------|----------|
| #24 | `chat.php (get_messages)` | `chat_messages SELECT` | `room_id` → `chat_room_id`, `.range()` 페이지네이션 |
| #26 | `chat.php (get_images)` | `chat_messages SELECT WHERE image_urls IS NOT NULL` | `file_path` → `image_urls` (jsonb 배열), `.flatMap()` 평탄화 |
| #27 | `chat.php (leave_room)` | `chat_rooms UPDATE (status='비활성')` | `deleted_at` → `status` 컬럼 |
| #28 | `chat.php (muted)` | `chat_room_members UPDATE (is_muted)` | `'Y'`/`'N'` → boolean |
| #29 | `read_chat.php` | `chat_room_members UPDATE (last_read_message_id)` | 에러 무시 패턴 유지 |

**기존 `chat.php` 라우터 패턴**: PHP에서는 `chat.php` 하나의 파일이 `method` 파라미터로 여러 기능을 분기했습니다. Supabase에서는 각 기능이 별도 테이블의 개별 쿼리로 분리됩니다.

> 📝 코드 예시: `APP_MIGRATION_CODE.md` #24, #26, #27, #28, #29 참조

### 10-2. 돌봄/정산/리뷰 관련 자동 API (4개)

| # | PHP API | Supabase 대응 | 핵심 변경 |
|---|---------|--------------|----------|
| #40 | `set_care_review.php` | `guardian_reviews/kindergarten_reviews INSERT` | `type` 파라미터 → 테이블 분리, `tags` → `selected_tags` (jsonb) |
| #42 | `get_settlement_info.php` | `settlement_infos SELECT` | `.maybeSingle()` (미등록 시 null) |
| #43 | `set_settlement_info.php` | `settlement_infos UPSERT` | `onConflict: 'member_id'`, 주민번호 마스킹 방식 변경 |
| #45 | `set_review.php` | `guardian_reviews/kindergarten_reviews INSERT + Storage` | 이미지: Storage `review-images` 버킷 |

**리뷰 테이블 분리** (#40, #45): 기존 PHP는 `type='pet'`/`type='partner'` 파라미터로 한 테이블에 저장했으나, Supabase에서는 `guardian_reviews` (보호자→유치원 후기)와 `kindergarten_reviews` (유치원→보호자 후기) 2개 테이블로 분리되었습니다. 앱에서 후기 타입에 따라 다른 테이블에 INSERT합니다.

**정산 정보 주민번호** (#43): 기존 PHP에서 `rrn_front_enc` + `rrn_back_enc` (암호화 저장) → Supabase에서는 `operator_ssn_masked` (마스킹: `'960315-*******'`)로 변경. 주민번호 뒷자리 전문은 앱 클라이언트에서 저장하지 않습니다.

> 📝 코드 예시: `APP_MIGRATION_CODE.md` #40, #42, #43, #45 참조

### 10-3. 기타 자동 API (4개)

| # | PHP API | Supabase 대응 | 핵심 변경 |
|---|---------|--------------|----------|
| #62 | `set_solved.php` | `education_completions INSERT` | 중복 INSERT 시 `23505` 에러 → 무시 처리 |
| #63 | `get_bank_list.php` | `banks SELECT WHERE is_active=true` | 마스터 데이터 조회 (인증 불필요) |
| #64 | `get_favorite_animal_list.php` | `favorite_pets SELECT + pets JOIN` | **임베디드 JOIN** — `pet:pets(...)` |
| #65 | `get_favorite_partner_list.php` | `favorite_kindergartens SELECT + kindergartens JOIN` | **임베디드 JOIN** — `kindergarten:kindergartens(...)` |

**임베디드 JOIN 패턴** (#64, #65): Supabase PostgREST는 FK 관계가 있는 테이블을 `.select()` 안에서 중첩 조회할 수 있습니다. `favorite_pets.pet:pets(id, name, breed, ...)` 구문으로 별도 쿼리 없이 반려동물 정보를 함께 가져옵니다. 응답은 `data[].pet.name` 형태의 중첩 객체입니다.

**교육 이수 중복 체크** (#62): `education_completions` 테이블에 `(member_id, topic_id)` UNIQUE 제약이 있으므로, 이미 이수한 교육에 INSERT하면 PostgreSQL 에러 `23505` (unique_violation)가 발생합니다. 앱에서 이 에러를 무시 처리합니다.

> 📝 코드 예시: `APP_MIGRATION_CODE.md` #62, #63, #64, #65 참조

---

## 11. 유치원/보호자 RPC

> **작성 라운드**: 3-3 / R3
> **관련 API**: #17~#20 (4개)
> **RPC 함수**: `app_get_kindergarten_detail`, `app_get_kindergartens`, `app_get_guardian_detail`, `app_get_guardians`
> **관련 파일**: `hooks/useKinderGarten.ts`, `utils/fetchPartnerList.ts`, `hooks/useProtector.ts`, `utils/fetchProtectorList.ts`

### 11-1. API #17. get_partner.php → RPC `app_get_kindergarten_detail`

<!-- TODO: PHP 호출 → supabase.rpc() 변환, 파라미터 매핑 (mb_id → p_kindergarten_member_id), 응답 구조 변환 -->
<!-- 참조: APP_MIGRATION_CODE.md #17 -->

### 11-2. API #18. get_partner_list.php → RPC `app_get_kindergartens`

<!-- 참조: APP_MIGRATION_CODE.md #18 -->

### 11-3. API #19. get_protector.php → RPC `app_get_guardian_detail`

<!-- 참조: APP_MIGRATION_CODE.md #19 -->

### 11-4. API #20. get_protector_list.php → RPC `app_get_guardians`

<!-- 참조: APP_MIGRATION_CODE.md #20 -->

### 11-5. 유치원/보호자 타입 변경 요약

<!-- TODO: PartnerType → KindergartenType 필드 매핑, ProtectorType → GuardianType 필드 매핑 -->

---

## 12. 예약 조회 RPC

> **작성 라운드**: 3-3 / R3
> **관련 API**: #37, #38 (2개)
> **RPC 함수**: `app_get_reservations`, `app_get_reservations_kindergarten`, `app_get_reservation_detail`
> **관련 파일**: `hooks/usePaymentRequestList.ts`, `hooks/usePaymentRequest.ts`

### 12-1. API #37. get_payment_request.php → RPC `app_get_reservations` (보호자) / `app_get_reservations_kindergarten` (유치원)

기존 PHP에서는 `get_payment_request.php` 하나로 `mb_id`/`to_mb_id` 파라미터로 보호자/유치원을 분기했으나, Supabase에서는 보호자/유치원 시점 차이가 커서 2개의 RPC로 분리되었습니다.
- **보호자 모드**: `supabase.rpc('app_get_reservations', { ... })` — 보호자가 요청한 예약 목록 (pet, kindergarten 정보 포함)
- **유치원 모드**: `supabase.rpc('app_get_reservations_kindergarten', { ... })` — 유치원에 들어온 예약 목록 (pet, member 정보 포함)

앱에서 현재 `systemMode` (보호자='1', 유치원='2')에 따라 호출할 RPC를 분기합니다.

<!-- TODO: Before/After 코드, 파라미터 매핑, 응답 매핑 -->

> 📝 코드 예시: `APP_MIGRATION_CODE.md` #37 참조

### 12-2. API #38. get_payment_request_by_id.php → RPC `app_get_reservation_detail`

<!-- 참조: APP_MIGRATION_CODE.md #38 -->

### 12-3. PaymentRequestType 변경 요약

<!-- TODO: 기존 PaymentRequestType vs 전환 후 ReservationType 비교표 -->

---

## 13. 리뷰/정산/교육 RPC

> **작성 라운드**: 3-3 / R3
> **관련 API**: #41, #44, #44b, #61 (4개, #16은 3장 반려동물 CRUD에 배치)
> **RPC 함수**: `app_get_settlement_summary`, `app_get_guardian_reviews`, `app_get_kindergarten_reviews`, `app_get_education_with_progress`

### 13-1. API #41. get_settlement.php → RPC `app_get_settlement_summary`

<!-- TODO: 2개 PHP (get_settlement + get_settlement_list) → 단일 RPC 통합 설명 -->
<!-- 참조: APP_MIGRATION_CODE.md #41 -->

### 13-2. API #44. get_review.php (type=pet) → RPC `app_get_guardian_reviews`

<!-- 참조: APP_MIGRATION_CODE.md #44 -->

### 13-3. API #44b. get_review.php (type=partner) → RPC `app_get_kindergarten_reviews`

<!-- 참조: APP_MIGRATION_CODE.md #44b -->

### 13-4. API #61. get_education.php → RPC `app_get_education_with_progress`

<!-- 참조: APP_MIGRATION_CODE.md #61 -->

---

## 14. 채팅 전환 (WebSocket → Realtime)

> **작성 라운드**: 3-4 / R4
> **관련 API**: #22~#30 (9개)
> **핵심 변경**: WebSocket (`react-use-websocket`) → Supabase Realtime (`supabase.channel()`)
> **관련 파일**: `hooks/useChat.ts` (대규모 리팩터링), `components/ChatMessage.tsx`

### 14-1. 현재 채팅 아키텍처 vs 전환 후 아키텍처

<!-- TODO: WebSocket 기반 흐름 다이어그램 -->
<!-- TODO: Supabase Realtime 기반 흐름 다이어그램 -->

### 14-2. useChat.ts 리팩터링 가이드

<!-- TODO: 기존 useChat 구조 분석 → 전환 후 구조 설계 -->
<!-- TODO: Supabase Realtime subscription 패턴 -->

### 14-3. API #22. chat.php → create_room → RPC

<!-- 참조: APP_MIGRATION_CODE.md #22 -->

### 14-4. API #23. chat.php → get_rooms → RPC

<!-- 참조: APP_MIGRATION_CODE.md #23 -->

### 14-5. API #25. chat.php → send_message → Edge Function `send-chat-message`

<!-- 참조: APP_MIGRATION_CODE.md #25 -->

### 14-6. Realtime 구독 패턴 (메시지 수신)

<!-- TODO: supabase.channel() 구독 코드, onPostgresChanges vs broadcast -->

### 14-7. 이미지/파일 전송 (Storage 연동)

<!-- TODO: Storage 업로드 → chat_messages.image_urls 패턴 -->

### 14-8. 읽음 처리 / 미읽음 카운트

<!-- TODO: last_read_message_id UPDATE, unread_count 계산 -->

---

## 15. 결제/예약 전환

> **작성 라운드**: 3-5 / R5
> **관련 API**: #34~#39 (6개)
> **핵심 변경**: PHP 콜백 → Edge Function, WebView 콜백 URL 변경
> **관련 파일**: `app/payment/inicisPayment.tsx`, `app/payment/inicisApproval.tsx`, `app/payment/request.tsx`

### 15-1. 현재 결제 흐름 vs 전환 후 흐름

<!-- TODO: 현재 흐름 (WebView → PHP callback → DB) -->
<!-- TODO: 전환 후 흐름 (WebView → Edge Function callback → DB) -->

### 15-2. API #34. inicis_payment.php → Edge Function `inicis-callback`

<!-- 참조: APP_MIGRATION_CODE.md #34 -->

### 15-3. API #35. set_inicis_approval.php → Edge Function (inicis-callback 내부)

<!-- 참조: APP_MIGRATION_CODE.md #35 -->

### 15-4. API #36. set_payment_request.php → Edge Function `create-reservation`

<!-- 참조: APP_MIGRATION_CODE.md #36 -->

### 15-5. API #39. set_care_complete.php → Edge Function `complete-care`

<!-- 참조: APP_MIGRATION_CODE.md #39 -->

### 15-6. WebView 콜백 URL 변경

<!-- TODO: INICIS_PAYMENT_URL 변경, 콜백 URL을 Edge Function 엔드포인트로 교체 -->

### 15-7. 테스트 MID / 상용 MID 전환

<!-- TODO: INIpayTest → wooyoope79 전환 가이드 -->

---

## 16. Edge Function 인터페이스 가이드

> **작성 라운드**: 3-5 / R5
> **관련 Edge Function**: 7개
> **핵심**: `supabase.functions.invoke()` 호출 규격 정의 (입력/출력 스펙만, 구현은 Step 4)

### 16-1. Edge Function 호출 공통 패턴

```typescript
// 공통 호출 패턴
const { data, error } = await supabase.functions.invoke('function-name', {
  body: { key: value },
})
```

### 16-2. inicis-callback (결제 콜백)

<!-- TODO: 입력 스펙, 출력 스펙, 호출 시점, 에러 처리 -->
<!-- 이 함수는 PG사가 직접 호출 → 앱에서 직접 호출하지 않음. WebView 콜백 URL만 변경 -->

### 16-3. send-chat-message (채팅 메시지 전송)

<!-- TODO: 입력 (room_id, content, message_type, file?), 출력, 에러 -->

### 16-4. create-reservation (예약 생성)

<!-- TODO: 입력 (kindergarten_id, pet_id, dates, price, payment_id, room_id?), 출력, 에러 -->

### 16-5. complete-care (돌봄 완료)

<!-- TODO: 입력 (reservation_id), 출력, 에러 -->

### 16-6. send-alimtalk (카카오 알림톡)

<!-- TODO: 입력 (phone, template_code, variables), 출력, 에러 -->

### 16-7. send-push (FCM 푸시)

<!-- TODO: 입력 (member_id/member_ids, title, body, data?), 출력, 에러 -->
<!-- 이 함수는 다른 Edge Function에서 내부 호출 → 앱에서 직접 호출하지 않음 -->

### 16-8. API #66. scheduler.php → Edge Function `scheduler`

<!-- TODO: pg_cron 또는 외부 cron 트리거 → 앱에서 직접 호출하지 않음 -->

---

## 부록 A. 타입 정의 변경 총정리

> 기존 `types/` 디렉토리의 인터페이스 변경 요약

### A-1. UserType 변경

<!-- TODO: 기존 vs 전환 후 필드 비교표 -->

### A-2. PetType / PetFormType 변경

<!-- TODO: wr_* 필드 → 정규 컬럼명 매핑 -->

### A-3. PartnerType / KindergartenType 변경

<!-- TODO: partner → kindergarten 용어 변환 + 필드 매핑 -->

### A-4. PaymentRequestType → ReservationType 변경

<!-- TODO: payment_request → reservation 용어 변환 -->

### A-5. ChatRoomType / MessageType 변경

<!-- TODO: WebSocket 메시지 → Supabase Realtime 메시지 형식 -->

### A-6. SettlementType 변경

<!-- TODO: RPC 응답에 맞춘 구조 변경 -->

### A-7. ReviewType 변경

<!-- TODO: 태그 구조 변경 -->

---

## 부록 B. 환경 변수 / 패키지 체크리스트

### B-1. 환경 변수 (.env)

| 변수 | 기존 | 전환 후 | 비고 |
|------|------|--------|------|
| `EXPO_PUBLIC_API_URL` | `https://woo1020.iwinv.net` | 삭제 | apiClient 삭제 시 |
| `EXPO_PUBLIC_WEBSOCKET_URL` | `wss://wooyoopet.store/ws` | 삭제 | Supabase Realtime 사용 |
| `EXPO_PUBLIC_SUPABASE_URL` | — | 추가 | Supabase 프로젝트 URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | — | 추가 | Supabase anon key |

### B-2. 패키지 변경

| 패키지 | 변경 | 비고 |
|--------|------|------|
| `@supabase/supabase-js` | 추가 | 핵심 의존성 |
| `react-native-url-polyfill` | 추가 | Supabase JS 필수 |
| `react-use-websocket` | 제거 (전환 완료 후) | Supabase Realtime으로 대체 |
| `@tosspayments/widget-sdk-react-native` | 제거 | 미사용 확인 |

### B-3. 전환 완료 후 삭제 파일

| 파일 | 이유 |
|------|------|
| `utils/apiClient.ts` | Supabase JS로 완전 대체 |
| `tossPay/` 디렉토리 | 미사용 |
| `app/payment/tossPay.tsx` | 미사용 |

---

## 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-04-17 | 초안 — 문서 구조, 규칙, 목차, 섹션 플레이스홀더 확정 |
| 2026-04-17 | 리뷰 반영 — Issue 1~4 (16-8 번호 명시, 9장/10장 API 재배치, 13장 #16 제거, 12장 #5b 명확화) + R1~R3,R5,R6 (쿼리 규칙, 응답 매핑 규칙, 문서 역할 분담, MMKV 어댑터, 코드 블록 렌더링) |
| 2026-04-17 | **R1 본문 작성** — §1 인증 전환 (1-1~1-6: 인증 흐름 다이어그램, API #1~#3 설명, userAtom 변경, 영향 범위) + §2 apiClient 교체 (2-1~2-5: 5패턴 비교, 점진적 전환, 에러 처리, 삭제 체크리스트) |
| 2026-04-17 | **R1 리뷰 반영 (Issue 2~8)** — §2-2 Auth API 수량 보충 설명 추가(Issue 2), §0-5 Phase A에 #4 RPC 예외 주석 추가(Issue 8). CODE.md의 Issue 3~6은 해당 문서 변경 이력 참조 |
| 2026-04-17 | **R2 본문 작성** — §3 반려동물 CRUD (아키텍처 변경, PetType 매핑표, 8개 API 설명), §4 즐겨찾기 (UPSERT+is_favorite 패턴), §5 알림/FCM (구조 요약), §6 콘텐츠 (공개 읽기 패턴, .single() 주의), §7 차단 (토글 패턴), §8 채팅 템플릿 (chat_templates 통합 구조, 4개 CRUD), §9 주소/프로필/회원 (#21 유치원 프로필 — 가격 구조 변경, Storage), §10 기타 자동 API (채팅 자동 5개, 돌봄/정산/리뷰 4개, 기타 4개 — 임베디드 JOIN, 중복 체크 패턴) |
| 2026-04-17 | **R2 리뷰 반영 (Issue 1~3)** — Issue 1: §9-3 가격 컬럼명 12개 정확 기재 (소형/중형/대형 × 1h/24h/walk/pickup), Issue 2: CODE #11 RLS 안내 정비 (본인 전용 + RPC 안내), Issue 3: CODE #10 inner JOIN → 별도 조회 교정 |
