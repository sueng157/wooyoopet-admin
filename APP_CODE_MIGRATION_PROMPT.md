# 우유펫 모바일 앱 Supabase 전환 — 코드 일괄 치환 작업 프롬프트

> **작성일**: 2026-04-20 (v3 — API 수 교정, 앱 소스 실사 보강, Phase별 참조 파일 목록 구체화)
> **목적**: APP_MIGRATION_CODE.md의 67개 API 코드 블록(#1~#66 + #44b)의 Before→After 코드를 기존 앱 소스코드에 일괄 적용
> **작업 방식**: 4개 Phase로 나누어 각각 새 채팅방에서 진행
> **산출물**: 수정 완료된 앱 소스코드 zip 파일 (Phase별 누적)

---

## 공통 지시사항 (모든 Phase에 적용)

### 역할
당신은 React Native (Expo) + TypeScript 앱의 백엔드를 PHP/MariaDB에서 Supabase로 전환하는 코드 마이그레이션 전문가입니다.

### 입력 파일
1. **참조 문서** (이 저장소 — develop 브랜치에서 읽기):
   - `APP_MIGRATION_GUIDE.md` (이하 "GUIDE.md") — 전환 가이드 (아키텍처 설명, 주의사항, 타입 변경)
   - `APP_MIGRATION_CODE.md` (이하 "CODE.md") — 67개 API 코드 블록 Before/After 코드 전문 (6,505줄)
   - `MOBILE_APP_ANALYSIS.md` — 앱 소스 분석 보고서

2. **앱 소스코드** (샌드박스에 첨부):
   - `20260404_wooyoopet_react_native_app.zip` → 압축 해제하여 작업

### 앱 소스코드 구조 요약 (실사 확인 완료)

```
wooyoopet_react_native_app/
├── app/                    # Expo Router 파일 기반 라우팅 (~60 페이지)
│   ├── _layout.tsx         # 루트 레이아웃 (onAuthStateChange 추가 대상)
│   ├── (tabs)/             # 탭 네비게이션 (mypage.tsx, paymentHistory.tsx 등)
│   ├── authentication/     # 인증 (authNumber.tsx, address*.tsx, selectMode.tsx 등)
│   ├── chat/               # 채팅 ([room]/index.tsx — 1,482줄, commonPhrase.tsx 등)
│   ├── kindergarten/       # 유치원 (register.tsx, [id]/index.tsx 등)
│   ├── payment/            # 결제 (request.tsx, inicisPayment.tsx, inicisApproval.tsx, tossPay.tsx 등)
│   ├── pet/                # 반려동물 (register.tsx, default.tsx, searchBreed.tsx)
│   ├── protector/          # 보호자
│   ├── review/             # 리뷰 (petWrite.tsx, kindergartenWrite.tsx)
│   ├── settlement/         # 정산 (info.tsx, account.tsx)
│   └── support/            # 고객센터 (notice.tsx, noticeDetail.tsx, customerService.tsx)
├── components/             # 재사용 컴포넌트 (~30개)
├── hooks/                  # 커스텀 훅 (~25개 — useChat.ts, useJoin.ts, usePetList.ts 등)
├── lib/                    # 라이브러리 (현재: firebaseBackgroundHandler.ts만 존재)
│                           # → lib/supabase.ts 신규 생성 대상
├── providers/              # 컨텍스트 프로바이더 (SignalingServerProvider, PaymentProvider)
├── states/                 # Jotai 상태 atom (11개 파일)
│   ├── userAtom.ts         # ★ MMKV→AsyncStorage 전환 대상
│   ├── fcmTokenAtom.ts     # ★ MMKV→AsyncStorage 전환 대상
│   ├── notificationConfigAtom.ts  # ★ MMKV→AsyncStorage 전환 대상
│   └── (기타 8개 — 비영속 atom, 수정 불필요)
├── storage/
│   └── mmkvStorage.ts      # ★ 삭제 → asyncStorage.ts 신규 생성
├── styles/                 # NativeWind/TailwindCSS 스타일
├── tossPay/                # ★ 삭제 대상 (미사용)
├── types/                  # 타입 정의 (19개 파일)
├── utils/                  # 유틸리티
│   ├── apiClient.ts        # ★ 최종 삭제 대상 (Phase D 완료 후)
│   └── (기타 11개)
├── .env                    # 환경변수 (현재: EXPO_PUBLIC_API_URL, EXPO_PUBLIC_WEBSOCKET_URL 등)
└── package.json            # 의존성 (react-native-mmkv ^4.1.0, async-storage ^2.2.0 등)
```

**핵심 수치** (실사):
- 소스 파일: ~175개 TypeScript (.ts/.tsx)
- `apiClient` import: **52개 파일**, 사용 라인: **88건** (non-import)
- `react-native-mmkv` 직접 참조: **1개 파일** (`storage/mmkvStorage.ts`)
- MMKV 간접 참조 (Jotai atom): **3개 파일** (`states/userAtom.ts`, `fcmTokenAtom.ts`, `notificationConfigAtom.ts`)
- 비영속 atom (MMKV 무관): **8개 파일** (수정 불필요)

### 절대 준수 사항

1. **앱 소스코드는 Private 저장소 코드**이므로, 이 저장소(public)에 절대 commit/push하지 마세요.
   - `git add`, `git commit`, `git push` 등을 앱 소스코드에 대해 실행하지 마세요.
   - 샌드박스 내에서만 작업하고 zip 파일로 결과를 전달하세요.
   - 특히 채팅방에서 작업 마무리할 때 zip 압축 시 이 사항을 반드시 재확인하세요.

2. **코드 치환 원칙**:
   - CODE.md의 **Before** 블록에 해당하는 코드를 앱 소스에서 찾아 **After** 블록으로 교체
   - CODE.md의 코드는 "예시"이므로, 실제 앱 소스의 변수명/구조에 맞게 적응시켜야 합니다
   - Before 코드가 정확히 일치하지 않을 수 있으므로, `apiClient.get/post('api/xxx.php')` 패턴을 기준으로 해당 API 호출부를 식별하세요
   - 하나의 파일에 여러 API 호출이 있을 수 있습니다 (예: `app/chat/[room]/index.tsx`에 채팅 관련 API 다수)

3. **MMKV → AsyncStorage 전환** (빌드 오류 해결):
   `react-native-mmkv` v4.x는 JSI/TurboModules를 필수 요구하여 Expo Go 시뮬레이터에서 빌드 오류가 발생합니다.
   `@react-native-async-storage/async-storage`는 이미 package.json에 `^2.2.0`으로 설치되어 있으므로 교체만 하면 됩니다.

   **변경 대상 파일 4개** (앱 소스 실사 확인 완료):

   **(a) `storage/mmkvStorage.ts` → `storage/asyncStorage.ts`로 교체 (파일명 변경)**
   ```typescript
   // 기존 storage/mmkvStorage.ts (삭제)
   import { createJSONStorage } from "jotai/utils";
   import { createMMKV } from "react-native-mmkv";
   export const storage = createMMKV();
   const mmkvStringStorage = {
     getItem: (key: string) => { const v = storage.getString(key); return v ?? null; },
     setItem: (key: string, value: string) => { storage.set(key, value); },
     removeItem: (key: string) => { storage.remove(key); },
   };
   export const jsonStorage = createJSONStorage(() => mmkvStringStorage);
   ```
   ```typescript
   // 신규 storage/asyncStorage.ts (생성)
   import { createJSONStorage } from "jotai/utils";
   import AsyncStorage from "@react-native-async-storage/async-storage";
   export const jsonStorage = createJSONStorage(() => AsyncStorage);
   ```

   **(b) `states/userAtom.ts` — import 경로 + SyncStorage 캐스팅 제거**
   ```typescript
   // 기존
   import { jsonStorage as baseJsonStorage } from "@/storage/mmkvStorage";
   import { SyncStorage } from "jotai/vanilla/utils/atomWithStorage";
   const jsonStorage = baseJsonStorage as SyncStorage<UserType | null>;
   export const userAtom = atomWithStorage("user", null, jsonStorage);
   ```
   ```typescript
   // 변경 후
   import { jsonStorage } from "@/storage/asyncStorage";
   export const userAtom = atomWithStorage("user", null, jsonStorage as any);
   ```

   **(c) `states/fcmTokenAtom.ts` — 동일 패턴**
   ```typescript
   // 기존
   import { jsonStorage as baseJsonStorage } from "@/storage/mmkvStorage";
   import { SyncStorage } from "jotai/vanilla/utils/atomWithStorage";
   const jsonStorage = baseJsonStorage as SyncStorage<string | null>;
   export const fcmTokenAtom = atomWithStorage("fcm-token", null, jsonStorage);
   ```
   ```typescript
   // 변경 후
   import { jsonStorage } from "@/storage/asyncStorage";
   export const fcmTokenAtom = atomWithStorage("fcm-token", null, jsonStorage as any);
   ```

   **(d) `states/notificationConfigAtom.ts` — 동일 패턴**
   ```typescript
   // 기존
   import { jsonStorage as baseJsonStorage } from "@/storage/mmkvStorage";
   import { SyncStorage } from "jotai/vanilla/utils/atomWithStorage";
   const jsonStorage = baseJsonStorage as SyncStorage<NotificationConfigType | null>;
   export const notificationConfigAtom = atomWithStorage("notificationConfig", {...}, jsonStorage);
   ```
   ```typescript
   // 변경 후
   import { jsonStorage } from "@/storage/asyncStorage";
   export const notificationConfigAtom = atomWithStorage("notificationConfig", {...}, jsonStorage as any);
   ```

   **(e) `package.json` — MMKV 패키지 제거**
   ```bash
   yarn remove react-native-mmkv
   # @react-native-async-storage/async-storage는 이미 ^2.2.0 설치됨 — 추가 설치 불필요
   ```

   **나머지 ~170개 소스 파일은 수정 불필요** — Jotai atom 추상화로 storage 백엔드와 무관합니다.
   (`useAtom(userAtom)` 등으로 읽는 쪽은 저장소가 뭔지 모릅니다)

4. **`lib/supabase.ts` 신규 생성** (GUIDE.md §0-4 그대로):
   ```typescript
   // lib/supabase.ts (신규 생성)
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

5. **가이드 문서에 반영되지 않은 추가 수정 사항**:
   코드 치환 과정에서 아래 항목도 포괄적으로 점검하고 수정하세요:
   - `mb_id` 참조가 남아있는 곳 → `user.id` (UUID)로 교체
   - `mb_no`, `mb_name`, `mb_nick`, `mb_5`, `mb_profile1` 등 기존 회원 필드 참조 → 새 필드명으로 교체 (GUIDE §1-5 참조)
   - `wr_id`, `wr_subject`, `wr_content` 등 기존 컬럼명 참조 → 새 컬럼명으로 교체 (GUIDE §0-1 용어 매핑표)
   - `'Y'`/`'N'` 문자열 비교 → `true`/`false` boolean 비교로 교체
   - `response.result === 'Y'` 패턴 → Supabase 응답의 `error === null` 패턴으로 교체
   - `apiClient` import 문 → `supabase` import 문으로 교체 (해당 Phase에서 전환되는 파일만)
   - FormData 생성 코드 → Supabase query builder 또는 Storage 업로드로 교체
   - 타입 인터페이스 파일(`types/*.ts`)의 필드명 변경 반영 (GUIDE.md 부록 A 참조)
   - `EXPO_PUBLIC_API_URL` / `EXPO_PUBLIC_WEBSOCKET_URL` 참조 제거 (해당 Phase에서)

6. **작업 완료 후**:
   - 수정한 파일 목록을 정리하여 보고 (파일 경로 + 변경 내용 요약)
   - 수정 완료된 소스를 zip으로 압축하여 다운로드 가능하게 제공
   - zip 압축 전에 아래 디렉토리/파일은 제외:
     `node_modules`, `.expo`, `.idea`, `.vscode`, `.cursor`, `android/build`, `ios/Pods`

---

## Phase A: 인증 + 단순 CRUD (48개 API)

### 개요
- **GUIDE.md 대응 장**: 0장(공통 설정) + 1장~10장
- **CODE.md 참조 범위**: API #1~#16, #21, #24, #26~#33, #40, #42~#43, #45~#59, #62~#65 + 부록 Storage 패턴
- **난이도**: 가장 낮음 (점진적 전환의 첫 단계)
- **핵심**: MMKV→AsyncStorage 전환 + `lib/supabase.ts` 신규 생성 + `apiClient` → `supabase` 교체 시작

### 작업 순서

#### A-0. 환경 설정 (신규 파일 생성 + 기존 파일 수정)
| 순서 | 작업 | 참조 |
|------|------|------|
| A-0-1 | **MMKV→AsyncStorage 전환**: `storage/mmkvStorage.ts` 삭제 → `storage/asyncStorage.ts` 신규 생성 | 공통 지시사항 #3-(a) |
| A-0-2 | **atom 파일 3개 수정**: `states/userAtom.ts`, `states/fcmTokenAtom.ts`, `states/notificationConfigAtom.ts` — import 경로 변경 + SyncStorage 캐스팅 제거 | 공통 지시사항 #3-(b)(c)(d) |
| A-0-3 | **`package.json`**: `react-native-mmkv` 제거 | 공통 지시사항 #3-(e) |
| A-0-4 | **`lib/supabase.ts` 신규 생성** (Supabase 클라이언트 초기화, AsyncStorage 사용) | 공통 지시사항 #4 / GUIDE §0-4 |
| A-0-5 | **`utils/handleSupabaseError.ts` 신규 생성** (공통 에러 핸들러) | GUIDE §2-4 |
| A-0-6 | **`utils/uploadImage.ts` 신규 생성** (Storage 업로드 공통 유틸) | CODE.md 부록 Storage 패턴 |
| A-0-7 | `.env` 파일에 `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` 추가 (기존 변수는 아직 유지) | GUIDE 부록 B-1 |
| A-0-8 | `@supabase/supabase-js`, `react-native-url-polyfill` 패키지 추가 | GUIDE §0-6 |
| A-0-9 | `@tosspayments/widget-sdk-react-native` 제거, `tossPay/` 디렉토리 + `app/payment/tossPay.tsx` 삭제 | GUIDE 부록 B-2, B-3 |

#### A-1. 인증 전환 (3개 API)
| 순서 | API # | PHP 파일 | Supabase 대응 | CODE.md 참조 |
|------|-------|----------|--------------|-------------|
| A-1-1 | #1 | `alimtalk.php` | `supabase.auth.signInWithOtp()` (앱 직접호출 삭제 → Supabase Auth가 자동 발송) | CODE #1 |
| A-1-2 | #2 | `auth_request.php` | `supabase.auth.verifyOtp()` | CODE #2 |
| A-1-3 | #3 | `set_join.php` | `members UPSERT` | CODE #3 |

**주의사항**:
- `onAuthStateChange` 리스너 설정 (`app/_layout.tsx` 루트 컴포넌트에 추가) — GUIDE §1-5
- `userAtom` 구조 변경: `mb_id`(폰번호) → `id`(UUID), `mb_5` → `current_mode` 등 — GUIDE §1-5, 부록 A-1
- 전화번호 포맷 변환: `01012345678` → `+821012345678`
- 관련 앱 소스 파일: `hooks/useJoin.ts`, `app/authentication/authNumber.tsx`, `app/authentication/selectMode.tsx`

#### A-2. 회원 관리 (6개 API)
| 순서 | API # | PHP 파일 | Supabase 대응 | CODE.md 참조 |
|------|-------|----------|--------------|-------------|
| A-2-1 | #4 | `set_member_leave.php` | RPC `app_withdraw_member` | CODE #4 |
| A-2-2 | #5 | `set_mypage_mode_update.php` | `members UPDATE` | CODE #5 |
| A-2-3 | #6 | `set_profile_update.php` | `members UPDATE + Storage` | CODE #6 |
| A-2-4 | #7 | `set_address_verification.php` | `members UPDATE + Storage` | CODE #7 |
| A-2-5 | #8 | `kakao-address.php` | 카카오 REST API 직접 호출 | CODE #8 |
| A-2-6 | #21 | `set_partner_update.php` | `kindergartens UPDATE + Storage` | CODE #21 |

**주의사항**:
- #4(`set_member_leave`)는 RPC이지만 인증 흐름과 밀접하므로 Phase A에서 처리 — GUIDE §0-5
- #4 After 코드에서 `data?.success` 비즈니스 에러 이중 체크 필수 (ALREADY_WITHDRAWN, HAS_ACTIVE_RESERVATIONS 등)
- #8은 PHP 프록시 제거 → 앱에서 카카오 REST API 직접 호출로 변경 (API 키 보안 주의)
- #6, #7, #21은 이미지 업로드 포함 → Storage 업로드 2단계 패턴 (CODE.md 부록 참조)
- 관련 앱 소스 파일: `app/user/withdraw/index.tsx`, `app/(tabs)/mypage.tsx`, `app/protector/[id]/updateProfile.tsx`, `app/authentication/addressVerify.tsx`, `app/authentication/address.tsx`, `app/authentication/addressDetail.tsx`, `app/kindergarten/register.tsx`

#### A-3. 반려동물 CRUD (8개 API)
| 순서 | API # | PHP 파일 | Supabase 대응 | CODE.md 참조 |
|------|-------|----------|--------------|-------------|
| A-3-1 | #9 | `get_my_animal.php` | `pets SELECT` | CODE #9 |
| A-3-2 | #10 | `get_animal_by_id.php` | `pets SELECT + favorite_pets 별도 조회` | CODE #10 |
| A-3-3 | #11 | `get_animal_by_mb_id.php` | `pets SELECT` | CODE #11 |
| A-3-4 | #12 | `get_animal_kind.php` | `pet_breeds SELECT` | CODE #12 |
| A-3-5 | #13 | `set_animal_insert.php` | `Storage + pets INSERT` | CODE #13 |
| A-3-6 | #14 | `set_animal_update.php` | `Storage + pets UPDATE` | CODE #14 |
| A-3-7 | #15 | `set_animal_delete.php` | `pets UPDATE (soft delete)` | CODE #15 |
| A-3-8 | #16 | `set_first_animal_set.php` | RPC `app_set_representative_pet` | CODE #16 |

**주의사항**:
- PetType 인터페이스 전면 변경 — GUIDE §3-7, 부록 A-2
- `animal_img1`~`10` → `photo_urls[]` 배열 통합
- `'Y'`/`'N'` → boolean 변환 (is_neutered, is_vaccinated 등)
- #10에서 `!inner` JOIN 대신 별도 2회 조회 (찜하지 않은 반려동물도 조회 가능하게)
- #16 `data?.success` 이중 체크 패턴 (RPC 비즈니스 에러 처리)
- 관련 앱 소스 파일: `app/pet/register.tsx`, `app/pet/default.tsx`, `app/pet/searchBreed.tsx`

#### A-4. 즐겨찾기 CRUD (4개 API)
| 순서 | API # | PHP 파일 | Supabase 대응 | CODE.md 참조 |
|------|-------|----------|--------------|-------------|
| A-4-1 | #46 | `set_partner_favorite_add.php` | `favorite_kindergartens UPSERT` | CODE #46 |
| A-4-2 | #47 | `set_partner_favorite_remove.php` | `favorite_kindergartens UPDATE (is_favorite=false)` | CODE #47 |
| A-4-3 | #48 | `set_user_favorite_add.php` | `favorite_pets UPSERT` | CODE #48 |
| A-4-4 | #49 | `set_user_favorite_remove.php` | `favorite_pets UPDATE (is_favorite=false)` | CODE #49 |

**주의사항**: UPSERT `onConflict` 패턴 사용, DELETE 대신 `is_favorite=false` UPDATE

#### A-5. 알림/FCM (3개 API)
| 순서 | API # | PHP 파일 | Supabase 대응 | CODE.md 참조 |
|------|-------|----------|--------------|-------------|
| A-5-1 | #50 | `fcm_token.php` | `fcm_tokens UPSERT` | CODE #50 |
| A-5-2 | #51 | `get_notification.php` | `notifications SELECT` | CODE #51 |
| A-5-3 | #52 | `delete_notification.php` | `notifications DELETE` | CODE #52 |

**주의사항**:
- #50: `member_id` + `token` UNIQUE 제약으로 UPSERT
- #51: RLS 자동 필터 (로그인 사용자 알림만), `type`/`data` jsonb 신규 필드
- #52: 단건 삭제 + 전체 삭제 지원 (전체 삭제 시 `.neq` 더미 조건 패턴)
- 관련 앱 소스 파일: `app/notification/index.tsx`

#### A-6. 콘텐츠 조회 (5개 API)
| 순서 | API # | PHP 파일 | Supabase 대응 | CODE.md 참조 |
|------|-------|----------|--------------|-------------|
| A-6-1 | #53 | `get_banner.php` | `banners SELECT` | CODE #53 |
| A-6-2 | #54 | `get_notice.php` | `notices SELECT` | CODE #54 |
| A-6-3 | #55 | `get_notice_detail.php` | `notices SELECT .single()` | CODE #55 |
| A-6-4 | #56 | `get_faq.php` | `faqs SELECT` | CODE #56 |
| A-6-5 | #57 | `get_policy.php` | `terms SELECT` | CODE #57 |

**주의사항**:
- #55 단건 조회 시 `.single()` 필수 (빠뜨리면 배열 반환 → 앱 크래시, PGRST116 에러 핸들링)
- #57: `terms` + `term_versions` 임베디드 JOIN (버전 관리 구조)
- 관련 앱 소스 파일: `app/support/notice.tsx`, `app/support/noticeDetail.tsx`, `app/support/customerService.tsx`

#### A-7. 차단/신고 (2개 API, #60 제외)
| 순서 | API # | PHP 파일 | Supabase 대응 | CODE.md 참조 |
|------|-------|----------|--------------|-------------|
| A-7-1 | #58 | `set_block_user.php` | `member_blocks INSERT/DELETE 토글` | CODE #58 |
| A-7-2 | #59 | `get_block_user.php` | `member_blocks SELECT` | CODE #59 |

**주의사항**:
- #58: INSERT/DELETE 분리, 23505 중복 에러 무시 패턴
- #59: `.maybeSingle()` 사용 (차단 여부 확인)
- #60(`get_blocked_list`)은 `members` 테이블 RLS 제약으로 임베디드 JOIN 불가 → **Phase B에서 RPC로 처리**

#### A-8. 채팅 템플릿 (4개 API)
| 순서 | API # | PHP 파일 | Supabase 대응 | CODE.md 참조 |
|------|-------|----------|--------------|-------------|
| A-8-1 | #30 | `get_message_template.php` | `chat_templates SELECT` | CODE #30 |
| A-8-2 | #31 | `set_message_template.php` | `chat_templates INSERT` | CODE #31 |
| A-8-3 | #32 | `update_message_template.php` | `chat_templates UPDATE` | CODE #32 |
| A-8-4 | #33 | `delete_message_template.php` | `chat_templates DELETE` | CODE #33 |

**주의사항**: 관련 앱 소스 파일: `app/chat/commonPhrase.tsx`

#### A-9. 기타 자동 API (13개 API)
| 순서 | API # | PHP 파일 | Supabase 대응 | CODE.md 참조 |
|------|-------|----------|--------------|-------------|
| A-9-1 | #24 | `chat.php (get_messages)` | `chat_messages SELECT` | CODE #24 |
| A-9-2 | #26 | `chat.php (get_images)` | `chat_messages SELECT (image)` | CODE #26 |
| A-9-3 | #27 | `chat.php (leave_room)` | `chat_rooms UPDATE` | CODE #27 |
| A-9-4 | #28 | `chat.php (muted)` | `chat_room_members UPDATE` | CODE #28 |
| A-9-5 | #29 | `read_chat.php` | `chat_room_members UPDATE` | CODE #29 |
| A-9-6 | #40 | `set_care_review.php` | `guardian_reviews/kindergarten_reviews INSERT` | CODE #40 |
| A-9-7 | #42 | `get_settlement_info.php` | `settlement_infos SELECT` | CODE #42 |
| A-9-8 | #43 | `set_settlement_info.php` | `settlement_infos UPSERT` | CODE #43 |
| A-9-9 | #45 | `set_review.php` | `guardian_reviews/kindergarten_reviews INSERT + Storage` | CODE #45 |
| A-9-10 | #62 | `set_solved.php` | `education_completions UPSERT` | CODE #62 |
| A-9-11 | #63 | `get_bank_list.php` | `banks SELECT` | CODE #63 |
| A-9-12 | #64 | `get_favorite_animal_list.php` | `favorite_pets SELECT + pets JOIN` | CODE #64 |
| A-9-13 | #65 | `get_favorite_partner_list.php` | `favorite_kindergartens SELECT + kindergartens JOIN` | CODE #65 |

**주의사항**:
- #28, #29의 FK 컬럼명: `.eq('room_id')` → `.eq('chat_room_id')` 교정 필요 — CODE #28, #29 변환 포인트
- #24, #26~#29는 `app/chat/[room]/index.tsx` (1,482줄)에 집중 — Phase C에서 교차 확인
- #40, #45 리뷰 테이블 분리: `type` 파라미터에 따라 `guardian_reviews` 또는 `kindergarten_reviews`
- #62 교육 이수: `topic_details` JSONB 배열 갱신 패턴
- #64, #65 임베디드 JOIN 패턴
- 관련 앱 소스 파일: `app/chat/[room]/index.tsx`, `app/review/petWrite.tsx`, `app/review/kindergartenWrite.tsx`, `app/settlement/info.tsx`, `app/settlement/account.tsx`, `app/kindergarten/tutorial/index.tsx`

#### A-10. 타입 인터페이스 변경
| 파일 | 변경 내용 | 참조 |
|------|----------|------|
| `types/userType.ts` | UserType 전면 변경 (mb_id→id, mb_5→current_mode 등) | GUIDE §1-5, 부록 A-1 |
| `types/petType.ts` | PetType 전면 변경 (animal_img→photo_urls, Y/N→boolean 등) | GUIDE §3-7, 부록 A-2 |

### Phase A 완료 체크리스트
- [ ] `storage/mmkvStorage.ts` 삭제 → `storage/asyncStorage.ts` 생성 완료
- [ ] atom 3개 파일 import 경로 변경 + SyncStorage 캐스팅 제거 완료
- [ ] `package.json`에서 `react-native-mmkv` 제거됨
- [ ] `lib/supabase.ts` 생성됨 (AsyncStorage 직접 사용)
- [ ] `utils/handleSupabaseError.ts` 생성됨
- [ ] `utils/uploadImage.ts` 생성됨 (Storage 공통 유틸)
- [ ] 인증 흐름 (#1~#3) 전환 완료 + `onAuthStateChange` 설정
- [ ] 단순 CRUD 45개 API 전환 완료 (#4~#16, #21, #24, #26~#33, #40, #42~#43, #45~#59, #62~#65)
- [ ] UserType, PetType 인터페이스 변경 완료
- [ ] `tossPay/` 디렉토리 + `app/payment/tossPay.tsx` 삭제됨
- [ ] 전체 소스에서 `react-native-mmkv` import → **0건** 확인
- [ ] 전체 소스에서 `mmkvStorage` import → **0건** 확인
- [ ] zip 압축하여 다운로드 제공 (node_modules, .expo, .idea, .vscode 등 제외)

### Phase A 전용 프롬프트

```
## 작업 요청: 우유펫 모바일 앱 Phase A — 인증 + 단순 CRUD (48개 API)

### 입력
1. 참조 문서: 이 저장소 develop 브랜치의 아래 파일들을 읽어주세요
   - `APP_CODE_MIGRATION_PROMPT.md` — **먼저 읽기** (전체 작업 구조, 공통 지시사항, Phase 간 관계, apiClient 52개 파일 목록, 주의사항)
   - `APP_MIGRATION_GUIDE.md` (GUIDE.md) — §0~§10 + 부록 A-1, A-2, B 전체
   - `APP_MIGRATION_CODE.md` (CODE.md) — API #1~#16, #21, #24, #26~#33, #40, #42~#43, #45~#59, #62~#65 + 부록 Storage 패턴
   - `MOBILE_APP_ANALYSIS.md` — 앱 소스 구조 파악용
2. 앱 소스코드: 샌드박스에 첨부한 `20260404_wooyoopet_react_native_app.zip`

### 작업 내용
1. zip 파일을 샌드박스에서 압축 해제
2. **먼저 A-0 환경 설정 수행** (MMKV→AsyncStorage 전환 + lib/supabase.ts 생성 + 유틸리티 생성 + 패키지 변경)
3. GUIDE.md의 설명을 참고하여 CODE.md의 Before→After 코드를 앱 소스에 일괄 적용
4. 작업 순서: A-0(환경설정) → A-1(인증) → A-2(회원) → A-3(반려동물) → A-4(즐겨찾기) → A-5(알림) → A-6(콘텐츠) → A-7(차단) → A-8(채팅 템플릿) → A-9(기타) → A-10(타입)
5. 위 작업계획서(`APP_CODE_MIGRATION_PROMPT.md`)의 "공통 지시사항"을 모두 준수

### MMKV→AsyncStorage 전환 상세 (A-0에서 수행)
기존 앱의 MMKV 사용처를 전수 조사한 결과, 변경 대상은 정확히 4개 파일입니다:
- `storage/mmkvStorage.ts` 삭제 → `storage/asyncStorage.ts` 신규 생성
- `states/userAtom.ts` — import 경로 + SyncStorage 캐스팅 제거
- `states/fcmTokenAtom.ts` — 동일
- `states/notificationConfigAtom.ts` — 동일
- `package.json` — `react-native-mmkv` 제거 (AsyncStorage는 이미 설치됨)
나머지 ~170개 소스 파일은 수정 불필요합니다 (Jotai atom 추상화).
구체적인 변경 코드는 작업계획서의 "공통 지시사항 #3"을 참조하세요.

### 상세 API 목록 (48개)
#1, #2, #3, #4, #5, #6, #7, #8, #9, #10, #11, #12, #13, #14, #15, #16, #21,
#24, #26, #27, #28, #29, #30, #31, #32, #33,
#40, #42, #43, #45,
#46, #47, #48, #49, #50, #51, #52,
#53, #54, #55, #56, #57, #58, #59,
#62, #63, #64, #65

### 절대 준수
- 앱 소스코드를 이 저장소에 절대 commit/push 하지 마세요 (Private 코드)
- 샌드박스에서만 작업하고 zip 파일로 결과를 전달해주세요
- zip 압축 시 node_modules, .expo, .idea, .vscode, .cursor, android/build, ios/Pods 등 제외
- 수정한 파일 목록을 정리하여 보고해주세요 (파일 경로 + 변경 요약)
```

---

## Phase B: RPC 조회 (11개 API)

### 개요
- **GUIDE.md 대응 장**: 11장~13장 + 7장 #60
- **CODE.md 참조 범위**: API #17~#20, #37, #38, #41, #44, #44b, #60, #61
- **난이도**: 중간 (RPC 호출 패턴)
- **핵심**: `apiClient.get()` → `supabase.rpc()` 교체
- **전제 조건**: Phase A 완료된 소스코드를 입력으로 사용

### 작업 순서

#### B-1. 유치원/보호자 RPC (4개 API)
| 순서 | API # | PHP 파일 | Supabase 대응 | CODE.md 참조 |
|------|-------|----------|--------------|-------------|
| B-1-1 | #17 | `get_partner.php` | RPC `app_get_kindergarten_detail` | CODE #17 |
| B-1-2 | #18 | `get_partner_list.php` | RPC `app_get_kindergartens` | CODE #18 |
| B-1-3 | #19 | `get_protector.php` | RPC `app_get_guardian_detail` | CODE #19 |
| B-1-4 | #20 | `get_protector_list.php` | RPC `app_get_guardians` | CODE #20 |

**주의사항**:
- 응답 구조 대폭 변경: `partner` → `kindergarten`, `animals` → `resident_pets`
- 가격 구조: 파이프 문자열(`|` 구분) → 12개 개별 숫자 컬럼 → `prices` 중첩 객체
- KindergartenType, GuardianDetailType 인터페이스 변경 — GUIDE §11-6, 부록 A-3
- #17, #19: SECURITY DEFINER RPC + `internal.members_public_profile` VIEW 패턴 (타인 프로필 조회)
- 관련 앱 소스 파일: `hooks/useKinderGarten.ts`, `hooks/useProtector.ts`, `utils/fetchPartnerList.ts`, `utils/fetchProtectorList.ts`

#### B-2. 예약 조회 RPC (2개 API)
| 순서 | API # | PHP 파일 | Supabase 대응 | CODE.md 참조 |
|------|-------|----------|--------------|-------------|
| B-2-1 | #37 | `get_payment_request.php` | RPC `app_get_reservations` / `app_get_reservations_kindergarten` | CODE #37 |
| B-2-2 | #38 | `get_payment_request_by_id.php` | RPC `app_get_reservation_detail` | CODE #38 |

**주의사항**:
- #37은 `current_mode`에 따라 2개 RPC 중 하나를 호출하도록 분기 (보호자 / 유치원)
- PaymentRequestType → ReservationType 인터페이스 변경 — GUIDE §12-4, 부록 A-4
- 날짜 통합: `start_date`+`start_time` → `checkin_scheduled` (ISO 8601)
- 관련 앱 소스 파일: `hooks/usePaymentRequestList.ts`, `hooks/usePaymentRequest.ts`, `app/(tabs)/paymentHistory.tsx`

#### B-3. 리뷰/정산/교육 RPC (4개 API)
| 순서 | API # | PHP 파일 | Supabase 대응 | CODE.md 참조 |
|------|-------|----------|--------------|-------------|
| B-3-1 | #41 | `get_settlement.php` | RPC `app_get_settlement_summary` | CODE #41 |
| B-3-2 | #44 | `get_review.php (type=pet)` | RPC `app_get_guardian_reviews` | CODE #44 |
| B-3-3 | #44b | `get_review.php (type=partner)` | RPC `app_get_kindergarten_reviews` | CODE #44b |
| B-3-4 | #61 | `get_education.php` | RPC `app_get_education_with_progress` | CODE #61 |

**주의사항**:
- #41 정산: 2개 PHP → 1개 RPC 통합 (앱에서 2번 호출 → 1번으로), 4파트 구조 응답
- #44, #44b 리뷰: `type` 파라미터 분기 → 별도 RPC 호출로 분리, 태그 집계 7개 항목
- #61 교육: topics+quiz+completion 통합 RPC
- 관련 앱 소스 파일: `hooks/useSettlement.ts`, `hooks/useReviewList.ts`, `app/kindergarten/tutorial/index.tsx`

#### B-4. 차단 목록 RPC (1개 API)
| 순서 | API # | PHP 파일 | Supabase 대응 | CODE.md 참조 |
|------|-------|----------|--------------|-------------|
| B-4-1 | #60 | `get_blocked_list.php` | RPC `app_get_blocked_list` | CODE #60 |

**주의사항**: Phase A에서 제외된 API. `members` 테이블 RLS(`id = auth.uid()`) 제약으로 임베디드 JOIN 시 타인 프로필 `null` 반환 → SECURITY DEFINER RPC 필수
- 관련 앱 소스 파일: `hooks/useBlockList.ts`

#### B-5. 타입 인터페이스 변경
| 파일 | 변경 내용 | 참조 |
|------|----------|------|
| `types/kindergartenType.ts` | PartnerType → KindergartenType (prices 중첩 객체, 금융정보 제외) | GUIDE 부록 A-3 |
| `types/protectorType.ts` | ProtectorType → GuardianDetailType | GUIDE 부록 A-3 |
| `types/paymentRequestType.ts` | PaymentRequestType → ReservationType (날짜 ISO 8601 통합) | GUIDE 부록 A-4 |
| `types/settlementType.ts` | SettlementType 변경 | GUIDE 부록 A-6 |
| `types/reviewType.ts` | ReviewType 변경 (태그 집계, is_guardian_only 등) | GUIDE 부록 A-7 |

### Phase B 완료 체크리스트
- [ ] RPC 10개 API 전환 완료 (#17~#20, #37, #38, #41, #44, #44b, #61)
- [ ] #60 차단 목록 RPC 전환 완료
- [ ] 유치원/보호자/예약/정산/리뷰 타입 변경 완료
- [ ] 전체 소스에서 전환 대상 `apiClient` 호출 → supabase.rpc() 교체 확인
- [ ] zip 압축하여 다운로드 제공

### Phase B 전용 프롬프트

```
## 작업 요청: 우유펫 모바일 앱 Phase B — RPC 조회 (11개 API)

### 입력
1. 참조 문서: 이 저장소 develop 브랜치의 아래 파일들을 읽어주세요
   - `APP_CODE_MIGRATION_PROMPT.md` — **먼저 읽기** (전체 작업 구조, 공통 지시사항, Phase 간 관계, 주의사항)
   - `APP_MIGRATION_GUIDE.md` — §11~§13 + §7-2 (#60 RPC 전환 사유) + 부록 A-3, A-4, A-6, A-7
   - `APP_MIGRATION_CODE.md` — API #17~#20, #37, #38, #41, #44, #44b, #60, #61
   - `MOBILE_APP_ANALYSIS.md` — 앱 소스 구조 파악용
2. 앱 소스코드: 샌드박스에 첨부한 **Phase A 완료 zip** 파일

### 작업 내용
1. Phase A 완료된 소스를 압축 해제
2. CODE.md의 Before→After 코드를 적용 (RPC 호출 패턴: `supabase.rpc()`)
3. 작업 순서: B-1(유치원/보호자) → B-2(예약 조회) → B-3(리뷰/정산/교육) → B-4(차단 #60) → B-5(타입)
4. 위 작업계획서(`APP_CODE_MIGRATION_PROMPT.md`)의 "공통 지시사항"을 모두 준수

### 상세 API 목록 (11개)
#17, #18, #19, #20, #37, #38, #41, #44, #44b, #60, #61

### 절대 준수
- 앱 소스코드를 이 저장소에 절대 commit/push 하지 마세요 (Private 코드)
- 샌드박스에서만 작업하고 zip 파일로 결과를 전달해주세요
- zip 압축 시 node_modules, .expo, .idea, .vscode, .cursor, android/build, ios/Pods 등 제외
- 수정한 파일 목록을 정리하여 보고해주세요 (파일 경로 + 변경 요약)
```

---

## Phase C: 채팅 Realtime 전환 (3개 신규 API + 교차 확인)

### 개요
- **GUIDE.md 대응 장**: 14장
- **CODE.md 참조 범위**: API #22, #23, #25 (신규) + #24, #26~#30 (Phase A 교차 확인)
- **난이도**: 높음 (useChat.ts 대규모 리팩터링)
- **핵심**: WebSocket (`react-use-websocket`) → Supabase Realtime (`supabase.channel()`)
- **전제 조건**: Phase B 완료된 소스코드를 입력으로 사용

### 작업 순서

#### C-1. WebSocket 코드 제거 + Realtime 구독 설정
| 작업 | 설명 | 참조 |
|------|------|------|
| C-1-1 | `hooks/useChat.ts`에서 `react-use-websocket` import 및 관련 코드 전체 제거 | GUIDE §14-2 |
| C-1-2 | `supabase.channel()` Realtime 구독 코드 추가 (postgres_changes) | GUIDE §14-6, CODE #25 After 코드 |
| C-1-3 | heartbeat (25초 ping/pong), reconnect 로직 제거 (Supabase 자동 관리) | GUIDE §14-2 |
| C-1-4 | `ReadyState` 상태 체크 → 채널 상태 체크로 교체 | GUIDE §14-2 |

**관련 앱 소스 파일**: `hooks/useChat.ts`, `hooks/useChatRoom.ts`, `app/chat/[room]/index.tsx` (1,482줄)

#### C-2. 채팅방 RPC (2개 API)
| 순서 | API # | PHP 파일 | Supabase 대응 | CODE.md 참조 |
|------|-------|----------|--------------|-------------|
| C-2-1 | #22 | `chat.php (create_room)` | RPC `app_create_chat_room` | CODE #22 |
| C-2-2 | #23 | `chat.php (get_rooms)` | RPC `app_get_chat_rooms` | CODE #23 |

**주의사항**:
- #22 SECURITY DEFINER RPC: 채팅방 생성 + chat_room_members 2건 INSERT 트랜잭션, 중복 방지/방 복원 로직
- #23 응답의 `opponent` 구조화 객체: 기존 `name` 폰번호 조합 파싱 → 구조화된 상대방 프로필
- #23 미읽음 계산: UUID v4 순서 미보장 → `created_at > (서브쿼리)` 타임스탬프 비교

#### C-3. 메시지 전송 Edge Function (1개 API)
| 순서 | API # | PHP 파일 | Supabase 대응 | CODE.md 참조 |
|------|-------|----------|--------------|-------------|
| C-3-1 | #25 | `chat.php (send_message)` | EF `send-chat-message` | CODE #25 |

**주의사항**:
- FormData → `supabase.functions.invoke()` (JSON body 또는 FormData)
- 이미지 전송: `file_path` → `image_urls` (Storage URL 배열, `chat-files` 버킷)
- Realtime `postgres_changes` INSERT 이벤트로 자동 전파 (WebSocket send 불필요)

#### C-4. 이미 전환된 자동 API 교차 확인
Phase A에서 전환한 #24, #26~#30이 채팅 흐름에서 정상 동작하는지 확인:
- #24 메시지 히스토리 (`chat_messages SELECT`)
- #26 이미지 목록 (`chat_messages SELECT image`)
- #27 방 나가기 (`chat_rooms UPDATE`)
- #28 음소거 (`chat_room_members UPDATE` — `.eq('chat_room_id')` 확인)
- #29 읽음 처리 (`chat_room_members UPDATE` — `.eq('chat_room_id')` 확인)
- #30 상용문구 (`chat_templates SELECT`)

#### C-5. 타입 인터페이스 + 패키지 정리
| 작업 | 설명 | 참조 |
|------|------|------|
| C-5-1 | ChatRoomType, ChatMessageType 인터페이스 변경 | GUIDE §14-10, 부록 A-5 |
| C-5-2 | `react-use-websocket` 패키지 제거 (`yarn remove react-use-websocket`) | GUIDE 부록 B-2 |
| C-5-3 | `EXPO_PUBLIC_WEBSOCKET_URL` 환경변수 참조 제거 (`.env`에서 삭제) | GUIDE 부록 B-1 |

### Phase C 완료 체크리스트
- [ ] WebSocket 코드 완전 제거 (`react-use-websocket` import 0건)
- [ ] `EXPO_PUBLIC_WEBSOCKET_URL` 참조 0건 (`.env` + 소스 코드 모두)
- [ ] `useWebSocket` 참조 0건
- [ ] Realtime 구독 설정 완료 (postgres_changes)
- [ ] 채팅방 생성/목록 RPC 전환 완료 (#22, #23)
- [ ] 메시지 전송 EF 전환 완료 (#25)
- [ ] ChatRoomType, ChatMessageType 변경 완료
- [ ] Phase A에서 전환한 #24, #26~#30 교차 확인 완료
- [ ] zip 압축하여 다운로드 제공

### Phase C 전용 프롬프트

```
## 작업 요청: 우유펫 모바일 앱 Phase C — 채팅 Realtime 전환 (3개 신규 API + 교차 확인)

### 입력
1. 참조 문서: 이 저장소 develop 브랜치의 아래 파일들을 읽어주세요
   - `APP_CODE_MIGRATION_PROMPT.md` — **먼저 읽기** (전체 작업 구조, 공통 지시사항, Phase 간 관계, 주의사항)
   - `APP_MIGRATION_GUIDE.md` — §14 전체 (14-1~14-10) + 부록 A-5
   - `APP_MIGRATION_CODE.md` — API #22, #23, #25 + (교차 확인: #24, #26~#30)
   - `MOBILE_APP_ANALYSIS.md` — §6 채팅 시스템 분석
2. 앱 소스코드: 샌드박스에 첨부한 **Phase B 완료 zip** 파일

### 작업 내용
1. Phase B 완료된 소스를 압축 해제
2. **useChat.ts 대규모 리팩터링**: WebSocket → Supabase Realtime
3. 작업 순서: C-1(WebSocket 제거+Realtime) → C-2(채팅방 RPC) → C-3(메시지 EF) → C-4(교차 확인) → C-5(타입+패키지)
4. 위 작업계획서(`APP_CODE_MIGRATION_PROMPT.md`)의 "공통 지시사항"을 모두 준수

### 핵심 변경
- `react-use-websocket` 라이브러리 완전 제거
- `supabase.channel()` + `postgres_changes` 구독으로 교체
- heartbeat (25초 ping/pong) / reconnect 로직 삭제 (Supabase 자동 관리)
- useChat.ts 대규모 리팩터링 (app/chat/[room]/index.tsx 1,482줄 주의)

### 상세 API 목록 (신규 3개 + 교차 확인 7개)
신규: #22, #23, #25
교차 확인: #24, #26, #27, #28, #29, #30

### 절대 준수
- 앱 소스코드를 이 저장소에 절대 commit/push 하지 마세요 (Private 코드)
- 샌드박스에서만 작업하고 zip 파일로 결과를 전달해주세요
- zip 압축 시 node_modules, .expo, .idea, .vscode, .cursor, android/build, ios/Pods 등 제외
- 수정한 파일 목록을 정리하여 보고해주세요 (파일 경로 + 변경 요약)
```

---

## Phase D: 결제/예약 + Edge Functions (5개 API + 최종 정리)

### 개요
- **GUIDE.md 대응 장**: 15장~16장
- **CODE.md 참조 범위**: API #34, #35, #36, #39, #66
- **난이도**: 가장 높음 (WebView 결제 흐름 변경)
- **핵심**: PHP 콜백 → Edge Function, 앱 순차 3회 호출 → 1회로 축소
- **전제 조건**: Phase C 완료된 소스코드를 입력으로 사용

### 작업 순서

#### D-1. 결제 WebView 콜백 URL 변경 (2개 API)
| 순서 | API # | PHP 파일 | Supabase 대응 | CODE.md 참조 |
|------|-------|----------|--------------|-------------|
| D-1-1 | #34 | `inicis_payment.php` | EF `inicis-callback` (앱: P_RETURN_URL만 변경) | CODE #34 |
| D-1-2 | #35 | `set_inicis_approval.php` | **삭제** (inicis-callback 내부 흡수) | CODE #35 |

**주의사항**:
- `P_RETURN_URL` 변경: `EXPO_PUBLIC_API_URL/api/inicis_payment.php` → `EXPO_PUBLIC_SUPABASE_URL/functions/v1/inicis-callback`
- `P_MID` 환경변수화: 하드코딩 `INIpayTest` → `EXPO_PUBLIC_INICIS_MID` (.env에 추가)
- #35 `set_inicis_approval.php` 호출 코드 **전체 삭제** (`saveInicisApproval` 함수 제거 — inicis-callback EF가 내부 흡수)
- WebView `onMessage` 콜백에서 `payment_id` 수신 추가
- 기존 3단계(WebView 승인→승인저장→예약생성) → 1단계(WebView → EF 자동 처리)로 축소
- 관련 앱 소스 파일: `app/payment/inicisPayment.tsx`, `app/payment/inicisApproval.tsx`(삭제 대상)

#### D-2. 예약 생성 Edge Function (1개 API)
| 순서 | API # | PHP 파일 | Supabase 대응 | CODE.md 참조 |
|------|-------|----------|--------------|-------------|
| D-2-1 | #36 | `set_payment_request.php` | EF `create-reservation` | CODE #36 |

**주의사항**:
- 기존 앱 3회 순차 호출 (승인저장→예약생성→채팅메시지) → EF 1회 호출
- FormData → JSON body (날짜 ISO 8601 통합, `price` 파라미터 제거 → 변조 방지)
- 생성 모드 + 업데이트 모드(확정/거절/취소) 통합
- 부가 처리(채팅 메시지, FCM 푸시) EF 내부 원자적 처리
- 관련 앱 소스 파일: `app/payment/request.tsx` (1,206줄)

#### D-3. 돌봄 완료 Edge Function (1개 API)
| 순서 | API # | PHP 파일 | Supabase 대응 | CODE.md 참조 |
|------|-------|----------|--------------|-------------|
| D-3-1 | #39 | `set_care_complete.php` | EF `complete-care` | CODE #39 |

**주의사항**: 양측 하원 확인 로직 (보호자/유치원 각각 확인), `both_confirmed` 상세 응답

#### D-4. 스케줄러 (앱 코드 변경 없음)
| API # | 설명 | 앱 코드 변경 |
|-------|------|-------------|
| #66 | `scheduler.php` → EF `scheduler` | **없음** (서버 사이드 전용, pg_cron 실행) |

#### D-5. 최종 정리 (전체 전환 검증)
| 작업 | 설명 | 참조 |
|------|------|------|
| D-5-1 | `utils/apiClient.ts` **삭제** | GUIDE §2-5, 부록 B-3 |
| D-5-2 | `.env`에서 `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_WEBSOCKET_URL` **제거** | GUIDE 부록 B-1 |
| D-5-3 | 전체 소스 `apiClient` import 검색 → 0건 확인 | GUIDE 부록 B-5 |
| D-5-4 | 전체 소스 `mb_id` 문자열 검색 → 0건 확인 | GUIDE 부록 B-5 |
| D-5-5 | 전체 소스 `wr_id`, `wr_subject` 검색 → 0건 확인 | GUIDE 부록 B-5 |
| D-5-6 | 전체 소스 `react-native-mmkv` import 검색 → 0건 확인 | GUIDE 부록 B-5 |
| D-5-7 | 전체 소스 `mmkvStorage` import 검색 → 0건 확인 | GUIDE 부록 B-5 |
| D-5-8 | 전체 소스 `EXPO_PUBLIC_API_URL` 참조 → 0건 확인 | GUIDE 부록 B-5 |
| D-5-9 | 전체 소스 `useWebSocket` import 검색 → 0건 확인 | GUIDE 부록 B-5 |

### Phase D 완료 체크리스트 (= 전체 전환 완료)
- [ ] 결제 WebView P_RETURN_URL 변경 완료
- [ ] `set_inicis_approval.php` 호출 코드 삭제 (`app/payment/inicisApproval.tsx` 포함)
- [ ] create-reservation EF 전환 완료
- [ ] complete-care EF 전환 완료
- [ ] `utils/apiClient.ts` 삭제됨
- [ ] `.env`에서 `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_WEBSOCKET_URL` 제거됨
- [ ] **전체 소스 0건 확인 (grep 검증)**:
  - [ ] `apiClient` 참조 → **0건**
  - [ ] `mb_id` 참조 → **0건**
  - [ ] `wr_id` / `wr_subject` 참조 → **0건**
  - [ ] `react-native-mmkv` 참조 → **0건**
  - [ ] `mmkvStorage` 참조 → **0건**
  - [ ] `EXPO_PUBLIC_API_URL` 참조 → **0건**
  - [ ] `EXPO_PUBLIC_WEBSOCKET_URL` 참조 → **0건**
  - [ ] `useWebSocket` 참조 → **0건**
- [ ] **최종 zip 압축하여 다운로드 제공**

### Phase D 전용 프롬프트

```
## 작업 요청: 우유펫 모바일 앱 Phase D — 결제/예약 + Edge Functions (5개 API + 최종 정리)

### 입력
1. 참조 문서: 이 저장소 develop 브랜치의 아래 파일들을 읽어주세요
   - `APP_CODE_MIGRATION_PROMPT.md` — **먼저 읽기** (전체 작업 구조, 공통 지시사항, Phase 간 관계, 최종 검증 체크리스트)
   - `APP_MIGRATION_GUIDE.md` — §15~§16 전체 + §2-5 (apiClient 삭제) + 부록 B
   - `APP_MIGRATION_CODE.md` — API #34, #35, #36, #39, #66
   - `MOBILE_APP_ANALYSIS.md` — §7 결제 시스템 분석
2. 앱 소스코드: 샌드박스에 첨부한 **Phase C 완료 zip** 파일

### 작업 내용
1. Phase C 완료된 소스를 압축 해제
2. 결제/예약 Edge Function 전환 + apiClient 최종 삭제
3. 작업 순서: D-1(결제 WebView) → D-2(예약 생성 EF) → D-3(돌봄 완료 EF) → D-5(최종 정리)
4. 위 작업계획서(`APP_CODE_MIGRATION_PROMPT.md`)의 "공통 지시사항"을 모두 준수
5. **최종 검증**: 전체 소스에서 아래 항목 모두 0건 확인 (grep 실행 결과 첨부)
   - apiClient, mb_id, wr_id, react-native-mmkv, mmkvStorage
   - EXPO_PUBLIC_API_URL, EXPO_PUBLIC_WEBSOCKET_URL, useWebSocket

### 상세 API 목록 (5개)
#34, #35(삭제), #36, #39, #66(앱 코드 변경 없음)

### 최종 정리 (필수)
- `utils/apiClient.ts` 파일 삭제
- `.env`에서 `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_WEBSOCKET_URL` 제거
- `EXPO_PUBLIC_INICIS_MID` 환경변수 추가 (test: INIpayTest, production: wooyoope79)
- 전체 소스 검증 (grep) 후 결과 보고

### 절대 준수
- 앱 소스코드를 이 저장소에 절대 commit/push 하지 마세요 (Private 코드)
- 샌드박스에서만 작업하고 zip 파일로 결과를 전달해주세요
- zip 압축 시 node_modules, .expo, .idea, .vscode, .cursor, android/build, ios/Pods 등 제외
- 수정한 파일 목록을 정리하여 보고해주세요 (파일 경로 + 변경 요약)
- **이것이 최종 Phase입니다. 완료 후 전체 전환 검증 체크리스트를 실행해주세요.**
```

---

## 전체 작업 요약

| Phase | GUIDE 장 | API 수 | 핵심 | 난이도 |
|-------|---------|--------|------|--------|
| **A** | 0~10장 | 48개 | MMKV→AsyncStorage + 인증 + 단순 CRUD + 환경설정 | 낮음 |
| **B** | 11~13장 + 7장#60 | 11개 | RPC 조회 (유치원/예약/리뷰/정산/교육/차단) | 중간 |
| **C** | 14장 | 3개 (신규) + 7개 (교차 확인) | 채팅 WebSocket → Realtime (useChat.ts 리팩터링) | 높음 |
| **D** | 15~16장 | 5개 | 결제 WebView + Edge Functions + apiClient 삭제 + 최종 검증 | 최고 |
| **합계** | | **67개 CODE.md 코드 블록** | 전체 앱 API 전환 완료 | |

> **API 수 상세**: CODE.md에는 67개 코드 블록이 있습니다 (#1~#66 + #44b).
> Phase A(48) + Phase B(11) + Phase C(3 신규) + Phase D(5) = 67개.
> Phase C의 교차 확인 7개(#24, #26~#30)는 Phase A에서 이미 전환 완료된 것의 동작 확인입니다.
> #66(scheduler)은 서버 사이드 전용으로 앱 코드 변경이 없습니다.

### 작업 흐름
```
Phase A zip 생성 → Phase B에 입력 → Phase B zip 생성 → Phase C에 입력 → Phase C zip 생성 → Phase D에 입력 → 최종 zip
```

### 각 Phase 새 채팅방에서 시작할 때
1. 이 작업계획서(`APP_CODE_MIGRATION_PROMPT.md`)를 먼저 읽으라고 안내
2. 해당 Phase의 "전용 프롬프트" 섹션을 복사하여 사용
3. 이전 Phase의 완료 zip을 첨부

### apiClient 사용 현황 (Phase 진행에 따른 감소 추적 참고)

현재 앱 소스에서 `apiClient`를 import하는 52개 파일 목록:

| 카테고리 | 파일 | 해당 Phase |
|----------|------|-----------|
| 인증 | `app/authentication/authNumber.tsx` | A |
| 인증 | `app/authentication/address.tsx` | A |
| 인증 | `app/authentication/addressDetail.tsx` | A |
| 인증 | `app/authentication/addressVerify.tsx` | A |
| 인증 | `app/authentication/location.tsx` | A |
| 인증 | `app/authentication/selectMode.tsx` | A |
| 회원 | `app/(tabs)/mypage.tsx` | A |
| 회원 | `app/protector/[id]/updateProfile.tsx` | A |
| 회원 | `app/user/withdraw/index.tsx` | A |
| 유치원 | `app/kindergarten/register.tsx` | A |
| 유치원 | `app/kindergarten/tutorial/index.tsx` | A/B |
| 반려동물 | `app/pet/register.tsx` | A |
| 반려동물 | `app/pet/default.tsx` | A |
| 반려동물 | `app/pet/searchBreed.tsx` | A |
| 채팅 | `app/chat/[room]/index.tsx` | A/C |
| 채팅 | `app/chat/[room]/indexX.tsx` | A/C |
| 채팅 | `app/chat/commonPhrase.tsx` | A |
| 결제 | `app/payment/approval.tsx` | D |
| 결제 | `app/payment/inicisApproval.tsx` | D |
| 결제 | `app/(tabs)/paymentHistory.tsx` | B |
| 리뷰 | `app/review/petWrite.tsx` | A |
| 리뷰 | `app/review/kindergartenWrite.tsx` | A |
| 정산 | `app/settlement/info.tsx` | A |
| 정산 | `app/settlement/account.tsx` | A |
| 고객센터 | `app/support/notice.tsx` | A |
| 고객센터 | `app/support/noticeDetail.tsx` | A |
| 고객센터 | `app/support/customerService.tsx` | A |
| 알림 | `app/notification/index.tsx` | A |
| 유틸리티 | `utils/fetchPartnerList.ts` | B |
| 유틸리티 | `utils/fetchProtectorList.ts` | B |
| hooks | `hooks/useBankList.ts` | A |
| hooks | `hooks/useBannerList.ts` | A |
| hooks | `hooks/useBlockList.ts` | A/B |
| hooks | `hooks/useBlockUser.ts` | A |
| hooks | `hooks/useChat.ts` | A/C |
| hooks | `hooks/useChatRoom.ts` | A/C |
| hooks | `hooks/useFavorite.ts` | A |
| hooks | `hooks/useFavoriteAnimalList.ts` | A |
| hooks | `hooks/useFavoritePartnerList.ts` | A |
| hooks | `hooks/useFcmToken.ts` | A |
| hooks | `hooks/useJoin.ts` | A |
| hooks | `hooks/useKinderGarten.ts` | B |
| hooks | `hooks/useNotificationHandler.ts` | A |
| hooks | `hooks/usePaymentRequest.ts` | B/D |
| hooks | `hooks/usePaymentRequestList.ts` | B |
| hooks | `hooks/usePetDetail.ts` | A |
| hooks | `hooks/usePetList.ts` | A |
| hooks | `hooks/usePolicy.ts` | A |
| hooks | `hooks/useProtector.ts` | B |
| hooks | `hooks/useReviewList.ts` | A/B |
| hooks | `hooks/useSettlement.ts` | A/B |
| hooks | `hooks/useSettlementInfo.ts` | A |

> 파일 하나에 여러 Phase의 API가 섞여 있을 수 있습니다 (예: `useChat.ts`는 Phase A에서 #24, #26~#29를 전환하고, Phase C에서 #22, #23, #25와 WebSocket→Realtime을 처리). 해당 Phase에서 다루는 API만 교체하고, 아직 전환하지 않은 API 호출은 그대로 두세요.

---

## 변경 이력

| 버전 | 날짜 | 주요 변경 |
|------|------|----------|
| v1 | 2026-04-20 | 초안 — 추정 기반 |
| v2 | 2026-04-20 | MMKV→AsyncStorage 전환 코드를 앱 소스 실사 기반으로 정확히 기술, GUIDE.md PR#159 반영, 전체 검증 체크리스트 보강 |
| v3 | 2026-04-20 | API 수 교정 (Phase A: 43→48, 총합: 67 코드 블록), 앱 소스 디렉토리 구조 트리 추가, apiClient 사용 52개 파일 전수 목록 추가, Phase별 관련 앱 소스 파일 경로 명시, Phase A-0에 `uploadImage.ts` 유틸 생성 추가, Phase별 주의사항 보강 (RPC 비즈니스 에러 이중 체크, UUID 순서 미보장, PGRST116 에러 등), zip 제외 디렉토리 확대 (.cursor, android/build, ios/Pods), Phase C 교차 확인 항목 #30 추가 (총 7개) |
