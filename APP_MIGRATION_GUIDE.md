# 우유펫 모바일 앱 API 전환 가이드

> **작성일**: 2026-04-17
> **최종 업데이트**: 2026-04-21 (create-reservation kindergarten_id 매핑 오류 수정 반영, 부록 A-8 PendingCareRequestType 추가)
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
| **상태 관리** | Jotai atom + AsyncStorage (MMKV에서 전환) | `states/userAtom.ts` |
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
import AsyncStorage from '@react-native-async-storage/async-storage'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!

// AsyncStorage를 Supabase Auth storage로 직접 사용
// AsyncStorage는 getItem/setItem/removeItem 인터페이스를 이미 지원하므로
// 별도 어댑터 없이 바로 전달 가능하다.
// ※ 기존 앱의 MMKV(react-native-mmkv)는 Expo Go 환경에서
//   JSI/TurboModules 미지원으로 빌드 오류가 발생하여 AsyncStorage로 전환함.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,         // AsyncStorage 직접 사용 (어댑터 불필요)
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,     // React Native에서는 false
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
  → 1장 인증 + 3장~10장 자동 API (43개, #60 제외)
  → apiClient.ts 와 supabase.ts 공존 가능 (점진적 전환)
  → ※ #4 set_member_leave.php는 RPC(app_withdraw_member)이지만
       인증 흐름과 밀접하므로 Phase A에서 함께 전환 권장

Phase B: RPC 조회 (Step 2.5 함수 + Step 4 추가 RPC)
  → 11장 유치원/보호자 + 12장 예약 조회 + 13장 리뷰/정산/교육 + 7장 #60 차단 목록 (15개 RPC)
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
| 4 | 즐겨찾기 CRUD | 3-2 / R2 (CODE: R6 ✅) | 4개 (#46~#49) | ✅ 완료 |
| 5 | 알림/FCM | 3-2 / R2 (CODE: R6 ✅) | 3개 (#50~#52) | ✅ 완료 |
| 6 | 콘텐츠 조회 | 3-2 / R2 (CODE: R6 ✅) | 5개 (#53~#57) | ✅ 완료 |
| 7 | 차단/신고 | 3-2 / R2 (CODE: R6 ✅, R6 리뷰: #60 RPC 전환) | 3개 (#58~#60) | ✅ 완료 |
| 8 | 채팅 템플릿 | 3-2 / R2 | 4개 (#30~#33) | ✅ 완료 |
| 9 | 주소 인증 / 프로필 / 회원 관리 | 3-2 / R2 | 6개 (#4~#8, #21) | ✅ 완료 |
| 10 | 기타 자동 API | 3-2 / R2 | 12개 (#24, #26~#29, #40, #42~#43, #45, #62~#65) | ✅ 완료 |
| 11 | 유치원/보호자 RPC | 3-3 / R3 | 4개 (#17~#20) | ✅ 완료 |
| 12 | 예약 조회 RPC | 3-3 / R3 | 2개 (#37, #38) | ✅ 완료 |
| 13 | 리뷰/정산/교육 RPC | 3-3 / R3 | 4개 (#41, #44, #44b, #61) | ✅ 완료 |
| 14 | 채팅 전환 (WebSocket → Realtime) | 3-4 / R4 | 9개 (#22~#30) | ✅ 완료 |
| 15 | 결제/예약 전환 | 3-5 / R5 | 4개 (#34~#36, #39) | ✅ 완료 |
| 16 | Edge Function 인터페이스 | 3-5 / R5 | 7개 (#25, #34~#36, #39, #1, #66) | ✅ 완료 |
| A | 부록: 타입 정의 변경 총정리 | 3-6 / R6 | — | ✅ 완료 |
| B | 부록: 환경 변수 / 패키지 체크리스트 | 3-6 / R6 | — | ✅ 완료 |

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
│          │ ←────────────── │ {"result":"Y"}   │  → userAtom에 mb_id(폰번호) 저장 (AsyncStorage)
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
│          │                    │                            │     AsyncStorage에 자동 저장
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

전환 후에는 **Supabase Auth 세션이 AsyncStorage에 자동 저장**됩니다 (§0-4 참조).

> ⚠️ **MMKV → AsyncStorage 전환 필요**: 기존 앱의 `react-native-mmkv`(v4.x)는 JSI/TurboModules를 필수로 요구하여 Expo Go 시뮬레이터에서 빌드 오류가 발생합니다. 따라서 영구 저장소를 `@react-native-async-storage/async-storage`(이미 package.json에 설치됨)로 교체합니다. 변경 대상 파일은 `storage/mmkvStorage.ts`, `states/userAtom.ts`, `states/fcmTokenAtom.ts`, `states/notificationConfigAtom.ts` 총 4개이며, 나머지 175개 소스 파일은 수정 불필요합니다.

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
- 기존에는 MMKV에 직접 `mb_id`를 저장/복원했으나, 전환 후에는 Supabase Auth 세션이 AsyncStorage를 통해 자동 관리됨

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
| 앱 재시작 | MMKV에서 mb_id 복원 | AsyncStorage에서 세션 자동 복원 | **자동** |

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

- [ ] **Phase A**: 인증 (#1~#3) + 단순 CRUD (#4~#16, #21, #24~#33, #40, #42~#43, #45~#59, #62~#65) 전환 완료
- [ ] **Phase B**: RPC (#17~#20, #37~#38, #41, #44, #44b, #60, #61) 전환 완료
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

> 📝 코드 예시: `APP_MIGRATION_CODE.md` #46~#49 참조

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

> 📝 코드 예시: `APP_MIGRATION_CODE.md` #50~#52 참조

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
| #53 | `get_banner.php` | `banners SELECT WHERE visibility='노출중'` | 정렬: `display_order` |
| #54 | `get_notice.php` | `notices SELECT WHERE visibility='공개'` | 최신순, 페이지네이션 |
| #55 | `get_notice_detail.php` | `notices SELECT WHERE id=? .single()` | **`.single()` 필수** (단건 조회) |
| #56 | `get_faq.php` | `faqs SELECT` | 검색: `.ilike('question', '%keyword%')` |
| #57 | `get_policy.php` | `terms SELECT WHERE category=?` | 카테고리 필터 |

**주의**: 단건 조회(#55)에서는 반드시 `.single()`을 사용해야 합니다. 빠뜨리면 배열(`[]`)로 반환되어 앱에서 `data.title` 등 접근 시 크래시가 발생합니다.

> 📝 코드 예시: `APP_MIGRATION_CODE.md` #53~#57 참조

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
| #60 | `get_blocked_list.php` | ~~`member_blocks SELECT + members JOIN`~~ → **RPC `app_get_blocked_list`** | ⚠️ RLS 제약으로 임베디드 JOIN 불가 → RPC 전환 필수 |

**차단 토글 패턴** (#58): 차단 상태를 먼저 확인 → 이미 차단이면 DELETE(해제), 미차단이면 INSERT(차단). 또는 앱 UI에서 차단/해제 버튼을 분리하여 각각 호출합니다.

### 7-2. #60 RLS 제약 및 RPC 전환 방향

> ⚠️ **`members` 테이블 RLS 제약**: `members_select_app` 정책은 `id = auth.uid()` 본인 행만 SELECT를 허용합니다.
> 차단 목록에서 `blocked:members!blocked_id(id, nickname, profile_image)` 임베디드 JOIN을 사용하면,
> 차단 대상(타인)의 `members` 행에 RLS가 접근을 차단하여 `blocked` 필드가 **항상 `null`**로 반환됩니다.

**해결 방안**: 기존 #17, #19, #23, #41과 동일한 패턴으로 **`app_get_blocked_list` RPC** 신규 추가.

- **SECURITY DEFINER** + **`internal.members_public_profile` VIEW** 사용
- RPC 내부에서 `auth.uid()`를 수동 검증하여 `blocker_id` 필터
- `members_public_profile` VIEW는 공개 필드(nickname, profile_image 등)만 포함하며, 금융 정보·주소 상세 등 민감 정보는 제외
- **구현 시점**: Step 4 (Edge Functions + 추가 RPC) — `RPC_PHP_MAPPING.md` #15, `MIGRATION_PLAN.md` 4-10 참조
- **예상 호출**: `supabase.rpc('app_get_blocked_list')` → `{ blocked_id, nickname, profile_image, blocked_at }[]`

> 📝 코드 예시: `APP_MIGRATION_CODE.md` #58~#60 참조

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
| #62 | `set_solved.php` | `education_completions UPSERT` | 유치원 단위 1행 — `topic_details` JSONB 배열에 주제 추가 후 UPSERT (`onConflict: 'kindergarten_id'`) |
| #63 | `get_bank_list.php` | `banks SELECT WHERE use_yn=true` | 마스터 데이터 조회 (인증 불필요). DDL 컬럼명: `use_yn` (boolean) |
| #64 | `get_favorite_animal_list.php` | `favorite_pets SELECT + pets JOIN` | **임베디드 JOIN** — `pet:pets(...)` |
| #65 | `get_favorite_partner_list.php` | `favorite_kindergartens SELECT + kindergartens JOIN` | **임베디드 JOIN** — `kindergarten:kindergartens(...)` |

**임베디드 JOIN 패턴** (#64, #65): Supabase PostgREST는 FK 관계가 있는 테이블을 `.select()` 안에서 중첩 조회할 수 있습니다. `favorite_pets.pet:pets(id, name, breed, ...)` 구문으로 별도 쿼리 없이 반려동물 정보를 함께 가져옵니다. 응답은 `data[].pet.name` 형태의 중첩 객체입니다.

**교육 이수 저장 구조** (#62): `education_completions`는 **유치원 단위 1행** 구조입니다 (`member_id`, `topic_id` 컬럼 없음). 개별 주제 이수 상태는 `topic_details` JSONB 배열(`[{ topic_id, completed_at }, ...]`)로 관리됩니다. 이수 저장 시 현재 JSONB를 읽어 → 주제 추가 → `completed_topics`/`progress_rate`/`completion_status` 재계산 → `upsert({ ... }, { onConflict: 'kindergarten_id' })` 패턴을 사용합니다. 중복 이수 방지는 JSONB 배열 내 `topic_id` 일치 여부를 앱에서 체크합니다.

> 📝 코드 예시: `APP_MIGRATION_CODE.md` #62, #63, #64, #65 참조

---

## 11. 유치원/보호자 RPC

> **작성 라운드**: 3-3 / R3
> **관련 API**: #17~#20 (4개)
> **RPC 함수**: `app_get_kindergarten_detail`, `app_get_kindergartens`, `app_get_guardian_detail`, `app_get_guardians`
> **관련 파일**: `hooks/useKinderGarten.ts`, `utils/fetchPartnerList.ts`, `hooks/useProtector.ts`, `utils/fetchProtectorList.ts`

### 11-1. 아키텍처 변경 요약

**기존**: `apiClient.get('api/get_partner.php', { mb_id, user_id })` → PHP에서 `g5_write_partner` + `g5_member` + `g5_write_animal` + `settlement_info` + `g5_favorite_partner` 5개 테이블을 N+1 쿼리로 조회, 이미지 URL을 `while` 루프로 절대경로 변환.

**전환 후**: `supabase.rpc('app_get_kindergarten_detail', { p_kindergarten_id })` → 단일 RPC 내부에서 CTE + LEFT JOIN 통합 쿼리. `internal` VIEW로 RLS 제약을 안전하게 우회하여 타인(운영자/보호자) 프로필을 공개 필드만 조회.

**핵심 변경 4가지**:
1. **파라미터 방식**: `mb_id`(폰번호) 파라미터 → `p_kindergarten_id`(UUID) + `auth.uid()` 자동 추출. 기존에는 `user_id`를 파라미터로 받아 찜 여부를 판단했으나, 전환 후에는 `auth.uid()`를 RPC 내부에서 직접 사용하여 보안 강화
2. **응답 구조**: `{ partner: {...}, animals: [...] }` → `{ kindergarten: {...}, operator: {...}, resident_pets: [...], review_count, inicis_status, is_favorite }` — 중첩 구조가 의미별로 분리됨
3. **RLS + internal VIEW**: `members`, `pets`, `settlement_infos` 테이블은 RLS가 본인 데이터만 허용하므로, 타인 데이터 조회 시 `internal.members_public_profile`, `internal.pets_public_info`, `internal.settlement_infos_public` VIEW를 사용. 금융 정보(은행명/계좌번호), 호수(`address_building_ho`), 노쇼 카운트 등은 VIEW에서 제외되어 비노출
4. **보호자/유치원 비대칭**: 유치원 상세(#17)에는 가격·정산·리뷰수가 포함되지만, 보호자 상세(#19)에는 이들이 없고 반려동물별 찜 여부가 포함됨. 목록(#18, #20)도 반환 필드가 완전히 다름

### 11-2. API #17. get_partner.php → RPC `app_get_kindergarten_detail`

**전환 방식**: RPC | **난이도**: 중

유치원 상세 화면에서 호출하는 통합 조회 API입니다. 기존 PHP는 유치원 정보 + 운영자 정보 + 반려동물 목록 + 찜 여부를 N+1 쿼리(1+3회)로 가져왔으나, RPC는 단일 호출로 모든 데이터를 반환합니다.

**주요 변경점**:
- **파라미터**: `mb_id`(운영자 폰번호) + `user_id`(조회자 폰번호) → `p_kindergarten_id`(유치원 UUID). `user_id`는 `auth.uid()`가 대체
- **가격 구조**: PHP `wr_2`(파이프 문자열 `'10000|12000|...'`) → RPC `prices` 중첩 객체 (`{ small: { 1h, 24h, walk, pickup }, medium: {...}, large: {...} }`)
- **리뷰 수**: PHP `partner_rCnt: '0'` (하드코딩) → RPC `review_count` (실제 COUNT 집계)
- **신선도**: PHP `partner_freshness: 100` (하드코딩) → RPC `freshness_current` (실제값)
- **금융 정보**: PHP에서 `partner_bank_name`/`partner_account` 노출 → RPC에서 **제외** (금융정보 비노출 원칙)
- **호수**: PHP에서 `partner_ho` 노출 → RPC에서 **제외** (호수 비공개 정책, 1층/로비 원칙)

> 📝 코드 예시: `APP_MIGRATION_CODE.md` #17 참조

### 11-3. API #18. get_partner_list.php → RPC `app_get_kindergartens`

**전환 방식**: RPC | **난이도**: 중

유치원 지도/목록 화면에서 호출합니다. 기존 PHP는 **전체 유치원을 페이지네이션 없이 한 번에 반환**했으나, RPC는 `p_limit` safety cap(기본 100, 최대 200)으로 최대 건수를 제한하고 **Haversine 거리순 정렬**을 추가합니다.

**주요 변경점**:
- **파라미터**: `mb_id`(조회자 폰번호) → `p_latitude`, `p_longitude`(거리 계산용), `p_limit`(최대 건수). 좌표 미제공 시 최신순(id DESC)
- **필터**: PHP `settlement_info.status='active'` JOIN → RPC `kindergartens.inicis_status='등록완료'` 직접 필터 + `registration_status='registered'` 추가 (임시저장 유치원 제외)
- **가격**: 목록에서는 소형 2개(`price_small_1h`, `price_small_24h`)만 반환 (12개 전체는 상세에서)
- **거리 계산**: PHP에서 미구현 → RPC에서 Haversine 공식으로 `distance_km` 계산, 거리순 정렬
- **0건 처리**: 빈 배열 반환 (에러 아님)

> 📝 코드 예시: `APP_MIGRATION_CODE.md` #18 참조

### 11-4. API #19. get_protector.php → RPC `app_get_guardian_detail`

**전환 방식**: RPC | **난이도**: 중

보호자 상세 화면에서 호출합니다. **PHP 소스가 존재하지 않아** `get_partner.php`(유치원 상세)의 대칭 구조로 역추론하여 설계했으며, 외주개발자 확인 완료(2026-04-17).

**유치원 상세(#17)와의 차이점**:
- `prices`, `inicis_status`, `business_status`, `freshness_*` 제외 (유치원 전용 속성)
- `address_road` 제외 (보호자 상세 주소는 개인정보 → `address_complex` + `address_building_dong` 수준만 노출)
- `review_count` 제외 (앱 화면에 보호자 단위 리뷰 UI 없음. 반려동물별 리뷰는 #44b `app_get_kindergarten_reviews` 참조)
- **찜은 보호자 단위가 아닌 반려동물 단위**: `pets[]` 배열 내부에 `is_favorite` 개별 포함 (유치원 운영자가 해당 반려동물을 찜했는지)

> 📝 코드 예시: `APP_MIGRATION_CODE.md` #19 참조

### 11-5. API #20. get_protector_list.php → RPC `app_get_guardians`

**전환 방식**: RPC | **난이도**: 중

보호자 목록 화면에서 호출합니다. #19와 마찬가지로 PHP 소스 미존재, `get_partner_list.php`의 대칭 구조로 역추론.

**유치원 목록(#18)과의 차이점**:
- 필터: `inicis_status`/`registration_status` → `current_mode='보호자'` + `status='정상'`
- 가격 정보, 리뷰 수, 찜 여부: 모두 제외 (보호자 목록 카드에 해당 UI 없음)
- `pet_thumbnails` 추가: 각 보호자의 반려동물 첫 번째 사진 배열 (`[{ id, name, thumbnail }]`)
- `distance_km`: CTE 내부에서 정렬 용도로만 계산, **반환하지 않음**

> 📝 코드 예시: `APP_MIGRATION_CODE.md` #20 참조

### 11-6. 유치원/보호자 타입 변경 요약

**KindergartenDetailType** (RPC #17 응답):

| PHP 응답 필드 | Supabase 응답 필드 | 타입 변경 | 비고 |
|---|---|---|---|
| `partner.wr_id` | `data.kindergarten.id` | `number` → `string` (UUID) | PK |
| `partner.wr_subject` | `data.kindergarten.name` | — | |
| `partner.wr_content` | `data.kindergarten.description` | — | |
| `partner.wr_2` (파이프 문자열) | `data.kindergarten.prices.small.1h` 등 12개 | `string` → `number` × 12 | 구조 변경 |
| `partner.partner_img1~10` (개별) | `data.kindergarten.photo_urls` (배열) | 10× `string` → `string[]` | |
| `partner.partner_freshness` (`100` 하드코딩) | `data.kindergarten.freshness_current` | — | 실제값 |
| `partner.partner_rCnt` (`'0'` 하드코딩) | `data.review_count` | `string` → `number` | 실제값 |
| `partner.is_favorite` | `data.is_favorite` | `string` → `boolean` | |
| `partner.settlement_ready` | `data.inicis_status` | `'0'`/`'1'` → `'미등록'`/`'등록완료'` 등 | |
| `animals[]` | `data.resident_pets[]` | — | 키 이름 변경 |
| — | `data.operator` | — (신규) | 운영자 프로필 (닉네임, 이미지) |

**GuardianDetailType** (RPC #19 응답):

| PHP 응답 필드 (추정) | Supabase 응답 필드 | 비고 |
|---|---|---|
| `protector.mb_id` | `data.guardian.id` (UUID) | PK |
| `protector.mb_nick` | `data.guardian.nickname` | |
| `protector.mb_profile1` | `data.guardian.profile_image` | 파일명 → 전체 URL |
| `protector.mb_4` | `data.guardian.address_complex` | 단지명 |
| `protector.mb_dong` | `data.guardian.address_building_dong` | 동 |
| `animals[].is_favorite` | `data.pets[].is_favorite` | 반려동물별 찜 |

---

## 12. 예약 조회 RPC

> **작성 라운드**: 3-3 / R3
> **관련 API**: #37, #38 (2개, 목록 + 상세)
> **RPC 함수**: `app_get_reservations_guardian`, `app_get_reservations_kindergarten`, `app_get_reservation_detail`
> **관련 파일**: `hooks/usePaymentRequestList.ts`, `hooks/usePaymentRequest.ts`

### 12-1. 아키텍처 변경 요약

**기존**: `apiClient.get('api/get_payment_request.php', { mb_id, to_mb_id, pet_id, page })` → PHP에서 예약 1건당 N+1 쿼리 3회(반려동물, 유치원, 회원) 추가 조회. `total: 0` 하드코딩(구현 누락). `mb_id`/`to_mb_id` 파라미터로 타인 예약 조회 가능(보안 구멍).

**전환 후**: 보호자/유치원 시점에 따라 **2개 RPC로 분리**.
- **보호자**: `supabase.rpc('app_get_reservations_guardian', { ... })` — 상대방 = 유치원 → `kindergarten` 키로 반환
- **유치원**: `supabase.rpc('app_get_reservations_kindergarten', { ... })` — 상대방 = 보호자 → `member` 키로 반환

**분리 이유**: 보호자와 유치원의 반환 데이터가 완전히 다릅니다. 보호자에게는 유치원 정보(이름, 주소, 사진)가, 유치원에게는 보호자 정보(닉네임, 프로필)가 필요합니다. TypeScript에서 union type 분기 캐스팅 없이 깔끔한 타입 정의가 가능합니다.

**핵심 변경 3가지**:
1. **N+1 쿼리 제거**: PHP에서 50건 조회 시 150회 추가 쿼리 → RPC 내부 CTE + LEFT JOIN 단일 쿼리
2. **결제 정보 분리**: PHP `payment_request.price` 직접 필드 → Supabase `payments` LATERAL JOIN 최신 1건
3. **후기 작성 여부**: PHP `is_review_written` 컬럼 → Supabase `guardian_reviews` EXISTS 서브쿼리 (리뷰 테이블로 판단)

### 12-2. API #37. get_payment_request.php → RPC `app_get_reservations_guardian` / `app_get_reservations_kindergarten`

**전환 방식**: RPC (2개 분리) | **난이도**: 중

앱에서 `current_mode`(보호자/유치원)에 따라 호출할 RPC를 분기합니다.

| 모드 | 기존 파라미터 | 전환 후 RPC | 상대방 키 |
|------|-------------|-----------|----------|
| 보호자 (`current_mode='보호자'`) | `mb_id=내폰번호` | `app_get_reservations_guardian` | `kindergarten` |
| 유치원 (`current_mode='유치원'`) | `to_mb_id=내폰번호` | `app_get_reservations_kindergarten` | `member` |

**공통 파라미터**: `p_status` (상태 필터, NULL=전체), `p_pet_id` (반려동물 필터), `p_page`, `p_per_page` (최대 50)

**주요 변경점**:
- `mb_id`/`to_mb_id` 파라미터 제거 → `auth.uid()`로 자동 식별 (RLS 연동)
- `total: 0` 하드코딩 → 실제 COUNT 반환
- 보호자용: `kindergarten` 키에 유치원 이름/주소/사진 포함
- 유치원용: 내 유치원 ID를 자동 조회 (`kindergartens WHERE member_id = auth.uid()`)하여 해당 유치원에 온 예약만 필터
- 결제 정보: `payment` 키로 LATERAL JOIN 최신 1건 (금액, 상태, 결제수단, 결제일시)

> 📝 코드 예시: `APP_MIGRATION_CODE.md` #37 참조

### 12-3. API #38. get_payment_request_by_id.php → RPC `app_get_reservation_detail`

**전환 방식**: RPC | **난이도**: 중

예약 상세 화면에서 호출합니다. 보호자/유치원 **통합 함수**로, RLS가 당사자 여부를 자동 판별합니다 (비당사자는 NULL 반환 = 접근 거부).

**목록(#37)과의 차이점**:
- 결제 확장: `approval_number`, `card_number`, `card_company`, `pg_transaction_id` 추가
- 환불 정보: `refund` 키 추가 (`penalty_amount`, `refund_amount`, `status`, `completed_at`, `cancel_reason`)
- 예약 확장: `reject_detail`, `rejected_at`, `requested_at`, `guardian_checkout_confirmed`, `kg_checkout_confirmed`, `*_confirmed_at` 추가
- 보호자/유치원 공통: 양쪽 모두 `pet`, `kindergarten`, `member`, `payment`, `refund` 키가 동일하게 반환됨

> 📝 코드 예시: `APP_MIGRATION_CODE.md` #38 참조

### 12-4. PaymentRequestType → ReservationType 변경 요약

| 기존 필드 (PHP 응답) | 전환 후 필드 (RPC 응답) | 타입 변경 | 비고 |
|---|---|---|---|
| `id` (정수) | `data.reservation.id` (UUID) | `number` → `string` | PK |
| `mb_id` (폰번호) | — (auth.uid() 자동) | — | 파라미터 제거 |
| `to_mb_id` (폰번호) | — (RPC 분리) | — | 보호자/유치원 RPC 분리로 불필요 |
| `start_date` + `start_time` (문자열 2개) | `data.reservation.checkin_scheduled` | `string×2` → `timestamptz` | 2개→1개 통합 |
| `end_date` + `end_time` (문자열 2개) | `data.reservation.checkout_scheduled` | `string×2` → `timestamptz` | 2개→1개 통합 |
| `price` (예약 컬럼) | `data.payment.amount` (결제 테이블) | — | 테이블 분리 |
| `penalty` (예약 컬럼) | `data.refund.penalty_amount` (환불 테이블) | — | 테이블 분리 |
| `is_review_written` (컬럼) | `data.reservation.is_review_written` (서브쿼리) | — | EXISTS로 판단 |
| `status` | `data.reservation.status` | — | 값 동일 (수락대기/예약확정/돌봄진행중/돌봄완료 등) |
| `data.meta.total: 0` (하드코딩) | `data.meta.total` (실제 COUNT) | — | 버그 수정 |

---

## 13. 리뷰/정산/교육 RPC

> **작성 라운드**: 3-3 / R3
> **관련 API**: #41, #44, #44b, #61 (4개)
> **RPC 함수**: `app_get_settlement_summary`, `app_get_guardian_reviews`, `app_get_kindergarten_reviews`, `app_get_education_with_progress`

### 13-1. API #41. get_settlement.php + get_settlement_list.php → RPC `app_get_settlement_summary`

**전환 방식**: RPC | **난이도**: 중

기존 PHP에서는 **2개 파일**이 정산 기능을 담당했습니다:
- `get_settlement.php`: 누적 집계(정산완료/예정/보류) + 기간별 상세
- `get_settlement_list.php`: 월별 집계 + 세부 명세

전환 후에는 **단일 RPC** `app_get_settlement_summary`로 통합됩니다. 유치원 운영자 전용 함수로, `auth.uid()`에서 본인 유치원을 자동 조회합니다.

**응답 4-파트 구조**:

| 파트 | 설명 | 기간 필터 적용 |
|------|------|-------------|
| `summary` | 전체 기간 누적 — 정산완료/예정/보류 금액 | ❌ (항상 전체) |
| `next_settlement` | 가장 가까운 미래 정산예정 — 금액 + 계좌정보 | ❌ |
| `period_summary` | 기간 필터 적용 — 정산수익/결제합계/수수료 합산 | ✅ |
| `details` | 기간 필터 + 페이지네이션 — 건별 상세 + 보호자 정보 | ✅ |

**파라미터**: `p_start_date` (YYYY-MM-DD), `p_end_date`, `p_page`, `p_per_page` (최대 50). 날짜 미지정 시 전체 기간.

**주요 변경점**:
- `mb_id` 파라미터 제거 → `auth.uid()` → 본인 유치원 자동 조회 (유치원 미등록 시 에러 반환)
- 2개 PHP → 1개 RPC 통합 (앱에서 2번 호출 → 1번 호출)
- 날짜 형식 검증: `YYYY-MM-DD` 정규식 (`!~ '^\d{4}-\d{2}-\d{2}$'`) — 잘못된 형식 시 에러 반환
- `details[]` 내 보호자 정보: `internal.members_public_profile` VIEW 사용 (주소 비대칭 정책 — `address_complex`만 노출)

> 📝 코드 예시: `APP_MIGRATION_CODE.md` #41 참조

### 13-2. API #44. get_review.php (type=pet) → RPC `app_get_guardian_reviews`

**전환 방식**: RPC | **난이도**: 중

유치원 상세 화면의 **보호자→유치원 후기 목록**입니다. 기존 PHP는 `get_review.php`에서 `type='pet'` 파라미터로 분기했으나, Supabase에서는 `guardian_reviews` 전용 RPC로 분리됩니다.

**태그 집계 구조**:
RPC는 7개 긍정 태그별 COUNT를 `tags[]` 배열로 반환합니다:
1. 상담이 친절하고 편안했어요
2. 사진과 영상을 자주 보내주셨어요
3. 아이 상태를 자세히 알려주셨어요
4. 아이 컨디션 변화에 빠르게 대응해 주셨어요
5. 시설이 깨끗하고 관리가 잘 되어있어요
6. 예약한 돌봄 일정을 잘 지켜주셨어요
7. 다음에도 맡기고 싶어요

**파라미터**: `p_kindergarten_id` (필수), `p_page`, `p_per_page` (최대 50)

**응답 구조**: `{ tags: [{ tag, count }], reviews: [{ id, satisfaction, selected_tags, content, image_urls, written_at, pet, member }], meta }`

**주의**: 숨김 후기(`is_hidden=true`)는 자동 제외됩니다.

> 📝 코드 예시: `APP_MIGRATION_CODE.md` #44 참조

### 13-3. API #44b. get_review.php (type=partner) → RPC `app_get_kindergarten_reviews`

**전환 방식**: RPC | **난이도**: 중

반려동물 프로필 화면의 **유치원→보호자 후기 목록**입니다. #44와 대칭이지만, **`is_guardian_only` 필터**가 핵심 차이점입니다.

**`is_guardian_only` 분기**:
- **보호자(반려동물 주인)**: 전체 후기 표시 — `is_guardian_only=true` 후기도 볼 수 있음
- **그 외 사용자(유치원 운영자 등)**: `is_guardian_only=false` 후기만 표시

RPC 내부에서 `auth.uid()`와 반려동물의 `member_id`를 비교하여 보호자 여부를 자동 판별합니다.

**태그 집계 정책**: `is_guardian_only=true` 후기도 태그 집계에는 포함 (비공개는 "내용"이지 "통계"가 아님)

**파라미터**: `p_pet_id` (필수), `p_page`, `p_per_page` (최대 50)

**#44와의 차이점**:
- `p_kindergarten_id` → `p_pet_id` (조회 대상이 반려동물)
- 태그: 유치원 후기 태그 7개 (사람을 좋아하고 애교가 많아요, 거의 짖지 않았어요 등)
- 리뷰 내 `kindergarten` 객체 포함 (어떤 유치원의 후기인지)
- `image_urls` 제외 (`kindergarten_reviews`에 이미지 컬럼 없음)
- `is_guardian_only` 필드 반환 (보호자에게만 표시되는 후기 표시)

> 📝 코드 예시: `APP_MIGRATION_CODE.md` #44b 참조

### 13-4. API #61. get_education.php → RPC `app_get_education_with_progress`

**전환 방식**: RPC | **난이도**: 중

유치원 교육/튜토리얼 화면에서 호출합니다. 교육 주제 목록 + 퀴즈 + 이수 현황을 통합 조회합니다.

**파라미터**: `p_kindergarten_id` (필수, 유치원 ID)

**응답 2-파트 구조**:

| 파트 | 설명 |
|------|------|
| `completion` | 이수 현황 — `total_topics`, `completed_topics`, `progress_rate`, `completion_status` (미시작/진행중/완료), `checklist_confirmed`, `pledge_agreed`, `all_completed_at` |
| `topics[]` | 교육 주제 배열 — `topic_id`, `title`, `top_image_url`, `principle_text`, `principle_details`, `correct_behavior_1/2`, `wrong_behavior_1`, `is_completed`, `completed_at`, `quiz` (퀴즈 객체 또는 null) |

**주요 변경점**:
- 기존 PHP: `ca_name`(카테고리) 파라미터로 필터 → Supabase: `visibility='공개'` 교육만 조회 (카테고리 필터는 앱에서 `topics[]` 배열을 클라이언트 필터링)
- 기존 PHP: `mb_id` + 퀴즈 데이터를 JSON 문자열로 파싱 → Supabase: `education_topics` + `education_quizzes` LEFT JOIN + `education_completions` JSONB 매칭
- 이수 기록 미존재 시(첫 진입): 기본값 객체 반환 (`progress_rate: 0`, `completion_status: '미시작'` 등) — 앱에서 별도 null 체크 불필요

> 📝 코드 예시: `APP_MIGRATION_CODE.md` #61 참조

---

## 14. 채팅 전환 (WebSocket → Realtime)

> **작성 라운드**: 3-4 / R4
> **관련 API**: #22~#30 (9개, 이 중 #24, #26~#30은 R2에서 자동 API 코드 작성 완료)
> **핵심 변경**: WebSocket (`react-use-websocket`) → Supabase Realtime (`supabase.channel()`)
> **관련 파일**: `hooks/useChat.ts` (대규모 리팩터링), `hooks/useChatRoom.ts`, `components/ChatMessage.tsx`, `app/chat/[room]/index.tsx`

### 14-1. 현재 채팅 아키텍처 vs 전환 후 아키텍처

**현재 흐름 (WebSocket + PHP)**:

```
┌──────────┐   ① WebSocket 연결           ┌──────────────────┐
│  앱 화면   │ ─────────────────────────→  │ 카페24 채팅 서버     │
│ (useChat) │   wss://wooyoopet.store/ws  │ (server.py/Docker) │
│           │                              │                    │
│           │   ② 메시지 수신 (실시간)        │  ← WebSocket push  │
│           │ ←─────────────────────────   │                    │
│           │                              └──────────────────┘
│           │   ③ 메시지 전송/조회            ┌──────────────────┐
│           │ ─────────────────────────→  │ PHP API (chat.php)  │
│           │   apiClient.post(FormData)  │  → MariaDB          │
│           │ ←─────────────────────────  │  → room/chat 테이블  │
└──────────┘   ④ 응답 (JSON)              └──────────────────┘
```

문제점:
- **서버 2개 동시 관리**: 카페24 WebSocket 서버 + 스마일서브 PHP API 서버
- **이원화된 메시지 흐름**: 실시간 수신(WebSocket) ≠ 메시지 저장(PHP API) → 동기화 이슈
- **heartbeat 부담**: 25초 간격 ping/pong, 60초 타임아웃 → 앱 백그라운드 시 연결 끊김
- **수동 재연결**: 네트워크 변경/앱 복귀 시 WebSocket 재연결 로직 직접 구현 필요

**전환 후 흐름 (Supabase Realtime)**:

```
┌──────────┐   ① Realtime 채널 구독        ┌──────────────────────┐
│  앱 화면   │ ─────────────────────────→  │  Supabase             │
│ (useChat) │  supabase.channel(room_id)  │  ┌─ Realtime 서버     │
│           │                              │  │  (자동 관리)        │
│           │   ② 메시지 수신 (실시간)        │  │  ← postgres_changes │
│           │ ←─────────────────────────   │  │                     │
│           │                              │  ├─ PostgREST (자동 API)│
│           │   ③ 메시지 전송               │  │  ← chat_messages     │
│           │ ─────────────────────────→  │  │                     │
│           │  Edge Function (send-chat)  │  ├─ Edge Functions     │
│           │                              │  │  ← FCM + Storage    │
│           │   ④ 자동 INSERT 감지          │  │                     │
│           │ ←─────────────────────────   │  └─ PostgreSQL        │
└──────────┘   postgres_changes 이벤트     └──────────────────────┘
```

장점:
- **단일 인프라**: Supabase 하나로 실시간 + API + DB + Storage 통합
- **자동 동기화**: `chat_messages` INSERT 시 Realtime이 자동으로 변경 이벤트 전파
- **자동 재연결**: Supabase JS 클라이언트가 네트워크 복구 시 자동 재구독
- **RLS 보안**: Realtime도 RLS 정책을 따르므로, 채팅방 참여자만 이벤트 수신

### 14-2. useChat.ts 리팩터링 가이드

기존 `useChat.ts`는 앱에서 가장 큰 hook 파일(~1,482줄)로, WebSocket 연결 관리 + 메시지 CRUD + 읽음 처리 + 파일 전송이 모두 포함되어 있습니다. 전환 시 **WebSocket 관련 코드를 모두 제거**하고 Supabase Realtime 구독으로 교체합니다.

**제거 대상 (WebSocket 관련)**:

| 기존 코드 | 역할 | 전환 후 |
|-----------|------|---------|
| `import useWebSocket from 'react-use-websocket'` | 라이브러리 import | 삭제 |
| `const { sendMessage, lastMessage, readyState }` | WebSocket 훅 | `supabase.channel()` |
| `EXPO_PUBLIC_WEBSOCKET_URL` 환경변수 참조 | WebSocket 서버 URL | 삭제 |
| heartbeat 설정 (`heartbeat: { interval: 25000, ... }`) | ping/pong | Supabase 자동 관리 |
| `reconnectAttempts`, `reconnectInterval` | 재연결 로직 | Supabase 자동 재연결 |
| `ReadyState` 상태 체크 (`OPEN`, `CONNECTING` 등) | 연결 상태 | 채널 상태 체크 |
| `useEffect` 내 `lastMessage` 파싱 로직 | 수신 메시지 파싱 | `on('postgres_changes')` 콜백 |

**전환 후 구조 핵심**:

```
useChat.ts (수정 후)
├── Realtime 채널 관리
│   ├── subscribeToChatRoom(roomId)   ← supabase.channel() 구독
│   ├── unsubscribeFromChatRoom()     ← channel.unsubscribe()
│   └── handleNewMessage(payload)     ← INSERT 이벤트 콜백
├── 메시지 CRUD
│   ├── getMessageHistory(roomId)     ← R2에서 작성 완료 (#24)
│   ├── sendMessage(roomId, content)  ← Edge Function 호출 (#25)
│   └── getChatImages(roomId)         ← R2에서 작성 완료 (#26)
├── 채팅방 관리
│   ├── leaveRoom(roomId)             ← R2에서 작성 완료 (#27)
│   └── mutedRoom(roomId, muted)      ← R2에서 작성 완료 (#28)
├── 읽음 처리
│   └── readChat(roomId, messageId)   ← R2에서 작성 완료 (#29)
└── 파일 전송
    └── uploadAndSend(roomId, file)   ← Storage + Edge Function
```

**R2에서 이미 작성된 자동 API 코드**:
- #24 `getMessageHistory` — `chat_messages SELECT` (페이지네이션)
- #26 `getChatImages` — `chat_messages SELECT WHERE image_urls IS NOT NULL`
- #27 `leaveRoom` — `chat_rooms UPDATE (status='비활성')`
- #28 `mutedRoom` — `chat_room_members UPDATE (is_muted)`
- #29 `readChat` — `chat_room_members UPDATE (last_read_message_id)`
- #30 `fetchTemplates` — `chat_templates SELECT` (상용문구)

**R4에서 새로 작성하는 핵심 코드 3개**:
- #22 `createRoom` — RPC `app_create_chat_room` (채팅방 생성)
- #23 `getRooms` — RPC `app_get_chat_rooms` (채팅방 목록 + 미읽음 수)
- #25 `sendMessage` — Edge Function `send-chat-message` (메시지 전송)

> ⚠️ **R2 코드의 FK 컬럼명 보정**: R2에서 작성한 #28, #29 코드의 `.eq('room_id', roomId)`는 실제 DB 스키마 `chat_room_id`와 불일치합니다. `chat_room_members` 테이블의 FK는 `chat_room_id`이므로 `.eq('chat_room_id', roomId)`로 수정해야 합니다. (sql/41_08 참조)

### 14-3. API #22. chat.php → create_room → RPC `app_create_chat_room`

**전환 방식**: RPC (SECURITY DEFINER) | **난이도**: 상

채팅 시작 시 호출하는 채팅방 생성 API입니다. 기존 PHP는 `chat.php`에서 `method=create_room` 분기로 처리했으나, Supabase에서는 **SECURITY DEFINER RPC**로 전환합니다.

**SECURITY DEFINER가 필요한 이유**: 채팅방 생성 시 `chat_rooms` INSERT + `chat_room_members` 2건 INSERT가 트랜잭션으로 묶여야 합니다. 특히 `chat_room_members`에는 상대방 member_id 레코드도 INSERT해야 하는데, RLS 정책이 `member_id = auth.uid()` 제한이므로 일반 API로는 상대방 레코드를 생성할 수 없습니다. SECURITY DEFINER RPC는 테이블 소유자 권한으로 실행되어 이 제약을 우회합니다.

**핵심 로직**:
1. 기존 채팅방 존재 확인: `guardian_id` + `kindergarten_id` 조합이 이미 있는지 체크
2. 이미 있으면 `status='활성'`으로 복원 + 기존 방 ID 반환 (나간 방 복구)
3. 없으면 `chat_rooms` INSERT + `chat_room_members` 2건 INSERT
4. 호출자의 `current_mode`로 역할 자동 판별: `'보호자'` → guardian, `'유치원'` → kindergarten

**주요 변경점**:
- `mb_id`(폰번호 2개) → `p_target_member_id`(상대방 UUID 1개). 내 ID는 `auth.uid()`
- `name` 필드(`'폰번호-폰번호'` 형식) 제거 → `guardian_id` + `kindergarten_id` FK로 구조화
- 채팅방 중복 생성 방지: PHP에서는 `name` 문자열 비교 → RPC에서는 `guardian_id + kindergarten_id` UNIQUE 체크
- 방 나가기 후 재대화: PHP `deleted_at` 복원 → Supabase `status='활성'` 복원

> 📝 코드 예시: `APP_MIGRATION_CODE.md` #22 참조

### 14-4. API #23. chat.php → get_rooms → RPC `app_get_chat_rooms`

**전환 방식**: RPC | **난이도**: 상

채팅 목록 화면에서 호출하는 채팅방 목록 조회 API입니다. 기존 PHP는 `chat.php`에서 `method=get_rooms` (또는 채팅방 목록 조회 분기)로 처리했습니다.

**RPC가 필요한 이유**: 채팅방 목록은 단순 SELECT가 아닙니다. 각 방의 **미읽음 메시지 수**(unread_count), **마지막 메시지**, **상대방 프로필** 정보를 서브쿼리로 조회해야 하며, `chat_room_members`의 `last_read_message_id`와 `chat_messages`의 COUNT를 교차 비교합니다.

**응답 구조**:

| 필드 | 타입 | 설명 |
|------|------|------|
| `room_id` | UUID | 채팅방 ID |
| `status` | text | '활성' / '비활성' |
| `last_message` | text | 마지막 메시지 내용 |
| `last_message_at` | timestamptz | 마지막 메시지 시각 |
| `last_message_type` | text | 마지막 메시지 타입 (text/image/file/reservation_request 등 영문 8종) |
| `unread_count` | integer | 미읽음 메시지 수 |
| `is_muted` | boolean | 알림 차단 여부 |
| `opponent` | object | 상대방 프로필 (`id`, `nickname`, `profile_image`, `role`) |
| `reservation_count` | integer | 해당 채팅방의 예약 수 |

**핵심 로직**:
1. `chat_room_members`에서 `member_id = auth.uid()`인 방만 조회 (RLS 연동)
2. 상대방 프로필: `chat_room_members`에서 `member_id ≠ auth.uid()`인 레코드의 `members` JOIN
3. 미읽음 수: `chat_messages` 중 `id > last_read_message_id`이고 `sender_id ≠ auth.uid()`인 COUNT
4. `status='활성'` 방만 반환 + `last_message_at DESC` 정렬

**주요 변경점**:
- `mb_id` 파라미터 → `auth.uid()` 자동 (RPC 내부)
- `name`(폰번호 조합) 파싱 → `opponent` 구조화 객체
- WebSocket 연결 상태 → 제거 (Realtime 구독은 별도)
- PHP에서 별도 쿼리로 가져오던 `unread_count` → RPC 내부 서브쿼리 통합

> 📝 코드 예시: `APP_MIGRATION_CODE.md` #23 참조

### 14-5. API #25. chat.php → send_message → Edge Function `send-chat-message`

**전환 방식**: Edge Function | **난이도**: 상

채팅 메시지 전송 API입니다. 채팅 시스템에서 **가장 복잡한 단일 API**로, 메시지 저장 + 파일 업로드 + 실시간 전파 + 푸시 알림이 하나의 흐름에 결합됩니다.

**Edge Function이 필요한 이유**: 클라이언트(앱)에서 `chat_messages` INSERT만으로는 FCM 푸시 전송, 상대방 `is_muted` 체크, `notifications` INSERT 등의 서버 사이드 로직을 수행할 수 없습니다. 또한 이미지 파일 업로드 시 Storage URL 획득 → `image_urls` 컬럼 반영까지 원자적으로 처리해야 합니다.

**처리 흐름**:

```
앱 → Edge Function (send-chat-message)
  1. JWT에서 sender_id 추출
  2. chat_room_members 검증 (참여자인지)
  3. 파일 있으면 → Storage 업로드 (chat-files/{room_id}/{msg_id}/)
  4. chat_messages INSERT (content, message_type, image_urls)
  5. chat_rooms UPDATE (last_message, last_message_at, total_message_count +1)
  6. 상대방 is_muted 체크
  7. is_muted=false면 → FCM 푸시 발송 (send-push 내부 호출)
  8. notifications INSERT
```

**주요 변경점**:
- FormData 전송 → `supabase.functions.invoke('send-chat-message', { body })` JSON
- 이미지: `file_path` (서버 파일시스템) → `image_urls` (Storage 공개 URL 배열)
- 실시간 전파: PHP → WebSocket 서버 push → Supabase `chat_messages` INSERT 시 Realtime `postgres_changes` 자동 전파
- FCM 푸시: PHP 내부 → Edge Function `send-push` 내부 호출

**입력 스펙**:

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `room_id` | UUID | ✅ | 채팅방 ID |
| `content` | string | 조건부 | 텍스트 메시지 (이미지 전용이면 빈 문자열 가능) |
| `message_type` | string | ✅ | `'text'`, `'image'`, `'file'` (사용자 전송용, DB에는 영문 8종 저장) |
| `image_files` | File[] | ❌ | 이미지/파일 배열 (FormData 전송 시) |

> ⚠️ **message_type DB 저장값**: DB에는 영문 8종(`text`, `image`, `file`, `reservation_request`, `reservation_confirmed`, `care_start`, `care_end`, `review`)으로 저장됩니다. `sender_type`만 한글(보호자/유치원/시스템) 유지.

**출력 스펙**:

| 필드 | 타입 | 설명 |
|------|------|------|
| `success` | boolean | 성공 여부 |
| `data.message_id` | UUID | 생성된 메시지 ID |
| `data.image_urls` | string[] | Storage 업로드된 이미지 URL 배열 |
| `error` | string | 에러 메시지 (실패 시) |

> 📝 코드 예시: `APP_MIGRATION_CODE.md` #25 참조

### 14-6. Realtime 구독 패턴 (메시지 수신)

기존 WebSocket 방식에서는 `react-use-websocket` 라이브러리의 `lastMessage`를 `useEffect`로 감시하여 새 메시지를 처리했습니다. 전환 후에는 **Supabase Realtime의 `postgres_changes` 이벤트**를 구독합니다.

**구독 방식**: `postgres_changes` (INSERT 이벤트 감지)

`postgres_changes`는 `chat_messages` 테이블에 INSERT가 발생하면 해당 채팅방 구독자에게 자동으로 새 레코드를 전달합니다. 별도의 브로드캐스트 서버가 불필요합니다.

**채널 구독 라이프사이클**:

```
채팅방 진입 (mount)
  → supabase.channel(`chat:${roomId}`) 생성
  → .on('postgres_changes', { filter: `chat_room_id=eq.${roomId}` }) 구독
  → INSERT 이벤트 수신 시 → 메시지 목록 state에 추가
  → 스크롤 자동 하단 이동

채팅방 퇴장 (unmount)
  → channel.unsubscribe()
  → 메모리 정리
```

**RLS와 Realtime**: Supabase Realtime은 RLS 정책을 따릅니다. `chat_messages_select_app` 정책에 의해 **채팅방 참여자만** INSERT 이벤트를 수신합니다. 비참여자가 채널을 구독해도 이벤트가 전달되지 않습니다.

**Broadcast와의 차이**: Supabase Realtime에는 `postgres_changes`(DB 변경 감지)와 `broadcast`(임의 메시지 전송) 두 가지 모드가 있습니다. 채팅에서는 **`postgres_changes`를 사용**합니다. 이유:
- 메시지가 DB에 저장되어야 히스토리 조회가 가능
- Edge Function에서 INSERT하면 자동으로 구독자에게 전달
- 별도 브로드캐스트 로직 불필요 (DB INSERT = 실시간 전파)

**채팅방 목록 실시간 업데이트**: 채팅 목록 화면에서도 별도 Realtime 채널을 구독하여, 다른 방에 새 메시지가 도착하면 `last_message`와 `unread_count`를 실시간 갱신할 수 있습니다. 이 구독은 `chat_rooms` 테이블의 UPDATE 이벤트(`last_message_at` 변경)를 감지합니다.

> 📝 코드 예시: `APP_MIGRATION_CODE.md` #25 내 Realtime 구독 코드 참조

### 14-7. 이미지/파일 전송 (Storage 연동)

기존 PHP에서는 이미지를 FormData로 `chat.php`에 전송하면 서버 파일시스템에 저장 후 `file_path`(상대 경로)를 DB에 기록했습니다. 전환 후에는 **Supabase Storage의 `chat-files` 버킷**을 사용합니다.

**Storage 버킷 구성**:

| 항목 | 값 |
|------|---|
| 버킷 이름 | `chat-files` |
| 공개 여부 | **private** (채팅방 참여자만 접근) |
| 최대 파일 크기 | 10MB |
| 경로 형식 | `chat-files/{chat_room_id}/{message_id}/{filename}` |

**RLS 정책**: `chat_room_members`에 본인이 참여한 채팅방의 파일만 업로드/다운로드 가능 (sql/43_02 참조).

**이미지 전송 흐름**:

```
① 앱에서 이미지 선택 (react-native-image-picker)
② Edge Function (send-chat-message) 호출 — image_files 첨부
③ Edge Function 내부:
   a. chat_messages INSERT (message_type='image', image_urls=[] 임시)
   b. Storage 업로드 → signed URL 획득
   c. chat_messages UPDATE (image_urls = [url1, url2, ...])
④ Realtime postgres_changes로 상대방에게 전파
```

**기존 `file_path` → `image_urls` 변환**:
- 기존: `file_path` = 단일 문자열 (`'/uploads/chat/123/image.jpg'`)
- 전환 후: `image_urls` = jsonb 배열 (`['https://.../chat-files/room-id/msg-id/image1.jpg', ...]`)
- 한 메시지에 **여러 이미지** 첨부 가능 (기존은 1개씩만)

**signed URL**: `chat-files` 버킷은 private이므로, 앱에서 이미지를 표시하려면 signed URL이 필요합니다:
```typescript
const { data } = await supabase.storage
  .from('chat-files')
  .createSignedUrl(filePath, 3600)  // 1시간 유효
```

> **대안**: Edge Function에서 INSERT 시점에 public URL을 생성하여 `image_urls`에 저장하면, 앱에서 별도 signed URL 요청이 불필요합니다. 이 방식은 Edge Function 구현(Step 4)에서 확정합니다.

### 14-8. 읽음 처리 / 미읽음 카운트

**읽음 처리 (R2 #29 작성 완료)**:
채팅방 진입 시 / 새 메시지 수신 시 `chat_room_members.last_read_message_id`를 최신 메시지 ID로 UPDATE합니다. 이 코드는 R2 §10-1에서 이미 작성되었습니다 (`APP_MIGRATION_CODE.md` #29 참조).

**미읽음 카운트 계산**:
미읽음 수는 **RPC 내부에서 계산**됩니다 (#23 `app_get_chat_rooms`). 계산 공식:

```sql
-- unread_count 계산 (RPC 내부 서브쿼리)
SELECT COUNT(*)
FROM chat_messages cm
WHERE cm.chat_room_id = crm.chat_room_id
  AND cm.sender_id <> auth.uid()              -- 내가 보낸 메시지 제외
  AND cm.created_at > COALESCE(
    (SELECT cm2.created_at
     FROM chat_messages cm2
     WHERE cm2.id = crm.last_read_message_id),
    '1970-01-01T00:00:00Z'::timestamptz
  )
  -- last_read_message_id가 NULL이면 전체 메시지 = 미읽음
```

> ⚠️ **UUID v4 순서 비교 금지 (R4 리뷰 Issue 4)**
> Supabase `gen_random_uuid()`는 **UUID v4 (랜덤)**를 생성합니다. UUID v4는 시간 순서를 보장하지 않으므로, `cm.id > crm.last_read_message_id` 같은 비교는 **올바른 미읽음 카운트를 보장하지 못합니다**.
> 대신 `last_read_message_id`로 해당 메시지의 `created_at` 타임스탬프를 서브쿼리로 조회한 뒤, `cm.created_at > (서브쿼리)` 형태로 시간 기반 비교를 사용합니다.
> UUID v7 (시간순)을 채택한다면 직접 비교도 가능하지만, 현재 스키마는 v4이므로 반드시 타임스탬프 기반 비교를 사용하십시오.

**읽음 처리 타이밍**:
1. **채팅방 진입 시**: 가장 최신 메시지 ID로 즉시 UPDATE
2. **새 메시지 수신 시**: Realtime 이벤트 콜백에서 자동 UPDATE (채팅방 화면이 열려 있을 때)
3. **앱 복귀 시**: 채팅방 화면이 foreground로 돌아오면 최신 메시지로 UPDATE

**기존 대비 변경점**:
- `read_chat.php` GET 호출 → `chat_room_members` UPDATE (R2 코드 그대로)
- `mb_id` → `member_id` (UUID), `last_read_id` → `last_read_message_id`
- 미읽음 수: PHP에서 별도 API/WebSocket 이벤트 → RPC 응답에 `unread_count` 포함

### 14-9. 채팅 관련 자동 API 교차 참조 (R2 작성 완료)

아래 API는 R2 §10-1에서 이미 Before/After 코드가 작성되었습니다. 이 장에서는 설명만 교차 참조하며, 코드 중복 작성하지 않습니다.

| # | API | 전환 방식 | CODE 참조 | 비고 |
|---|-----|---------|----------|------|
| #24 | `get_messages` | 자동 API | CODE #24 | 메시지 히스토리 (페이지네이션) |
| #26 | `get_images` | 자동 API | CODE #26 | 이미지 메시지 필터 조회 |
| #27 | `leave_room` | 자동 API | CODE #27 | `status='비활성'` 변경 |
| #28 | `muted` | 자동 API | CODE #28 | `is_muted` 토글 |
| #29 | `read_chat.php` | 자동 API | CODE #29 | `last_read_message_id` UPDATE |
| #30 | `get_message_template` | 자동 API | CODE #30 | 상용문구 조회 |

### 14-10. ChatRoomType / MessageType 변경 요약

**ChatRoomType** (RPC #23 응답):

| PHP 응답 필드 | Supabase 응답 필드 | 타입 변경 | 비고 |
|---|---|---|---|
| `room.id` (정수) | `data[].room_id` (UUID) | `number` → `string` | PK |
| `room.name` (`'폰번호-폰번호'`) | — (제거) | — | `guardian_id` + `kindergarten_id` FK로 대체 |
| `room.last_message` | `data[].last_message` | — | |
| `room.last_message_time` | `data[].last_message_at` | `string` → `timestamptz` | |
| `room.unread_count` | `data[].unread_count` | — | RPC 서브쿼리로 계산 |
| 상대방 이름 (name 파싱) | `data[].opponent.nickname` | — | 구조화 객체 |
| 상대방 이미지 (별도 조회) | `data[].opponent.profile_image` | — | RPC 내 JOIN |
| — | `data[].opponent.role` | — (신규) | `'보호자'` / `'유치원'` |
| — | `data[].is_muted` | — (신규) | 알림 차단 여부 |
| — | `data[].last_message_type` | — (신규) | 마지막 메시지 타입 |

**MessageType** (Realtime 이벤트 / #24 응답):

| PHP 응답 필드 | Supabase 응답 필드 | 타입 변경 | 비고 |
|---|---|---|---|
| `msg.id` (정수) | `data[].id` (UUID) | `number` → `string` | PK |
| `msg.room_id` | `data[].chat_room_id` | 예 — 키 이름 변경 | FK |
| `msg.mb_id` (폰번호) | `data[].sender_id` (UUID) | 예 — 폰번호 → UUID | |
| — | `data[].sender_type` | — (신규) | `'보호자'` / `'유치원'` / `'시스템'` |
| `msg.message_type` | `data[].message_type` | — | 동일 |
| `msg.content` | `data[].content` | — | |
| `msg.file_path` | `data[].image_urls` (jsonb) | `string` → `string[]` | 다중 이미지 |
| `msg.file_type` | — (제거) | — | `message_type`으로 대체 |
| `msg.created_at` | `data[].created_at` | — | |
| — | `data[].is_read` | — (신규) | 읽음 여부 |

**WebSocket 메시지 → Realtime 이벤트 비교**:

| 항목 | WebSocket (기존) | Supabase Realtime (전환 후) |
|------|-----------------|--------------------------|
| 수신 형식 | JSON 문자열 (`lastMessage.data`) | `payload.new` 객체 (PostgreSQL row) |
| 이벤트 타입 | 커스텀 (`type: 'message'`, `type: 'ping'` 등) | `postgres_changes` INSERT |
| 파싱 | `JSON.parse(lastMessage.data)` | 직접 접근 (`payload.new.content`) |
| 연결 관리 | 수동 (heartbeat, reconnect) | 자동 (`supabase.channel()`) |
| 인증 | WebSocket URL에 토큰 포함 | JWT 자동 (Supabase Auth 세션) |

---

## 15. 결제/예약 전환

> **작성 라운드**: 3-5 / R5
> **관련 API**: #34~#36, #39 (4개 — Edge Function 전환 대상). #37, #38 예약 조회는 §12 참조
> **핵심 변경**: PHP 콜백 → Edge Function, WebView 콜백 URL 변경
> **관련 파일**: `app/payment/inicisPayment.tsx`, `app/payment/inicisApproval.tsx`, `app/payment/request.tsx`

### 15-1. 현재 결제 흐름 vs 전환 후 흐름

**현재 흐름 (WebView → PHP callback → MariaDB)**:

```
┌──────────┐                ┌────────────────┐                ┌───────────────┐
│  앱 화면   │   ① 결제 정보    │  WebView        │   ④ PG 콜백     │  PHP 서버       │
│ (request │ → 입력 + 결제  → │ (inicisPayment │ ←──────────── │  inicis_      │
│  .tsx)   │   버튼 터치      │  .tsx)         │   POST 직접     │  payment.php  │
│          │                │               │   호출          │               │
│          │   ② WebView     │ ─────────────→│               │  ⑤ DB 저장     │
│          │   이니시스 결제창  │ mobile.inicis  │               │  inicis_      │
│          │   로드          │ .com/smart/    │               │  payments     │
│          │                │ payment/       │               │  INSERT       │
│          │   ③ 사용자 결제   │               │               │               │
│          │   완료          │ 이니시스 서버 →  │               │  ⑥ HTML 반환   │
│          │                │ P_RETURN_URL   │               │  → WebView    │
│          │                │ 콜백 호출       │               │               │
│          │   ⑦ WebView     │ ←──────────── │               │               │
│          │   결과 수신      │ postMessage    │               │               │
│          │                │ (결제 결과)     │               │               │
│          │   ⑧ 승인 저장    │               │               │               │
│          │ ──────────────→│               │  ⑨ POST       │  set_inicis_  │
│          │ apiClient.post │               │ ─────────────→│  approval.php │
│          │ (FormData)     │               │               │  payments     │
│          │                │               │               │  UPSERT       │
│          │   ⑩ 예약 생성    │               │               │               │
│          │ ──────────────→│               │  ⑪ POST       │  set_payment_ │
│          │ apiClient.post │               │ ─────────────→│  request.php  │
│          │ (FormData)     │               │               │  payment_     │
│          │                │               │               │  request      │
│          │   ⑫ 완료 화면    │               │               │  INSERT       │
└──────────┘                └────────────────┘                └───────────────┘

⚠️ 문제점:
  - ④~⑥ PHP 콜백: 스마일서브 서버 의존 (해지 예정)
  - ⑧~⑪ 앱에서 3번 순차 API 호출 (승인 저장 → 예약 생성 → 채팅 시스템 메시지)
  - 결제 성공 후 ⑨/⑩/⑪ 중 하나라도 실패하면 데이터 불일치 위험
  - 콜백 URL이 PHP 서버 고정 → 서버 이전 시 PG사 설정 변경 필요
```

**전환 후 흐름 (WebView → Edge Function callback → Supabase)**:

```
┌──────────┐                ┌────────────────┐                ┌────────────────────┐
│  앱 화면   │   ① 결제 정보    │  WebView        │   ④ PG 콜백     │  Supabase          │
│ (request │ → 입력 + 결제  → │ (inicisPayment │ ←──────────── │  Edge Function     │
│  .tsx)   │   버튼 터치      │  .tsx)         │   POST 직접     │  inicis-callback   │
│          │                │               │   호출          │                    │
│          │   ② WebView     │ ─────────────→│               │  ⑤ 원자적 처리      │
│          │   이니시스 결제창  │ mobile.inicis  │               │  a. payments       │
│          │   로드          │ .com/smart/    │               │     UPSERT         │
│          │                │ payment/       │               │  b. raw_response   │
│          │   ③ 사용자 결제   │               │               │     전체 저장       │
│          │   완료          │ 이니시스 서버 →  │               │                    │
│          │                │ P_RETURN_URL   │               │  ⑥ HTML 반환       │
│          │                │ (EF 엔드포인트)  │               │  → WebView         │
│          │   ⑦ WebView     │ ←──────────── │               │   postMessage      │
│          │   결과 수신      │ postMessage    │               │                    │
│          │                │ (결제 결과 +    │               │                    │
│          │                │  payment_id)   │               │                    │
│          │   ⑧ 예약 생성    │               │               │                    │
│          │ ──────────────→│               │               │  Edge Function     │
│          │ supabase.      │               │               │  create-reservation│
│          │ functions.     │               │               │  a. reservations   │
│          │ invoke()       │               │               │     INSERT         │
│          │                │               │               │  b. chat 시스템 메시지│
│          │                │               │               │  c. FCM 푸시       │
│          │   ⑨ 완료 화면    │               │               │                    │
└──────────┘                └────────────────┘                └────────────────────┘

✅ 개선사항:
  - ④~⑥ Edge Function: Supabase 인프라 (서버 이전 불필요)
  - ⑤ inicis-callback이 payments 저장을 원자적으로 처리 → 앱에서 set_inicis_approval 별도 호출 제거
  - ⑧ create-reservation 한 번 호출로 예약 생성 + 채팅 메시지 + FCM 푸시 원자적 처리
  - 앱에서 API 호출: 3번 → 1번 (create-reservation만)
  - 콜백 URL = Supabase Edge Function URL → 서버 의존성 제거
```

**핵심 차이 요약**:

| 항목 | 기존 (PHP) | 전환 후 (Supabase) |
|------|----------|------------------|
| PG 콜백 수신 | `inicis_payment.php` (PHP 서버) | `inicis-callback` (Edge Function) |
| 승인 정보 저장 | 앱 → `set_inicis_approval.php` (별도 호출) | `inicis-callback` 내부 자동 처리 |
| 예약 생성 | 앱 → `set_payment_request.php` (별도 호출) | 앱 → `create-reservation` (EF, 1번 호출) |
| 예약 생성 부가 처리 | 앱에서 채팅 메시지 별도 전송 | EF 내부에서 채팅 + FCM 원자적 처리 |
| 앱 순차 API 호출 | 3번 (승인→예약→채팅) | 1번 (예약 생성 EF) |
| 데이터 일관성 | 3번 중 실패 시 불일치 위험 | EF 내부 트랜잭션으로 보장 |
| 콜백 URL | `https://woo1020.iwinv.net/api/inicis_payment.php` | `https://<project-ref>.supabase.co/functions/v1/inicis-callback` |

### 15-2. API #34. inicis_payment.php → Edge Function `inicis-callback`

**전환 방식**: Edge Function | **난이도**: 상

기존 `inicis_payment.php`는 이니시스 PG사가 결제 완료 후 **직접 POST 호출하는 서버 콜백** URL입니다. 앱에서 직접 호출하는 API가 아니며, WebView의 `P_RETURN_URL`에 지정된 서버 엔드포인트입니다.

**전환 후에는 Edge Function `inicis-callback`이 이 콜백을 수신합니다.** 앱 코드에서 변경해야 하는 것은 **WebView에서 이니시스 결제창을 로드할 때 전달하는 `P_RETURN_URL`**뿐입니다.

**변환 포인트**:
- `P_RETURN_URL` 변경: PHP URL → Edge Function URL (§15-6 참조)
- `P_NOTI` JSON 파싱: 기존과 동일한 JSON 구조 유지 (앱에서 `P_NOTI`에 담는 데이터 형식 변경 없음)
- 앱에서 `apiClient.post('api/inicis_payment.php')` 호출하는 코드는 없음 (PG사가 직접 호출)
- Edge Function 결과: HTML 페이지 반환 → WebView의 `onMessage` 이벤트로 결제 결과 수신 (기존과 동일)
- `inicis-callback` 내부에서 `payments` UPSERT + `raw_response` 저장을 자동 처리 → 기존 `set_inicis_approval.php` 별도 호출 불필요

> 📝 코드 예시: `APP_MIGRATION_CODE.md` #34 참조

### 15-3. API #35. set_inicis_approval.php → Edge Function (inicis-callback 내부 흡수)

**전환 방식**: Edge Function (inicis-callback 내부) | **난이도**: 중

기존 `set_inicis_approval.php`는 WebView에서 결제 완료 후 **앱이 직접 호출하여** 승인 정보를 DB에 저장하는 API입니다. 전환 후에는 **이 역할이 `inicis-callback` Edge Function 내부로 흡수**됩니다.

**흡수 과정**:
1. 기존: 이니시스 콜백(#34) → HTML 반환 → 앱이 결과 파싱 → 앱이 `set_inicis_approval.php`(#35) 호출 → DB 저장
2. 전환 후: 이니시스 콜백(inicis-callback EF) → **EF 내부에서 바로 DB 저장** → HTML 반환 → 앱이 결과 파싱 (DB 저장은 이미 완료)

**변환 포인트**:
- 앱에서 `apiClient.post('api/set_inicis_approval.php', inicisPayload)` 호출 코드 **삭제**
- WebView `onMessage` 콜백에서 결제 결과를 받으면, **DB 저장 API를 호출하지 않고** 바로 다음 단계(예약 생성)로 진행
- `inicis-callback`이 반환하는 HTML `postMessage`에 `payment_id` (UUID)가 포함됨 → 예약 생성 시 이 ID를 전달
- 기존 `inicis_payments` 테이블 → Supabase `payments` 테이블로 매핑 (DB_MAPPING_REFERENCE §2-5 참조)

> 📝 코드 예시: `APP_MIGRATION_CODE.md` #35 참조

### 15-4. API #36. set_payment_request.php → Edge Function `create-reservation`

**전환 방식**: Edge Function | **난이도**: 상

기존 `set_payment_request.php`는 돌봄 예약을 **생성/수정/상태변경**하는 통합 API입니다. 전환 후에는 Edge Function `create-reservation`으로 대체됩니다.

**Edge Function이 필요한 이유**: 예약 생성 시 단순 INSERT 외에 다음 부가 처리가 필요합니다:
1. `reservations` INSERT (예약 생성)
2. `payments` 연결 (`payment_id` ← `inicis-callback`에서 생성된 결제 레코드)
3. 채팅방 존재 확인 → 없으면 자동 생성 (`app_create_chat_room` RPC 내부 호출)
4. `chat_room_reservations` INSERT (채팅방↔예약 연결)
5. `chat_messages` INSERT (`message_type='reservation_request'` 시스템 메시지)
6. 상대방 FCM 푸시 발송 (`send-push` 내부 호출)
7. `notifications` INSERT

이 모든 처리를 앱에서 순차 호출하면 실패 시 데이터 불일치 위험이 있으므로, **Edge Function 내부에서 원자적으로 처리**합니다.

**입력 필드**:

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `kindergarten_id` | UUID | ✅ | 유치원 ID — `kindergartens` 테이블 PK |
| `pet_id` | UUID | ✅ | 반려동물 ID |
| `checkin_scheduled` | timestamptz | ✅ | 등원 예정 일시 |
| `checkout_scheduled` | timestamptz | ✅ | 하원 예정 일시 |
| `walk_count` | integer | ✅ | 산책 횟수 |
| `pickup_requested` | boolean | ✅ | 픽드랍 요청 여부 |
| `payment_id` | UUID | ✅ | 결제 ID (`inicis-callback`에서 반환) |
| `room_id` | UUID | ❌ | 기존 채팅방 ID (없으면 자동 생성) |

> ⚠️ **`kindergarten_id` 값 주의**: `kindergartens` 테이블의 PK(UUID)를 전달해야 합니다. 유치원 운영자의 `members.id`(UUID)가 **아닙니다**. 앱에서는 `useKinderGarten()` 훅의 `kindergarten?.partner?.id` 값을 사용하세요. (`PendingCareRequestType.kindergartenId` 필드에 저장됨. 기존 `kindergartenMemberId`는 운영자 members UUID이므로 혼동 주의)

**출력 필드**:

| 필드 | 타입 | 설명 |
|------|------|------|
| `success` | boolean | 성공 여부 |
| `data.reservation_id` | UUID | 생성된 예약 ID |
| `data.room_id` | UUID | 채팅방 ID (생성 또는 기존) |
| `error` | string | 에러 메시지 (실패 시) |

**업데이트 모드**: `reservation_id`를 추가로 전달하면 UPDATE 모드로 동작합니다.
- `status='예약확정'` → DB `'예약확정'` 그대로 저장, `message_type='reservation_confirmed'` 시스템 메시지 + FCM
- `status='거절'` → DB `'유치원거절'`으로 변환 저장, `reject_reason`/`reject_detail` 기록, `message_type='reservation_rejected'` 시스템 메시지 + FCM
- `status='취소'` → DB `'보호자취소'`(보호자) 또는 `'유치원취소'`(유치원)으로 변환 저장, `message_type='reservation_cancelled'` 시스템 메시지 + FCM
  - ⚠️ 위약금 계산 + `refunds` INSERT 로직은 TODO (향후 구현 예정)

> 📝 **DB 상태값 변환 노트**: 앱은 API 파라미터로 `'거절'`/`'취소'`를 보내지만, EF 내부에서 `isGuardian`/`isKgOwner` 판단 후 DB 실제 상태값으로 동적 변환합니다:
> - `'거절'` → `'유치원거절'`
> - `'취소'` → `isGuardian ? '보호자취소' : '유치원취소'`
> - `'예약확정'` → `'예약확정'` (변환 없음)
>
> 📝 코드 예시: `APP_MIGRATION_CODE.md` #36 참조

### 15-5. API #39. set_care_complete.php → Edge Function `complete-care`

**전환 방식**: Edge Function | **난이도**: 상

기존 `set_care_complete.php`는 돌봄 완료 처리 API입니다. 하원 확인 + 상태 변경 + 시스템 메시지 + FCM 발송이 결합되어 있으므로 Edge Function으로 전환합니다.

**처리 흐름**:
1. `reservations` UPDATE (`status='돌봄완료'`, `checkout_actual=NOW()`)
2. 하원 확인 플래그 설정 (`guardian_checkout_confirmed`/`kg_checkout_confirmed`)
3. `chat_messages` INSERT (`message_type='care_end'`) — 돌봄 종료 시스템 메시지
4. `chat_messages` INSERT (`message_type='review'`) — 후기 작성 유도 메시지
5. 상대방 FCM 푸시 발송
6. `notifications` INSERT
7. `auto_complete_scheduled_at` 설정 (양측 모두 미확인 시 자동 완료 예정 시각)

**양측 하원 확인 로직**:
- 보호자가 하원 확인 → `guardian_checkout_confirmed=true` + `guardian_checkout_confirmed_at=NOW()`
- 유치원이 하원 확인 → `kg_checkout_confirmed=true` + `kg_checkout_confirmed_at=NOW()`
- **양측 모두 확인** 시에만 `status='돌봄완료'`로 최종 변경
- 한쪽만 확인 시: 확인 플래그만 업데이트, 상대방에게 FCM 알림 발송
- 양측 미확인 + `auto_complete_scheduled_at` 도달 시: `scheduler` EF가 자동 완료 처리

**입력 필드**:

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `reservation_id` | UUID | ✅ | 예약 ID |

> `auth.uid()`로 호출자를 자동 식별하여, 보호자/유치원 중 누가 하원 확인했는지 판별합니다.

**출력 필드**:

| 필드 | 타입 | 설명 |
|------|------|------|
| `success` | boolean | 성공 여부 |
| `data.status` | string | 갱신된 예약 상태 (`'돌봄완료'` — 양측 확인 완료 시, 또는 기존 상태 유지) |
| `data.both_confirmed` | boolean | 양측 모두 하원 확인 여부 (`true` 시 돌봄완료 전환됨) |
| `data.guardian_checkout_confirmed` | boolean | 보호자 하원 확인 여부 |
| `data.kg_checkout_confirmed` | boolean | 유치원 하원 확인 여부 |
| `error` | string | 에러 메시지 (실패 시 — 예: 이미 완료된 예약, 권한 없음 등) |

> 📝 코드 예시: `APP_MIGRATION_CODE.md` #39 참조

### 15-6. WebView 콜백 URL 변경

이니시스 모바일 결제에서 가장 중요한 변경은 **`P_RETURN_URL`** (PG 콜백 URL)입니다. WebView에서 이니시스 결제창을 로드할 때, 결제 완료 후 결과를 수신할 서버 URL을 지정합니다.

**콜백 URL 변경**:

| 항목 | 기존 | 전환 후 |
|------|------|--------|
| `P_RETURN_URL` | `https://woo1020.iwinv.net/api/inicis_payment.php` | `https://<project-ref>.supabase.co/functions/v1/inicis-callback` |
| `P_NEXT_URL` | PHP 서버 URL (성공/실패 분기) | Edge Function URL (동일) |

**앱 코드 변경 위치**: `app/payment/inicisPayment.tsx`

```typescript
// 기존
const INICIS_RETURN_URL = `${process.env.EXPO_PUBLIC_API_URL}/api/inicis_payment.php`

// 전환 후
const INICIS_RETURN_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/inicis-callback`
```

**P_NOTI 파라미터**: 앱에서 이니시스 결제 요청 시 `P_NOTI` 파라미터에 JSON 문자열로 추가 데이터를 전달합니다. Edge Function에서 이를 파싱하여 `payments` 레코드에 연결합니다.

```typescript
// P_NOTI에 담는 데이터 (기존과 동일 구조 유지)
const pNoti = JSON.stringify({
  mode: user.current_mode,        // '보호자' | '유치원'
  roomId: chatRoomId ?? null,     // 채팅방 ID (있으면)
  kindergartenId: kindergartenId, // 유치원 ID
  petId: petId,                   // 반려동물 ID
  memberId: user.id,              // 결제자 UUID (기존 mb_id 대체)
})
```

**WebView `onMessage` 처리**: Edge Function이 반환하는 HTML에서 `ReactNativeWebView.postMessage()`로 결과를 전달합니다. 전환 후 결과 JSON에 `payment_id`(UUID)가 추가됩니다.

```typescript
// 기존 WebView onMessage
const onMessage = (event: WebViewMessageEvent) => {
  const data = JSON.parse(event.nativeEvent.data)
  // data: { result: 'Y'|'N', P_OID, P_TID, P_AMT, ... }
}

// 전환 후 WebView onMessage
const onMessage = (event: WebViewMessageEvent) => {
  const data = JSON.parse(event.nativeEvent.data)
  // data: { result: 'Y'|'N', payment_id, pg_transaction_id, amount, ... }
  //        ↑ payment_id가 추가됨 (create-reservation에 전달)
}
```

### 15-7. 테스트 MID / 상용 MID 전환

현재 앱은 이니시스 **테스트 MID** (`INIpayTest`)를 사용 중입니다. 상용 전환 시 아래 항목을 변경합니다.

| 항목 | 테스트 환경 | 상용 환경 |
|------|----------|---------|
| MID | `INIpayTest` | `wooyoope79` |
| 결제 모듈 URL | `https://mobile.inicis.com/smart/payment/` | 동일 (INIpay Mobile은 URL 동일) |
| `P_MID` 파라미터 | `INIpayTest` | `wooyoope79` |
| Edge Function Secret | `INICIS_MID=INIpayTest` | `INICIS_MID=wooyoope79` |

**전환 순서**:
1. Edge Function `inicis-callback` 배포 + 테스트 MID로 검증 완료
2. 이니시스 관리자 페이지에서 상용 MID의 `P_RETURN_URL`을 Edge Function URL로 등록
3. Supabase Secret `INICIS_MID` 값을 `wooyoope79`로 변경
4. 앱의 `P_MID` 파라미터를 환경변수로 관리 → `.env`에서 전환

```
// .env (테스트)
EXPO_PUBLIC_INICIS_MID=INIpayTest

// .env.production (상용)
EXPO_PUBLIC_INICIS_MID=wooyoope79
```

> ⚠️ **주의**: 테스트 MID에서 실결제는 발생하지 않습니다. 상용 MID 전환 전에 반드시 테스트 시나리오(§15-1 전체 흐름)를 완료하세요.

---

## 16. Edge Function 인터페이스 가이드

> **작성 라운드**: 3-5 / R5
> **관련 Edge Function**: 7개
> **핵심**: `supabase.functions.invoke()` 호출 규격 정의 (입력/출력 스펙만, 구현은 Step 4)

### 16-1. Edge Function 호출 공통 패턴

**앱에서 직접 호출하는 EF**와 **서버에서만 호출하는 EF**로 나뉩니다.

| EF | 앱 호출 | 호출 방식 | 앱 코드 변경 |
|----|---------|---------|------------|
| `inicis-callback` | ❌ | PG사 POST | WebView `P_RETURN_URL`만 변경 |
| `send-chat-message` | ✅ | `supabase.functions.invoke()` | R4 §14-5 참조 (작성 완료) |
| `create-reservation` | ✅ | `supabase.functions.invoke()` | 예약 생성 흐름 교체 |
| `complete-care` | ✅ | `supabase.functions.invoke()` | 돌봄 완료 호출 교체 |
| `send-alimtalk` | ❌ | Supabase Auth SMS 훅 | R1 §1-2 참조 (앱 코드 없음) |
| `send-push` | ❌ | 다른 EF 내부 호출 | 앱 코드 변경 없음 |
| `scheduler` | ❌ | pg_cron / 외부 cron | 앱 코드 변경 없음 |

**앱에서 호출하는 공통 패턴**:

```typescript
// 패턴 1: JSON body 전송 (일반)
const { data, error } = await supabase.functions.invoke('function-name', {
  body: { key: value },
})

if (error) {
  Alert.alert('오류', error.message)
  return
}
// data: Edge Function이 반환하는 JSON
```

```typescript
// 패턴 2: FormData 전송 (파일 포함 — send-chat-message에서 사용)
const formData = new FormData()
formData.append('room_id', roomId)
formData.append('content', content)
formData.append('message_type', 'image')
formData.append('file', {
  uri: fileUri,
  name: 'image.jpg',
  type: 'image/jpeg',
} as any)

const { data, error } = await supabase.functions.invoke('send-chat-message', {
  body: formData,
})
```

**공통 에러 처리**: Edge Function은 HTTP 상태 코드로 에러를 구분합니다.

| HTTP 상태 | 의미 | 앱 처리 |
|-----------|------|--------|
| 200 | 성공 | `data` 사용 |
| 400 | 잘못된 요청 (파라미터 오류) | `error.message` 표시 |
| 401 | 인증 실패 (JWT 만료/누락) | 재로그인 유도 |
| 403 | 권한 없음 (본인 데이터 아님) | 접근 거부 안내 |
| 500 | 서버 내부 오류 | 재시도 안내 |

### 16-2. inicis-callback (결제 콜백)

**호출 주체**: 이니시스 PG사 서버 (앱에서 직접 호출하지 않음)
**트리거**: 사용자가 WebView에서 결제 완료 후, 이니시스가 `P_RETURN_URL`로 POST 요청

**입력 스펙** (이니시스 PG사 POST 파라미터):

| 파라미터 | 타입 | 설명 |
|---------|------|------|
| `P_STATUS` | string | 결제 상태 (`'00'`=성공) |
| `P_OID` | string | 주문번호 (Order ID) |
| `P_TID` | string | 거래번호 (Transaction ID) |
| `P_AMT` | string | 결제 금액 |
| `P_RMESG1` | string | 결과 메시지 |
| `P_NOTI` | string | 앱에서 전달한 JSON 문자열 (§15-6 참조) |
| `P_AUTH_DT` | string | 승인 일시 |
| `P_AUTH_NO` | string | 승인 번호 |
| `P_CARD_NUM` | string | 카드 번호 (마스킹) |
| `P_CARD_ISSUER_NAME` | string | 카드사명 |
| `P_TYPE` | string | 결제 수단 (`CARD`, `BANK`, `VBANK`) |

**EF 내부 처리**:
1. `P_NOTI` JSON 파싱 → `memberId`, `kindergartenId`, `petId` 추출
2. `P_OID` 빈 값 시 `P_TID`로 대체 (이니시스 간헐적 이슈 대응)
3. `payments` UPSERT (`pg_transaction_id` 기준): 결제 정보 저장
4. `raw_response` jsonb 컬럼에 PG 응답 전체 저장 (감사 추적용)
5. 결제 성공/실패 판단 후 HTML 반환 → WebView에서 `postMessage`로 앱에 결과 전달

**출력**: HTML 페이지 (앱 WebView에서 실행)

```html
<script>
  // 앱 WebView의 onMessage 이벤트로 결과 전달
  window.ReactNativeWebView.postMessage(JSON.stringify({
    result: 'Y',           // 'Y'=성공, 'N'=실패
    payment_id: '...',     // payments 테이블 UUID (신규 추가)
    pg_transaction_id: '...', // PG 거래번호
    amount: 50000,         // 결제 금액
    message: '결제가 완료되었습니다'
  }))
</script>
```

**앱 코드 변경**: §15-6 WebView 콜백 URL 변경만 필요. `inicis-callback` 자체는 서버 사이드 코드.

**Secrets 사용**: `INICIS_MID` (이니시스 상점 ID) — 응답 검증 시 MID 일치 확인

### 16-3. send-chat-message (채팅 메시지 전송)

**호출 주체**: 앱 (채팅 메시지 전송 시)
**가이드 참조**: §14-5 (R4에서 상세 설명 완료)

**입력 스펙**:

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `room_id` | UUID | ✅ | 채팅방 ID |
| `content` | string | 조건부 | 텍스트 내용 (이미지 전용이면 빈 문자열) |
| `message_type` | string | ✅ | `'text'`, `'image'`, `'file'` (사용자 전송용, DB에는 영문 8종 저장) |
| `image_files` | File[] | ❌ | 이미지/파일 배열 (FormData로 전송) |

**EF 내부 처리**:
1. JWT에서 `sender_id` 추출
2. `chat_room_members` 검증 (참여자인지)
3. 파일 있으면 → `chat-files` Storage 업로드 → URL 획득
4. `chat_messages` INSERT
5. `chat_rooms` UPDATE (`last_message`, `last_message_at`, `total_message_count +1`)
6. 상대방 `is_muted` 체크
7. `is_muted=false`면 → `send-push` 내부 호출 (FCM 발송)
8. `notifications` INSERT

**출력 스펙**:

| 필드 | 타입 | 설명 |
|------|------|------|
| `success` | boolean | 성공 여부 |
| `data.message_id` | UUID | 생성된 메시지 ID |
| `data.image_urls` | string[] | 업로드된 이미지 URL 배열 |
| `error` | string | 에러 메시지 (실패 시) |

**Secrets 사용**: `FIREBASE_SERVICE_ACCOUNT_JSON` (FCM 발송)

> 📝 코드 예시: `APP_MIGRATION_CODE.md` #25 참조 (R4에서 작성 완료)

### 16-4. create-reservation (예약 생성)

**호출 주체**: 앱 (결제 완료 후 예약 생성 시)
**가이드 참조**: §15-4

**입력 스펙**:

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `kindergarten_id` | UUID | ✅ | 유치원 ID — `kindergartens` 테이블 PK (§15-4 주의사항 참조) |
| `pet_id` | UUID | ✅ | 반려동물 ID |
| `checkin_scheduled` | string (ISO 8601) | ✅ | 등원 예정 (`'2026-04-20T09:00:00+09:00'`) |
| `checkout_scheduled` | string (ISO 8601) | ✅ | 하원 예정 |
| `walk_count` | integer | ✅ | 산책 횟수 (0~N) |
| `pickup_requested` | boolean | ✅ | 픽드랍 요청 |
| `payment_id` | UUID | ✅ | 결제 ID (inicis-callback에서 반환) |
| `room_id` | UUID | ❌ | 기존 채팅방 (없으면 자동 생성) |

**업데이트 모드** (추가 필드):

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `reservation_id` | UUID | ✅ (업데이트 시) | 기존 예약 ID |
| `status` | string | ✅ (업데이트 시) | 변경할 상태 |
| `reject_reason` | string | 조건부 | 거절 사유 (status='거절' 시) |
| `reject_detail` | string | ❌ | 거절 상세 |
| `cancel_reason` | string | 조건부 | 취소 사유 (status='취소' 시) |

**EF 내부 처리** (생성 모드):
1. `reservations` INSERT (`status='수락대기'`, `requested_at=NOW()`)
2. `payments.reservation_id` UPDATE (결제↔예약 연결)
3. `room_id` 없으면 `app_create_chat_room` RPC 호출 → 채팅방 자동 생성
4. `chat_room_reservations` INSERT (채팅방↔예약 연결)
5. `chat_messages` INSERT (`message_type='reservation_request'`, 시스템 메시지)
6. Realtime `postgres_changes` 자동 전파 (chat_messages INSERT)
7. 상대방 `send-push` 호출 (FCM)
8. `notifications` INSERT

**EF 내부 처리** (업데이트 모드):
- `status='예약확정'`: DB `'예약확정'` 그대로 저장, `message_type='reservation_confirmed'` 시스템 메시지 + FCM
- `status='거절'`: DB `'유치원거절'`으로 변환 저장, `reject_reason`/`reject_detail` 기록, `message_type='reservation_rejected'` 시스템 메시지 + FCM
- `status='취소'`: DB `'보호자취소'`(보호자) 또는 `'유치원취소'`(유치원)으로 변환 저장, `message_type='reservation_cancelled'` 시스템 메시지 + FCM (⚠️ 위약금/`refunds` 로직은 TODO)

**출력 스펙**:

| 필드 | 타입 | 설명 |
|------|------|------|
| `success` | boolean | 성공 여부 |
| `data.reservation_id` | UUID | 생성/갱신된 예약 ID |
| `data.room_id` | UUID | 채팅방 ID |
| `data.status` | string | 현재 예약 상태 |
| `error` | string | 에러 메시지 (실패 시) |

**Secrets 사용**: `FIREBASE_SERVICE_ACCOUNT_JSON` (FCM 발송)

> 📝 코드 예시: `APP_MIGRATION_CODE.md` #36 참조

### 16-5. complete-care (돌봄 완료)

**호출 주체**: 앱 (돌봄 완료 확인 시)
**가이드 참조**: §15-5

**입력 스펙**:

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `reservation_id` | UUID | ✅ | 예약 ID |

> `auth.uid()`로 호출자 자동 식별 (보호자/유치원 판별)

**EF 내부 처리**:
1. `reservations` 조회 → 당사자 여부 검증
2. 호출자가 보호자면 `guardian_checkout_confirmed=true`, 유치원이면 `kg_checkout_confirmed=true`
3. 양측 모두 확인 시: `status='돌봄완료'`, `checkout_actual=NOW()`
4. `chat_messages` INSERT (`message_type='care_end'`) — 돌봄 종료 시스템 메시지
5. `chat_messages` INSERT (`message_type='review'`) — 후기 작성 유도 메시지
6. 상대방 `send-push` 호출 (FCM)
7. `notifications` INSERT
8. 한쪽만 확인 시: `auto_complete_scheduled_at` 설정 (예: 24시간 후)

**출력 스펙**:

| 필드 | 타입 | 설명 |
|------|------|------|
| `success` | boolean | 성공 여부 |
| `data.status` | string | 갱신된 예약 상태 |
| `data.both_confirmed` | boolean | 양측 모두 하원 확인 완료 여부 |
| `data.guardian_checkout_confirmed` | boolean | 보호자 확인 여부 |
| `data.kg_checkout_confirmed` | boolean | 유치원 확인 여부 |
| `error` | string | 에러 메시지 (실패 시) |

**Secrets 사용**: `FIREBASE_SERVICE_ACCOUNT_JSON` (FCM 발송)

> 📝 코드 예시: `APP_MIGRATION_CODE.md` #39 참조

### 16-6. send-alimtalk (카카오 알림톡)

**호출 주체**: Supabase Auth SMS 훅 (앱에서 직접 호출하지 않음)
**가이드 참조**: §1-2 (R1에서 설명 완료)

**트리거**: Supabase Auth `signInWithOtp({ phone })` 호출 시, Supabase Auth가 **커스텀 SMS 훅**으로 이 Edge Function을 자동 호출합니다.

**입력 스펙** (Supabase Auth가 전달):

| 필드 | 타입 | 설명 |
|------|------|------|
| `phone` | string | 수신 전화번호 (`+821012345678` 국제 형식) |
| `otp` | string | Supabase가 생성한 OTP 코드 (6자리) |

**EF 내부 처리**:
1. `phone`에서 국가번호 제거 → `01012345678` 형식 변환
2. 루나소프트 API 호출 (카카오 알림톡 템플릿으로 OTP 발송)
3. 발송 결과 로깅

**Secrets 사용**: `KAKAO_ALIMTALK_API_KEY`, `KAKAO_ALIMTALK_USER_ID`

**앱 코드 변경**: 없음. `supabase.auth.signInWithOtp({ phone })` 한 줄이면 자동으로 이 Edge Function이 호출됩니다.

### 16-7. send-push (FCM 푸시)

**호출 주체**: 다른 Edge Function 내부 (앱에서 직접 호출하지 않음)
**사용처**: `send-chat-message`, `create-reservation`, `complete-care`, `scheduler`에서 내부 호출

**입력 스펙**:

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `member_id` | UUID | 조건부 | 단건 발송 대상 |
| `member_ids` | UUID[] | 조건부 | 다건 발송 대상 |
| `title` | string | ✅ | 푸시 알림 제목 |
| `body` | string | ✅ | 푸시 알림 본문 |
| `data` | object | ❌ | 추가 데이터 (`screen`, `reservation_id` 등 — 앱에서 딥링크용) |

> `member_id`와 `member_ids` 중 하나 필수. 양쪽 모두 없으면 에러.

**EF 내부 처리**:
1. `fcm_tokens`에서 대상 회원의 FCM 토큰 조회 (복수 기기 가능)
2. Firebase Admin SDK로 멀티캐스트 발송
3. 만료/무효 토큰 → `fcm_tokens`에서 자동 삭제 (cleanup)
4. 발송 결과 반환 (성공/실패 수)

**출력 스펙**:

| 필드 | 타입 | 설명 |
|------|------|------|
| `success` | boolean | 성공 여부 |
| `data.sent_count` | number | 발송 성공 수 |
| `data.failed_count` | number | 발송 실패 수 |
| `data.cleaned_tokens` | number | 삭제된 무효 토큰 수 |

**Secrets 사용**: `FIREBASE_SERVICE_ACCOUNT_JSON`

**앱 코드 변경**: 없음. 이 Edge Function은 다른 EF에서만 호출합니다.

### 16-8. API #66. scheduler.php → Edge Function `scheduler`

**호출 주체**: pg_cron 또는 외부 cron (앱에서 직접 호출하지 않음)
**실행 주기**: 5분 간격

기존 `scheduler.php`는 PHP cron job으로 실행되며, 예약 상태 자동 변경 + 알림 발송을 담당합니다. 전환 후에는 Edge Function `scheduler`가 동일 역할을 수행합니다.

**처리 항목** (5분마다 실행):

| # | 처리 | 대상 조건 | 동작 |
|---|------|---------|------|
| 1 | 등원 30분 전 알림 | `checkin_scheduled - 30min ≤ NOW()` AND `reminder_start_sent_at IS NULL` AND `status='예약확정'` | FCM 발송 + `reminder_start_sent_at=NOW()` |
| 2 | 하원 30분 전 알림 | `checkout_scheduled - 30min ≤ NOW()` AND `reminder_end_sent_at IS NULL` AND `status='돌봄진행중'` | FCM 발송 + `reminder_end_sent_at=NOW()` |
| 3 | 돌봄 시작 자동 처리 | `checkin_scheduled ≤ NOW()` AND `care_start_sent_at IS NULL` AND `status='예약확정'` | `status='돌봄진행중'` + 시스템 메시지(`care_start`) + FCM + `care_start_sent_at=NOW()` |
| 4 | 돌봄 종료 자동 처리 | `checkout_scheduled ≤ NOW()` AND `care_end_sent_at IS NULL` AND `status='돌봄진행중'` | 시스템 메시지(`care_end` + `review`) + FCM + `care_end_sent_at=NOW()` |
| 5 | 자동 완료 | `auto_complete_scheduled_at ≤ NOW()` AND `status='돌봄진행중'` | `status='돌봄완료'` + `checkout_actual=NOW()` (양측 미확인 자동 완료) |

**알림 중복 방지**: 각 처리 항목에 `*_sent_at` 타임스탬프 컬럼이 있으며, `IS NULL` 조건으로 미발송 건만 대상으로 합니다. 한 번 발송 후 `sent_at` 값이 기록되면 다음 실행 시 스킵됩니다.

**cron 설정 방법** (2가지):

```sql
-- 방법 1: Supabase pg_cron + Vault (권장, 실제 적용 완료)
-- Step 1: Vault에 시크릿 저장
SELECT vault.create_secret('https://ieeodlkvfnjikdpcumfa.supabase.co', 'project_url');
SELECT vault.create_secret('실제_SERVICE_ROLE_KEY', 'service_role_key');

-- Step 2: cron Job 등록 (Vault에서 시크릿 참조)
SELECT cron.schedule(
  'scheduler-every-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/scheduler',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
-- 상세: sql/47_01_scheduler_cron_setup.sql 참조
```

```bash
# 방법 2: 외부 cron (pg_cron 미사용 시)
# 5분마다 Edge Function 호출
*/5 * * * * curl -X POST \
  https://<project-ref>.supabase.co/functions/v1/scheduler \
  -H "Authorization: Bearer <service_role_key>" \
  -H "Content-Type: application/json"
```

**Secrets 사용**: `FIREBASE_SERVICE_ACCOUNT_JSON` (FCM 발송)

**앱 코드 변경**: 없음. 서버 설정(pg_cron 또는 외부 cron)만 필요합니다.

> 📝 코드 예시: `APP_MIGRATION_CODE.md` #66 참조

---

## 부록 A. 타입 정의 변경 총정리

> 기존 `types/` 디렉토리의 인터페이스 변경 요약.
> 각 섹션의 상세 설명은 본문 해당 장을 참조하세요.
> 이 부록은 **전체 인터페이스를 한눈에 비교**하기 위한 목적입니다.

### A-1. UserType 변경

> 상세: §1-5 인증 상태 관리

| 기존 필드 | 전환 후 필드 | 타입 변경 | 비고 |
|---|---|---|---|
| `mb_id` (폰번호) | `id` (UUID) | `string` → `string` | 값 형태 변경 (폰번호→UUID) |
| `mb_no` (정수 PK) | `id` (UUID) | `number` → `string` | PK 통합 |
| `mb_name` | `name` | — | |
| `mb_nick` | `nickname` | — | |
| — | `nickname_tag` | — (신규) | `'#1001'` 형식 태그 |
| `mb_5` (`'1'`/`'2'`) | `current_mode` (`'보호자'`/`'유치원'`) | `string` → `string` | 값 의미 명확화 |
| `mb_profile1` (파일명) | `profile_image` (전체 URL) | `string` → `string` | Storage URL |
| `mb_2` (주민번호 앞6자리) | `birth_date` | `string` → `string` | date 타입 |
| `mb_hp` | `phone` | — | 키 변경 |
| `mb_addr1` | `address_road` | — | 키 변경 |
| `mb_4` | `address_complex` | — | 키 변경 (단지명) |
| — | `session` (`Session \| null`) | — (신규) | Supabase Auth 세션 |
| — | `address_verified` (boolean) | — (신규) | 주소 인증 여부 |

```typescript
// types/userType.ts (전환 후)
import { Session } from '@supabase/supabase-js'

interface UserType {
  session: Session | null
  id: string                // UUID (= auth.uid())
  phone: string
  name: string
  nickname: string
  nickname_tag: string       // '#1001'
  current_mode: '보호자' | '유치원'
  profile_image: string      // Storage 전체 URL
  birth_date: string         // 'YYYY-MM-DD'
  address_road: string
  address_complex: string
  address_building_dong: string
  address_building_ho: string
  address_direct: string
  latitude: number | null
  longitude: number | null
  address_verified: boolean
  status: string             // '정상' | '탈퇴' | '정지'
}
```

### A-2. PetType / PetFormType 변경

> 상세: §3-7 PetType 인터페이스 변경 요약

| 기존 필드 | 전환 후 필드 | 타입 변경 | 비고 |
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
| `wr_7` (문자열) | `weight` | `string` → `number` | numeric |
| `wr_8` (`'Y'`/`'N'`) | `is_vaccinated` | `string` → `boolean` | |
| `wr_10` (`'Y'`/`'N'`) | `is_draft` | `string` → `boolean` | |
| `firstYN` (`'Y'`/`'N'`) | `is_representative` | `string` → `boolean` | |
| `deleteYN` (`'Y'`/`'N'`) | `deleted` | `string` → `boolean` | |
| `animal_img1`~`10` | `photo_urls` | 10× `string` → `string[]` | 배열 통합 |
| — | `size_class` | — (신규) | 트리거 자동 계산 |
| — | `created_at` | — (신규) | timestamptz |

```typescript
// types/petType.ts (전환 후)
interface PetType {
  id: string                  // UUID
  member_id: string           // UUID
  name: string
  description: string | null
  gender: '수컷' | '암컷'
  is_neutered: boolean
  breed: string
  birth_date: string          // 'YYYY-MM-DD'
  is_birth_date_unknown: boolean
  weight: number              // kg
  is_vaccinated: boolean
  is_draft: boolean
  is_representative: boolean
  deleted: boolean
  photo_urls: string[]        // Storage URL 배열
  size_class: '소형' | '중형' | '대형' | null  // 트리거 자동
  created_at: string          // ISO 8601
}
```

### A-3. PartnerType → KindergartenType 변경

> 상세: §11-6 유치원/보호자 타입 변경 요약

| 기존 필드 | 전환 후 필드 | 타입 변경 | 비고 |
|---|---|---|---|
| `wr_id` (정수) | `id` (UUID) | `number` → `string` | PK |
| `wr_subject` | `name` | — | |
| `wr_content` | `description` | — | |
| `wr_2` (파이프 문자열) | 12개 가격 컬럼 | `string` → `number` × 12 | 구조 분리 |
| `partner_img1`~`10` | `photo_urls` | 10× `string` → `string[]` | 배열 통합 |
| `partner_freshness` (100) | `freshness_current` | — | 실제값 |
| `partner_rCnt` ('0') | `review_count` (RPC) | `string` → `number` | 실제 COUNT |
| `is_favorite` (`'Y'`/`'N'`) | `is_favorite` | `string` → `boolean` | |
| `settlement_ready` (`'0'`/`'1'`) | `inicis_status` | `string` → `string` | 값 변경 |
| `animals[]` | `resident_pets[]` | — | 키 변경 |
| `mb_addr1` | `address_road` | — | 키 변경 |
| `mb_4` | `address_complex` | — | 키 변경 (단지명) |

```typescript
// types/kindergartenType.ts (전환 후)
interface KindergartenType {
  id: string
  name: string
  description: string | null
  address_road: string
  address_complex: string
  address_building_dong: string
  latitude: number | null
  longitude: number | null
  photo_urls: string[]
  inicis_status: '미등록' | '심사중' | '등록완료' | '반려'
  registration_status: 'draft' | 'registered'
  freshness_current: number
  // 가격 — 소형/중형/대형 × 1시간/24시간/산책/픽드랍
  price_small_1h: number | null
  price_small_24h: number | null
  price_small_walk: number | null
  price_small_pickup: number | null
  price_medium_1h: number | null
  price_medium_24h: number | null
  price_medium_walk: number | null
  price_medium_pickup: number | null
  price_large_1h: number | null
  price_large_24h: number | null
  price_large_walk: number | null
  price_large_pickup: number | null
}

// RPC #17 응답 (유치원 상세 전체)
interface KindergartenDetailResponse {
  kindergarten: KindergartenType
  operator: { id: string; nickname: string; profile_image: string }
  resident_pets: PetType[]
  review_count: number
  inicis_status: string
  is_favorite: boolean
}
```

### A-4. PaymentRequestType → ReservationType 변경

> 상세: §12-4 PaymentRequestType → ReservationType 변경 요약

| 기존 필드 | 전환 후 필드 | 타입 변경 | 비고 |
|---|---|---|---|
| `id` (정수) | `id` (UUID) | `number` → `string` | PK |
| `mb_id` (폰번호) | — | — | auth.uid() 자동 |
| `to_mb_id` (폰번호) | — | — | RPC 분리로 불필요 |
| `start_date` + `start_time` | `checkin_scheduled` | `string×2` → `string` | ISO 8601 통합 |
| `end_date` + `end_time` | `checkout_scheduled` | `string×2` → `string` | ISO 8601 통합 |
| `price` (예약 컬럼) | `payment.amount` | — | 테이블 분리 |
| `penalty` (예약 컬럼) | `refund.penalty_amount` | — | 테이블 분리 |
| `is_review_written` (컬럼) | `is_review_written` (서브쿼리) | — | EXISTS로 판단 |
| `status` | `status` | — | 값 동일 |
| `total: 0` (하드코딩) | `meta.total` (실제 COUNT) | — | 버그 수정 |

```typescript
// types/reservationType.ts (전환 후)
interface ReservationType {
  id: string
  status: '수락대기' | '예약확정' | '돌봄진행중' | '돌봄완료' | '거절' | '취소'
  checkin_scheduled: string    // ISO 8601
  checkout_scheduled: string
  checkout_actual: string | null
  walk_count: number
  pickup_requested: boolean
  is_review_written: boolean
  requested_at: string
  // RPC에서 중첩 객체로 제공
  pet: { id: string; name: string; breed: string; photo_urls: string[] }
  kindergarten: { id: string; name: string; address_road: string; photo_urls: string[] }
  payment: { amount: number; status: string; method: string; paid_at: string } | null
  refund: { penalty_amount: number; refund_amount: number; status: string } | null
}
```

### A-5. ChatRoomType / MessageType 변경

> 상세: §14-10 ChatRoomType / MessageType 변경 요약

| 기존 필드 | 전환 후 필드 | 타입 변경 | 비고 |
|---|---|---|---|
| `room.id` (정수) | `room_id` (UUID) | `number` → `string` | PK |
| `room.name` (`'폰번호-폰번호'`) | — (제거) | — | FK 구조로 대체 |
| `room.last_message` | `last_message` | — | |
| `room.last_message_time` | `last_message_at` | `string` → `string` | timestamptz |
| `room.unread_count` | `unread_count` | — | RPC 서브쿼리 |
| 상대방 이름 (name 파싱) | `opponent.nickname` | — | 구조화 |
| 상대방 이미지 (별도 조회) | `opponent.profile_image` | — | RPC JOIN |
| `msg.id` (정수) | `id` (UUID) | `number` → `string` | PK |
| `msg.room_id` | `chat_room_id` | — | FK 키명 변경 |
| `msg.mb_id` (폰번호) | `sender_id` (UUID) | — | 키·값 변경 |
| `msg.file_path` (단일) | `image_urls` (jsonb) | `string` → `string[]` | 다중 이미지 |
| `msg.file_type` | — (제거) | — | `message_type`으로 대체 |

```typescript
// types/chatType.ts (전환 후)
interface ChatRoomType {
  room_id: string
  status: '활성' | '비활성'
  last_message: string | null
  last_message_at: string | null
  last_message_type: string | null
  unread_count: number
  is_muted: boolean
  opponent: {
    id: string
    nickname: string
    profile_image: string
    role: '보호자' | '유치원'
  }
  reservation_count: number
}

interface ChatMessageType {
  id: string
  chat_room_id: string
  sender_id: string
  sender_type: '보호자' | '유치원' | '시스템'
  message_type: 'text' | 'image' | 'file' | 'reservation_request' | 'reservation_confirmed' | 'care_start' | 'care_end' | 'review'
  content: string
  image_urls: string[] | null
  is_read: boolean
  created_at: string
}
```

### A-6. SettlementType 변경

> 상세: §13-1 API #41 정산 RPC

```typescript
// types/settlementType.ts (전환 후) — RPC #41 응답
interface SettlementSummaryResponse {
  summary: {
    total_settled: number       // 정산완료 누적
    total_pending: number       // 정산예정
    total_held: number          // 보류
  }
  next_settlement: {
    amount: number
    scheduled_date: string
    bank_name: string
    account_number_masked: string
  } | null
  period_summary: {
    settlement_revenue: number
    payment_total: number
    fee_total: number
  }
  details: Array<{
    id: string
    reservation_id: string
    amount: number
    fee: number
    net_amount: number
    status: '정산완료' | '정산예정' | '보류'
    settled_at: string | null
    guardian: { nickname: string; profile_image: string }
    pet: { name: string }
  }>
  meta: { total: number; page: number; per_page: number }
}
```

### A-7. ReviewType 변경

> 상세: §13-2 API #44 보호자→유치원 후기, §13-3 API #44b 유치원→보호자 후기

```typescript
// types/reviewType.ts (전환 후)

// 보호자→유치원 후기 (RPC #44 응답)
interface GuardianReviewsResponse {
  tags: Array<{ tag: string; count: number }>  // 7개 긍정 태그 집계
  reviews: Array<{
    id: string
    satisfaction: '최고예요' | '좋았어요' | '아쉬워요'
    selected_tags: string[]     // jsonb
    content: string
    image_urls: string[] | null // jsonb
    written_at: string
    pet: { id: string; name: string; photo_urls: string[] }
    member: { nickname: string; profile_image: string }
  }>
  meta: { total: number; page: number; per_page: number }
}

// 유치원→보호자 후기 (RPC #44b 응답)
interface KindergartenReviewsResponse {
  tags: Array<{ tag: string; count: number }>  // 7개 긍정 태그 집계
  reviews: Array<{
    id: string
    satisfaction: '최고예요' | '좋았어요' | '아쉬워요'
    selected_tags: string[]
    content: string
    written_at: string
    is_guardian_only: boolean    // true면 보호자에게만 표시
    kindergarten: { id: string; name: string }
  }>
  meta: { total: number; page: number; per_page: number }
}
```

### A-8. PendingCareRequestType 변경 (앱 내부 State — Jotai Atom)

> `states/pendingCareRequestAtom.ts` — 결제/예약 생성 흐름에서 사용되는 앱 내부 상태 타입.
> DB 테이블 타입은 아니지만, `create-reservation` EF에 전달하는 `kindergarten_id` 값의 출처이므로 기록합니다.

| 기존 필드 | 전환 후 필드 | 변경 유형 | 비고 |
|---|---|---|---|
| `kindergartenMemberId` | `kindergartenMemberId` | **유지** | 유치원 운영자 `members.id` (UUID) — 채팅 등 기타 용도 |
| — (신규) | `kindergartenId` | **추가** | `kindergartens` 테이블 PK (UUID) — EF `create-reservation`에 전달 |
| `to_mb_id` (참조) | — | **제거** | `payment/index.tsx`에서 잘못 참조하던 필드. `kindergartenId`로 대체 |

```typescript
// states/pendingCareRequestAtom.ts (전환 후)
interface PendingCareRequestType {
  memberId: string
  kindergartenId: string        // kindergartens 테이블 PK UUID (EF create-reservation 전달용)
  kindergartenMemberId: string  // 유치원 운영자 members UUID (채팅 등 기타 용도)
  pet_id: number
  start_date: string
  start_time: string
  end_date: string
  end_time: string
  walk_count: number
  pickup_dropoff: 0 | 1
  special_request: string
  price: string
  roomId: string
  // ... 표시용 필드 생략
}
```

> ⚠️ **관련 수정 파일 (5개)**:
> - `states/pendingCareRequestAtom.ts` — `kindergartenId` 필드 추가
> - `app/payment/request.tsx` — `kindergartenId: partner?.id` 저장
> - `app/payment/index.tsx` — `pendingCare?.to_mb_id` → `pendingCare?.kindergartenId` 교체
> - `app/payment/approval.tsx` — `pendingCare.kindergartenMemberId` → `pendingCare.kindergartenId` 교체
> - `app/payment/inicisApproval.tsx` — 동일 교체

---

## 부록 B. 환경 변수 / 패키지 체크리스트

### B-1. 환경 변수 (.env)

| 변수 | 기존 | 전환 후 | 비고 |
|------|------|--------|------|
| `EXPO_PUBLIC_API_URL` | `https://woo1020.iwinv.net` | **삭제** | apiClient 삭제 시 |
| `EXPO_PUBLIC_WEBSOCKET_URL` | `wss://wooyoopet.store/ws` | **삭제** | Supabase Realtime 사용 |
| `EXPO_PUBLIC_SUPABASE_URL` | — | **추가** | `https://<project-ref>.supabase.co` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | — | **추가** | `eyJhbGciOiJIUzI1NiIs...` |
| `EXPO_PUBLIC_INICIS_MID` | (하드코딩 `INIpayTest`) | **추가** | 테스트: `INIpayTest` / 상용: `wooyoope79` |
| `EXPO_PUBLIC_KAKAO_REST_API_KEY` | (하드코딩) | **추가** (권장) | 카카오 주소 검색 API 키 |

> **`.env` 파일 분리 권장**: `.env.development` (테스트 MID) / `.env.production` (상용 MID) 분리

### B-2. 패키지 변경

| 패키지 | 변경 | 비고 |
|--------|------|------|
| `@supabase/supabase-js` | **추가** | 핵심 의존성 (v2.x) |
| `react-native-url-polyfill` | **추가** | Supabase JS 필수 (React Native에서 URL 지원) |
| `react-native-mmkv` | **제거** (Phase A) | Expo Go 빌드 오류 원인 — AsyncStorage로 전환 (§0-4 참조) |
| `react-use-websocket` | **제거** (전환 완료 후) | Supabase Realtime으로 대체 (Phase C 완료 후) |
| `@tosspayments/widget-sdk-react-native` | **제거** | 미사용 확인 (이니시스 확정) |

```bash
# 추가 설치
yarn add @supabase/supabase-js react-native-url-polyfill
# ※ @react-native-async-storage/async-storage는 이미 설치되어 있음 (^2.2.0)

# Phase A 시작 시 제거 (MMKV → AsyncStorage 전환)
yarn remove react-native-mmkv

# 전환 완료 후 제거
yarn remove react-use-websocket
yarn remove @tosspayments/widget-sdk-react-native
```

### B-3. 전환 완료 후 삭제 파일

| 파일 | 이유 | 삭제 시점 |
|------|------|---------|
| `utils/apiClient.ts` | Supabase JS로 완전 대체 | Phase D 완료 후 |
| `storage/mmkvStorage.ts` | AsyncStorage로 전환하면서 교체 (§0-4 참조) | Phase A |
| `tossPay/` 디렉토리 | 미사용 (이니시스 확정) | 즉시 가능 |
| `app/payment/tossPay.tsx` | 미사용 | 즉시 가능 |

### B-4. 신규 생성 파일

| 파일 | 용도 | 생성 시점 |
|------|------|---------|
| `lib/supabase.ts` | Supabase 클라이언트 초기화 (§0-4) | Phase A 시작 전 |
| `utils/handleSupabaseError.ts` | 공통 에러 핸들러 (§2-4, 선택사항) | Phase A |
| `types/supabase.ts` | Supabase 자동 생성 타입 (선택사항) | 필요 시 |

### B-5. 전환 완료 검증 체크리스트

- [ ] **코드 검색**: 전체 소스에서 `react-native-mmkv` import → **0건** 확인 (MMKV 전환 완료)
- [ ] **코드 검색**: 전체 소스에서 `apiClient` import → **0건** 확인
- [ ] **코드 검색**: 전체 소스에서 `EXPO_PUBLIC_API_URL` 참조 → **0건** 확인
- [ ] **코드 검색**: 전체 소스에서 `EXPO_PUBLIC_WEBSOCKET_URL` 참조 → **0건** 확인
- [ ] **코드 검색**: 전체 소스에서 `useWebSocket` import → **0건** 확인
- [ ] **코드 검색**: 전체 소스에서 `mb_id` 문자열 → **0건** 확인 (용어 매핑 완료)
- [ ] **코드 검색**: 전체 소스에서 `wr_id`, `wr_subject`, `wr_content` → **0건** 확인
- [ ] **빌드**: `expo build` (또는 `eas build`) 성공
- [ ] **타입 체크**: `tsc --noEmit` 에러 0건
- [ ] **인증 흐름**: OTP 발송 → 인증 확인 → JWT 세션 발급 → 자동 갱신
- [ ] **Phase A**: 인증 + 단순 CRUD 43개 API 정상 동작
- [ ] **Phase B**: RPC 15개 정상 동작 (포함: #60 `app_get_blocked_list`)
- [ ] **Phase C**: 채팅 Realtime 정상 동작 (메시지 수신/발송/미읽음)
- [ ] **Phase D**: 결제/예약 + Edge Function 7개 정상 동작
- [ ] **삭제**: `utils/apiClient.ts`, `tossPay/`, `.env`에서 기존 URL 제거
- [ ] **삭제**: `react-use-websocket`, `@tosspayments/widget-sdk-react-native` 패키지 제거

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
| 2026-04-18 | **R3 본문 작성** — §11 유치원/보호자 RPC (아키텍처 변경 요약, #17~#20 API 설명 4개, KindergartenDetailType/GuardianDetailType 매핑표), §12 예약 조회 RPC (보호자/유치원 분리 설명, #37~#38 API 설명 2개, PaymentRequestType→ReservationType 매핑표), §13 리뷰/정산/교육 RPC (#41 정산 2개 PHP 통합 설명 + 4파트 구조, #44/#44b 리뷰 태그 집계 + is_guardian_only 분기, #61 교육 이수현황 통합 조회). 총 10개 API TODO 해소 |
| 2026-04-18 | **R4 본문 작성** — §14 채팅 전환 (14-1~14-10: WebSocket↔Realtime 아키텍처 비교 다이어그램, useChat.ts 리팩터링 가이드 — 제거 대상/전환 후 구조/R2 완료 항목 정리, #22 create_room RPC — SECURITY DEFINER 이유·중복 방지·방 복원, #23 get_rooms RPC — 미읽음 서브쿼리·상대방 프로필 JOIN, #25 send_message Edge Function — 처리 흐름 8단계·입출력 스펙, Realtime postgres_changes 구독 패턴 — RLS 연동·broadcast 차이, Storage chat-files 버킷 연동 — private 버킷·signed URL, 읽음 처리 미읽음 카운트 계산 공식, R2 자동 API 교차 참조 6개, ChatRoomType/MessageType 변경 요약 + WebSocket↔Realtime 비교표). CODE #28/#29 FK 교정 (room_id → chat_room_id) |
| 2026-04-18 | **R4 리뷰 반영 (Issue 1~4)** — Issue 1: RPC_PHP_MAPPING.md 채팅 RPC 2개 추가·제목 13→15개 (선행 반영 완료). Issue 2: DB_MAPPING_REFERENCE.md `chat_room_members.room_id` → `chat_room_id (FK)` 교정 (sql/41_08 스키마 동기화). Issue 3: MIGRATION_PLAN.md §9-1에 `app_create_chat_room` SECURITY DEFINER 예외 사유 추가 (chat_room_members INSERT RLS 부재·중복 방 검사 시 타 회원 행 SELECT 필요). Issue 4: §14-8 미읽음 카운트 SQL `cm.id >` UUID v4 비교 → `cm.created_at >` 타임스탬프 서브쿼리 비교로 교정 + UUID v4 순서 미보장 경고 노트 추가, MIGRATION_PLAN Step 4 표에 채팅 RPC 2행(4-8, 4-9) 추가 |
| 2026-04-18 | **R5 리뷰 반영 (Issue 1~2)** — Issue 1: §15 헤더 관련 API 수량 `#34~#39 (6개)` → `#34~#36, #39 (4개)` 교정 + TOC §15 행 동기화 (#37~#38은 §12 참조 안내). Issue 2: §15-5 complete-care 출력 필드 테이블 3→5행 확장 — `data.guardian_checkout_confirmed` (boolean), `data.kg_checkout_confirmed` (boolean) 추가, `data.status`/`error` 설명 보강 |
| 2026-04-18 | **R5 본문 작성** — §15 결제/예약 전환 (15-1~15-7: 현재↔전환 후 결제 흐름 비교 다이어그램, #34 inicis-callback — WebView P_RETURN_URL 변경·P_NOTI 파라미터·앱 호출 삭제, #35 set_inicis_approval 삭제 — inicis-callback 내부 흡수·앱 3단계→1단계, #36 create-reservation EF — 예약 생성+채팅방 자동 생성+FCM 원자적 처리·생성/업데이트 통합, #39 complete-care EF — 양측 하원 확인 로직·auto_complete, WebView 콜백 URL 변경 상세·P_MID 환경변수 분리, 테스트/상용 MID 전환 가이드). §16 Edge Function 인터페이스 (16-1~16-8: 앱 호출/서버 전용 EF 분류표, 공통 호출 패턴 2종 — JSON body·FormData, HTTP 에러 코드 매핑표, inicis-callback 입력 11필드+HTML 출력 스펙, send-chat-message 8단계 처리 흐름, create-reservation 생성 8단계+업데이트 모드 3분기, complete-care 8단계 처리+auto_complete, send-alimtalk Auth SMS 훅 연동, send-push 범용 FCM — 멀티캐스트+토큰 cleanup, scheduler 5개 처리 항목+알림 중복 방지+pg_cron 설정 예시). 총 4개 API TODO 해소 + 7개 EF 인터페이스 확정 |
| 2026-04-18 | **R6 본문 작성** — 부록 A 타입 정의 변경 총정리 (A-1 UserType: Session 통합·mb_* 매핑 13개, A-2 PetType: wr_*→정규 컬럼 15개·boolean/배열 변환, A-3 KindergartenType: 가격 12개 분리·KindergartenDetailResponse 구조, A-4 ReservationType: 날짜 통합·결제/환불 테이블 분리, A-5 ChatRoomType/ChatMessageType: WebSocket→Realtime 필드 매핑·opponent 구조화, A-6 SettlementSummaryResponse: 4파트 구조, A-7 ReviewType: GuardianReviewsResponse/KindergartenReviewsResponse 태그 집계). 부록 B 환경변수/패키지 체크리스트 완성 (B-1 env 6개·B-2 패키지 4개·B-3 삭제 파일 3개·B-4 신규 파일 3개·B-5 전환 검증 체크리스트 15항목). CODE §9~12 (15개 API) 동시 작성 — 즐겨찾기 #46~#49 UPSERT/UPDATE 패턴, 알림 #50~#52 FCM UPSERT/SELECT/DELETE, 콘텐츠 #53~#57 공개 읽기 패턴·.single() 주의·임베디드 JOIN, 차단 #58~#60 INSERT/DELETE 토글·.maybeSingle()·members JOIN |
| 2026-04-18 | **R6 리뷰 반영 (수정 1~5)** — 수정 1: CODE.md #60 RLS 경고 헤더 추가 + 전환 방식 `자동 API` → `RPC app_get_blocked_list` 변경 + 임베디드 JOIN 코드를 참고용 접힘(details)으로 이동 + After 코드 RPC 호출로 교체 + 응답 매핑 플랫 구조 반영. 수정 2: GUIDE.md §7-2 신설 — `members` RLS 제약 설명 + RPC 전환 방향·SECURITY DEFINER·internal VIEW 사용 근거·Step 4 구현 시점 명시 + §7 표 #60 행 업데이트. 수정 3: MIGRATION_PLAN.md Step 4 표에 4-10 행 추가 (`app_get_blocked_list`, 난이도 하, RLS 제약 사유). 수정 4: RPC_PHP_MAPPING.md #15 행 추가 (`app_get_blocked_list`, `get_blocked_list.php`→SECURITY DEFINER + internal VIEW), 제목 15→16개, 섹션명 변경, 변경 이력 추가. 수정 5: DB_MAPPING_REFERENCE.md §3-1에 `member_blocks` 컬럼 상세 테이블 추가 (5컬럼 + RLS 정책 4개 + RLS 제약 사항 설명). Phase A/B API 수 교정 (Phase A: 44→43, Phase B: 14→15, #60 이동). B-5 체크리스트 RPC 수 14→15 교정 |
| 2026-04-19 | **Step 4 R5 배포 반영** — §16-8 cron 설정 방법을 Vault 방식으로 교체 (기존 `current_setting` 방식 → `vault.create_secret` + `vault.decrypted_secrets` 조회). `sql/47_01_scheduler_cron_setup.sql` 참조 추가. scheduler EF 배포 완료·pg_cron 등록 완료·실행 확인 완료 반영 |
| 2026-04-20 | **MMKV → AsyncStorage 전환 반영** — §0-2 상태 관리 표기 변경, §0-4 Supabase 클라이언트 초기화 코드를 AsyncStorage 직접 전달 방식으로 전면 교체 (mmkvStorageAdapter 제거), §1 인증 흐름 다이어그램 2곳 수정 (MMKV→AsyncStorage), §1-5 userAtom 설명에 MMKV→AsyncStorage 전환 배경·영향 범위 안내 추가 (대상 파일 4개 명시), §1-6 영향 범위 표 1행 수정. 부록 B-2 패키지 변경에 `react-native-mmkv` 제거 행 추가 + yarn 명령어 보강, B-3 삭제 파일에 `storage/mmkvStorage.ts` 추가, B-5 체크리스트에 MMKV import 0건 확인 항목 추가. 전환 사유: `react-native-mmkv` v4.x가 JSI/TurboModules 필수 요구 → Expo Go 시뮬레이터 빌드 오류 발생 → `@react-native-async-storage/async-storage`(이미 package.json에 ^2.2.0 설치됨)로 교체. 서버 사이드(RPC 13개, EF 7개) 수정 없음 확인 완료 |
| 2026-04-21 | **`create-reservation` kindergarten_id 매핑 오류 수정 반영** — §15-4 입력 필드 `kindergarten_id` 설명에 ⚠️ 주의사항 추가 (`kindergartens` 테이블 PK vs 운영자 `members.id` 혼동 방지), §16-4 입력 스펙 테이블에 동일 주의 문구 추가 (§15-4 참조). 부록 A-8 `PendingCareRequestType` 변경 신설 — `kindergartenId` 필드 추가·`kindergartenMemberId` 유지·`to_mb_id` 참조 제거, 관련 수정 파일 5개 목록 기재. CODE.md #36 동시 수정 (코드 주석 보완·변환 포인트 추가·응답 매핑 비고란 교정) |
