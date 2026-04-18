# 우유펫 모바일 앱 API 전환 코드 예시

> **작성일**: 2026-04-17
> **최종 업데이트**: 2026-04-18 (R5 본문 작성 — §6 결제/돌봄 #34~#36,#39 Before/After 코드 + §13 #66 변환 포인트)
> **대상 독자**: 외주 개발자 (React Native/Expo 앱 코드 수정 담당)
> **관련 문서**: `APP_MIGRATION_GUIDE.md` (전환 가이드 — 규칙/표기법/아키텍처 설명), `MIGRATION_PLAN.md` (설계서)
> **표기 규칙**: `APP_MIGRATION_GUIDE.md §0`의 규칙을 따릅니다

---

## 사용법

1. 각 API의 **Before** 블록은 현재 PHP API 호출 코드입니다 (삭제 대상).
2. **After** 블록은 Supabase 전환 후 코드입니다 (교체 대상).
3. **변환 포인트**에 주의사항과 응답 필드 매핑을 정리했습니다.
4. API 번호(`#N`)는 `MIGRATION_PLAN.md §5`의 번호와 동일합니다.
5. 자세한 설명은 `APP_MIGRATION_GUIDE.md`의 해당 장을 참고하세요.

---

## 목차

| 분류 | API 번호 | 수량 |
|------|---------|------|
| [1. 인증/회원](#1-인증회원) | #1~#6 | 6개 |
| [2. 주소 인증](#2-주소-인증) | #7~#8 | 2개 |
| [3. 반려동물](#3-반려동물) | #9~#16 | 8개 |
| [4. 유치원/보호자](#4-유치원보호자) | #17~#21 | 5개 |
| [5. 채팅](#5-채팅) | #22~#33 | 12개 |
| [6. 결제/돌봄](#6-결제돌봄) | #34~#40 | 7개 |
| [7. 정산](#7-정산) | #41~#43 | 3개 |
| [8. 리뷰](#8-리뷰) | #44~#45 | 3개 |
| [9. 즐겨찾기](#9-즐겨찾기) | #46~#49 | 4개 |
| [10. 알림/FCM](#10-알림fcm) | #50~#52 | 3개 |
| [11. 콘텐츠](#11-콘텐츠) | #53~#57 | 5개 |
| [12. 차단](#12-차단) | #58~#60 | 3개 |
| [13. 기타](#13-기타) | #61~#66 | 6개 |

---

## 1. 인증/회원

> **가이드 참조**: `APP_MIGRATION_GUIDE.md §1 인증 전환`
>
> **#4~#6 선행 작성 사유**: 본 섹션의 #1~#3은 인증 전환 API이고, #4~#6은 GUIDE 기준으로는 §9(주소 인증/프로필/회원 관리)에 속합니다. 그러나 #4(회원 탈퇴)는 `supabase.auth.signOut()`과 밀접하고, #5(모드 전환)와 #6(프로필 수정)은 인증 완료 직후 호출되는 `members` 테이블 CRUD로서, **인증 흐름을 이해한 상태에서 바로 적용할 수 있는 자동 API 패턴 예시**입니다. Phase A에서 인증과 함께 전환하는 것을 권장하므로, R1에서 선행 작성합니다.

### API #1. alimtalk.php → Edge Function `send-alimtalk`

**전환 방식**: Edge Function (Supabase Auth 내부 훅) | **난이도**: 중
**관련 파일**: `hooks/useJoin.ts`, `app/authentication/authNumber.tsx`
**Supabase 대응**: `supabase.auth.signInWithOtp()` 내부에서 자동 호출 (앱 코드에서 직접 호출 없음)

**Before**:
```typescript
// 파일: hooks/useJoin.ts 또는 app/authentication/authNumber.tsx
// 인증번호 발송 (카카오 알림톡)
const sendAuthCode = async (phone: string) => {
  try {
    const authCode = Math.floor(100000 + Math.random() * 900000).toString()
    const response = await apiClient.get('api/alimtalk.php', {
      phone: phone,        // 수신 폰번호 (01012345678)
      auth_code: authCode, // 6자리 인증번호
    })
    if (response.result === 'Y') {
      // 인증번호 발송 성공 → 타이머 시작
      setAuthCode(authCode)  // 로컬에 저장 (확인용)
      startTimer()
    } else {
      Alert.alert('오류', '인증번호 발송에 실패했습니다')
    }
  } catch (error) {
    Alert.alert('오류', '서버와 통신할 수 없습니다')
  }
}
```

**After**:
```typescript
// 파일: hooks/useAuth.ts (신규) 또는 hooks/useJoin.ts (수정)
import { supabase } from '@/lib/supabase'

// 인증번호 발송 (Supabase Auth Phone OTP)
// → Supabase Auth가 send-alimtalk Edge Function을 내부적으로 호출
// → 앱에서 alimtalk.php를 직접 호출하지 않음
const sendOtp = async (phone: string) => {
  try {
    // 국제번호 형식 변환: '01012345678' → '+821012345678'
    const formattedPhone = phone.startsWith('+82')
      ? phone
      : `+82${phone.replace(/^0/, '')}`

    const { error } = await supabase.auth.signInWithOtp({
      phone: formattedPhone,
    })

    if (error) {
      Alert.alert('오류', error.message)
      return
    }
    // OTP 발송 성공 → 타이머 시작
    startTimer()
  } catch (error) {
    Alert.alert('오류', '서버와 통신할 수 없습니다')
  }
}
```

**변환 포인트**:
- **앱 코드에서 `alimtalk.php` 호출 완전 삭제** → `signInWithOtp` 한 줄로 대체
- 기존: 인증번호를 앱에서 생성하여 PHP로 전달 → 전환 후: Supabase Auth가 내부적으로 생성·발송
- 기존: 인증번호를 로컬 변수에 저장 (`setAuthCode`) → 전환 후: 저장 불필요 (Supabase가 서버에서 관리)
- 전화번호 포맷: `01012345678` → `+821012345678` 변환 필요
- `send-alimtalk` Edge Function은 Supabase Auth SMS 훅으로 동작 → 앱 개발자는 구현 불필요

**응답 매핑**:

| PHP 응답 필드 | Supabase 응답 필드 | 변환 필요 |
|---|---|---|
| `result` (`'Y'`/`'N'`) | `error` (`null`이면 성공) | 예 — `result === 'Y'` → `error === null` |
| `message` (에러 메시지) | `error.message` | 아니오 |
| `auth_code` (로컬 저장) | — (서버에서 관리, 앱에서 저장 불필요) | 예 — 삭제 |

---

### API #2. auth_request.php → Supabase Auth

**전환 방식**: Supabase Auth | **난이도**: 중
**관련 파일**: `hooks/useJoin.ts`, `app/authentication/authNumber.tsx`
**Supabase 대응**: `supabase.auth.verifyOtp({ phone, token, type: 'sms' })`

**Before**:
```typescript
// 파일: hooks/useJoin.ts 또는 app/authentication/authNumber.tsx
// 인증번호 확인
const verifyAuthCode = async (phone: string, inputCode: string) => {
  try {
    const response = await apiClient.get('api/auth_request.php', {
      mb_id: phone,        // 폰번호 (= mb_id)
      auth_no: inputCode,  // 사용자가 입력한 인증번호
    })
    if (response.result === 'Y') {
      // 인증 성공 → 다음 단계(회원가입 또는 로그인)로 이동
      return true
    } else {
      Alert.alert('오류', '인증번호가 일치하지 않습니다')
      return false
    }
  } catch (error) {
    Alert.alert('오류', '서버와 통신할 수 없습니다')
    return false
  }
}
```

**After**:
```typescript
// 파일: hooks/useAuth.ts (신규) 또는 hooks/useJoin.ts (수정)
import { supabase } from '@/lib/supabase'

// OTP 인증번호 확인 → 성공 시 즉시 JWT 세션 발급
const verifyOtp = async (phone: string, otpCode: string) => {
  try {
    const formattedPhone = phone.startsWith('+82')
      ? phone
      : `+82${phone.replace(/^0/, '')}`

    const { data, error } = await supabase.auth.verifyOtp({
      phone: formattedPhone,
      token: otpCode,     // 사용자가 입력한 6자리 OTP
      type: 'sms',
    })

    if (error) {
      Alert.alert('오류', '인증번호가 일치하지 않습니다')
      return null
    }

    // ✅ 인증 성공 → data.session에 JWT가 포함됨
    // onAuthStateChange 리스너가 자동으로 userAtom 업데이트
    return data.session  // { access_token, refresh_token, user }
  } catch (error) {
    Alert.alert('오류', '서버와 통신할 수 없습니다')
    return null
  }
}
```

**변환 포인트**:
- 기존: 인증 확인 후 `{"result":"Y"}` → 앱에서 별도로 `set_join.php` 호출해야 로그인 완료
- 전환 후: `verifyOtp` 성공 → **즉시 JWT 세션 발급** → `onAuthStateChange`가 자동으로 상태 업데이트
- `mb_id` 파라미터 → `phone` 파라미터 (국제번호 형식)
- `auth_no` → `token` (파라미터 이름 변경)
- 반환값: `boolean` → `Session | null` (JWT 세션 객체)

**응답 매핑**:

| PHP 응답 필드 | Supabase 응답 필드 | 변환 필요 |
|---|---|---|
| `result` (`'Y'`/`'N'`) | `error` (`null`이면 성공) | 예 — `result === 'Y'` → `error === null` |
| `message` | `error.message` | 아니오 |
| — | `data.session` (JWT 세션) | 예 — 신규 필드. access_token, refresh_token 포함 |
| — | `data.session.user.id` (UUID) | 예 — 기존 `mb_id`(폰번호)를 대체하는 사용자 식별자 |
| — | `data.session.user.phone` (폰번호) | 예 — 기존 `mb_id`와 동일한 값 (국제번호 형식) |

---

### API #3. set_join.php → Supabase Auth + members UPSERT

**전환 방식**: 자동 API | **난이도**: 쉬움
**관련 파일**: `utils/updateJoin.ts`, `hooks/useJoin.ts`, `app/authentication/selectMode.tsx`
**Supabase 대응**: `supabase.from('members').upsert({ ... })`

**Before**:
```typescript
// 파일: utils/updateJoin.ts
// 회원가입 또는 주소 업데이트 (FormData POST)
const updateJoin = async (params: {
  mb_id: string        // 폰번호 (필수)
  mb_name?: string     // 이름
  mb_nick?: string     // 닉네임
  mb_2?: string        // 주민번호 앞 6자리 → 생년월일
  mb_sex?: string      // 성별 ('남' | '여')
  mb_5?: string        // 모드 ('1'=보호자, '2'=유치원)
  mb_1?: string        // 통신사 코드
  mb_4?: string        // 아파트/단지명
  mb_addr1?: string    // 도로명주소
  dong?: string        // 동
  ho?: string          // 호
}) => {
  try {
    const formData = new FormData()
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) formData.append(key, value)
    })

    const response = await apiClient.post('api/set_join.php', formData)
    if (response.result === 'Y') {
      // 가입/업데이트 성공 → userAtom 업데이트
      return response.data  // 회원 정보
    } else {
      Alert.alert('오류', response.message ?? '회원정보 저장 실패')
      return null
    }
  } catch (error) {
    Alert.alert('오류', '서버와 통신할 수 없습니다')
    return null
  }
}
```

**After**:
```typescript
// 파일: utils/updateJoin.ts (수정)
import { supabase } from '@/lib/supabase'

// ── 변환 유틸리티 ──────────────────────────────────────────

/**
 * 주민번호 앞 6자리(mb_2)를 'YYYY-MM-DD' 형식의 date 문자열로 변환
 * DB 컬럼: members.birth_date (date 타입)
 *
 * @example convertBirthDate('960315')  → '1996-03-15'
 * @example convertBirthDate('040101')  → '2004-01-01'
 * @example convertBirthDate('1996-03-15') → '1996-03-15' (이미 변환된 경우 그대로)
 */
const convertBirthDate = (raw: string): string => {
  // 이미 'YYYY-MM-DD' 형식이면 그대로 반환
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw

  // 6자리 → YYMMDD 파싱
  const yy = parseInt(raw.slice(0, 2), 10)
  const mm = raw.slice(2, 4)
  const dd = raw.slice(4, 6)
  // 00~30 → 2000년대, 31~99 → 1900년대 (한국 주민번호 관례)
  const yyyy = yy <= 30 ? 2000 + yy : 1900 + yy
  return `${yyyy}-${mm}-${dd}`
}

/**
 * 기존 성별 값을 Supabase members.gender CHECK 제약에 맞는 값으로 변환
 * DB CHECK 제약: gender IN ('남성', '여성')
 *
 * @example convertGender('남')  → '남성'
 * @example convertGender('여')  → '여성'
 * @example convertGender('남성') → '남성' (이미 변환된 경우 그대로)
 */
const convertGender = (raw: string): string => {
  const map: Record<string, string> = { '남': '남성', '여': '여성' }
  return map[raw] ?? raw  // 매핑에 없으면 원본 반환
}

// ── 회원 프로필 UPSERT ─────────────────────────────────────

// ※ verifyOtp 성공 후 auth.users에 사용자가 이미 생성된 상태에서 호출
const updateMemberProfile = async (params: {
  name?: string
  nickname?: string
  birth_date?: string        // 'YYYY-MM-DD' 형식 (기존 mb_2에서 convertBirthDate로 변환)
  gender?: string            // '남성' | '여성' (기존 '남'/'여'에서 convertGender로 변환)
  current_mode?: string      // '보호자' | '유치원' (기존 '1'/'2'에서 변환)
  carrier?: string           // 통신사 코드
  address_complex?: string   // 아파트/단지명
  address_road?: string      // 도로명주소
  address_building_dong?: string  // 동
  address_building_ho?: string    // 호
}) => {
  try {
    // 현재 로그인된 사용자의 UUID 획득
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      Alert.alert('오류', '로그인이 필요합니다')
      return null
    }

    // 기존 값을 Supabase 스키마에 맞게 변환
    const converted = { ...params }
    if (converted.birth_date) {
      converted.birth_date = convertBirthDate(converted.birth_date)
    }
    if (converted.gender) {
      converted.gender = convertGender(converted.gender)
    }

    const { data, error } = await supabase
      .from('members')
      .upsert({
        id: user.id,            // auth.uid() — PK 기준 UPSERT
        phone: user.phone ?? '',
        ...converted,
      })
      .select()
      .single()

    if (error) {
      Alert.alert('오류', error.message)
      return null
    }
    return data  // 저장된 회원 정보
  } catch (error) {
    Alert.alert('오류', '서버와 통신할 수 없습니다')
    return null
  }
}
```

**변환 포인트**:
- `FormData` POST → `supabase.from('members').upsert()` (JSON)
- `mb_id` 파라미터 제거 → `user.id` (auth.uid()) 사용
- 컬럼명 전면 변경 (§0-1 용어 매핑표 참조):
  - `mb_name` → `name`, `mb_nick` → `nickname`
  - `mb_2` → `birth_date`: **`convertBirthDate()` 유틸리티 사용**. 주민번호 앞 6자리(`'960101'`)를 date 타입(`'1996-01-01'`)으로 변환. YY≤30 → 2000년대, YY≥31 → 1900년대 기준
  - `mb_sex` → `gender`: **`convertGender()` 유틸리티 사용**. `'남'`→`'남성'`, `'여'`→`'여성'`. DB에 `CHECK (gender IN ('남성', '여성'))` 제약이 있으므로 반드시 변환 필요
  - `mb_5` → `current_mode` (값 변환: `'1'` → `'보호자'`, `'2'` → `'유치원'`)
  - `mb_4` → `address_complex`, `mb_addr1` → `address_road`
  - `dong` → `address_building_dong`, `ho` → `address_building_ho`
- `.upsert()` + `.select().single()`: 결과를 단일 객체로 반환
- verifyOtp 성공 후 호출하는 순서 유지 (기존: alimtalk → auth_request → set_join → 전환 후: signInWithOtp → verifyOtp → members upsert)
- **주의**: `convertBirthDate`와 `convertGender`는 별도 유틸 파일(`utils/convertMemberFields.ts`)로 분리하거나, `updateJoin.ts` 내 로컬 함수로 둘 수 있음. 다른 화면에서도 재사용한다면 별도 파일 권장

**응답 매핑**:

| PHP 응답 필드 | Supabase 응답 필드 | 변환 필요 |
|---|---|---|
| `result` (`'Y'`/`'N'`) | `error` (`null`이면 성공) | 예 |
| `data.mb_id` | `data.phone` | 예 — 키 이름 변경 |
| `data.mb_no` | `data.id` (UUID) | 예 — 정수 → UUID |
| `data.mb_name` | `data.name` | 예 — 키 이름 변경 |
| `data.mb_nick` | `data.nickname` | 예 — 키 이름 변경 |
| `data.mb_2` | `data.birth_date` | 예 — `'960101'` → `'1996-01-01'` |
| `data.mb_sex` | `data.gender` | 예 — `'남'` → `'남성'` |
| `data.mb_5` | `data.current_mode` | 예 — `'1'` → `'보호자'` |
| `data.mb_1` | `data.carrier` | 예 — 키 이름 변경 |
| `data.mb_4` | `data.address_complex` | 예 — 키 이름 변경 |
| `data.mb_addr1` | `data.address_road` | 예 — 키 이름 변경 |
| `data.dong` | `data.address_building_dong` | 예 — 키 이름 변경 |
| `data.ho` | `data.address_building_ho` | 예 — 키 이름 변경 |
| `data.mb_profile1` | `data.profile_image` | 예 — 파일명 → Storage URL |
| — | `data.nickname_tag` | 예 — 신규 필드 (`'#1001'` 형식) |
| — | `data.created_at` | 예 — 신규 필드 |

---

### API #4. set_member_leave.php → RPC `app_withdraw_member`

**전환 방식**: RPC | **난이도**: 중
**관련 파일**: `app/user/withdraw/index.tsx`
**Supabase 대응**: `supabase.rpc('app_withdraw_member', { p_reason })`
**Supabase 테이블**: `members`, `pets`, `kindergartens`

**Before**:
```typescript
// 파일: app/user/withdraw/index.tsx
// 회원 탈퇴
const withdrawMember = async (reason: string) => {
  try {
    const formData = new FormData()
    formData.append('mb_id', user.mb_id)    // 폰번호
    formData.append('reason', reason)        // 탈퇴 사유

    const response = await apiClient.post('api/set_member_leave.php', formData)
    if (response.result === 'Y') {
      // 탈퇴 성공 → 로그아웃 처리
      resetUserAtom()
      router.replace('/authentication/login')
    } else {
      Alert.alert('오류', response.message ?? '탈퇴 처리 실패')
    }
  } catch (error) {
    Alert.alert('오류', '서버와 통신할 수 없습니다')
  }
}
```

**After**:
```typescript
// 파일: app/user/withdraw/index.tsx (수정)
import { supabase } from '@/lib/supabase'

// 회원 탈퇴 (RPC: soft delete + Auth 삭제)
const withdrawMember = async (reason: string) => {
  try {
    // RPC: members.status→'탈퇴', pets.deleted=true,
    //       kindergartens.registration_status='withdrawn'
    const { error: rpcError } = await supabase.rpc('app_withdraw_member', {
      p_reason: reason,
    })

    if (rpcError) {
      Alert.alert('오류', rpcError.message)
      return
    }

    // Supabase Auth 로그아웃 (세션 삭제)
    await supabase.auth.signOut()

    // userAtom 초기화 → 로그인 화면으로 이동
    resetUserAtom()
    router.replace('/authentication/login')
  } catch (error) {
    Alert.alert('오류', '서버와 통신할 수 없습니다')
  }
}
```

**변환 포인트**:
- FormData POST → `supabase.rpc()` (JSON)
- `mb_id` 파라미터 제거 → RPC 내부에서 `auth.uid()` 자동 사용
- `reason` → `p_reason` (RPC 파라미터 네이밍 규칙: `p_` 접두사)
- RPC가 수행하는 작업: `members.status='탈퇴'`, `members.withdrawn_at=NOW()`, `members.withdraw_reason=p_reason`, `pets.deleted=true`, `kindergartens.registration_status='withdrawn'`
- RPC 호출 후 반드시 `supabase.auth.signOut()` 호출하여 로컬 세션 정리
- Auth 사용자 삭제는 관리자 Edge Function에서 후속 처리 (앱에서 직접 삭제 불가)

**응답 매핑**:

| PHP 응답 필드 | Supabase 응답 필드 | 변환 필요 |
|---|---|---|
| `result` (`'Y'`/`'N'`) | `error` (`null`이면 성공) | 예 |
| `message` | `error.message` | 아니오 |

---

### API #5. set_mypage_mode_update.php → members UPDATE

**전환 방식**: 자동 API | **난이도**: 쉬움
**관련 파일**: `app/(tabs)/mypage.tsx`
**Supabase 대응**: `supabase.from('members').update({ current_mode }).eq('id', userId)`
**Supabase 테이블**: `members`

**Before**:
```typescript
// 파일: app/(tabs)/mypage.tsx
// 보호자 ↔ 유치원 모드 전환
const toggleMode = async (newMode: '1' | '2') => {
  try {
    const formData = new FormData()
    formData.append('mb_id', user.mb_id)
    formData.append('mb_5', newMode)  // '1'=보호자, '2'=유치원

    const response = await apiClient.post('api/set_mypage_mode_update.php', formData)
    if (response.result === 'Y') {
      // 모드 변경 성공 → userAtom 업데이트
      setUser(prev => ({ ...prev, mb_5: newMode }))
    } else {
      Alert.alert('오류', response.message ?? '모드 변경 실패')
    }
  } catch (error) {
    Alert.alert('오류', '서버와 통신할 수 없습니다')
  }
}
```

**After**:
```typescript
// 파일: app/(tabs)/mypage.tsx (수정)
import { supabase } from '@/lib/supabase'

// 보호자 ↔ 유치원 모드 전환
const toggleMode = async (newMode: '보호자' | '유치원') => {
  try {
    const { data, error } = await supabase
      .from('members')
      .update({ current_mode: newMode })
      .eq('id', user.id)
      .select('current_mode')
      .single()

    if (error) {
      Alert.alert('오류', error.message)
      return
    }
    // 모드 변경 성공 → userAtom 업데이트
    setUser(prev => prev ? { ...prev, current_mode: data.current_mode } : prev)
  } catch (error) {
    Alert.alert('오류', '서버와 통신할 수 없습니다')
  }
}
```

**변환 포인트**:
- `mb_id` 파라미터 제거 → `.eq('id', user.id)` (UUID)
- `mb_5` → `current_mode`: 값도 변경 (`'1'` → `'보호자'`, `'2'` → `'유치원'`)
- FormData → `.update()` 메서드
- `.select().single()`: UPDATE 후 변경된 값 확인

**응답 매핑**:

| PHP 응답 필드 | Supabase 응답 필드 | 변환 필요 |
|---|---|---|
| `result` (`'Y'`/`'N'`) | `error` (`null`이면 성공) | 예 |
| — | `data.current_mode` | 예 — 신규. UPDATE 후 변경된 값 반환 |

---

### API #6. set_profile_update.php → members UPDATE + Storage

**전환 방식**: 자동 API + Storage | **난이도**: 쉬움
**관련 파일**: `app/protector/[id]/updateProfile.tsx` (보호자 프로필 수정)
**Supabase 대응**: Storage `profile-images` 업로드 → `members` UPDATE
**Supabase 테이블**: `members`

**Before**:
```typescript
// 파일: app/protector/[id]/updateProfile.tsx (추정)
// 프로필 수정 (닉네임 + 이미지)
const updateProfile = async (nickname: string, imageFile?: any) => {
  try {
    const formData = new FormData()
    formData.append('mb_id', user.mb_id)
    formData.append('mb_nick', nickname)

    if (imageFile) {
      formData.append('mb_profile1', {
        uri: imageFile.uri,
        type: 'image/jpeg',
        name: 'profile.jpg',
      } as any)
    }

    const response = await apiClient.post('api/set_profile_update.php', formData)
    if (response.result === 'Y') {
      // 프로필 업데이트 성공 → userAtom 업데이트
      setUser(prev => ({
        ...prev,
        mb_nick: nickname,
        mb_profile1: response.data?.mb_profile1 ?? prev.mb_profile1,
      }))
    } else {
      Alert.alert('오류', response.message ?? '프로필 수정 실패')
    }
  } catch (error) {
    Alert.alert('오류', '서버와 통신할 수 없습니다')
  }
}
```

**After**:
```typescript
// 파일: app/protector/[id]/updateProfile.tsx (수정) 또는 해당 프로필 수정 화면
import { supabase } from '@/lib/supabase'

// 프로필 수정 (닉네임 + 이미지)
const updateProfile = async (nickname: string, imageFile?: { uri: string }) => {
  try {
    let profileImageUrl: string | undefined

    // Step 1: 이미지 업로드 (변경된 경우만)
    if (imageFile) {
      const fileExt = 'jpg'
      const filePath = `${user.id}/profile.${fileExt}`

      // 파일을 fetch → blob 변환 (React Native에서 Storage 업로드 방식)
      const response = await fetch(imageFile.uri)
      const blob = await response.blob()

      const { error: uploadError } = await supabase.storage
        .from('profile-images')
        .upload(filePath, blob, {
          contentType: 'image/jpeg',
          upsert: true,  // 기존 이미지 덮어쓰기
        })

      if (uploadError) {
        Alert.alert('오류', '이미지 업로드 실패: ' + uploadError.message)
        return
      }

      // 공개 URL 획득
      const { data: { publicUrl } } = supabase.storage
        .from('profile-images')
        .getPublicUrl(filePath)

      profileImageUrl = publicUrl
    }

    // Step 2: members 테이블 업데이트
    const updateData: Record<string, any> = { nickname }
    if (profileImageUrl) {
      updateData.profile_image = profileImageUrl
    }

    const { data, error } = await supabase
      .from('members')
      .update(updateData)
      .eq('id', user.id)
      .select('nickname, profile_image')
      .single()

    if (error) {
      Alert.alert('오류', error.message)
      return
    }

    // 프로필 업데이트 성공 → userAtom 업데이트
    setUser(prev => prev ? {
      ...prev,
      nickname: data.nickname,
      profile_image: data.profile_image ?? prev.profile_image,
    } : prev)
  } catch (error) {
    Alert.alert('오류', '서버와 통신할 수 없습니다')
  }
}
```

**변환 포인트**:
- FormData 이미지 → Storage `profile-images` 버킷 업로드 후 공개 URL 저장
- `mb_id` 제거 → `.eq('id', user.id)`
- `mb_nick` → `nickname`, `mb_profile1` (파일명) → `profile_image` (전체 URL)
- 이미지 업로드와 DB 업데이트가 2단계로 분리됨 (기존 PHP는 1회 요청으로 처리)
- Storage 경로: `profile-images/{user.id}/profile.jpg` (사용자별 고정 경로, upsert로 덮어쓰기)
- `fetch()` → `blob()` 변환: React Native에서 Supabase Storage 업로드 시 필요

**응답 매핑**:

| PHP 응답 필드 | Supabase 응답 필드 | 변환 필요 |
|---|---|---|
| `result` (`'Y'`/`'N'`) | `error` (`null`이면 성공) | 예 |
| `data.mb_nick` | `data.nickname` | 예 — 키 이름 변경 |
| `data.mb_profile1` (파일명) | `data.profile_image` (Storage URL) | 예 — 파일명 → 전체 URL |

---

## 2. 주소 인증

> **가이드 참조**: `APP_MIGRATION_GUIDE.md §9 주소 인증 / 프로필 / 회원 관리`

### API #7. set_address_verification.php → members UPDATE + Storage

**전환 방식**: 자동 API + Storage | **난이도**: 쉬움
**관련 파일**: `app/authentication/addressVerify.tsx`
**Supabase 대응**: Storage `address-docs` 업로드 → `members` UPDATE (`address_doc_urls`)
**Supabase 테이블**: `members`

**Before**:
```typescript
// 파일: app/authentication/addressVerify.tsx
// 위치 인증 서류 업로드
const submitAddressVerification = async (
  images: { uri: string }[],  // 인증 서류 이미지 (1~3장)
  addressInfo: {
    mb_addr1: string    // 도로명주소
    mb_4: string        // 단지명
    dong: string        // 동
    ho: string          // 호
  }
) => {
  try {
    const formData = new FormData()
    formData.append('mb_id', user.mb_id)
    formData.append('mb_addr1', addressInfo.mb_addr1)
    formData.append('mb_4', addressInfo.mb_4)
    formData.append('dong', addressInfo.dong)
    formData.append('ho', addressInfo.ho)

    // 이미지 파일 추가
    images.forEach((img, index) => {
      formData.append(`file${index + 1}`, {
        uri: img.uri,
        type: 'image/jpeg',
        name: `address_doc_${index + 1}.jpg`,
      } as any)
    })

    const response = await apiClient.post('api/set_address_verification.php', formData)
    if (response.result === 'Y') {
      Alert.alert('완료', '위치 인증이 요청되었습니다')
    } else {
      Alert.alert('오류', response.message ?? '위치 인증 요청 실패')
    }
  } catch (error) {
    Alert.alert('오류', '서버와 통신할 수 없습니다')
  }
}
```

**After**:
```typescript
// 파일: app/authentication/addressVerify.tsx (수정)
import { supabase } from '@/lib/supabase'

// 위치 인증 서류 업로드
const submitAddressVerification = async (
  images: { uri: string }[],
  addressInfo: {
    address_road: string
    address_complex: string
    address_building_dong: string
    address_building_ho: string
  }
) => {
  try {
    // Step 1: 인증 서류 이미지 업로드 (Storage)
    const uploadedUrls: string[] = []

    for (let i = 0; i < images.length; i++) {
      const filePath = `${user.id}/address_doc_${Date.now()}_${i}.jpg`
      const response = await fetch(images[i].uri)
      const blob = await response.blob()

      const { error: uploadError } = await supabase.storage
        .from('address-docs')
        .upload(filePath, blob, {
          contentType: 'image/jpeg',
          upsert: false,  // 고유 파일명 사용
        })

      if (uploadError) {
        Alert.alert('오류', `이미지 ${i + 1} 업로드 실패: ${uploadError.message}`)
        return
      }

      const { data: { publicUrl } } = supabase.storage
        .from('address-docs')
        .getPublicUrl(filePath)

      uploadedUrls.push(publicUrl)
    }

    // Step 2: members 테이블 업데이트 (주소 + 서류 URL + 인증 상태)
    const { error } = await supabase
      .from('members')
      .update({
        address_road: addressInfo.address_road,
        address_complex: addressInfo.address_complex,
        address_building_dong: addressInfo.address_building_dong,
        address_building_ho: addressInfo.address_building_ho,
        address_doc_urls: uploadedUrls,          // text[] 배열
        address_auth_status: '인증요청',           // 관리자 승인 대기
        address_auth_date: new Date().toISOString(),
      })
      .eq('id', user.id)

    if (error) {
      Alert.alert('오류', error.message)
      return
    }

    Alert.alert('완료', '위치 인증이 요청되었습니다')
  } catch (error) {
    Alert.alert('오류', '서버와 통신할 수 없습니다')
  }
}
```

**변환 포인트**:
- FormData 파일 업로드 → Storage `address-docs` 버킷 + `members.address_doc_urls` (text[] 배열)
- `mb_id` 제거 → `.eq('id', user.id)`
- 주소 컬럼명 변경: `mb_addr1` → `address_road`, `mb_4` → `address_complex`, `dong` → `address_building_dong`, `ho` → `address_building_ho`
- `address_auth_status`: 인증 요청 상태를 DB에 직접 저장 (관리자가 승인/거절)
- Storage 경로: `address-docs/{user.id}/address_doc_{timestamp}_{index}.jpg`
- 여러 이미지를 순차 업로드 후 URL 배열을 `text[]` 타입 컬럼에 저장

**응답 매핑**:

| PHP 응답 필드 | Supabase 응답 필드 | 변환 필요 |
|---|---|---|
| `result` (`'Y'`/`'N'`) | `error` (`null`이면 성공) | 예 |
| `message` | `error.message` | 아니오 |

---

### API #8. kakao-address.php → 앱 직접 호출

**전환 방식**: 앱 직접 호출 | **난이도**: 쉬움
**관련 파일**: `app/authentication/address.tsx`, `app/authentication/addressDetail.tsx`, `app/authentication/location.tsx`
**Supabase 대응**: 없음 (서버 경유 불필요 — 앱에서 카카오 주소 API 직접 호출)

**Before**:
```typescript
// 파일: app/authentication/address.tsx 등
// 카카오 주소 검색 (PHP 프록시 경유)
const searchAddress = async (keyword: string) => {
  try {
    const response = await apiClient.get('api/kakao-address.php', {
      keyword: keyword,
    })
    if (response.results) {
      setAddressList(response.results)
    }
  } catch (error) {
    Alert.alert('오류', '주소 검색에 실패했습니다')
  }
}
```

**After**:
```typescript
// 파일: app/authentication/address.tsx (수정)
// 카카오 주소 검색 (앱에서 직접 호출 — PHP 프록시 제거)

const KAKAO_REST_API_KEY = process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY!

const searchAddress = async (keyword: string) => {
  try {
    // 카카오 주소 검색 REST API 직접 호출
    const response = await fetch(
      `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(keyword)}`,
      {
        headers: {
          Authorization: `KakaoAK ${KAKAO_REST_API_KEY}`,
        },
      }
    )
    const json = await response.json()

    if (json.documents) {
      setAddressList(json.documents)
    }
  } catch (error) {
    Alert.alert('오류', '주소 검색에 실패했습니다')
  }
}
```

**변환 포인트**:
- **PHP 프록시 완전 제거** → 앱에서 카카오 REST API 직접 호출
- 기존: `apiClient.get('api/kakao-address.php')` → 전환 후: `fetch('https://dapi.kakao.com/v2/...')`
- 카카오 REST API 키를 `.env`에 추가 필요: `EXPO_PUBLIC_KAKAO_REST_API_KEY`
- 응답 형식이 약간 다를 수 있음 (PHP 프록시가 가공했을 가능성) → 카카오 API 원본 응답 사용

> **\u26a0\ufe0f 보안 경고 — 카카오 REST API 키 노출**
>
> 기존에는 PHP 서버가 API 키를 숨겨주었으나, 전환 후에는 `EXPO_PUBLIC_` 접두사 환경 변수가 **앱 번들에 포함**되어 디컴파일 시 노출됩니다.
>
> **필수 조치 사항**:
> 1. **카카오 개발자 콘솔 → 내 애플리케이션 → 플랫폼 등록**: Android 패키지명(`com.wooyoopet.app`) + iOS 번들 ID 등록
> 2. **허용 IP/도메인 제한**: 카카오 개발자 콘솔에서 API 호출 허용 범위를 앱 플랫폼으로 제한
> 3. **API 키 종류 확인**: `REST API 키`(서버용)가 아닌 `JavaScript 키` 또는 `Native 앱 키` 사용 검토
> 4. **사용량 모니터링**: 카카오 API 일일 호출 한도 확인 (무료 기본 300,000건/일)
>
> 이 조치를 하지 않으면 API 키가 악용되어 할당량이 소진되거나, 카카오 측에서 키를 정지시킬 수 있습니다.

**응답 매핑**:

| PHP 프록시 응답 필드 | 카카오 API 원본 응답 필드 | 변환 필요 |
|---|---|---|
| `results` (배열) | `documents` (배열) | 예 — 키 이름 변경 |
| `results[].address_name` | `documents[].address_name` | 아니오 |
| `results[].road_address_name` | `documents[].road_address.address_name` | 예 — 중첩 구조 |
| `results[].building_name` | `documents[].road_address.building_name` | 예 — 중첩 구조 |
| `results[].x` (경도) | `documents[].x` | 아니오 |
| `results[].y` (위도) | `documents[].y` | 아니오 |

> **주의**: PHP 프록시가 카카오 API 응답을 가공하여 평탄화(flatten)했을 수 있습니다. 전환 후 카카오 API 원본 응답의 중첩 구조(`road_address.address_name` 등)에 맞게 파싱 코드를 수정해야 합니다. 실제 `kakao-address.php` 소스를 확인하여 가공 여부를 판단하세요.

---

## 3. 반려동물

> **가이드 참조**: `APP_MIGRATION_GUIDE.md §3 반려동물 CRUD`

### API #9. get_my_animal.php → pets SELECT

**전환 방식**: 자동 API | **난이도**: 쉬움
**관련 파일**: `hooks/usePetList.ts` → `fetchPets()`
**Supabase 대응**: `supabase.from('pets').select('*').eq('member_id', userId).eq('deleted', false)`
**Supabase 테이블**: `pets`

**Before**:
```typescript
// 파일: hooks/usePetList.ts
// 내 반려동물 목록 조회
const fetchPets = async () => {
  try {
    const response = await apiClient.get('api/get_my_animal.php', {
      mb_id: user.mb_id,  // 폰번호
    })
    if (response.result === 'Y') {
      // response.data: 반려동물 배열
      setPetList(response.data)
    }
  } catch (error) {
    Alert.alert('오류', '반려동물 목록을 불러올 수 없습니다')
  }
}
```

**After**:
```typescript
// 파일: hooks/usePetList.ts (수정)
import { supabase } from '@/lib/supabase'

// 내 반려동물 목록 조회
const fetchPets = async () => {
  try {
    const { data, error } = await supabase
      .from('pets')
      .select('*')
      .eq('member_id', user.id)     // UUID (auth.uid())
      .eq('deleted', false)          // soft delete된 항목 제외
      .order('is_representative', { ascending: false })  // 대표 동물 먼저
      .order('created_at', { ascending: false })

    if (error) {
      Alert.alert('오류', error.message)
      return
    }
    setPetList(data)  // PetType[] 배열
  } catch (error) {
    Alert.alert('오류', '반려동물 목록을 불러올 수 없습니다')
  }
}
```

**변환 포인트**:
- `mb_id` (폰번호) → `member_id` (UUID) + `deleted=false` 필터 추가
- `is_representative` 기준 정렬 추가 (대표 동물이 항상 맨 앞)
- PHP 응답의 `wr_*` 컬럼명이 Supabase에서는 정규 컬럼명으로 변경됨 (아래 매핑표 참조)

**응답 매핑**:

| PHP 응답 필드 | Supabase 응답 필드 | 변환 필요 |
|---|---|---|
| `wr_id` | `id` (UUID) | 예 — 정수 → UUID |
| `mb_id` | `member_id` (UUID) | 예 — 폰번호 → UUID |
| `wr_subject` | `name` | 예 — 키 이름 변경 |
| `wr_content` | `description` | 예 — 키 이름 변경 |
| `wr_2` | `gender` | 예 — 키 이름 변경 |
| `wr_3` | `is_neutered` (bool) | 예 — 문자열 → boolean |
| `wr_4` | `breed` | 예 — 키 이름 변경 |
| `wr_5` | `birth_date` (date) | 예 — 키 이름 변경 |
| `wr_6` | `is_birth_date_unknown` (bool) | 예 — 문자열 → boolean |
| `wr_7` | `weight` (numeric) | 예 — 키 이름 변경 |
| `wr_8` | `is_vaccinated` (bool) | 예 — 문자열 → boolean |
| `wr_10` | `is_draft` (bool) | 예 — 문자열 → boolean |
| `firstYN` | `is_representative` (bool) | 예 — `'Y'`/`'N'` → true/false |
| `deleteYN` | `deleted` (bool) | 예 — `'Y'`/`'N'` → true/false |
| `animal_img1`~`animal_img10` | `photo_urls` (text[]) | 예 — 개별 10컬럼 → 배열 1개 |
| — | `size_class` | 예 — 신규 (트리거 자동 계산: 소형/중형/대형) |
| — | `created_at` | 예 — 신규 필드 |

---

### API #10. get_animal_by_id.php → pets SELECT + favorite_pets 별도 조회

**전환 방식**: 자동 API | **난이도**: 쉬움
**관련 파일**: `hooks/usePetDetail.ts`
**Supabase 대응**: `supabase.from('pets').select('*').eq('id', petId).single()` + `supabase.from('favorite_pets').select('id').eq('pet_id', petId).maybeSingle()`
**Supabase 테이블**: `pets`, `favorite_pets`

> ⚠️ **`!inner` JOIN을 사용하지 않는 이유**: `favorite_pets!inner(...)` 조인을 사용하면 찜하지 않은 반려동물은 조회 결과에서 제외되어 404 에러가 발생합니다. 따라서 반려동물 정보와 찜 여부를 **별도 2회 조회**하는 패턴을 사용합니다.

**Before**:
```typescript
// 파일: hooks/usePetDetail.ts (추정)
// 반려동물 상세 조회 (찜 여부 포함)
const fetchPetDetail = async (petId: string, myMbId: string) => {
  try {
    const response = await apiClient.get('api/get_animal_by_id.php', {
      wr_id: petId,       // 반려동물 ID
      mb_id: myMbId,      // 조회자 mb_id (찜 여부 확인용)
    })
    if (response.result === 'Y') {
      setPetDetail(response.data)
      setIsFavorite(response.data.is_favorite === 'Y')
    }
  } catch (error) {
    Alert.alert('오류', '반려동물 정보를 불러올 수 없습니다')
  }
}
```

**After**:
```typescript
// 파일: hooks/usePetDetail.ts (수정)
import { supabase } from '@/lib/supabase'

// 반려동물 상세 조회 (찜 여부 포함)
const fetchPetDetail = async (petId: string) => {
  try {
    // Step 1: 반려동물 정보 조회
    const { data: pet, error: petError } = await supabase
      .from('pets')
      .select('*')
      .eq('id', petId)
      .eq('deleted', false)
      .single()

    if (petError) {
      Alert.alert('오류', petError.message)
      return
    }

    // Step 2: 찜 여부 확인 (현재 로그인 사용자 기준)
    const { data: favorite } = await supabase
      .from('favorite_pets')
      .select('id')
      .eq('member_id', user.id)
      .eq('pet_id', petId)
      .eq('is_favorite', true)
      .maybeSingle()

    setPetDetail(pet)
    setIsFavorite(!!favorite)
  } catch (error) {
    Alert.alert('오류', '반려동물 정보를 불러올 수 없습니다')
  }
}
```

**변환 포인트**:
- `wr_id` → `id` (UUID), `mb_id` 파라미터 제거 (조회자는 JWT에서 자동 식별)
- **찜 여부 별도 조회**: PHP는 응답에 `is_favorite` 포함 → Supabase는 `favorite_pets` 테이블을 **별도 쿼리**로 조회 (`!inner` JOIN 사용 시 찜하지 않은 반려동물이 결과에서 제외되므로 반드시 2회 분리 조회)
- `.single()`: 반려동물 1건 조회 (배열 대신 객체 반환, 없으면 에러)
- `.maybeSingle()`: 찜 데이터는 없을 수 있으므로 `maybeSingle()` 사용 (없으면 null, 에러 아님)

**응답 매핑**:

| PHP 응답 필드 | Supabase 응답 필드 | 변환 필요 |
|---|---|---|
| `data.*` (wr_* 컬럼) | `pet.*` (정규 컬럼명) | 예 — #9 매핑표와 동일 |
| `data.is_favorite` (`'Y'`/`'N'`) | `!!favorite` (boolean) | 예 — 별도 쿼리 결과 |

---

### API #11. get_animal_by_mb_id.php → pets SELECT (본인 전용)

**전환 방식**: 자동 API | **난이도**: 쉬움
**관련 파일**: `hooks/usePetList.ts` → `fetchPetsByMbId()`
**Supabase 대응**: `supabase.from('pets').select('*').eq('member_id', user.id).eq('deleted', false)`
**Supabase 테이블**: `pets`

**Before**:
```typescript
// 파일: hooks/usePetList.ts
// 회원의 반려동물 목록 조회 (유치원 모드에서 보호자의 반려동물 확인)
const fetchPetsByMbId = async (targetMbId: string) => {
  try {
    const response = await apiClient.get('api/get_animal_by_mb_id.php', {
      mb_id: targetMbId,  // 조회 대상 회원 폰번호
    })
    if (response.result === 'Y') {
      return response.data  // 반려동물 배열
    }
    return []
  } catch (error) {
    return []
  }
}
```

**After**:
```typescript
// 파일: hooks/usePetList.ts (수정)
import { supabase } from '@/lib/supabase'

// 본인의 반려동물 목록 조회 (RLS: member_id = auth.uid() → 본인 데이터만 조회 가능)
// ⚠️ 타인의 반려동물은 RPC app_get_guardian_detail 사용 (§11 참조)
const fetchMyPets = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    const { data, error } = await supabase
      .from('pets')
      .select('id, name, breed, gender, birth_date, weight, size_class, photo_urls, is_representative, is_neutered, is_vaccinated')
      .eq('member_id', user.id)  // RLS 보조 — 본인 UUID
      .eq('deleted', false)
      .order('is_representative', { ascending: false })

    if (error) return []
    return data
  } catch (error) {
    return []
  }
}
```

**변환 포인트**:
- `mb_id` (폰번호) → `member_id` (UUID)
- **RLS 제약 (중요)**: `pets` 테이블에는 `member_id = auth.uid()` RLS 정책이 적용되어 있으므로, `supabase.from('pets')` 직접 호출은 **본인 소유 반려동물만** 조회할 수 있습니다
- **타인 반려동물 조회**: 유치원 모드에서 보호자의 반려동물을 확인해야 하는 경우, 이 API(#11)를 직접 사용하지 **마십시오**. 대신 RPC `app_get_guardian_detail` (SECURITY DEFINER)을 사용하세요. 이 RPC는 내부적으로 `internal.pets_public_info` VIEW를 통해 타인의 반려동물 데이터에 접근합니다
- **결론**: API #11은 **"본인 반려동물 목록 조회"** 용도로만 사용하고, 타인(보호자/유치원) 반려동물은 반드시 해당 RPC를 통해 조회할 것

**응답 매핑**: #9 매핑표와 동일

---

### API #12. get_animal_kind.php → pet_breeds SELECT

**전환 방식**: 자동 API | **난이도**: 쉬움
**관련 파일**: `app/pet/searchBreed.tsx` (품종 검색 화면)
**Supabase 대응**: `supabase.from('pet_breeds').select('*').ilike('name', '%keyword%')`
**Supabase 테이블**: `pet_breeds`

**Before**:
```typescript
// 파일: app/pet/searchBreed.tsx
// 품종 검색 (자동완성)
const searchBreed = async (keyword: string) => {
  try {
    const response = await apiClient.get('api/get_animal_kind.php', {
      keyword: keyword,
      type: 'dog',  // 'dog' 또는 'cat' (현재 dog만 운영)
    })
    if (response.result === 'Y') {
      setBreedList(response.data)  // [{ kind_name: '말티즈' }, ...]
    }
  } catch (error) {
    setBreedList([])
  }
}
```

**After**:
```typescript
// 파일: app/pet/searchBreed.tsx (수정)
import { supabase } from '@/lib/supabase'

// 품종 검색 (자동완성)
const searchBreed = async (keyword: string) => {
  try {
    const { data, error } = await supabase
      .from('pet_breeds')
      .select('id, name, type')
      .eq('type', 'dog')                         // 현재 dog만 운영
      .ilike('name', `%${keyword}%`)             // 부분 일치 검색 (대소문자 무시)
      .order('name')
      .limit(50)

    if (error) {
      setBreedList([])
      return
    }
    setBreedList(data)  // [{ id, name, type }, ...]
  } catch (error) {
    setBreedList([])
  }
}
```

**변환 포인트**:
- `kind_name` → `name` (컬럼명 변경)
- MariaDB `LIKE` → Supabase `.ilike()` (PostgreSQL `ILIKE` — 대소문자 무시)
- `type` 필터 추가 (`pet_breeds` 테이블은 dog/cat 통합, type 컬럼으로 구분)
- `.limit(50)`: 검색 결과 수 제한 (자동완성 UX)

**응답 매핑**:

| PHP 응답 필드 | Supabase 응답 필드 | 변환 필요 |
|---|---|---|
| `data[].kind_name` | `data[].name` | 예 — 키 이름 변경 |
| `data[].kind_id` | `data[].id` (UUID) | 예 — 정수 → UUID |
| — | `data[].type` | 예 — 신규 필드 (`'dog'`/`'cat'`) |

---

### API #13. set_animal_insert.php → pets INSERT + Storage

**전환 방식**: 자동 API + Storage | **난이도**: 쉬움
**관련 파일**: `components/PetRegisterForm.tsx`
**Supabase 대응**: Storage `pet-images` 업로드 → `pets` INSERT
**Supabase 테이블**: `pets`

**Before**:
```typescript
// 파일: components/PetRegisterForm.tsx
// 반려동물 등록
const registerPet = async (petData: {
  mb_id: string
  wr_subject: string     // 이름
  wr_content?: string    // 소개
  wr_2: string           // 성별
  wr_3: string           // 중성화 ('Y'/'N')
  wr_4: string           // 품종
  wr_5: string           // 생년월일
  wr_6: string           // 생일 체크 ('Y'/'N')
  wr_7: string           // 몸무게
  wr_8: string           // 백신 접종 ('Y'/'N')
  wr_10?: string         // 임시저장 ('Y'/'N')
  images?: { uri: string }[]  // 이미지 (최대 10장)
}) => {
  try {
    const formData = new FormData()
    formData.append('mb_id', petData.mb_id)
    formData.append('wr_subject', petData.wr_subject)
    formData.append('wr_content', petData.wr_content ?? '')
    formData.append('wr_2', petData.wr_2)
    formData.append('wr_3', petData.wr_3)
    formData.append('wr_4', petData.wr_4)
    formData.append('wr_5', petData.wr_5)
    formData.append('wr_6', petData.wr_6 ?? 'N')
    formData.append('wr_7', petData.wr_7)
    formData.append('wr_8', petData.wr_8)
    if (petData.wr_10) formData.append('wr_10', petData.wr_10)

    // 이미지 파일 추가
    petData.images?.forEach((img, index) => {
      formData.append(`animal_img${index + 1}`, {
        uri: img.uri,
        type: 'image/jpeg',
        name: `pet_${index + 1}.jpg`,
      } as any)
    })

    const response = await apiClient.post('api/set_animal_insert.php', formData)
    if (response.result === 'Y') {
      Alert.alert('완료', '반려동물이 등록되었습니다')
      return response.data
    } else {
      Alert.alert('오류', response.message ?? '등록 실패')
      return null
    }
  } catch (error) {
    Alert.alert('오류', '서버와 통신할 수 없습니다')
    return null
  }
}
```

**After**:
```typescript
// 파일: components/PetRegisterForm.tsx (수정)
import { supabase } from '@/lib/supabase'

// 반려동물 등록
const registerPet = async (petData: {
  name: string
  description?: string
  gender: string               // '수컷' | '암컷'
  is_neutered: boolean
  breed: string
  birth_date: string           // 'YYYY-MM-DD'
  is_birth_date_unknown: boolean
  weight: number
  is_vaccinated: boolean
  is_draft?: boolean
  images?: { uri: string }[]   // 이미지 (최대 10장)
}) => {
  try {
    // Step 0: 4마리 제한 체크 (기존 PHP에서도 서버 측 검증)
    const { count, error: countError } = await supabase
      .from('pets')
      .select('*', { count: 'exact', head: true })
      .eq('member_id', user.id)
      .eq('deleted', false)
      .eq('is_draft', false)

    if (countError) {
      Alert.alert('오류', countError.message)
      return null
    }
    if ((count ?? 0) >= 4) {
      Alert.alert('알림', '반려동물은 최대 4마리까지 등록할 수 있습니다')
      return null
    }

    // Step 1: 이미지 업로드 (Storage)
    const photoUrls: string[] = []
    if (petData.images && petData.images.length > 0) {
      for (let i = 0; i < petData.images.length; i++) {
        const filePath = `${user.id}/${Date.now()}_${i}.jpg`
        const response = await fetch(petData.images[i].uri)
        const blob = await response.blob()

        const { error: uploadError } = await supabase.storage
          .from('pet-images')
          .upload(filePath, blob, {
            contentType: 'image/jpeg',
            upsert: false,
          })

        if (uploadError) {
          Alert.alert('오류', `이미지 ${i + 1} 업로드 실패: ${uploadError.message}`)
          return null
        }

        const { data: { publicUrl } } = supabase.storage
          .from('pet-images')
          .getPublicUrl(filePath)

        photoUrls.push(publicUrl)
      }
    }

    // Step 2: pets 테이블 INSERT
    const { data, error } = await supabase
      .from('pets')
      .insert({
        member_id: user.id,
        name: petData.name,
        description: petData.description ?? '',
        gender: petData.gender,
        is_neutered: petData.is_neutered,
        breed: petData.breed,
        birth_date: petData.birth_date,
        is_birth_date_unknown: petData.is_birth_date_unknown,
        weight: petData.weight,
        is_vaccinated: petData.is_vaccinated,
        is_draft: petData.is_draft ?? false,
        photo_urls: photoUrls.length > 0 ? photoUrls : null,
        is_representative: false,        // 첫 등록 시 대표 아님 (별도 설정)
      })
      .select()
      .single()

    if (error) {
      Alert.alert('오류', error.message)
      return null
    }

    Alert.alert('완료', '반려동물이 등록되었습니다')
    return data
  } catch (error) {
    Alert.alert('오류', '서버와 통신할 수 없습니다')
    return null
  }
}
```

**변환 포인트**:
- FormData → JSON `.insert()`
- `mb_id` 제거 → `member_id: user.id` (UUID)
- 이미지: FormData `animal_img1~10` → Storage `pet-images` 버킷 업로드 후 `photo_urls` (text[]) 배열 저장
- Storage 경로: `pet-images/{user.id}/{timestamp}_{index}.jpg`
- **4마리 제한 체크**: `.select('*', { count: 'exact', head: true })`로 현재 등록 수 확인 (head: true → 데이터 본문 없이 count만)
- `wr_3` (`'Y'`/`'N'`) → `is_neutered` (boolean): 값 타입 변환 필요
- `wr_6` (`'Y'`/`'N'`) → `is_birth_date_unknown` (boolean)
- `wr_8` (`'Y'`/`'N'`) → `is_vaccinated` (boolean)
- `wr_10` (`'Y'`/`'N'`) → `is_draft` (boolean)
- `size_class`는 DB 트리거가 `weight` 기준으로 자동 계산 (앱에서 전달 불필요)

**응답 매핑**: #9 매핑표와 동일 (INSERT 후 `.select().single()`로 반환)

---

### API #14. set_animal_update.php → pets UPDATE + Storage

**전환 방식**: 자동 API + Storage | **난이도**: 쉬움
**관련 파일**: `components/PetRegisterForm.tsx`
**Supabase 대응**: Storage 이미지 교체 → `pets` UPDATE
**Supabase 테이블**: `pets`

**Before**:
```typescript
// 파일: components/PetRegisterForm.tsx
// 반려동물 수정
const updatePet = async (petId: string, petData: {
  mb_id: string
  wr_subject: string
  wr_content?: string
  wr_2: string
  wr_3: string
  wr_4: string
  wr_5: string
  wr_6?: string
  wr_7: string
  wr_8: string
  images?: { uri: string }[]   // 새로 추가/교체할 이미지
}) => {
  try {
    const formData = new FormData()
    formData.append('wr_id', petId)
    formData.append('mb_id', petData.mb_id)
    // ... (나머지 필드 append)

    petData.images?.forEach((img, index) => {
      formData.append(`animal_img${index + 1}`, {
        uri: img.uri, type: 'image/jpeg', name: `pet_${index + 1}.jpg`,
      } as any)
    })

    const response = await apiClient.post('api/set_animal_update.php', formData)
    if (response.result === 'Y') {
      Alert.alert('완료', '반려동물 정보가 수정되었습니다')
      return response.data
    }
    return null
  } catch (error) {
    Alert.alert('오류', '서버와 통신할 수 없습니다')
    return null
  }
}
```

**After**:
```typescript
// 파일: components/PetRegisterForm.tsx (수정)
import { supabase } from '@/lib/supabase'

// 반려동물 수정
const updatePet = async (petId: string, petData: {
  name: string
  description?: string
  gender: string
  is_neutered: boolean
  breed: string
  birth_date: string
  is_birth_date_unknown: boolean
  weight: number
  is_vaccinated: boolean
  newImages?: { uri: string }[]       // 새로 추가할 이미지
  existingPhotoUrls?: string[]        // 유지할 기존 이미지 URL
}) => {
  try {
    // Step 1: 새 이미지 업로드 (있는 경우)
    const newPhotoUrls: string[] = []
    if (petData.newImages && petData.newImages.length > 0) {
      for (let i = 0; i < petData.newImages.length; i++) {
        const filePath = `${user.id}/${Date.now()}_${i}.jpg`
        const response = await fetch(petData.newImages[i].uri)
        const blob = await response.blob()

        const { error: uploadError } = await supabase.storage
          .from('pet-images')
          .upload(filePath, blob, {
            contentType: 'image/jpeg',
            upsert: false,
          })

        if (uploadError) {
          Alert.alert('오류', `이미지 업로드 실패: ${uploadError.message}`)
          return null
        }

        const { data: { publicUrl } } = supabase.storage
          .from('pet-images')
          .getPublicUrl(filePath)

        newPhotoUrls.push(publicUrl)
      }
    }

    // Step 2: 기존 URL + 새 URL 합치기
    const allPhotoUrls = [
      ...(petData.existingPhotoUrls ?? []),
      ...newPhotoUrls,
    ]

    // Step 3: pets 테이블 UPDATE
    const { data, error } = await supabase
      .from('pets')
      .update({
        name: petData.name,
        description: petData.description ?? '',
        gender: petData.gender,
        is_neutered: petData.is_neutered,
        breed: petData.breed,
        birth_date: petData.birth_date,
        is_birth_date_unknown: petData.is_birth_date_unknown,
        weight: petData.weight,
        is_vaccinated: petData.is_vaccinated,
        photo_urls: allPhotoUrls.length > 0 ? allPhotoUrls : null,
      })
      .eq('id', petId)
      .eq('member_id', user.id)    // RLS 보조 (본인 데이터만)
      .select()
      .single()

    if (error) {
      Alert.alert('오류', error.message)
      return null
    }

    Alert.alert('완료', '반려동물 정보가 수정되었습니다')
    return data
  } catch (error) {
    Alert.alert('오류', '서버와 통신할 수 없습니다')
    return null
  }
}
```

**변환 포인트**:
- `wr_id` → `id` (UUID), `mb_id` 제거
- 이미지 관리: 기존 PHP는 전체 교체 방식 → Supabase는 기존 URL 유지 + 새 이미지 추가 방식
- `existingPhotoUrls`: 수정 화면에서 사용자가 삭제하지 않은 기존 이미지 URL
- `newImages`: 새로 추가한 이미지 → Storage 업로드 후 URL 추가
- `photo_urls` 배열에 합쳐서 UPDATE
- `.eq('member_id', user.id)`: RLS와 함께 본인 데이터만 수정 가능하도록 이중 안전장치

**응답 매핑**: #9 매핑표와 동일

---

### API #15. set_animal_delete.php → pets UPDATE (soft delete)

**전환 방식**: 자동 API | **난이도**: 쉬움
**관련 파일**: `hooks/usePetList.ts` → `deletePet()`
**Supabase 대응**: `supabase.from('pets').update({ deleted: true }).eq('id', petId)`
**Supabase 테이블**: `pets`

**Before**:
```typescript
// 파일: hooks/usePetList.ts
// 반려동물 삭제 (soft delete)
const deletePet = async (petId: string) => {
  try {
    const formData = new FormData()
    formData.append('mb_id', user.mb_id)
    formData.append('wr_id', petId)

    const response = await apiClient.post('api/set_animal_delete.php', formData)
    if (response.result === 'Y') {
      // 목록에서 제거
      setPetList(prev => prev.filter(p => p.wr_id !== petId))
      Alert.alert('완료', '반려동물이 삭제되었습니다')
    } else {
      Alert.alert('오류', response.message ?? '삭제 실패')
    }
  } catch (error) {
    Alert.alert('오류', '서버와 통신할 수 없습니다')
  }
}
```

**After**:
```typescript
// 파일: hooks/usePetList.ts (수정)
import { supabase } from '@/lib/supabase'

// 반려동물 삭제 (soft delete: deleted=true)
const deletePet = async (petId: string) => {
  try {
    const { error } = await supabase
      .from('pets')
      .update({ deleted: true })
      .eq('id', petId)
      .eq('member_id', user.id)    // RLS 보조

    if (error) {
      Alert.alert('오류', error.message)
      return
    }

    // 목록에서 제거
    setPetList(prev => prev.filter(p => p.id !== petId))
    Alert.alert('완료', '반려동물이 삭제되었습니다')
  } catch (error) {
    Alert.alert('오류', '서버와 통신할 수 없습니다')
  }
}
```

**변환 포인트**:
- `wr_id` → `id` (UUID), `mb_id` 제거
- **soft delete**: `deleted=true` UPDATE (실제 행 삭제가 아님)
- `deleted=true` 이후 모든 조회 쿼리에서 `.eq('deleted', false)` 필터로 제외됨
- `internal.pets_public_info` VIEW에도 `WHERE deleted=false` 필터가 적용되어 있음
- 목록 갱신: `wr_id` → `id` 로 필터 변경

**응답 매핑**:

| PHP 응답 필드 | Supabase 응답 필드 | 변환 필요 |
|---|---|---|
| `result` (`'Y'`/`'N'`) | `error` (`null`이면 성공) | 예 |

---

### API #16. set_first_animal_set.php → RPC `app_set_representative_pet`

**전환 방식**: RPC | **난이도**: 쉬움
**관련 파일**: `app/pet/default.tsx`
**Supabase 대응**: `supabase.rpc('app_set_representative_pet', { p_pet_id })`
**Supabase 테이블**: `pets`

**Before**:
```typescript
// 파일: app/pet/default.tsx
// 대표 반려동물 설정
const setRepresentativePet = async (petId: string) => {
  try {
    const formData = new FormData()
    formData.append('mb_id', user.mb_id)
    formData.append('wr_id', petId)    // 대표로 설정할 반려동물 ID

    const response = await apiClient.post('api/set_first_animal_set.php', formData)
    if (response.result === 'Y' || response.result?.msg === 'SUCCESS') {
      Alert.alert('완료', '대표 반려동물이 변경되었습니다')
      fetchPets()  // 목록 새로고침
    } else {
      Alert.alert('오류', '대표 설정 실패')
    }
  } catch (error) {
    Alert.alert('오류', '서버와 통신할 수 없습니다')
  }
}
```

**After**:
```typescript
// 파일: app/pet/default.tsx (수정)
import { supabase } from '@/lib/supabase'

// 대표 반려동물 설정 (RPC: 기존 대표 해제 → 새 대표 설정)
const setRepresentativePet = async (petId: string) => {
  try {
    const { data, error } = await supabase.rpc('app_set_representative_pet', {
      p_pet_id: petId,
    })

    if (error) {
      Alert.alert('오류', error.message)
      return
    }

    // RPC 응답: { success: true, data: { ... }, reset_count: N }
    if (data?.success) {
      Alert.alert('완료', '대표 반려동물이 변경되었습니다')
      fetchPets()  // 목록 새로고침
    } else {
      Alert.alert('오류', data?.error ?? '대표 설정 실패')
    }
  } catch (error) {
    Alert.alert('오류', '서버와 통신할 수 없습니다')
  }
}
```

**변환 포인트**:
- FormData POST → `supabase.rpc()` (JSON)
- `mb_id` 제거 → RPC 내부에서 `auth.uid()` 자동 사용 (SECURITY INVOKER)
- `wr_id` → `p_pet_id` (UUID, RPC 파라미터 `p_` 접두사 규칙)
- RPC가 수행하는 작업: ① p_pet_id 존재 검증 → ② 기존 대표 해제 (`is_representative=false`) → ③ 선택한 반려동물 대표 설정 (`is_representative=true`)
- RPC 응답 형식: `{ success: boolean, data?: {...}, error?: string, reset_count?: number }`
- 트랜잭션 안전성: RPC 내부에서 p_pet_id 존재 여부를 먼저 검증하므로, 기존 대표 해제 후 새 대표 설정 실패하는 경우가 없음

**응답 매핑**:

| PHP 응답 필드 | Supabase 응답 필드 | 변환 필요 |
|---|---|---|
| `result.msg` (`'SUCCESS'`) | `data.success` (boolean) | 예 — 문자열 → boolean |
| — | `data.data` (대표로 설정된 반려동물 정보) | 예 — 신규 |
| — | `data.reset_count` (해제된 기존 대표 수) | 예 — 신규 |
| — | `data.error` (실패 사유) | 예 — 신규 |

---

## 4. 유치원/보호자

> **가이드 참조**: `APP_MIGRATION_GUIDE.md §11 유치원/보호자 RPC`

### API #17. get_partner.php → RPC `app_get_kindergarten_detail`

**전환 방식**: RPC | **난이도**: 중
**관련 파일**: `hooks/useKinderGarten.ts` → `fetchKindergarten()`
**Supabase 대응**: `supabase.rpc('app_get_kindergarten_detail', { p_kindergarten_id })`

**Before**:
```typescript
// 파일: hooks/useKinderGarten.ts
// 유치원 상세 조회 (프로필 + 운영자 + 반려동물 + 찜여부)
const fetchKindergarten = async (partnerId: string) => {
  try {
    const response = await apiClient.get('api/get_partner.php', {
      mb_id: partnerId,          // 유치원 운영자 폰번호
      user_id: user.mb_id,       // 조회자(보호자) 폰번호 → 찜 여부 판단용
    })
    if (response.result === 'Y') {
      // response.data: { partner: {...}, animals: [...] }
      setKindergarten(response.data.partner)
      setAnimals(response.data.animals)
      return response.data
    }
    return null
  } catch (error) {
    Alert.alert('오류', '서버와 통신할 수 없습니다')
    return null
  }
}
```

**After**:
```typescript
// 파일: hooks/useKinderGarten.ts (수정)
import { supabase } from '@/lib/supabase'

// 유치원 상세 조회 (프로필 + 운영자 + 반려동물 + 리뷰수 + 정산상태 + 찜여부)
const fetchKindergarten = async (kindergartenId: string) => {
  try {
    const { data, error } = await supabase.rpc('app_get_kindergarten_detail', {
      p_kindergarten_id: kindergartenId,   // 유치원 UUID
      // user_id 제거 — auth.uid()가 RPC 내부에서 자동 추출
    })

    if (error) {
      Alert.alert('오류', error.message)
      return null
    }

    // RPC 응답: { success, data: { kindergarten, operator, resident_pets, review_count, inicis_status, is_favorite } }
    if (!data?.success) {
      Alert.alert('오류', data?.error ?? '유치원을 찾을 수 없습니다')
      return null
    }

    setKindergarten(data.data.kindergarten)
    setOperator(data.data.operator)
    setResidentPets(data.data.resident_pets ?? [])
    setReviewCount(data.data.review_count)
    setIsFavorite(data.data.is_favorite)
    setInicisStatus(data.data.inicis_status)
    return data.data
  } catch (error) {
    Alert.alert('오류', '서버와 통신할 수 없습니다')
    return null
  }
}
```

**변환 포인트**:
- `mb_id` (운영자 폰번호) → `p_kindergarten_id` (유치원 UUID) — 운영자 ID가 아닌 **유치원 ID**로 변경
- `user_id` (조회자 폰번호) 파라미터 제거 → RPC 내부에서 `auth.uid()` 자동 사용
- 가격 구조: `wr_2`(파이프 문자열) → `kindergarten.prices` 중첩 객체 (소형/중형/대형 × 1h/24h/walk/pickup)
- 이미지: `partner_img1~10` (10개 개별 필드) → `kindergarten.photo_urls` (text[] 배열)
- `partner_freshness: 100` (하드코딩) → `kindergarten.freshness_current` (실제값)
- `partner_rCnt: '0'` (하드코딩) → `review_count` (실제 COUNT)
- 금융 정보(`partner_bank_name`/`partner_account`), 호수(`address_building_ho`), 노쇼 카운트: **제외** (비공개)
- RPC 응답은 `{ success, data }` 래퍼 — `data.success`를 반드시 체크

**응답 매핑**:

| PHP 응답 필드 | Supabase 응답 필드 | 변환 필요 |
|---|---|---|
| `data.partner.wr_id` | `data.data.kindergarten.id` (UUID) | 예 — 정수 → UUID, 경로 변경 |
| `data.partner.wr_subject` | `data.data.kindergarten.name` | 예 — 키 이름 변경 |
| `data.partner.wr_content` | `data.data.kindergarten.description` | 예 — 키 이름 변경 |
| `data.partner.wr_2` (파이프 문자열) | `data.data.kindergarten.prices.small.1h` 등 | 예 — 구조 변경 |
| `data.partner.partner_img1~10` | `data.data.kindergarten.photo_urls[]` | 예 — 10필드 → 배열 |
| `data.partner.partner_freshness` | `data.data.kindergarten.freshness_current` | 예 — 키 이름 변경 |
| `data.partner.partner_rCnt` | `data.data.review_count` | 예 — 경로 + 타입 변경 (string→number) |
| `data.partner.is_favorite` | `data.data.is_favorite` | 예 — 경로 변경, string→boolean |
| `data.partner.settlement_ready` | `data.data.inicis_status` | 예 — `'0'`/`'1'` → `'미등록'`/`'등록완료'` |
| `data.animals[]` | `data.data.resident_pets[]` | 예 — 키 이름 변경 |
| — | `data.data.operator` (신규) | 운영자 프로필 (닉네임, 이미지) |
| `data.partner.partner_bank_name` | — (제외) | 금융정보 비노출 |
| `data.partner.partner_ho` | — (제외) | 호수 비공개 |

---

### API #18. get_partner_list.php → RPC `app_get_kindergartens`

**전환 방식**: RPC | **난이도**: 중
**관련 파일**: `utils/fetchPartnerList.ts`
**Supabase 대응**: `supabase.rpc('app_get_kindergartens', { p_latitude, p_longitude, p_limit })`

**Before**:
```typescript
// 파일: utils/fetchPartnerList.ts
// 유치원 목록 조회 (전체 — 페이지네이션 없음)
const fetchPartnerList = async () => {
  try {
    const response = await apiClient.get('api/get_partner_list.php', {
      mb_id: user.mb_id,        // 조회자 폰번호 → 찜 여부 판단
    })
    if (response.result === 'Y') {
      // response.data.partners: 전체 유치원 배열
      return response.data.partners
    }
    return []
  } catch (error) {
    return []
  }
}
```

**After**:
```typescript
// 파일: utils/fetchPartnerList.ts (수정)
import { supabase } from '@/lib/supabase'

// 유치원 목록 조회 (거리순 정렬, safety cap 적용)
const fetchKindergartenList = async (
  latitude?: number,    // 현재 위치 위도
  longitude?: number,   // 현재 위치 경도
  limit: number = 100   // 최대 건수 (기본 100, 최대 200)
) => {
  try {
    const { data, error } = await supabase.rpc('app_get_kindergartens', {
      p_latitude: latitude ?? null,
      p_longitude: longitude ?? null,
      p_limit: limit,
    })

    if (error) return []

    if (!data?.success) return []

    // data.data: { total_count, kindergartens: [...] }
    return data.data.kindergartens ?? []
  } catch (error) {
    return []
  }
}
```

**변환 포인트**:
- `mb_id` 파라미터 제거 → `auth.uid()`로 찜 여부 자동 판단 (RPC 내부)
- 좌표 파라미터 추가 (`p_latitude`, `p_longitude`) — 거리순 정렬용, 미제공 시 최신순
- `p_limit` safety cap (최소 1, 최대 200) — 전체 반환 → 최대 건수 제한
- 필터: `inicis_status='등록완료'` + `registration_status='registered'` 자동 적용 (앱에서 별도 필터 불필요)
- 가격: 소형 2개만 반환 (`price_small_1h`, `price_small_24h`) — 12개 전체는 상세(#17)에서
- `distance_km`: 좌표 제공 시 계산되어 반환 (km 단위, 소수점 2자리)
- `total_count`: 전체 유치원 수 반환 (클러스터링 등 클라이언트용)

**응답 매핑**:

| PHP 응답 필드 | Supabase 응답 필드 | 변환 필요 |
|---|---|---|
| `data.partners[].wr_id` | `data.data.kindergartens[].id` (UUID) | 예 — 정수 → UUID |
| `data.partners[].wr_subject` | `data.data.kindergartens[].name` | 예 — 키 이름 변경 |
| `data.partners[].partner_img1~10` | `data.data.kindergartens[].photo_urls[]` | 예 — 10필드 → 배열 |
| `data.partners[].is_favorite` | `data.data.kindergartens[].is_favorite` | 예 — string → boolean |
| — | `data.data.kindergartens[].distance_km` (신규) | 거리 (좌표 미제공 시 null) |
| — | `data.data.kindergartens[].operator` (신규) | 운영자 프로필 |
| — | `data.data.kindergartens[].review_count` (신규) | 실제 리뷰 수 |
| — | `data.data.total_count` (신규) | 전체 유치원 수 |

---

### API #19. get_protector.php → RPC `app_get_guardian_detail`

**전환 방식**: RPC | **난이도**: 중
**관련 파일**: `hooks/useProtector.ts` → `fetchProtector()`
**Supabase 대응**: `supabase.rpc('app_get_guardian_detail', { p_member_id })`

> **참고**: `get_protector.php` PHP 소스가 존재하지 않으므로 Before 코드는 `get_partner.php`의 대칭 구조로 추정하여 작성했습니다.

**Before**:
```typescript
// 파일: hooks/useProtector.ts
// 보호자 상세 조회 (프로필 + 반려동물 목록)
const fetchProtector = async (protectorId: string) => {
  try {
    const response = await apiClient.get('api/get_protector.php', {
      mb_id: protectorId,        // 보호자 폰번호
      user_id: user.mb_id,       // 조회자(유치원) 폰번호
    })
    if (response.result === 'Y') {
      setProtector(response.data.protector)
      setAnimals(response.data.animals)
      return response.data
    }
    return null
  } catch (error) {
    Alert.alert('오류', '서버와 통신할 수 없습니다')
    return null
  }
}
```

**After**:
```typescript
// 파일: hooks/useProtector.ts (수정)
import { supabase } from '@/lib/supabase'

// 보호자 상세 조회 (프로필 + 반려동물 목록 + 반려동물별 찜 여부)
const fetchGuardian = async (memberId: string) => {
  try {
    const { data, error } = await supabase.rpc('app_get_guardian_detail', {
      p_member_id: memberId,   // 보호자 UUID
      // user_id 제거 — auth.uid()가 RPC 내부에서 자동 추출
    })

    if (error) {
      Alert.alert('오류', error.message)
      return null
    }

    // RPC 응답: { success, data: { guardian, pets } }
    if (!data?.success) {
      Alert.alert('오류', data?.error ?? '보호자를 찾을 수 없습니다')
      return null
    }

    setGuardian(data.data.guardian)
    setPets(data.data.pets ?? [])
    return data.data
  } catch (error) {
    Alert.alert('오류', '서버와 통신할 수 없습니다')
    return null
  }
}
```

**변환 포인트**:
- `mb_id` (보호자 폰번호) → `p_member_id` (보호자 UUID)
- `user_id` (조회자) 파라미터 제거 → `auth.uid()` 자동 (찜 여부 판단)
- 찜은 보호자 단위가 아닌 **반려동물 단위**: `pets[].is_favorite` — 유치원 운영자가 해당 반려동물을 찜했는지
- 주소: `address_road` 비공개, `address_complex` + `address_building_dong`만 반환
- 리뷰 수, 가격, 정산 정보: 없음 (유치원 전용)
- `is_draft=true` 임시저장 반려동물: 자동 제외

**응답 매핑**:

| PHP 응답 필드 (추정) | Supabase 응답 필드 | 변환 필요 |
|---|---|---|
| `data.protector.mb_id` | `data.data.guardian.id` (UUID) | 예 — 폰번호 → UUID |
| `data.protector.mb_nick` | `data.data.guardian.nickname` | 예 — 키 이름 변경 |
| `data.protector.mb_profile1` | `data.data.guardian.profile_image` | 예 — 파일명 → 전체 URL |
| `data.protector.mb_4` | `data.data.guardian.address_complex` | 예 — 키 이름 변경 |
| `data.protector.mb_dong` | `data.data.guardian.address_building_dong` | 예 — 키 이름 변경 |
| `data.animals[]` | `data.data.pets[]` | 예 — 키 이름 변경 |
| `data.animals[].is_favorite` | `data.data.pets[].is_favorite` | 예 — string → boolean |
| — | `data.data.guardian.status` (신규) | 회원 상태 (정상/탈퇴 등) |

---

### API #20. get_protector_list.php → RPC `app_get_guardians`

**전환 방식**: RPC | **난이도**: 중
**관련 파일**: `utils/fetchProtectorList.ts`
**Supabase 대응**: `supabase.rpc('app_get_guardians', { p_latitude, p_longitude, p_limit })`

> **참고**: `get_protector_list.php` PHP 소스가 존재하지 않으므로 Before 코드는 `get_partner_list.php`의 대칭 구조로 추정하여 작성했습니다.

**Before**:
```typescript
// 파일: utils/fetchProtectorList.ts
// 보호자 목록 조회
const fetchProtectorList = async () => {
  try {
    const response = await apiClient.get('api/get_protector_list.php', {
      mb_id: user.mb_id,        // 조회자(유치원) 폰번호
    })
    if (response.result === 'Y') {
      return response.data.protectors
    }
    return []
  } catch (error) {
    return []
  }
}
```

**After**:
```typescript
// 파일: utils/fetchProtectorList.ts (수정)
import { supabase } from '@/lib/supabase'

// 보호자 목록 조회 (거리순 정렬, safety cap 적용)
const fetchGuardianList = async (
  latitude?: number,
  longitude?: number,
  limit: number = 100
) => {
  try {
    const { data, error } = await supabase.rpc('app_get_guardians', {
      p_latitude: latitude ?? null,
      p_longitude: longitude ?? null,
      p_limit: limit,
    })

    if (error) return []

    if (!data?.success) return []

    // data.data: { total_count, guardians: [...] }
    return data.data.guardians ?? []
  } catch (error) {
    return []
  }
}
```

**변환 포인트**:
- `mb_id` 파라미터 제거 → `auth.uid()` 자동 인증
- 좌표 파라미터 추가 (`p_latitude`, `p_longitude`) — 거리순 정렬용, 미제공 시 최신순
- `p_limit` safety cap (최소 1, 최대 200)
- 필터: `current_mode='보호자'` + `status='정상'` 자동 적용 (탈퇴/정지 회원 제외)
- `pet_thumbnails[]`: 각 보호자의 반려동물 첫 번째 사진 배열 (`[{ id, name, thumbnail }]`)
- `distance_km`: 정렬 전용으로 CTE 내부 계산, **반환하지 않음**
- 찜 여부, 리뷰 수: 목록에서 제외 (해당 UI 없음)

**응답 매핑**:

| PHP 응답 필드 (추정) | Supabase 응답 필드 | 변환 필요 |
|---|---|---|
| `data.protectors[].mb_id` | `data.data.guardians[].id` (UUID) | 예 — 폰번호 → UUID |
| `data.protectors[].mb_nick` | `data.data.guardians[].nickname` | 예 — 키 이름 변경 |
| `data.protectors[].mb_profile1` | `data.data.guardians[].profile_image` | 예 — 파일명 → 전체 URL |
| `data.protectors[].mb_4` | `data.data.guardians[].address_complex` | 예 — 키 이름 변경 |
| — | `data.data.guardians[].address_building_dong` (신규) | 동 정보 |
| — | `data.data.guardians[].pet_thumbnails[]` (신규) | 반려동물 썸네일 배열 |
| — | `data.data.total_count` (신규) | 전체 보호자 수 |

---

### API #21. set_partner_update.php → kindergartens UPDATE + Storage

**전환 방식**: 자동 API + Storage | **난이도**: 중
**관련 파일**: `app/kindergarten/register.tsx`, `hooks/useJoin.ts`
**Supabase 대응**: Storage `kindergarten-images` 업로드 → `kindergartens` UPDATE
**Supabase 테이블**: `kindergartens`

**Before**:
```typescript
// 파일: app/kindergarten/register.tsx
// 유치원 정보 등록/수정 (UPSERT)
const updateKindergarten = async (kgData: {
  mb_id: string
  wr_subject: string         // 유치원 이름
  wr_content: string         // 소개
  wr_2: string               // 가격 (파이프 구분: '10000|12000|...')
  mb_addr1: string           // 도로명주소
  mb_4: string               // 단지명
  mb_dong: string            // 동
  mb_ho: string              // 호
  business_status: string    // 영업 상태
  images?: { uri: string }[] // 유치원 이미지 (최대 10장)
}) => {
  try {
    const formData = new FormData()
    formData.append('mb_id', kgData.mb_id)
    formData.append('wr_subject', kgData.wr_subject)
    formData.append('wr_content', kgData.wr_content)
    formData.append('wr_2', kgData.wr_2)
    formData.append('mb_addr1', kgData.mb_addr1)
    formData.append('mb_4', kgData.mb_4)
    formData.append('mb_dong', kgData.mb_dong)
    formData.append('mb_ho', kgData.mb_ho)
    formData.append('business_status', kgData.business_status)

    kgData.images?.forEach((img, index) => {
      formData.append(`partner_img${index + 1}`, {
        uri: img.uri, type: 'image/jpeg', name: `kg_${index + 1}.jpg`,
      } as any)
    })

    const response = await apiClient.post('api/set_partner_update.php', formData)
    if (response.result === 'Y') {
      Alert.alert('완료', '유치원 정보가 저장되었습니다')
      return response.data
    }
    Alert.alert('오류', response.message ?? '저장 실패')
    return null
  } catch (error) {
    Alert.alert('오류', '서버와 통신할 수 없습니다')
    return null
  }
}
```

**After**:
```typescript
// 파일: app/kindergarten/register.tsx (수정)
import { supabase } from '@/lib/supabase'

// 유치원 정보 수정
const updateKindergarten = async (kgData: {
  name: string
  description: string
  price_small_1h?: number       // 소형 1시간 가격
  price_small_24h?: number      // 소형 24시간 가격
  price_small_walk?: number     // 소형 산책
  price_small_pickup?: number   // 소형 픽업
  price_medium_1h?: number      // 중형 1시간
  price_medium_24h?: number     // 중형 24시간
  price_medium_walk?: number    // 중형 산책
  price_medium_pickup?: number  // 중형 픽업
  price_large_1h?: number       // 대형 1시간
  price_large_24h?: number      // 대형 24시간
  price_large_walk?: number     // 대형 산책
  price_large_pickup?: number   // 대형 픽업
  address_road: string
  address_complex: string
  address_building_dong: string
  address_building_ho: string
  business_status: string       // '영업중' | '방학중'
  latitude?: number
  longitude?: number
  newImages?: { uri: string }[]
  existingPhotoUrls?: string[]
}) => {
  try {
    // Step 1: 이미지 업로드 (새 이미지가 있는 경우)
    const newPhotoUrls: string[] = []
    if (kgData.newImages && kgData.newImages.length > 0) {
      for (let i = 0; i < kgData.newImages.length; i++) {
        const filePath = `${user.id}/${Date.now()}_${i}.jpg`
        const response = await fetch(kgData.newImages[i].uri)
        const blob = await response.blob()

        const { error: uploadError } = await supabase.storage
          .from('kindergarten-images')
          .upload(filePath, blob, {
            contentType: 'image/jpeg',
            upsert: false,
          })

        if (uploadError) {
          Alert.alert('오류', `이미지 업로드 실패: ${uploadError.message}`)
          return null
        }

        const { data: { publicUrl } } = supabase.storage
          .from('kindergarten-images')
          .getPublicUrl(filePath)

        newPhotoUrls.push(publicUrl)
      }
    }

    const allPhotoUrls = [
      ...(kgData.existingPhotoUrls ?? []),
      ...newPhotoUrls,
    ]

    // Step 2: kindergartens 테이블 UPDATE
    const { data, error } = await supabase
      .from('kindergartens')
      .update({
        name: kgData.name,
        description: kgData.description,
        price_small_1h: kgData.price_small_1h,
        price_small_24h: kgData.price_small_24h,
        price_small_walk: kgData.price_small_walk,
        price_small_pickup: kgData.price_small_pickup,
        price_medium_1h: kgData.price_medium_1h,
        price_medium_24h: kgData.price_medium_24h,
        price_medium_walk: kgData.price_medium_walk,
        price_medium_pickup: kgData.price_medium_pickup,
        price_large_1h: kgData.price_large_1h,
        price_large_24h: kgData.price_large_24h,
        price_large_walk: kgData.price_large_walk,
        price_large_pickup: kgData.price_large_pickup,
        address_road: kgData.address_road,
        address_complex: kgData.address_complex,
        address_building_dong: kgData.address_building_dong,
        address_building_ho: kgData.address_building_ho,
        business_status: kgData.business_status,
        latitude: kgData.latitude,
        longitude: kgData.longitude,
        photo_urls: allPhotoUrls.length > 0 ? allPhotoUrls : null,
      })
      .eq('member_id', user.id)    // RLS 보조 (본인 유치원만)
      .select()
      .single()

    if (error) {
      Alert.alert('오류', error.message)
      return null
    }

    Alert.alert('완료', '유치원 정보가 저장되었습니다')
    return data
  } catch (error) {
    Alert.alert('오류', '서버와 통신할 수 없습니다')
    return null
  }
}
```

**변환 포인트**:
- FormData → `.update()` (JSON)
- `mb_id` 제거 → `.eq('member_id', user.id)` (UUID)
- **가격 구조 변경**: 기존 `wr_2` (파이프 구분 문자열 `'10000|12000|...'`) → 12개 개별 integer 컬럼 (`price_small_1h`, `price_small_24h`, `price_small_walk`, `price_small_pickup`, `price_medium_1h`, `price_medium_24h`, `price_medium_walk`, `price_medium_pickup`, `price_large_1h`, `price_large_24h`, `price_large_walk`, `price_large_pickup`)
- 이미지: `partner_img1~10` → Storage `kindergarten-images` 버킷 + `photo_urls` (text[])
- 주소 컬럼: `mb_addr1` → `address_road`, `mb_4` → `address_complex`, `mb_dong` → `address_building_dong`, `mb_ho` → `address_building_ho`
- `wr_subject` → `name`, `wr_content` → `description`
- 위치 좌표 (`latitude`, `longitude`) 추가 가능 (신규 컬럼)

**응답 매핑**:

| PHP 응답 필드 | Supabase 응답 필드 | 변환 필요 |
|---|---|---|
| `result` (`'Y'`/`'N'`) | `error` (`null`이면 성공) | 예 |
| `data.wr_subject` | `data.name` | 예 — 키 이름 변경 |
| `data.wr_content` | `data.description` | 예 — 키 이름 변경 |
| `data.wr_2` (파이프 구분) | `data.price_small_1h`, `price_small_24h`, `price_small_walk`, `price_small_pickup`, `price_medium_1h`, `price_medium_24h`, `price_medium_walk`, `price_medium_pickup`, `price_large_1h`, `price_large_24h`, `price_large_walk`, `price_large_pickup` (12개) | 예 — 문자열 → 개별 숫자 컬럼 |
| `data.partner_img1~10` | `data.photo_urls` (text[]) | 예 — 개별 → 배열 |

---

## 5. 채팅

> **가이드 참조**: `APP_MIGRATION_GUIDE.md §14 채팅 전환`

### API #22. chat.php → create_room → RPC `app_create_chat_room`

**전환 방식**: RPC (SECURITY DEFINER) | **난이도**: 상
**관련 파일**: `hooks/useChat.ts` → `createRoom()`, 채팅 시작 화면
**Supabase 대응**: `supabase.rpc('app_create_chat_room', { p_target_member_id })`

**Before**:
```typescript
// 파일: hooks/useChat.ts
// 채팅방 생성 (보호자↔유치원 1:1 채팅방)
const createRoom = async (targetMbId: string) => {
  try {
    const formData = new FormData()
    formData.append('method', 'create_room')
    formData.append('mb_id', user.mb_id)           // 내 폰번호
    formData.append('target_mb_id', targetMbId)     // 상대방 폰번호
    // name = '폰번호-폰번호' 형식으로 서버에서 자동 생성

    const response = await apiClient.post('api/chat.php', formData)
    if (response.result === 'Y') {
      const roomId = response.data.room_id
      router.push(`/chat/${roomId}`)
      return roomId
    }
    return null
  } catch (error) {
    Alert.alert('오류', '채팅방을 생성할 수 없습니다')
    return null
  }
}
```

**After**:
```typescript
// 파일: hooks/useChat.ts (수정)
import { supabase } from '@/lib/supabase'

// 채팅방 생성 또는 기존 방 복원 (보호자↔유치원 1:1)
const createRoom = async (targetMemberId: string) => {
  try {
    const { data, error } = await supabase.rpc('app_create_chat_room', {
      p_target_member_id: targetMemberId,  // 상대방 UUID
      // 내 ID: auth.uid() → RPC 내부에서 자동 추출
      // 역할 판별: members.current_mode → RPC 내부에서 자동 판별
    })

    if (error) {
      Alert.alert('오류', error.message)
      return null
    }

    // RPC 응답: { success, data: { room_id, is_new } }
    if (!data?.success) {
      Alert.alert('오류', data?.error ?? '채팅방을 생성할 수 없습니다')
      return null
    }

    const roomId = data.data.room_id
    // is_new: true=신규 생성, false=기존 방 복원 (나갔다가 다시 대화)
    router.push(`/chat/${roomId}`)
    return roomId
  } catch (error) {
    Alert.alert('오류', '채팅방을 생성할 수 없습니다')
    return null
  }
}
```

**변환 포인트**:
- FormData + `method=create_room` → `supabase.rpc('app_create_chat_room', { ... })`
- `mb_id` + `target_mb_id` (폰번호 2개) → `p_target_member_id` (상대방 UUID 1개). 내 ID는 `auth.uid()` 자동 추출
- 채팅방 이름: `'폰번호-폰번호'` 형식 제거 → `guardian_id` + `kindergarten_id` FK 구조
- 중복 방지: 기존 `name` 문자열 비교 → `guardian_id + kindergarten_id` 조합 UNIQUE 체크
- 방 복원: 나갔던 방이 있으면 `status='활성'`으로 복원 후 기존 방 ID 반환 (`is_new=false`)
- SECURITY DEFINER: 상대방 `chat_room_members` 레코드 INSERT를 위해 테이블 소유자 권한 필요
- 역할 자동 판별: `members.current_mode`가 `'보호자'`면 guardian, `'유치원'`이면 kindergarten

**응답 매핑**:

| PHP 응답 필드 | Supabase 응답 필드 | 변환 필요 |
|---|---|---|
| `result` (`'Y'`/`'N'`) | `data.success` (boolean) | 예 |
| `data.room_id` (정수) | `data.data.room_id` (UUID) | 예 — 정수 → UUID |
| — | `data.data.is_new` (boolean) | 예 — 신규 (신규 생성 vs 기존 복원) |

---

### API #23. chat.php → get_rooms → RPC `app_get_chat_rooms`

**전환 방식**: RPC | **난이도**: 상
**관련 파일**: `hooks/useChatRoom.ts`, `app/chat/index.tsx` (채팅 목록 화면)
**Supabase 대응**: `supabase.rpc('app_get_chat_rooms')`

**Before**:
```typescript
// 파일: hooks/useChatRoom.ts
// 채팅방 목록 조회 (마지막 메시지 + 미읽음 수 + 상대방 프로필)
const fetchChatRooms = async () => {
  try {
    const response = await apiClient.get('api/chat.php', {
      method: 'get_rooms',
      mb_id: user.mb_id,
    })
    if (response.result === 'Y') {
      setChatRooms(response.data)  // [{ room_id, name, last_message, unread_count, ... }]
    }
  } catch (error) {
    setChatRooms([])
  }
}
```

**After**:
```typescript
// 파일: hooks/useChatRoom.ts (수정)
import { supabase } from '@/lib/supabase'

interface ChatRoom {
  room_id: string               // UUID
  status: string                // '활성' | '비활성'
  last_message: string | null
  last_message_at: string | null  // timestamptz
  last_message_type: string | null
  unread_count: number
  is_muted: boolean
  opponent: {
    id: string                  // UUID
    nickname: string
    profile_image: string | null
    role: string                // '보호자' | '유치원'
  }
  reservation_count: number
}

// 채팅방 목록 조회 (미읽음 수 + 상대방 프로필 포함)
const fetchChatRooms = async () => {
  try {
    const { data, error } = await supabase.rpc('app_get_chat_rooms')
    // mb_id 파라미터 제거 — auth.uid()로 자동 식별

    if (error) {
      setChatRooms([])
      return
    }

    // RPC 응답: { success, data: ChatRoom[] }
    if (!data?.success) {
      setChatRooms([])
      return
    }

    setChatRooms(data.data as ChatRoom[])
  } catch (error) {
    setChatRooms([])
  }
}
```

**변환 포인트**:
- `mb_id` 파라미터 제거 → RPC 내부에서 `auth.uid()` 자동 추출
- `name` (`'폰번호-폰번호'`) 파싱으로 상대방 식별 → `opponent` 구조화 객체 (RPC 내 members JOIN)
- 미읽음 수: PHP 별도 쿼리 → RPC 내부 서브쿼리 (`chat_messages WHERE created_at > (last_read_message_id의 created_at 서브쿼리) AND sender_id ≠ auth.uid()`). ⚠️ UUID v4는 순서 미보장이므로 `cm.id >` 비교 대신 `cm.created_at >` 타임스탬프 비교 사용 (R4 리뷰 Issue 4)
- 정렬: `last_message_at DESC` (최신 메시지 순)
- `status='활성'` 방만 반환 (나간 방 제외)
- `opponent.profile_image`: 파일명 → Storage 전체 URL (internal VIEW 사용)
- `reservation_count`: 해당 채팅방에 연결된 예약 수 (`chat_room_reservations` COUNT)

**응답 매핑**:

| PHP 응답 필드 | Supabase 응답 필드 | 변환 필요 |
|---|---|---|
| `data[].room_id` (정수) | `data.data[].room_id` (UUID) | 예 — 정수 → UUID |
| `data[].name` (`'폰번호-폰번호'`) | — (제거) | — `opponent` 객체로 대체 |
| `data[].last_message` | `data.data[].last_message` | 아니오 |
| `data[].last_message_time` | `data.data[].last_message_at` | 예 — 키 이름 변경 |
| `data[].unread_count` | `data.data[].unread_count` | 아니오 |
| 상대방 이름 (name 파싱 + 별도 조회) | `data.data[].opponent.nickname` | 예 — 구조 변경 |
| 상대방 이미지 (별도 조회) | `data.data[].opponent.profile_image` | 예 — 구조 변경 |
| — | `data.data[].opponent.role` | 예 — 신규 (`'보호자'` / `'유치원'`) |
| — | `data.data[].is_muted` | 예 — 신규 |
| — | `data.data[].last_message_type` | 예 — 신규 |
| — | `data.data[].reservation_count` | 예 — 신규 |

---

### API #24. chat.php → get_messages → chat_messages SELECT

**전환 방식**: 자동 API | **난이도**: 중
**관련 파일**: `hooks/useChat.ts` → `getMessageHistory()`
**Supabase 대응**: `supabase.from('chat_messages').select('*').eq('chat_room_id', roomId).order('created_at').range(from, to)`
**Supabase 테이블**: `chat_messages`

**Before**:
```typescript
// 파일: hooks/useChat.ts
// 채팅 메시지 히스토리 조회 (페이지네이션)
const getMessageHistory = async (roomId: string, page: number = 1) => {
  try {
    const response = await apiClient.get('api/chat.php', {
      method: 'get_messages',
      room_id: roomId,
      mb_id: user.mb_id,
      page: page,
      per_page: 50,
    })
    if (response.result === 'Y') {
      return response.data  // 메시지 배열
    }
    return []
  } catch (error) {
    return []
  }
}
```

**After**:
```typescript
// 파일: hooks/useChat.ts (수정)
import { supabase } from '@/lib/supabase'

// 채팅 메시지 히스토리 조회 (페이지네이션)
const getMessageHistory = async (roomId: string, page: number = 1, perPage: number = 50) => {
  try {
    const from = (page - 1) * perPage
    const to = from + perPage - 1

    const { data, error } = await supabase
      .from('chat_messages')
      .select('id, chat_room_id, sender_id, sender_type, message_type, content, image_urls, is_read, created_at')
      .eq('chat_room_id', roomId)
      .order('created_at', { ascending: false })   // 최신 메시지 먼저
      .range(from, to)

    if (error) return []
    return data
  } catch (error) {
    return []
  }
}
```

**변환 포인트**:
- `room_id` → `chat_room_id` (FK 컬럼명 변경)
- `mb_id` 파라미터 제거 (JWT 자동 인증)
- 페이지네이션: `page/per_page` → `.range(from, to)` (0-based offset)
- `file_path` → `image_urls` (jsonb 배열), `file_type` → `message_type`으로 대체

**응답 매핑**:

| PHP 응답 필드 | Supabase 응답 필드 | 변환 필요 |
|---|---|---|
| `data[].id` | `data[].id` (UUID) | 예 — 정수 → UUID |
| `data[].room_id` | `data[].chat_room_id` | 예 — 키 이름 변경 |
| `data[].mb_id` | `data[].sender_id` (UUID) | 예 — 폰번호 → UUID |
| `data[].message_type` | `data[].message_type` | 아니오 |
| `data[].content` | `data[].content` | 아니오 |
| `data[].file_path` | `data[].image_urls` (jsonb) | 예 — 문자열 → jsonb 배열 |
| — | `data[].sender_type` | 예 — 신규 (보호자/유치원/시스템) |
| — | `data[].is_read` | 예 — 신규 |

---

### API #25. chat.php → send_message → Edge Function `send-chat-message`

**전환 방식**: Edge Function | **난이도**: 상
**관련 파일**: `hooks/useChat.ts` → `sendMessage()`, `app/chat/[room]/index.tsx`
**Supabase 대응**: `supabase.functions.invoke('send-chat-message', { body })`

**Before**:
```typescript
// 파일: hooks/useChat.ts
// ① 텍스트 메시지 전송
const sendTextMessage = async (roomId: string, content: string) => {
  try {
    const formData = new FormData()
    formData.append('method', 'send_message')
    formData.append('room_id', roomId)
    formData.append('mb_id', user.mb_id)
    formData.append('content', content)
    formData.append('message_type', 'text')

    const response = await apiClient.post('api/chat.php', formData)
    if (response.result === 'Y') {
      // WebSocket으로 상대방에게 실시간 전달은 별도 처리
      return response.data
    }
    return null
  } catch (error) {
    Alert.alert('오류', '메시지를 전송할 수 없습니다')
    return null
  }
}

// ② 이미지 메시지 전송
const sendImageMessage = async (roomId: string, imageFile: any) => {
  try {
    const formData = new FormData()
    formData.append('method', 'send_message')
    formData.append('room_id', roomId)
    formData.append('mb_id', user.mb_id)
    formData.append('message_type', 'image')
    formData.append('file', {
      uri: imageFile.uri,
      type: imageFile.type || 'image/jpeg',
      name: imageFile.fileName || 'image.jpg',
    } as any)

    const response = await apiClient.post('api/chat.php', formData)
    if (response.result === 'Y') {
      return response.data
    }
    return null
  } catch (error) {
    Alert.alert('오류', '이미지를 전송할 수 없습니다')
    return null
  }
}

// ③ WebSocket 실시간 수신 (react-use-websocket)
const { sendMessage: wsSend, lastMessage, readyState } = useWebSocket(
  `${WEBSOCKET_URL}?room_id=${roomId}&mb_id=${user.mb_id}`,
  {
    heartbeat: {
      message: 'ping',
      returnMessage: 'pong',
      timeout: 60000,
      interval: 25000,
    },
    reconnectAttempts: 10,
    reconnectInterval: 3000,
    shouldReconnect: () => true,
  }
)

// ④ 수신 메시지 처리
useEffect(() => {
  if (lastMessage?.data) {
    try {
      const parsed = JSON.parse(lastMessage.data)
      if (parsed.type === 'message') {
        setMessages(prev => [...prev, parsed.data])
        // 읽음 처리
        readChat(roomId, parsed.data.id)
      }
    } catch (e) {
      // 파싱 에러 무시 (ping/pong 등)
    }
  }
}, [lastMessage])
```

**After**:
```typescript
// 파일: hooks/useChat.ts (수정)
import { supabase } from '@/lib/supabase'
import { RealtimeChannel } from '@supabase/supabase-js'

// ─── Realtime 채널 관리 ───────────────────────────────
let chatChannel: RealtimeChannel | null = null

// 채팅방 Realtime 구독 시작
const subscribeToChatRoom = (roomId: string) => {
  // 기존 구독 해제
  if (chatChannel) {
    chatChannel.unsubscribe()
  }

  chatChannel = supabase
    .channel(`chat:${roomId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `chat_room_id=eq.${roomId}`,
      },
      (payload) => {
        // 새 메시지 수신 — payload.new에 INSERT된 row 전체
        const newMessage = payload.new as ChatMessageType
        setMessages(prev => [...prev, newMessage])

        // 내가 보낸 메시지가 아니면 읽음 처리
        if (newMessage.sender_id !== user.id) {
          readChat(roomId, newMessage.id)
        }
      }
    )
    .subscribe()
}

// 채팅방 Realtime 구독 해제
const unsubscribeFromChatRoom = () => {
  if (chatChannel) {
    chatChannel.unsubscribe()
    chatChannel = null
  }
}

// 컴포넌트 마운트/언마운트 시 구독 관리
useEffect(() => {
  if (roomId) {
    subscribeToChatRoom(roomId)
  }
  return () => {
    unsubscribeFromChatRoom()
  }
}, [roomId])

// ─── 메시지 전송 ──────────────────────────────────────
// ① 텍스트 메시지 전송
const sendTextMessage = async (roomId: string, content: string) => {
  try {
    const { data, error } = await supabase.functions.invoke('send-chat-message', {
      body: {
        room_id: roomId,
        content: content,
        message_type: 'text',
      },
    })

    if (error) {
      Alert.alert('오류', '메시지를 전송할 수 없습니다')
      return null
    }

    if (!data?.success) {
      Alert.alert('오류', data?.error ?? '메시지를 전송할 수 없습니다')
      return null
    }

    // 메시지 INSERT → Realtime postgres_changes로 자동 수신됨
    // → subscribeToChatRoom 콜백에서 messages state에 자동 추가
    return data.data
  } catch (error) {
    Alert.alert('오류', '메시지를 전송할 수 없습니다')
    return null
  }
}

// ② 이미지 메시지 전송
const sendImageMessage = async (roomId: string, imageFiles: ImagePickerAsset[]) => {
  try {
    // 이미지 파일을 FormData로 전송
    const formData = new FormData()
    formData.append('room_id', roomId)
    formData.append('content', '')
    formData.append('message_type', 'image')

    imageFiles.forEach((file, index) => {
      formData.append('image_files', {
        uri: file.uri,
        type: file.mimeType || 'image/jpeg',
        name: file.fileName || `image_${index}.jpg`,
      } as any)
    })

    const { data, error } = await supabase.functions.invoke('send-chat-message', {
      body: formData,
    })

    if (error) {
      Alert.alert('오류', '이미지를 전송할 수 없습니다')
      return null
    }

    if (!data?.success) {
      Alert.alert('오류', data?.error ?? '이미지를 전송할 수 없습니다')
      return null
    }

    // Edge Function이 Storage 업로드 + chat_messages INSERT 완료
    // → Realtime으로 자동 수신됨 (image_urls 포함)
    return data.data
  } catch (error) {
    Alert.alert('오류', '이미지를 전송할 수 없습니다')
    return null
  }
}
```

**변환 포인트**:
- **메시지 전송**: FormData + `apiClient.post('api/chat.php')` → `supabase.functions.invoke('send-chat-message', { body })`
- **실시간 수신**: `useWebSocket` + `lastMessage` + `JSON.parse` → `supabase.channel().on('postgres_changes')` — DB INSERT 자동 감지
- **heartbeat/재연결**: 수동 설정 (25초 interval, 60초 timeout, 10회 재시도) → Supabase 자동 관리 (코드 제거)
- **연결 상태**: `readyState` (OPEN/CONNECTING 등) → 채널 상태 (`subscribed`/`closed` 등) 또는 불필요 (자동 재연결)
- **이미지 전송**: FormData `file` 1개 → FormData `image_files` 복수 (다중 이미지 지원)
- **이미지 저장**: 서버 파일시스템 `file_path` → Storage `image_urls` (jsonb 배열)
- **FCM 푸시**: PHP 내부 처리 → Edge Function `send-push` 내부 호출 (앱 코드 변경 없음)
- **mb_id 제거**: 메시지 전송 시 `mb_id` 파라미터 불필요 → JWT에서 `sender_id` 자동 추출
- **`react-use-websocket` 패키지 제거**: 전환 완료 후 `yarn remove react-use-websocket`

**Edge Function 입력 스펙**:

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `room_id` | UUID | ✅ | 채팅방 ID |
| `content` | string | 조건부 | 텍스트 내용 (이미지 전용이면 빈 문자열) |
| `message_type` | string | ✅ | `'text'`, `'image'`, `'file'` |
| `image_files` | File[] | ❌ | 이미지 파일 (FormData 전송) |

**Edge Function 출력 스펙**:

| 필드 | 타입 | 설명 |
|---|---|---|
| `success` | boolean | 성공 여부 |
| `data.message_id` | UUID | 생성된 메시지 ID |
| `data.image_urls` | string[] | Storage 이미지 URL 배열 (이미지 전송 시) |
| `error` | string | 에러 메시지 (실패 시) |

**응답 매핑**:

| PHP 응답 필드 | Supabase 응답 필드 | 변환 필요 |
|---|---|---|
| `result` (`'Y'`/`'N'`) | `data.success` (boolean) | 예 |
| `data.id` (정수) | `data.data.message_id` (UUID) | 예 — 정수 → UUID |
| `data.file_path` (문자열) | `data.data.image_urls` (배열) | 예 — 문자열 → jsonb 배열 |
| (WebSocket push로 상대방 수신) | (Realtime postgres_changes 자동) | 예 — 방식 변경 |

**Realtime 수신 메시지(payload.new) 구조**:

| 필드 | 타입 | 설명 |
|---|---|---|
| `id` | UUID | 메시지 ID |
| `chat_room_id` | UUID | 채팅방 ID |
| `sender_id` | UUID | 발신자 ID |
| `sender_type` | string | `'보호자'` / `'유치원'` / `'시스템'` |
| `message_type` | string | `'text'` / `'image'` / `'file'` / `'payment_request'` / `'care_start'` / `'care_end'` / `'review'` |
| `content` | string | 메시지 내용 |
| `image_urls` | string[] \| null | 이미지 URL 배열 |
| `is_read` | boolean | 읽음 여부 |
| `created_at` | string | 생성 시각 |

---

### API #26. chat.php → get_images → chat_messages SELECT (image)

**전환 방식**: 자동 API | **난이도**: 쉬움
**관련 파일**: 채팅 이미지 갤러리 화면
**Supabase 대응**: `supabase.from('chat_messages').select('image_urls, created_at').eq('chat_room_id', roomId).not('image_urls', 'is', null)`
**Supabase 테이블**: `chat_messages`

**Before**:
```typescript
// 파일: hooks/useChat.ts 또는 채팅 이미지 갤러리 화면
// 채팅방의 이미지 메시지만 조회
const getChatImages = async (roomId: string) => {
  try {
    const response = await apiClient.get('api/chat.php', {
      method: 'get_images',
      room_id: roomId,
      mb_id: user.mb_id,
    })
    if (response.result === 'Y') {
      return response.data  // [{ file_path, created_at }, ...]
    }
    return []
  } catch (error) {
    return []
  }
}
```

**After**:
```typescript
// 파일: hooks/useChat.ts (수정)
import { supabase } from '@/lib/supabase'

// 채팅방의 이미지 메시지만 조회
const getChatImages = async (roomId: string) => {
  try {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('id, image_urls, created_at')
      .eq('chat_room_id', roomId)
      .not('image_urls', 'is', null)        // image_urls가 있는 메시지만
      .order('created_at', { ascending: false })

    if (error) return []
    // image_urls를 평탄화: [{image_urls: ['url1','url2']}] → ['url1','url2']
    return data.flatMap(msg => msg.image_urls ?? [])
  } catch (error) {
    return []
  }
}
```

**변환 포인트**:
- `file_path` (단일 문자열) → `image_urls` (jsonb 배열) — 한 메시지에 여러 이미지 가능
- `.not('image_urls', 'is', null)`: image_urls가 NULL이 아닌 메시지만 필터
- `flatMap`: 메시지별 image_urls 배열을 하나의 URL 배열로 평탄화

**응답 매핑**:

| PHP 응답 필드 | Supabase 응답 필드 | 변환 필요 |
|---|---|---|
| `data[].file_path` | `data[].image_urls` (jsonb 배열) | 예 — 문자열 → 배열 |
| `data[].created_at` | `data[].created_at` | 아니오 |

---

### API #27. chat.php → leave_room → chat_rooms UPDATE

**전환 방식**: 자동 API | **난이도**: 쉬움
**관련 파일**: `hooks/useChat.ts` → `leaveRoom()`
**Supabase 대응**: `supabase.from('chat_rooms').update({ status: '비활성' }).eq('id', roomId)`
**Supabase 테이블**: `chat_rooms`

**Before**:
```typescript
// 파일: hooks/useChat.ts
// 채팅방 나가기
const leaveRoom = async (roomId: string) => {
  try {
    const formData = new FormData()
    formData.append('method', 'leave_room')
    formData.append('room_id', roomId)
    formData.append('mb_id', user.mb_id)

    const response = await apiClient.post('api/chat.php', formData)
    if (response.result === 'Y') {
      // 채팅방 목록에서 제거
      router.back()
    }
  } catch (error) {
    Alert.alert('오류', '서버와 통신할 수 없습니다')
  }
}
```

**After**:
```typescript
// 파일: hooks/useChat.ts (수정)
import { supabase } from '@/lib/supabase'

// 채팅방 나가기 (status → '비활성')
const leaveRoom = async (roomId: string) => {
  try {
    const { error } = await supabase
      .from('chat_rooms')
      .update({ status: '비활성' })
      .eq('id', roomId)

    if (error) {
      Alert.alert('오류', error.message)
      return
    }
    router.back()
  } catch (error) {
    Alert.alert('오류', '서버와 통신할 수 없습니다')
  }
}
```

**변환 포인트**:
- FormData + `method=leave_room` → `.update({ status: '비활성' })`
- `mb_id` 제거, `room_id` → `.eq('id', roomId)` (UUID)
- 기존: `deleted_at=NOW()` → Supabase: `status='비활성'` (chat_rooms는 status 컬럼으로 관리)

**응답 매핑**:

| PHP 응답 필드 | Supabase 응답 필드 | 변환 필요 |
|---|---|---|
| `result` (`'Y'`/`'N'`) | `error` (`null`이면 성공) | 예 |

---

### API #28. chat.php → muted → chat_room_members UPDATE

**전환 방식**: 자동 API | **난이도**: 쉬움
**관련 파일**: `hooks/useChat.ts` → `mutedRoom()`
**Supabase 대응**: `supabase.from('chat_room_members').update({ is_muted }).eq('chat_room_id', roomId).eq('member_id', userId)`
**Supabase 테이블**: `chat_room_members`

**Before**:
```typescript
// 파일: hooks/useChat.ts
// 채팅방 알림 음소거 토글
const mutedRoom = async (roomId: string, muted: boolean) => {
  try {
    const formData = new FormData()
    formData.append('method', 'muted')
    formData.append('room_id', roomId)
    formData.append('mb_id', user.mb_id)
    formData.append('is_muted', muted ? 'Y' : 'N')

    const response = await apiClient.post('api/chat.php', formData)
    if (response.result === 'Y') {
      setIsMuted(muted)
    }
  } catch (error) {
    Alert.alert('오류', '서버와 통신할 수 없습니다')
  }
}
```

**After**:
```typescript
// 파일: hooks/useChat.ts (수정)
import { supabase } from '@/lib/supabase'

// 채팅방 알림 음소거 토글
const mutedRoom = async (roomId: string, muted: boolean) => {
  try {
    const { error } = await supabase
      .from('chat_room_members')
      .update({ is_muted: muted })
      .eq('chat_room_id', roomId)   // ⚠️ R4 교정: room_id → chat_room_id (sql/41_08 스키마 참조)
      .eq('member_id', user.id)

    if (error) {
      Alert.alert('오류', error.message)
      return
    }
    setIsMuted(muted)
  } catch (error) {
    Alert.alert('오류', '서버와 통신할 수 없습니다')
  }
}
```

**변환 포인트**:
- FormData + `method=muted` → `.update({ is_muted })` 직접 호출
- `is_muted` 값: `'Y'`/`'N'` → `true`/`false` (boolean)
- `mb_id` → `member_id` (UUID)

**응답 매핑**:

| PHP 응답 필드 | Supabase 응답 필드 | 변환 필요 |
|---|---|---|
| `result` (`'Y'`/`'N'`) | `error` (`null`이면 성공) | 예 |

---

### API #29. read_chat.php → chat_room_members UPDATE

**전환 방식**: 자동 API | **난이도**: 쉬움
**관련 파일**: `hooks/useChat.ts` → `readChat()`
**Supabase 대응**: `supabase.from('chat_room_members').update({ last_read_message_id }).eq('chat_room_id', roomId).eq('member_id', userId)`
**Supabase 테이블**: `chat_room_members`

**Before**:
```typescript
// 파일: hooks/useChat.ts
// 메시지 읽음 처리
const readChat = async (roomId: string, lastMessageId: string) => {
  try {
    const response = await apiClient.get('api/read_chat.php', {
      room_id: roomId,
      mb_id: user.mb_id,
      last_read_id: lastMessageId,
    })
    // 읽음 처리 — 실패해도 무시
  } catch (error) {
    // 무시 (UX 영향 없음)
  }
}
```

**After**:
```typescript
// 파일: hooks/useChat.ts (수정)
import { supabase } from '@/lib/supabase'

// 메시지 읽음 처리
const readChat = async (roomId: string, lastMessageId: string) => {
  try {
    await supabase
      .from('chat_room_members')
      .update({ last_read_message_id: lastMessageId })
      .eq('chat_room_id', roomId)   // ⚠️ R4 교정: room_id → chat_room_id (sql/41_08 스키마 참조)
      .eq('member_id', user.id)
    // 읽음 처리 — 실패해도 무시
  } catch (error) {
    // 무시 (UX 영향 없음)
  }
}
```

**변환 포인트**:
- `last_read_id` → `last_read_message_id` (컬럼명 변경)
- `mb_id` → `member_id` (UUID)
- 에러 무시 패턴 유지 (읽음 처리 실패는 UX에 영향 없음)

---

### API #30. get_message_template.php → chat_templates SELECT

**전환 방식**: 자동 API | **난이도**: 쉬움
**관련 파일**: `app/chat/[room]/index.tsx`, `app/chat/commonPhrase.tsx`
**Supabase 대응**: `supabase.from('chat_templates').select('*').eq('member_id', userId).eq('type', 'custom')`
**Supabase 테이블**: `chat_templates`

**Before**:
```typescript
// 파일: app/chat/[room]/index.tsx 또는 app/chat/commonPhrase.tsx
// 내 상용문구 목록 조회
const fetchTemplates = async () => {
  try {
    const response = await apiClient.get('api/get_message_template.php', {
      mb_id: user.mb_id,
    })
    if (response.result === 'Y') {
      setTemplates(response.data)  // [{ id, content, ... }, ...]
    }
  } catch (error) {
    setTemplates([])
  }
}
```

**After**:
```typescript
// 파일: app/chat/commonPhrase.tsx (수정)
import { supabase } from '@/lib/supabase'

// 내 상용문구 목록 조회
const fetchTemplates = async () => {
  try {
    const { data, error } = await supabase
      .from('chat_templates')
      .select('id, content, sort_order, created_at')
      .eq('member_id', user.id)
      .eq('type', 'custom')          // 개인 상용문구만 (가이드 문구 제외)
      .order('sort_order')
      .order('created_at', { ascending: false })

    if (error) {
      setTemplates([])
      return
    }
    setTemplates(data)
  } catch (error) {
    setTemplates([])
  }
}
```

**변환 포인트**:
- `mb_id` → `member_id` (UUID) + `type='custom'` 필터 추가
- `chat_templates` 테이블은 `custom`(개인 상용문구), `guide_guardian`(보호자 가이드), `guide_kindergarten`(유치원 가이드)을 type으로 구분
- 앱에서 이 API는 **개인 상용문구만** 조회 → 반드시 `.eq('type', 'custom')` 필터 사용

**응답 매핑**:

| PHP 응답 필드 | Supabase 응답 필드 | 변환 필요 |
|---|---|---|
| `data[].id` (정수) | `data[].id` (UUID) | 예 — 정수 → UUID |
| `data[].content` | `data[].content` | 아니오 |
| `data[].mb_id` | — (RLS로 본인 데이터만) | 예 — 삭제됨 |
| — | `data[].sort_order` | 예 — 신규 |

---

### API #31. set_message_template.php → chat_templates INSERT

**전환 방식**: 자동 API | **난이도**: 쉬움
**관련 파일**: `app/chat/commonPhrase.tsx`
**Supabase 대응**: `supabase.from('chat_templates').insert({ member_id, type: 'custom', content })`
**Supabase 테이블**: `chat_templates`

**Before**:
```typescript
// 파일: app/chat/commonPhrase.tsx
// 상용문구 등록
const addTemplate = async (content: string) => {
  try {
    const formData = new FormData()
    formData.append('mb_id', user.mb_id)
    formData.append('content', content)

    const response = await apiClient.post('api/set_message_template.php', formData)
    if (response.result === 'Y') {
      fetchTemplates()  // 목록 새로고침
    } else {
      Alert.alert('오류', response.message ?? '등록 실패')
    }
  } catch (error) {
    Alert.alert('오류', '서버와 통신할 수 없습니다')
  }
}
```

**After**:
```typescript
// 파일: app/chat/commonPhrase.tsx (수정)
import { supabase } from '@/lib/supabase'

// 상용문구 등록
const addTemplate = async (content: string) => {
  try {
    const { data, error } = await supabase
      .from('chat_templates')
      .insert({
        member_id: user.id,
        type: 'custom',
        content: content,
      })
      .select()
      .single()

    if (error) {
      Alert.alert('오류', error.message)
      return
    }
    fetchTemplates()  // 목록 새로고침
  } catch (error) {
    Alert.alert('오류', '서버와 통신할 수 없습니다')
  }
}
```

**변환 포인트**:
- FormData → `.insert()` (JSON)
- `mb_id` → `member_id` (UUID), `type: 'custom'` 명시
- `.select().single()`: INSERT 후 생성된 데이터 반환

**응답 매핑**:

| PHP 응답 필드 | Supabase 응답 필드 | 변환 필요 |
|---|---|---|
| `result` (`'Y'`/`'N'`) | `error` (`null`이면 성공) | 예 |

---

### API #32. update_message_template.php → chat_templates UPDATE

**전환 방식**: 자동 API | **난이도**: 쉬움
**관련 파일**: `app/chat/commonPhrase.tsx`
**Supabase 대응**: `supabase.from('chat_templates').update({ content }).eq('id', templateId).eq('member_id', userId)`
**Supabase 테이블**: `chat_templates`

**Before**:
```typescript
// 파일: app/chat/commonPhrase.tsx
// 상용문구 수정
const updateTemplate = async (templateId: string, content: string) => {
  try {
    const formData = new FormData()
    formData.append('mb_id', user.mb_id)
    formData.append('id', templateId)
    formData.append('content', content)

    const response = await apiClient.post('api/update_message_template.php', formData)
    if (response.result === 'Y') {
      fetchTemplates()
    } else {
      Alert.alert('오류', response.message ?? '수정 실패')
    }
  } catch (error) {
    Alert.alert('오류', '서버와 통신할 수 없습니다')
  }
}
```

**After**:
```typescript
// 파일: app/chat/commonPhrase.tsx (수정)
import { supabase } from '@/lib/supabase'

// 상용문구 수정
const updateTemplate = async (templateId: string, content: string) => {
  try {
    const { error } = await supabase
      .from('chat_templates')
      .update({ content })
      .eq('id', templateId)
      .eq('member_id', user.id)  // RLS 보조 (본인 데이터만)

    if (error) {
      Alert.alert('오류', error.message)
      return
    }
    fetchTemplates()
  } catch (error) {
    Alert.alert('오류', '서버와 통신할 수 없습니다')
  }
}
```

**변환 포인트**:
- FormData → `.update()` (JSON)
- `mb_id` 제거 → `.eq('member_id', user.id)` RLS 보조
- `id` → `.eq('id', templateId)` (UUID)

**응답 매핑**:

| PHP 응답 필드 | Supabase 응답 필드 | 변환 필요 |
|---|---|---|
| `result` (`'Y'`/`'N'`) | `error` (`null`이면 성공) | 예 |

---

### API #33. delete_message_template.php → chat_templates DELETE

**전환 방식**: 자동 API | **난이도**: 쉬움
**관련 파일**: `app/chat/commonPhrase.tsx`
**Supabase 대응**: `supabase.from('chat_templates').delete().eq('id', templateId).eq('member_id', userId)`
**Supabase 테이블**: `chat_templates`

**Before**:
```typescript
// 파일: app/chat/commonPhrase.tsx
// 상용문구 삭제
const deleteTemplate = async (templateId: string) => {
  try {
    const formData = new FormData()
    formData.append('mb_id', user.mb_id)
    formData.append('id', templateId)

    const response = await apiClient.post('api/delete_message_template.php', formData)
    if (response.result === 'Y') {
      setTemplates(prev => prev.filter(t => t.id !== templateId))
    } else {
      Alert.alert('오류', response.message ?? '삭제 실패')
    }
  } catch (error) {
    Alert.alert('오류', '서버와 통신할 수 없습니다')
  }
}
```

**After**:
```typescript
// 파일: app/chat/commonPhrase.tsx (수정)
import { supabase } from '@/lib/supabase'

// 상용문구 삭제
const deleteTemplate = async (templateId: string) => {
  try {
    const { error } = await supabase
      .from('chat_templates')
      .delete()
      .eq('id', templateId)
      .eq('member_id', user.id)  // RLS 보조 (본인 데이터만)

    if (error) {
      Alert.alert('오류', error.message)
      return
    }
    setTemplates(prev => prev.filter(t => t.id !== templateId))
  } catch (error) {
    Alert.alert('오류', '서버와 통신할 수 없습니다')
  }
}
```

**변환 포인트**:
- FormData → `.delete()` (JSON)
- `mb_id` 제거 → `.eq('member_id', user.id)` RLS 보조
- **hard delete**: chat_templates는 soft delete가 아닌 실제 삭제 (개인 상용문구는 복구 불필요)
- 목록에서 즉시 제거: `filter(t => t.id !== templateId)`

**응답 매핑**:

| PHP 응답 필드 | Supabase 응답 필드 | 변환 필요 |
|---|---|---|
| `result` (`'Y'`/`'N'`) | `error` (`null`이면 성공) | 예 |

---

## 6. 결제/돌봄

> **가이드 참조**: `APP_MIGRATION_GUIDE.md §15 결제/예약 전환`

### API #34. inicis_payment.php → Edge Function `inicis-callback`

**전환 방식**: Edge Function | **난이도**: 상
**관련 파일**: `app/payment/inicisPayment.tsx`
**Supabase 대응**: Edge Function `inicis-callback` (PG사 직접 호출 — 앱에서는 WebView 콜백 URL만 변경)

**Before**:
```typescript
// 파일: app/payment/inicisPayment.tsx
// WebView에서 이니시스 결제창 로드 시 콜백 URL 설정
const INICIS_RETURN_URL = `${process.env.EXPO_PUBLIC_API_URL}/api/inicis_payment.php`

// WebView로 이니시스 모바일 결제창 호출
const inicisPaymentHtml = `
  <form name="mobileweb" method="post" action="https://mobile.inicis.com/smart/payment/">
    <input type="hidden" name="P_INI_PAYMENT" value="CARD">
    <input type="hidden" name="P_MID" value="INIpayTest">
    <input type="hidden" name="P_OID" value="${orderId}">
    <input type="hidden" name="P_AMT" value="${amount}">
    <input type="hidden" name="P_GOODS" value="${goodsName}">
    <input type="hidden" name="P_UNAME" value="${userName}">
    <input type="hidden" name="P_NEXT_URL" value="${INICIS_RETURN_URL}">
    <input type="hidden" name="P_RETURN_URL" value="${INICIS_RETURN_URL}">
    <input type="hidden" name="P_NOTI" value='${JSON.stringify({
      mode: user.mb_5,              // '1'=보호자, '2'=유치원
      roomId: chatRoomId ?? '',
      paymentRequestId: '',         // 아직 미생성
    })}'>
  </form>
  <script>document.mobileweb.submit()</script>
`

// WebView에서 결과 수신
const onMessage = (event: WebViewMessageEvent) => {
  const data = JSON.parse(event.nativeEvent.data)
  // data: { P_STATUS, P_OID, P_TID, P_AMT, P_RMESG1, ... }
  if (data.P_STATUS === '00') {
    // 결제 성공 → set_inicis_approval.php 호출 (#35)
    saveInicisApproval(data)
  } else {
    Alert.alert('결제 실패', data.P_RMESG1 ?? '결제에 실패했습니다')
  }
}
```

**After**:
```typescript
// 파일: app/payment/inicisPayment.tsx (수정)
// 콜백 URL → Edge Function 엔드포인트로 교체
const INICIS_RETURN_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/inicis-callback`

// WebView로 이니시스 모바일 결제창 호출 (P_MID를 환경변수로 관리)
const inicisPaymentHtml = `
  <form name="mobileweb" method="post" action="https://mobile.inicis.com/smart/payment/">
    <input type="hidden" name="P_INI_PAYMENT" value="CARD">
    <input type="hidden" name="P_MID" value="${process.env.EXPO_PUBLIC_INICIS_MID}">
    <input type="hidden" name="P_OID" value="${orderId}">
    <input type="hidden" name="P_AMT" value="${amount}">
    <input type="hidden" name="P_GOODS" value="${goodsName}">
    <input type="hidden" name="P_UNAME" value="${userName}">
    <input type="hidden" name="P_NEXT_URL" value="${INICIS_RETURN_URL}">
    <input type="hidden" name="P_RETURN_URL" value="${INICIS_RETURN_URL}">
    <input type="hidden" name="P_NOTI" value='${JSON.stringify({
      mode: user.current_mode,              // '보호자' | '유치원'
      roomId: chatRoomId ?? null,
      kindergartenId: kindergartenId,        // 유치원 UUID
      petId: petId,                         // 반려동물 UUID
      memberId: user.id,                    // 결제자 UUID
    })}'>
  </form>
  <script>document.mobileweb.submit()</script>
`

// WebView에서 결과 수신
// ※ inicis-callback EF가 payments 저장을 이미 완료 → 별도 승인 저장 API 호출 불필요
const onMessage = (event: WebViewMessageEvent) => {
  const data = JSON.parse(event.nativeEvent.data)
  // data: { result, payment_id, pg_transaction_id, amount, message }
  if (data.result === 'Y') {
    // 결제 성공 → 예약 생성 EF 호출 (#36) — #35 승인 저장은 불필요 (EF 내부 처리)
    createReservation(data.payment_id)
  } else {
    Alert.alert('결제 실패', data.message ?? '결제에 실패했습니다')
  }
}
```

**변환 포인트**:
- `P_RETURN_URL` / `P_NEXT_URL`: PHP 서버 URL → Edge Function URL. 이 변경이 **유일한 앱 코드 수정**
- `P_MID`: 하드코딩 `'INIpayTest'` → 환경변수 `EXPO_PUBLIC_INICIS_MID`로 변경 (테스트/상용 분리)
- `P_NOTI` JSON 필드: `mode` 값 `'1'`/`'2'` → `'보호자'`/`'유치원'`, `paymentRequestId` → `kindergartenId` + `petId` + `memberId` 추가 (EF에서 payments 레코드에 연결)
- WebView `onMessage` 응답: `P_STATUS`/`P_OID` 등 이니시스 원시 필드 → `result`/`payment_id` 등 정규화된 필드. **`payment_id`(UUID)가 핵심 추가 필드** — 예약 생성(#36)에 전달
- 결제 성공 후: 기존 `saveInicisApproval(data)` (#35) → 삭제. 바로 `createReservation(data.payment_id)` (#36) 호출
- Edge Function `inicis-callback`은 앱에서 직접 호출하지 않음 — PG사가 POST로 직접 호출

**응답 매핑**:

| PHP 콜백 결과 (WebView) | Supabase EF 결과 (WebView) | 변환 필요 |
|---|---|---|
| `P_STATUS` (`'00'`=성공) | `result` (`'Y'`/`'N'`) | 예 — 값 형식 변경 |
| `P_OID` (주문번호) | `pg_transaction_id` | 예 — 키 이름 변경 |
| `P_TID` (거래번호) | (미노출, DB에만 저장) | — |
| `P_AMT` (금액 문자열) | `amount` (숫자) | 예 — `string` → `number` |
| — | `payment_id` (UUID) | 신규 — 예약 생성 시 전달 |
| `P_RMESG1` (결과 메시지) | `message` | 예 — 키 이름 변경 |

---

### API #35. set_inicis_approval.php → Edge Function (inicis-callback 내부 흡수)

**전환 방식**: Edge Function (inicis-callback 내부) | **난이도**: 중
**관련 파일**: `app/payment/inicisApproval.tsx`
**Supabase 대응**: `inicis-callback` Edge Function 내부에서 자동 처리 (별도 앱 호출 **삭제**)

**Before**:
```typescript
// 파일: app/payment/inicisApproval.tsx
// WebView 결제 완료 후 → 승인 정보를 DB에 저장
const saveInicisApproval = async (inicisResult: any) => {
  try {
    const formData = new FormData()
    formData.append('mb_id', user.mb_id)
    formData.append('oid', inicisResult.P_OID ?? inicisResult.P_TID)
    formData.append('tid', inicisResult.P_TID)
    formData.append('amount', inicisResult.P_AMT)
    formData.append('status', inicisResult.P_STATUS)
    formData.append('pay_type', inicisResult.P_TYPE ?? 'CARD')
    formData.append('auth_dt', inicisResult.P_AUTH_DT ?? '')
    formData.append('auth_no', inicisResult.P_AUTH_NO ?? '')
    formData.append('card_num', inicisResult.P_CARD_NUM ?? '')
    formData.append('card_name', inicisResult.P_CARD_ISSUER_NAME ?? '')

    const response = await apiClient.post('api/set_inicis_approval.php', formData)
    if (response.result === 'Y') {
      // 승인 저장 성공 → 예약 생성 (#36)
      createPaymentRequest(response.data.payment_id)
    } else {
      Alert.alert('오류', '결제 정보 저장에 실패했습니다')
    }
  } catch (error) {
    Alert.alert('오류', '서버와 통신할 수 없습니다')
  }
}
```

**After**:
```typescript
// 파일: app/payment/inicisApproval.tsx (수정)
//
// ※ saveInicisApproval 함수 전체 삭제
//
// 전환 후에는 inicis-callback Edge Function이 PG 콜백 수신 시점에
// payments 테이블에 결제 정보를 자동 저장합니다.
// 앱에서 별도로 승인 정보를 DB에 저장하는 API를 호출할 필요가 없습니다.
//
// WebView onMessage에서 받은 payment_id를 바로 create-reservation (#36)에 전달:
//
// const onMessage = (event: WebViewMessageEvent) => {
//   const data = JSON.parse(event.nativeEvent.data)
//   if (data.result === 'Y') {
//     createReservation(data.payment_id)  // → #36 Edge Function 호출
//   }
// }
```

**변환 포인트**:
- **`saveInicisApproval` 함수 전체 삭제**: 이 API는 전환 후 **완전히 제거**됩니다
- 기존 흐름: WebView 결과 수신 → `set_inicis_approval.php` 호출 → `set_payment_request.php` 호출 (3단계)
- 전환 흐름: WebView 결과 수신 → `create-reservation` EF 호출 (1단계). 승인 정보는 `inicis-callback` 내부에서 이미 저장됨
- `app/payment/inicisApproval.tsx` 파일 자체는 결제 완료 화면으로 남을 수 있으나, `saveInicisApproval` 호출 코드는 제거
- `formData.append('mb_id', ...)` 패턴 제거 — JWT 기반 인증으로 전환
- `inicis_payments` 테이블 → `payments` 테이블 매핑은 `inicis-callback` EF가 내부 처리

**응답 매핑**:

| PHP 응답 필드 | Supabase 대응 | 변환 필요 |
|---|---|---|
| `response.result` (`'Y'`/`'N'`) | — (별도 호출 없음) | API 자체 삭제 |
| `response.data.payment_id` (정수) | WebView `onMessage`의 `data.payment_id` (UUID) | 예 — 출처 변경 (PHP 응답 → WebView 이벤트) |

---

### API #36. set_payment_request.php → Edge Function `create-reservation`

**전환 방식**: Edge Function | **난이도**: 상
**관련 파일**: `app/payment/inicisApproval.tsx`, `app/payment/request.tsx`
**Supabase 대응**: `supabase.functions.invoke('create-reservation', { body })`

**Before**:
```typescript
// 파일: app/payment/inicisApproval.tsx 또는 request.tsx
// 돌봄 예약(결제요청) 생성
const createPaymentRequest = async (paymentApprovalId: string) => {
  try {
    const formData = new FormData()
    formData.append('mb_id', user.mb_id)                // 보호자 폰번호
    formData.append('to_mb_id', partnerMbId)             // 유치원 운영자 폰번호
    formData.append('pet_id', selectedPetId)             // 반려동물 ID (정수)
    formData.append('start_date', startDate)             // '2026-04-20'
    formData.append('start_time', startTime)             // '09:00'
    formData.append('end_date', endDate)                 // '2026-04-20'
    formData.append('end_time', endTime)                 // '18:00'
    formData.append('walk_count', walkCount.toString())  // 산책 횟수
    formData.append('pickup_dropoff', pickupDropoff)     // '1' or '0'
    formData.append('price', totalPrice.toString())      // 결제 금액
    formData.append('payment_approval_id', paymentApprovalId)
    formData.append('room_id', chatRoomId ?? '')         // 채팅방 ID (있으면)

    const response = await apiClient.post('api/set_payment_request.php', formData)
    if (response.result === 'Y') {
      Alert.alert('예약 완료', '돌봄 예약이 생성되었습니다')
      navigation.navigate('PaymentHistory')
    } else {
      Alert.alert('오류', response.message ?? '예약 생성에 실패했습니다')
    }
  } catch (error) {
    Alert.alert('오류', '서버와 통신할 수 없습니다')
  }
}

// 예약 상태 변경 (수락/거절/취소 등)
const updatePaymentRequest = async (
  requestId: string,
  status: string,
  rejectReason?: string
) => {
  try {
    const formData = new FormData()
    formData.append('mb_id', user.mb_id)
    formData.append('id', requestId)
    formData.append('status', status)
    if (rejectReason) formData.append('reject_reason', rejectReason)

    const response = await apiClient.post('api/set_payment_request.php', formData)
    if (response.result === 'Y') {
      // 상태 변경 성공
      fetchPaymentRequestList()
    }
  } catch (error) {
    Alert.alert('오류', '서버와 통신할 수 없습니다')
  }
}
```

**After**:
```typescript
// 파일: app/payment/request.tsx 또는 hooks/useReservation.ts (수정)
import { supabase } from '@/lib/supabase'

// 돌봄 예약 생성 (결제 완료 후)
const createReservation = async (paymentId: string) => {
  try {
    const { data, error } = await supabase.functions.invoke('create-reservation', {
      body: {
        kindergarten_id: kindergartenId,      // 유치원 UUID
        pet_id: selectedPetId,                // 반려동물 UUID
        checkin_scheduled: `${startDate}T${startTime}:00+09:00`,  // ISO 8601
        checkout_scheduled: `${endDate}T${endTime}:00+09:00`,
        walk_count: walkCount,                // 산책 횟수 (number)
        pickup_requested: pickupDropoff,      // boolean
        payment_id: paymentId,                // inicis-callback에서 반환된 UUID
        room_id: chatRoomId ?? null,          // 기존 채팅방 (없으면 자동 생성)
      },
    })

    if (error) {
      Alert.alert('오류', error.message)
      return
    }

    if (!data?.success) {
      Alert.alert('오류', data?.error ?? '예약 생성에 실패했습니다')
      return
    }

    // data: { success: true, data: { reservation_id, room_id, status } }
    Alert.alert('예약 완료', '돌봄 예약이 생성되었습니다')
    navigation.navigate('PaymentHistory')
  } catch (error) {
    Alert.alert('오류', '서버와 통신할 수 없습니다')
  }
}

// 예약 상태 변경 (수락/거절/취소 등) — 동일 EF의 업데이트 모드
const updateReservation = async (
  reservationId: string,
  status: string,
  options?: {
    reject_reason?: string
    reject_detail?: string
    cancel_reason?: string
  }
) => {
  try {
    const { data, error } = await supabase.functions.invoke('create-reservation', {
      body: {
        reservation_id: reservationId,  // 기존 예약 UUID → 업데이트 모드
        status: status,                 // '예약확정', '거절', '취소' 등
        ...options,                     // reject_reason, cancel_reason 등
      },
    })

    if (error) {
      Alert.alert('오류', error.message)
      return
    }

    if (!data?.success) {
      Alert.alert('오류', data?.error ?? '상태 변경에 실패했습니다')
      return
    }

    // data: { success: true, data: { reservation_id, room_id, status } }
    // 상태 변경 성공 → 목록 새로고침
    fetchReservationList()
  } catch (error) {
    Alert.alert('오류', '서버와 통신할 수 없습니다')
  }
}
```

**변환 포인트**:
- **FormData → JSON body**: `formData.append()` 반복 → `supabase.functions.invoke()` JSON body 1회. `apiClient.post` 제거
- **`mb_id`/`to_mb_id` 제거**: JWT `auth.uid()`로 자동 식별. `to_mb_id`(유치원 운영자 폰번호) → `kindergarten_id`(유치원 UUID)
- **날짜 형식 통합**: `start_date`(`'2026-04-20'`) + `start_time`(`'09:00'`) 2개 필드 → `checkin_scheduled`(`'2026-04-20T09:00:00+09:00'`) ISO 8601 1개 필드
- **`pickup_dropoff`**: `'1'`/`'0'` 문자열 → `true`/`false` boolean
- **`price` 제거**: 결제 금액은 `payments` 테이블에 이미 저장됨 (`payment_id`로 연결). 앱에서 금액을 파라미터로 전달하지 않음 (변조 방지)
- **`payment_approval_id` → `payment_id`**: 정수 ID → UUID. `inicis-callback` EF에서 반환된 값 사용
- **부가 처리 원자적 통합**: 기존에는 예약 생성 후 앱에서 채팅 시스템 메시지를 별도 전송했으나, 전환 후에는 EF 내부에서 채팅방 자동 생성 + 시스템 메시지 + FCM 푸시를 원자적으로 처리
- **상태 변경도 같은 EF**: `reservation_id`를 추가로 전달하면 업데이트 모드. 생성과 변경이 하나의 Edge Function으로 통합
- `response.result` 비교 제거 → `data?.success` 또는 `error` 체크

**응답 매핑** (생성 모드):

| PHP 응답 필드 | Supabase 응답 필드 | 변환 필요 |
|---|---|---|
| `response.result` (`'Y'`/`'N'`) | `data.success` (boolean) | 예 — 타입 변경 |
| `response.data.id` (정수) | `data.data.reservation_id` (UUID) | 예 — 정수→UUID, 경로 변경 |
| — | `data.data.room_id` (UUID) | 신규 — 채팅방 ID (자동 생성 시 유용) |
| — | `data.data.status` (string) | 신규 — 현재 예약 상태 |
| `response.message` | `data.error` (실패 시) | 예 — 키 이름 변경 |

---

### API #37. get_payment_request.php → RPC `app_get_reservations_guardian` / `app_get_reservations_kindergarten`

**전환 방식**: RPC (2개 분리) | **난이도**: 중
**관련 파일**: `hooks/usePaymentRequestList.ts`
**Supabase 대응**: `supabase.rpc('app_get_reservations_guardian', { ... })` (보호자) / `supabase.rpc('app_get_reservations_kindergarten', { ... })` (유치원)

**Before**:
```typescript
// 파일: hooks/usePaymentRequestList.ts
// 돌봄 예약 목록 조회 (보호자/유치원 공통)
const fetchPaymentRequestList = async (page: number = 1) => {
  try {
    const response = await apiClient.get('api/get_payment_request.php', {
      mb_id: systemMode === '1' ? user.mb_id : undefined,     // 보호자 모드
      to_mb_id: systemMode === '2' ? user.mb_id : undefined,  // 유치원 모드
      pet_id: selectedPetId ?? undefined,
      page: page,
      per_page: 50,
    })
    if (response.result === 'Y') {
      setPaymentRequests(response.data.data)
      // ⚠️ response.data.meta.total은 항상 0 (PHP 하드코딩 버그)
      return response.data
    }
    return null
  } catch (error) {
    return null
  }
}
```

**After**:
```typescript
// 파일: hooks/usePaymentRequestList.ts (수정)
import { supabase } from '@/lib/supabase'

// 돌봄 예약 목록 조회 — 보호자/유치원 모드에 따라 다른 RPC 호출
const fetchReservationList = async (
  status?: string,        // 상태 필터 (NULL=전체)
  petId?: string,         // 반려동물 필터 (선택)
  page: number = 1,
  perPage: number = 20
) => {
  try {
    // current_mode에 따라 RPC 분기
    // '보호자' → app_get_reservations_guardian (내가 요청한 예약)
    // '유치원' → app_get_reservations_kindergarten (나에게 들어온 예약)
    const rpcName = user.current_mode === '보호자'
      ? 'app_get_reservations_guardian'
      : 'app_get_reservations_kindergarten'

    const { data, error } = await supabase.rpc(rpcName, {
      p_status: status ?? null,
      p_pet_id: petId ?? null,
      p_page: page,
      p_per_page: perPage,
    })

    if (error) {
      Alert.alert('오류', error.message)
      return null
    }

    if (!data?.success) return null

    // data.data: { reservations, meta }
    //
    // ■ 보호자 모드 (app_get_reservations_guardian):
    //   reservations[].kindergarten: { id, name, address_complex, address_building_dong, photo_urls }
    //   reservations[].pet: { id, name, breed, gender, size_class, weight, photo_urls, is_representative }
    //   reservations[].payment: { amount, status, payment_method, paid_at } | null
    //
    // ■ 유치원 모드 (app_get_reservations_kindergarten):
    //   reservations[].member: { id, nickname, profile_image, address_complex, current_mode }
    //   reservations[].pet: (동일)
    //   reservations[].payment: (동일)
    //
    // 공통: reservations[].id, status, checkin_scheduled, checkout_scheduled,
    //        checkin_actual, checkout_actual, walk_count, pickup_requested,
    //        reject_reason, created_at, is_review_written

    setReservations(data.data.reservations ?? [])
    setMeta(data.data.meta)
    return data.data
  } catch (error) {
    return null
  }
}
```

**변환 포인트**:
- **1개 PHP → 2개 RPC 분리**: `mb_id`/`to_mb_id` 파라미터 분기 → `current_mode`에 따라 다른 RPC 호출
- `mb_id`/`to_mb_id` 파라미터 제거 → `auth.uid()` 자동 (보호자: `member_id=auth.uid()`, 유치원: 본인 유치원 자동 조회)
- **보호자 응답**: `kindergarten` 키에 유치원 정보 (이름, 단지명+동, 사진)
- **유치원 응답**: `member` 키에 보호자 정보 (닉네임, 프로필, 단지명). 주소 비대칭: 보호자는 `address_complex`만 (개인정보 최소화)
- `price` (예약 컬럼) → `payment.amount` (결제 테이블 LATERAL JOIN 최신 1건)
- `is_review_written` (컬럼) → `guardian_reviews` EXISTS 서브쿼리
- `meta.total: 0` (PHP 하드코딩 버그) → 실제 COUNT
- `per_page` 최대 50 cap (PHP는 50 고정)
- 유치원 미등록 사용자가 유치원 모드 호출 시: 빈 배열 반환 (에러 아님)

**응답 매핑** (보호자 모드):

| PHP 응답 필드 | Supabase 응답 필드 | 변환 필요 |
|---|---|---|
| `data.data[].id` | `data.data.reservations[].id` (UUID) | 예 — 정수 → UUID |
| `data.data[].status` | `data.data.reservations[].status` | 아니오 |
| `data.data[].start_date` + `start_time` | `data.data.reservations[].checkin_scheduled` | 예 — 2필드→1필드 |
| `data.data[].end_date` + `end_time` | `data.data.reservations[].checkout_scheduled` | 예 — 2필드→1필드 |
| `data.data[].price` | `data.data.reservations[].payment.amount` | 예 — 경로 변경 |
| `data.data[].partner` | `data.data.reservations[].kindergarten` | 예 — 키 이름 변경 |
| `data.data[].animal` | `data.data.reservations[].pet` | 예 — 키 이름 변경 |
| `data.data[].is_review_written` | `data.data.reservations[].is_review_written` | 아니오 (서브쿼리→boolean) |
| `data.meta.total` (`0` 하드코딩) | `data.data.meta.total` (실제값) | 예 — 버그 수정 |

---

### API #38. get_payment_request_by_id.php → RPC `app_get_reservation_detail`

**전환 방식**: RPC | **난이도**: 중
**관련 파일**: `hooks/usePaymentRequest.ts`
**Supabase 대응**: `supabase.rpc('app_get_reservation_detail', { p_reservation_id })`

**Before**:
```typescript
// 파일: hooks/usePaymentRequest.ts
// 돌봄 예약 상세 조회
const fetchPaymentRequest = async (requestId: string) => {
  try {
    const response = await apiClient.get('api/get_payment_request_by_id.php', {
      id: requestId,
      mb_id: user.mb_id,
    })
    if (response.result === 'Y') {
      setPaymentRequest(response.data)
      return response.data
    }
    return null
  } catch (error) {
    Alert.alert('오류', '서버와 통신할 수 없습니다')
    return null
  }
}
```

**After**:
```typescript
// 파일: hooks/usePaymentRequest.ts (수정)
import { supabase } from '@/lib/supabase'

// 돌봄 예약 상세 조회 (보호자/유치원 통합 — RLS가 당사자 여부 자동 판별)
const fetchReservationDetail = async (reservationId: string) => {
  try {
    const { data, error } = await supabase.rpc('app_get_reservation_detail', {
      p_reservation_id: reservationId,   // 예약 UUID
    })

    if (error) {
      Alert.alert('오류', error.message)
      return null
    }

    if (!data?.success) {
      Alert.alert('오류', data?.error ?? '예약을 찾을 수 없습니다')
      return null
    }

    // data.data: { reservation, pet, kindergarten, member, payment, refund }
    //
    // reservation: 예약 상세 정보
    //   { id, status, checkin_scheduled, checkout_scheduled,
    //     checkin_actual, checkout_actual, walk_count, pickup_requested,
    //     reject_reason, reject_detail, rejected_at, requested_at,
    //     guardian_checkout_confirmed, kg_checkout_confirmed,
    //     guardian_checkout_confirmed_at, kg_checkout_confirmed_at,
    //     created_at, is_review_written }
    //
    // pet: 반려동물 (birth_date, description 등 확장 필드 포함)
    // kindergarten: 유치원 (name, address_complex, address_building_dong, photo_urls, freshness_current)
    // member: 보호자 (nickname, profile_image, address_complex, current_mode)
    //
    // payment: 결제 (확장 — approval_number, card_number, card_company, pg_transaction_id)
    //   ※ null이면 결제 미완료
    //
    // refund: 환불/위약금 (penalty_amount, refund_amount, status, completed_at, cancel_reason)
    //   ※ null이면 환불 없음

    setReservation(data.data.reservation)
    setPet(data.data.pet)
    setKindergarten(data.data.kindergarten)
    setMember(data.data.member)
    setPayment(data.data.payment)
    setRefund(data.data.refund)
    return data.data
  } catch (error) {
    Alert.alert('오류', '서버와 통신할 수 없습니다')
    return null
  }
}
```

**변환 포인트**:
- `id` (정수) → `p_reservation_id` (UUID)
- `mb_id` 파라미터 제거 → RLS가 당사자 여부 자동 판별 (비당사자 → NULL 반환 = 접근 거부)
- 보호자/유치원 통합 함수: 양쪽 모두 동일한 응답 구조 (`reservation`, `pet`, `kindergarten`, `member`, `payment`, `refund`)
- 결제 확장: `payment.approval_number`, `card_number`, `card_company`, `pg_transaction_id` (목록에는 없던 필드)
- 환불 정보: `refund` 키 신규 (PHP에서는 `payment_request.penalty` 컬럼 → Supabase `refunds` 테이블 분리)
- 예약 확장: `reject_detail`, `rejected_at`, `requested_at`, `guardian_checkout_confirmed`, `kg_checkout_confirmed`, `*_confirmed_at`
- `payment`/`refund`가 null이면 해당 데이터 없음 (결제 미완료 / 환불 없음)

**응답 매핑**:

| PHP 응답 필드 | Supabase 응답 필드 | 변환 필요 |
|---|---|---|
| `data.id` | `data.data.reservation.id` (UUID) | 예 — 정수 → UUID, 경로 변경 |
| `data.status` | `data.data.reservation.status` | 예 — 경로 변경 |
| `data.start_date` + `start_time` | `data.data.reservation.checkin_scheduled` | 예 — 2필드→1필드 |
| `data.price` | `data.data.payment.amount` | 예 — 테이블 분리 |
| `data.penalty` | `data.data.refund.penalty_amount` | 예 — 테이블 분리 |
| `data.payment_approval_info` | `data.data.payment.approval_number` 등 | 예 — 별도 쿼리→payments 통합 |
| `data.partner` | `data.data.kindergarten` | 예 — 키 이름 변경 |
| `data.animal` | `data.data.pet` | 예 — 키 이름 변경 |
| `data.member` | `data.data.member` | 예 — 경로 변경 |
| — | `data.data.refund` (신규) | 환불/위약금 (별도 테이블) |
| — | `data.data.reservation.reject_detail` (신규) | 거절 상세 |
| — | `data.data.reservation.guardian_checkout_confirmed` (신규) | 보호자 하원 확인 |

---

### API #39. set_care_complete.php → Edge Function `complete-care`

**전환 방식**: Edge Function | **난이도**: 상
**관련 파일**: `app/(tabs)/paymentHistory.tsx`, 돌봄 상세 화면
**Supabase 대응**: `supabase.functions.invoke('complete-care', { body: { reservation_id } })`

**Before**:
```typescript
// 파일: app/(tabs)/paymentHistory.tsx 또는 돌봄 상세 화면
// 돌봄 완료 (하원 확인) 처리
const completeCare = async (requestId: string) => {
  try {
    const formData = new FormData()
    formData.append('mb_id', user.mb_id)          // 본인 폰번호
    formData.append('id', requestId)               // 예약 ID (정수)
    formData.append('type', 'complete')            // 완료 타입

    const response = await apiClient.post('api/set_care_complete.php', formData)
    if (response.result === 'Y') {
      Alert.alert('완료', '돌봄이 완료되었습니다')
      fetchPaymentRequestList()   // 목록 새로고침
    } else {
      Alert.alert('오류', response.message ?? '돌봄 완료 처리에 실패했습니다')
    }
  } catch (error) {
    Alert.alert('오류', '서버와 통신할 수 없습니다')
  }
}
```

**After**:
```typescript
// 파일: app/(tabs)/paymentHistory.tsx 또는 돌봄 상세 화면 (수정)
import { supabase } from '@/lib/supabase'

// 돌봄 완료 (하원 확인) 처리
// → auth.uid()로 호출자를 자동 식별하여 보호자/유치원 중 누가 확인했는지 판별
const completeCare = async (reservationId: string) => {
  try {
    const { data, error } = await supabase.functions.invoke('complete-care', {
      body: {
        reservation_id: reservationId,  // 예약 UUID
      },
    })

    if (error) {
      Alert.alert('오류', error.message)
      return
    }

    if (!data?.success) {
      Alert.alert('오류', data?.error ?? '돌봄 완료 처리에 실패했습니다')
      return
    }

    // data: {
    //   success: true,
    //   data: {
    //     status: '돌봄완료' | '돌봄진행중',  ← 양측 모두 확인 시만 '돌봄완료'
    //     both_confirmed: true | false,
    //     guardian_checkout_confirmed: true | false,
    //     kg_checkout_confirmed: true | false,
    //   }
    // }

    if (data.data.both_confirmed) {
      Alert.alert('완료', '양측 모두 하원을 확인했습니다. 돌봄이 완료되었습니다.')
    } else {
      // 한쪽만 확인 — 상대방 확인 대기 안내
      const confirmed = data.data.guardian_checkout_confirmed
        ? '보호자' : '유치원'
      Alert.alert('확인 완료', `${confirmed} 하원 확인 완료. 상대방 확인을 기다리고 있습니다.`)
    }

    fetchReservationList()   // 목록 새로고침
  } catch (error) {
    Alert.alert('오류', '서버와 통신할 수 없습니다')
  }
}
```

**변환 포인트**:
- **FormData → JSON body**: `formData.append()` → `supabase.functions.invoke()` JSON body
- **`mb_id` 제거**: JWT `auth.uid()`로 자동 식별. EF 내부에서 보호자/유치원 판별
- **`id` (정수) → `reservation_id` (UUID)**: PK 타입 변경
- **`type` 파라미터 제거**: 기존 `type='complete'` → EF가 단일 목적 (돌봄 완료 전용)
- **양측 하원 확인**: 기존 PHP는 한 번 호출로 즉시 완료. 전환 후에는 **보호자/유치원 각각 확인** 필요, 양측 모두 확인 시 `status='돌봄완료'`
- **결과 상세화**: `result: 'Y'` 단순 성공 → `both_confirmed`, `guardian_checkout_confirmed`, `kg_checkout_confirmed`로 상세 상태 반환
- EF 내부 부가 처리: 시스템 메시지(`care_end`, `review`) INSERT + 상대방 FCM 푸시 + notifications INSERT (앱에서 별도 호출 불필요)

**응답 매핑**:

| PHP 응답 필드 | Supabase 응답 필드 | 변환 필요 |
|---|---|---|
| `response.result` (`'Y'`/`'N'`) | `data.success` (boolean) | 예 — 타입 변경 |
| — | `data.data.status` (`'돌봄완료'`/`'돌봄진행중'`) | 신규 — 현재 상태 |
| — | `data.data.both_confirmed` (boolean) | 신규 — 양측 모두 확인 여부 |
| — | `data.data.guardian_checkout_confirmed` (boolean) | 신규 — 보호자 확인 상태 |
| — | `data.data.kg_checkout_confirmed` (boolean) | 신규 — 유치원 확인 상태 |
| `response.message` | `data.error` (실패 시) | 예 — 키 이름 변경 |

---

### API #40. set_care_review.php → guardian_reviews / kindergarten_reviews INSERT

**전환 방식**: 자동 API | **난이도**: 쉬움
**관련 파일**: `app/review/kindergartenWrite.tsx`, `app/review/petWrite.tsx`
**Supabase 대응**: `supabase.from('guardian_reviews').insert(...)` 또는 `supabase.from('kindergarten_reviews').insert(...)`
**Supabase 테이블**: `guardian_reviews`, `kindergarten_reviews`

**Before**:
```typescript
// 파일: app/review/kindergartenWrite.tsx 또는 petWrite.tsx
// 돌봄 후기 작성
const submitReview = async (reviewData: {
  mb_id: string
  type: 'pet' | 'partner'    // 보호자 후기 / 유치원 후기
  partner_id: string
  pet_id: string
  content: string
  tags: string[]              // 선택된 태그
  satisfaction: string        // 만족도
  reservation_id: string
}) => {
  try {
    const formData = new FormData()
    formData.append('mb_id', reviewData.mb_id)
    formData.append('type', reviewData.type)
    formData.append('partner_id', reviewData.partner_id)
    formData.append('pet_id', reviewData.pet_id)
    formData.append('content', reviewData.content)
    formData.append('tags', JSON.stringify(reviewData.tags))

    const response = await apiClient.post('api/set_care_review.php', formData)
    if (response.result === 'Y') {
      Alert.alert('완료', '후기가 등록되었습니다')
    }
  } catch (error) {
    Alert.alert('오류', '서버와 통신할 수 없습니다')
  }
}
```

**After**:
```typescript
// 파일: app/review/kindergartenWrite.tsx 또는 petWrite.tsx (수정)
import { supabase } from '@/lib/supabase'

// 돌봄 후기 작성 (보호자 후기 또는 유치원 후기)
const submitReview = async (reviewData: {
  type: 'guardian' | 'kindergarten'   // 보호자→유치원 후기 / 유치원→보호자 후기
  kindergarten_id: string
  pet_id: string
  member_id: string                    // 작성자 (auth.uid())
  content: string
  selected_tags: string[]              // 선택된 태그 (jsonb)
  satisfaction: string                 // '최고예요' | '좋았어요' | '아쉬워요'
  reservation_id: string
}) => {
  try {
    // 후기 타입에 따라 다른 테이블에 INSERT
    const tableName = reviewData.type === 'guardian'
      ? 'guardian_reviews'          // 보호자가 유치원에 대해 작성
      : 'kindergarten_reviews'      // 유치원이 보호자에 대해 작성

    const { data, error } = await supabase
      .from(tableName)
      .insert({
        kindergarten_id: reviewData.kindergarten_id,
        pet_id: reviewData.pet_id,
        member_id: user.id,
        content: reviewData.content,
        selected_tags: reviewData.selected_tags,
        satisfaction: reviewData.satisfaction,
        reservation_id: reviewData.reservation_id,
      })
      .select()
      .single()

    if (error) {
      Alert.alert('오류', error.message)
      return
    }
    Alert.alert('완료', '후기가 등록되었습니다')
  } catch (error) {
    Alert.alert('오류', '서버와 통신할 수 없습니다')
  }
}
```

**변환 포인트**:
- `type='pet'` / `type='partner'` → 테이블 분리: `guardian_reviews` / `kindergarten_reviews`
- `partner_id` → `kindergarten_id`, `protector_id` → `member_id`
- `tags` (JSON 문자열) → `selected_tags` (jsonb 배열) — `JSON.stringify` 불필요, 배열 직접 전달
- `satisfaction` 신규 필드: `'최고예요'` | `'좋았어요'` | `'아쉬워요'`
- `reservation_id` 신규 FK: 예약과 연결

**응답 매핑**:

| PHP 응답 필드 | Supabase 응답 필드 | 변환 필요 |
|---|---|---|
| `result` (`'Y'`/`'N'`) | `error` (`null`이면 성공) | 예 |
| `data.type` | — (테이블명으로 구분) | 예 — 삭제 |
| `data.partner_id` | `data.kindergarten_id` | 예 — 키 이름 변경 |
| `data.tags` (JSON 문자열) | `data.selected_tags` (jsonb) | 예 — 키 이름 + 타입 변경 |

---

## 7. 정산

> **가이드 참조**: `APP_MIGRATION_GUIDE.md §13 리뷰/정산/교육 RPC`

### API #41. get_settlement.php + get_settlement_list.php → RPC `app_get_settlement_summary`

**전환 방식**: RPC | **난이도**: 중
**관련 파일**: `hooks/useSettlement.ts`
**Supabase 대응**: `supabase.rpc('app_get_settlement_summary', { p_start_date, p_end_date, p_page, p_per_page })`

**Before**:
```typescript
// 파일: hooks/useSettlement.ts
// 정산 요약 + 기간별 상세 조회 (2개 PHP 호출)
const fetchSettlement = async () => {
  try {
    // ① 누적 집계 조회
    const summaryResponse = await apiClient.get('api/get_settlement.php', {
      mb_id: user.mb_id,
    })

    // ② 기간별 상세 명세 조회
    const listResponse = await apiClient.get('api/get_settlement_list.php', {
      mb_id: user.mb_id,
      start_date: startDate,     // '2026-04-01'
      end_date: endDate,         // '2026-04-30'
      page: page,
    })

    if (summaryResponse.result === 'Y') {
      setSummary(summaryResponse.data)
    }
    if (listResponse.result === 'Y') {
      setSettlementList(listResponse.data)
    }
  } catch (error) {
    Alert.alert('오류', '서버와 통신할 수 없습니다')
  }
}
```

**After**:
```typescript
// 파일: hooks/useSettlement.ts (수정)
import { supabase } from '@/lib/supabase'

// 정산 통합 조회 — 1개 RPC로 summary + period_summary + details 한 번에
const fetchSettlement = async (
  startDate?: string,   // 'YYYY-MM-DD' 또는 미지정(전체)
  endDate?: string,
  page: number = 1,
  perPage: number = 20
) => {
  try {
    const { data, error } = await supabase.rpc('app_get_settlement_summary', {
      p_start_date: startDate ?? null,
      p_end_date: endDate ?? null,
      p_page: page,
      p_per_page: perPage,
    })

    if (error) {
      Alert.alert('오류', error.message)
      return
    }

    if (!data?.success) {
      Alert.alert('오류', data?.error ?? '정산 조회 실패')
      return
    }

    // data.data: { summary, next_settlement, period_summary, details, meta }
    //
    // summary: 전체 기간 누적 (기간 필터 무관)
    //   { total_settled_amount, total_unsettled_amount, total_held_amount }
    //
    // next_settlement: 가장 가까운 미래 정산예정 (없으면 null)
    //   { amount, scheduled_date, account_bank, account_number }
    //
    // period_summary: 기간 필터 적용 합산
    //   { settlement_revenue, total_payment_amount, total_commission_amount }
    //
    // details: 건별 상세 (기간 필터 + 페이지네이션)
    //   [{ id, transaction_type, payment_amount, commission_rate, commission_amount,
    //      settlement_amount, status, scheduled_date, created_at, reservation_id,
    //      member: { id, nickname, profile_image, address_complex } }]

    setSummary(data.data.summary)
    setNextSettlement(data.data.next_settlement)
    setPeriodSummary(data.data.period_summary)
    setDetails(data.data.details ?? [])
    setMeta(data.data.meta)
  } catch (error) {
    Alert.alert('오류', '서버와 통신할 수 없습니다')
  }
}
```

**변환 포인트**:
- **2개 PHP → 1개 RPC**: `get_settlement.php`(누적 집계) + `get_settlement_list.php`(기간 상세)를 `app_get_settlement_summary` 하나로 통합
- `mb_id` 파라미터 제거 → `auth.uid()` → 본인 유치원 자동 조회 (유치원 미등록 시 에러)
- 날짜 형식: `YYYY-MM-DD` 문자열 (RPC 내부에서 정규식 검증)
- `details[].member`: 보호자 정보를 `internal.members_public_profile` VIEW로 안전 조회 (주소 비대칭 정책: `address_complex`만)
- `next_settlement.account_bank/account_number`: `settlement_infos` 테이블에서 본인 계좌정보 JOIN (정산예정 없으면 전체 null)
- 페이지네이션: `p_per_page` 최대 50 cap

**응답 매핑**:

| PHP 응답 필드 | Supabase 응답 필드 | 변환 필요 |
|---|---|---|
| `summaryResponse.data.total_amount` | `data.data.summary.total_settled_amount` | 예 — 키 이름 변경 |
| `summaryResponse.data.pending_amount` | `data.data.summary.total_unsettled_amount` | 예 — 키 이름 변경 |
| `listResponse.data[]` | `data.data.details[]` | 예 — 구조 변경 |
| `listResponse.data[].protector_name` | `data.data.details[].member.nickname` | 예 — 중첩 구조 |
| — | `data.data.next_settlement` (신규) | 가장 가까운 정산예정 |
| — | `data.data.period_summary` (신규) | 기간 합산 집계 |
| — | `data.data.meta` (신규) | 페이지네이션 정보 |

---

### API #42. get_settlement_info.php → settlement_infos SELECT

**전환 방식**: 자동 API | **난이도**: 쉬움
**관련 파일**: `hooks/useSettlementInfo.ts`
**Supabase 대응**: `supabase.from('settlement_infos').select('*').eq('member_id', userId)`
**Supabase 테이블**: `settlement_infos`

**Before**:
```typescript
// 파일: hooks/useSettlementInfo.ts
// 정산 계좌 정보 조회
const fetchSettlementInfo = async () => {
  try {
    const response = await apiClient.get('api/get_settlement_info.php', {
      mb_id: user.mb_id,
    })
    if (response.result === 'Y') {
      setSettlementInfo(response.data)
    }
  } catch (error) {
    Alert.alert('오류', '정산 정보를 불러올 수 없습니다')
  }
}
```

**After**:
```typescript
// 파일: hooks/useSettlementInfo.ts (수정)
import { supabase } from '@/lib/supabase'

// 정산 계좌 정보 조회
const fetchSettlementInfo = async () => {
  try {
    const { data, error } = await supabase
      .from('settlement_infos')
      .select('*')
      .eq('member_id', user.id)
      .maybeSingle()                 // 정산 정보 없을 수 있음

    if (error) {
      Alert.alert('오류', error.message)
      return
    }
    setSettlementInfo(data)          // null이면 아직 미등록
  } catch (error) {
    Alert.alert('오류', '정산 정보를 불러올 수 없습니다')
  }
}
```

**변환 포인트**:
- `mb_id` → `member_id` (UUID)
- `.maybeSingle()`: 정산 정보가 아직 등록되지 않은 유치원도 있으므로, 결과 없을 때 에러 대신 null 반환
- 컬럼명 변경: `account_number`, `account_holder`, `account_bank`, `business_type`, `business_reg_number`, `operator_email` 등

**응답 매핑**:

| PHP 응답 필드 | Supabase 응답 필드 | 변환 필요 |
|---|---|---|
| `data.mb_id` | `data.member_id` (UUID) | 예 |
| `data.has_business` | `data.business_type` | 예 — `'Y'`/`'N'` → `'개인사업자'`/`'비사업자'` 등 |
| `data.business_reg_no` | `data.business_reg_number` | 예 — 키 이름 변경 |
| `data.settlement_email` | `data.operator_email` | 예 — 키 이름 변경 |
| `data.account_number` | `data.account_number` | 아니오 |
| `data.account_holder` | `data.account_holder` | 아니오 |
| `data.status` | `data.inicis_status` | 예 — 키 이름 변경 |
| `data.rrn_front_enc` + `rrn_back_enc` | `data.operator_ssn_masked` | 예 — 암호화→마스킹 |

---

### API #43. set_settlement_info.php → settlement_infos UPSERT

**전환 방식**: 자동 API | **난이도**: 중
**관련 파일**: `app/settlement/account.tsx`, `app/settlement/info.tsx`
**Supabase 대응**: `supabase.from('settlement_infos').upsert({ ... })`
**Supabase 테이블**: `settlement_infos`

**Before**:
```typescript
// 파일: app/settlement/info.tsx
// 정산 계좌 정보 등록/수정
const saveSettlementInfo = async (info: {
  mb_id: string
  has_business: string         // 'Y'/'N'
  business_type?: string
  business_reg_no?: string
  settlement_email: string
  account_number: string
  account_holder: string
  bank_name: string
  rrn_front: string            // 주민번호 앞 6자리
  rrn_back: string             // 주민번호 뒤 7자리 (암호화 필요)
}) => {
  try {
    const formData = new FormData()
    Object.entries(info).forEach(([key, value]) => {
      if (value) formData.append(key, value)
    })

    const response = await apiClient.post('api/set_settlement_info.php', formData)
    if (response.result === 'Y') {
      Alert.alert('완료', '정산 정보가 저장되었습니다')
    }
  } catch (error) {
    Alert.alert('오류', '서버와 통신할 수 없습니다')
  }
}
```

**After**:
```typescript
// 파일: app/settlement/info.tsx (수정)
import { supabase } from '@/lib/supabase'

// 정산 계좌 정보 등록/수정
const saveSettlementInfo = async (info: {
  business_type: string        // '개인사업자' | '법인사업자' | '비사업자'
  business_name?: string
  business_category?: string
  business_reg_number?: string
  operator_name: string
  operator_email: string
  operator_phone: string
  operator_birth_date?: string
  operator_ssn_masked?: string // 마스킹된 주민번호 (앞6 + '- *******')
  account_bank: string
  account_number: string
  account_holder: string
  kindergarten_id: string
}) => {
  try {
    const { data, error } = await supabase
      .from('settlement_infos')
      .upsert({
        member_id: user.id,
        kindergarten_id: info.kindergarten_id,
        business_type: info.business_type,
        business_name: info.business_name,
        business_category: info.business_category,
        business_reg_number: info.business_reg_number,
        operator_name: info.operator_name,
        operator_email: info.operator_email,
        operator_phone: info.operator_phone,
        operator_birth_date: info.operator_birth_date,
        operator_ssn_masked: info.operator_ssn_masked,
        account_bank: info.account_bank,
        account_number: info.account_number,
        account_holder: info.account_holder,
        inicis_status: '작성중',
      }, { onConflict: 'member_id' })
      .select()
      .single()

    if (error) {
      Alert.alert('오류', error.message)
      return
    }
    Alert.alert('완료', '정산 정보가 저장되었습니다')
  } catch (error) {
    Alert.alert('오류', '서버와 통신할 수 없습니다')
  }
}
```

**변환 포인트**:
- FormData → `.upsert()` (JSON), `onConflict: 'member_id'`로 중복 시 UPDATE
- `mb_id` → `member_id` (UUID)
- `has_business` (`'Y'`/`'N'`) → `business_type` (`'개인사업자'`/`'법인사업자'`/`'비사업자'`)
- `rrn_front` + `rrn_back` (암호화) → `operator_ssn_masked` (마스킹: `'960315-*******'`)
- **주민번호 뒷자리**: 기존 PHP에서 암호화 저장 → Supabase에서는 마스킹 문자열만 저장. 전문 뒷자리는 앱 클라이언트에서 절대 저장하지 않음
- `kindergarten_id` 추가 (FK, 유치원과 연결)
- `bank_name` → `account_bank` (키 이름 변경)

**응답 매핑**:

| PHP 응답 필드 | Supabase 응답 필드 | 변환 필요 |
|---|---|---|
| `result` (`'Y'`/`'N'`) | `error` (`null`이면 성공) | 예 |

---

## 8. 리뷰

> **가이드 참조**: `APP_MIGRATION_GUIDE.md §13 리뷰/정산/교육 RPC`

### API #44. get_review.php (type=pet) → RPC `app_get_guardian_reviews`

**전환 방식**: RPC | **난이도**: 중
**관련 파일**: `hooks/useReviewList.ts`
**Supabase 대응**: `supabase.rpc('app_get_guardian_reviews', { p_kindergarten_id, p_page, p_per_page })`

**Before**:
```typescript
// 파일: hooks/useReviewList.ts
// 보호자→유치원 후기 목록 조회 (유치원 상세 화면)
const fetchGuardianReviews = async (partnerId: string, page: number = 1) => {
  try {
    const response = await apiClient.get('api/get_review.php', {
      type: 'pet',               // 보호자→유치원 후기
      id: partnerId,             // 유치원 ID (PHP에서는 partner_id)
      page: page,
      per_page: 20,
    })
    if (response.result === 'Y') {
      setReviews(response.data.reviews)
      setTagCounts(response.data.tag_counts)  // 태그별 카운트
      return response.data
    }
    return null
  } catch (error) {
    return null
  }
}
```

**After**:
```typescript
// 파일: hooks/useReviewList.ts (수정)
import { supabase } from '@/lib/supabase'

// 보호자→유치원 후기 목록 조회 (유치원 상세 화면)
const fetchGuardianReviews = async (
  kindergartenId: string,
  page: number = 1,
  perPage: number = 20
) => {
  try {
    const { data, error } = await supabase.rpc('app_get_guardian_reviews', {
      p_kindergarten_id: kindergartenId,    // 유치원 UUID
      p_page: page,
      p_per_page: perPage,
    })

    if (error) {
      Alert.alert('오류', error.message)
      return null
    }

    if (!data?.success) {
      Alert.alert('오류', data?.error ?? '후기 조회 실패')
      return null
    }

    // data.data: { tags, reviews, meta }
    //
    // tags: 7개 긍정 태그별 카운트 (순서 보장)
    //   [{ tag: '상담이 친절하고 편안했어요', count: 12 }, ...]
    //
    // reviews: 후기 목록 (최신순)
    //   [{ id, satisfaction, selected_tags, content, image_urls, written_at,
    //      pet: { id, name, breed, photo_urls },
    //      member: { id, nickname, profile_image } }]
    //
    // meta: { page, per_page, total }

    setTags(data.data.tags ?? [])
    setReviews(data.data.reviews ?? [])
    setMeta(data.data.meta)
    return data.data
  } catch (error) {
    return null
  }
}
```

**변환 포인트**:
- `type='pet'` 파라미터 제거 → 전용 RPC `app_get_guardian_reviews` (테이블 분리)
- `id` (partner_id) → `p_kindergarten_id` (유치원 UUID)
- 태그 집계: PHP 응답 구조 → RPC `tags[]` 배열 (`[{ tag, count }]`, 7개 고정, 순서 보장)
- 숨김 후기(`is_hidden=true`): 자동 제외 (앱에서 별도 필터 불필요)
- `reviews[].pet`: 반려동물 정보 포함 (internal VIEW — RLS 우회)
- `reviews[].member`: 작성자(보호자) 프로필 (internal VIEW — RLS 우회)

**응답 매핑**:

| PHP 응답 필드 | Supabase 응답 필드 | 변환 필요 |
|---|---|---|
| `data.tag_counts` (객체) | `data.data.tags[]` (배열) | 예 — 구조 변경 (객체→배열) |
| `data.reviews[].id` | `data.data.reviews[].id` (UUID) | 예 — 정수 → UUID |
| `data.reviews[].content` | `data.data.reviews[].content` | 아니오 |
| `data.reviews[].tags` (JSON 문자열) | `data.data.reviews[].selected_tags` (jsonb) | 예 — 키 이름 + 타입 |
| `data.reviews[].images` (JSON 문자열) | `data.data.reviews[].image_urls` (jsonb) | 예 — 키 이름 + 타입 |
| `data.reviews[].created_at` | `data.data.reviews[].written_at` | 예 — 키 이름 변경 |
| — | `data.data.reviews[].satisfaction` (신규) | 만족도 |
| — | `data.data.reviews[].pet` (신규) | 반려동물 정보 |
| — | `data.data.reviews[].member` (신규) | 작성자 프로필 |

---

### API #44b. get_review.php (type=partner) → RPC `app_get_kindergarten_reviews`

**전환 방식**: RPC | **난이도**: 중
**관련 파일**: `hooks/useReviewList.ts`
**Supabase 대응**: `supabase.rpc('app_get_kindergarten_reviews', { p_pet_id, p_page, p_per_page })`

**Before**:
```typescript
// 파일: hooks/useReviewList.ts
// 유치원→보호자 후기 목록 조회 (반려동물 프로필 화면)
const fetchKindergartenReviews = async (petId: string, page: number = 1) => {
  try {
    const response = await apiClient.get('api/get_review.php', {
      type: 'partner',            // 유치원→보호자 후기
      id: petId,                  // 반려동물 ID
      page: page,
      per_page: 20,
    })
    if (response.result === 'Y') {
      setReviews(response.data.reviews)
      setTagCounts(response.data.tag_counts)
      return response.data
    }
    return null
  } catch (error) {
    return null
  }
}
```

**After**:
```typescript
// 파일: hooks/useReviewList.ts (수정)
import { supabase } from '@/lib/supabase'

// 유치원→보호자 후기 목록 조회 (반려동물 프로필 화면)
// ⚠️ is_guardian_only 분기: RPC 내부에서 auth.uid()와 pet.member_id 비교
//    - 보호자(pet 주인): 전체 후기 표시
//    - 그 외 사용자: is_guardian_only=false 후기만 표시
const fetchKindergartenReviews = async (
  petId: string,
  page: number = 1,
  perPage: number = 20
) => {
  try {
    const { data, error } = await supabase.rpc('app_get_kindergarten_reviews', {
      p_pet_id: petId,            // 반려동물 UUID
      p_page: page,
      p_per_page: perPage,
    })

    if (error) {
      Alert.alert('오류', error.message)
      return null
    }

    if (!data?.success) {
      Alert.alert('오류', data?.error ?? '후기 조회 실패')
      return null
    }

    // data.data: { tags, reviews, meta }
    //
    // tags: 7개 긍정 태그별 카운트 (전체 후기 기반, is_guardian_only 무관)
    //   [{ tag: '사람을 좋아하고 애교가 많아요', count: 8 }, ...]
    //
    // reviews: 후기 목록 (최신순, is_guardian_only 분기 적용)
    //   [{ id, satisfaction, selected_tags, content, is_guardian_only, written_at,
    //      kindergarten: { id, name, photo_urls } }]
    //   ※ image_urls 없음 (kindergarten_reviews에 이미지 컬럼 없음)
    //
    // meta: { page, per_page, total }

    setTags(data.data.tags ?? [])
    setReviews(data.data.reviews ?? [])
    setMeta(data.data.meta)
    return data.data
  } catch (error) {
    return null
  }
}
```

**변환 포인트**:
- `type='partner'` 파라미터 제거 → 전용 RPC `app_get_kindergarten_reviews` (테이블 분리)
- `id` (pet_id) → `p_pet_id` (반려동물 UUID)
- **`is_guardian_only` 분기**: RPC 내부에서 자동 처리 — 보호자는 전체, 그 외는 공개만. 앱에서 별도 분기 불필요
- **태그 집계 정책**: `is_guardian_only=true` 후기도 태그 카운트에 포함
- `reviews[].kindergarten`: 후기를 작성한 유치원 정보 (어떤 유치원의 후기인지)
- `reviews[].image_urls` 없음: `kindergarten_reviews` 테이블에 이미지 컬럼 미존재
- `reviews[].is_guardian_only`: 반환됨 (앱 UI에서 "보호자에게만 보이는 후기" 라벨 표시용)
- `pet` 객체 미포함: 조회 대상이 반려동물이므로 중복 (반려동물 정보는 호출 측에서 이미 보유)

**응답 매핑**:

| PHP 응답 필드 | Supabase 응답 필드 | 변환 필요 |
|---|---|---|
| `data.tag_counts` (객체) | `data.data.tags[]` (배열) | 예 — 구조 변경 |
| `data.reviews[].id` | `data.data.reviews[].id` (UUID) | 예 — 정수 → UUID |
| `data.reviews[].content` | `data.data.reviews[].content` | 아니오 |
| `data.reviews[].tags` | `data.data.reviews[].selected_tags` | 예 — 키 이름 + 타입 |
| `data.reviews[].created_at` | `data.data.reviews[].written_at` | 예 — 키 이름 변경 |
| — | `data.data.reviews[].satisfaction` (신규) | 만족도 |
| — | `data.data.reviews[].is_guardian_only` (신규) | 보호자 전용 후기 플래그 |
| — | `data.data.reviews[].kindergarten` (신규) | 작성 유치원 정보 |
| `data.reviews[].images` | — (없음) | kindergarten_reviews에 이미지 없음 |

---

### API #45. set_review.php → guardian_reviews / kindergarten_reviews INSERT + Storage

**전환 방식**: 자동 API + Storage | **난이도**: 쉬움
**관련 파일**: `app/review/kindergartenWrite.tsx`, `app/review/petWrite.tsx`
**Supabase 대응**: Storage `review-images` 업로드 → `guardian_reviews` 또는 `kindergarten_reviews` INSERT
**Supabase 테이블**: `guardian_reviews`, `kindergarten_reviews`

**Before**:
```typescript
// 파일: app/review/kindergartenWrite.tsx
// 후기 작성 (이미지 포함)
const submitReview = async (reviewData: {
  mb_id: string
  type: 'pet' | 'partner'
  partner_id: string
  pet_id: string
  content: string
  tags: string[]
  images?: { uri: string }[]     // 후기 이미지 (최대 5장)
  reservation_id: string
}) => {
  try {
    const formData = new FormData()
    formData.append('mb_id', reviewData.mb_id)
    formData.append('type', reviewData.type)
    formData.append('partner_id', reviewData.partner_id)
    formData.append('pet_id', reviewData.pet_id)
    formData.append('content', reviewData.content)
    formData.append('tags', JSON.stringify(reviewData.tags))
    formData.append('reservation_id', reviewData.reservation_id)

    reviewData.images?.forEach((img, index) => {
      formData.append(`image${index + 1}`, {
        uri: img.uri, type: 'image/jpeg', name: `review_${index + 1}.jpg`,
      } as any)
    })

    const response = await apiClient.post('api/set_review.php', formData)
    if (response.result === 'Y') {
      Alert.alert('완료', '후기가 등록되었습니다')
    }
  } catch (error) {
    Alert.alert('오류', '서버와 통신할 수 없습니다')
  }
}
```

**After**:
```typescript
// 파일: app/review/kindergartenWrite.tsx (수정)
import { supabase } from '@/lib/supabase'

// 후기 작성 (이미지 포함)
const submitReview = async (reviewData: {
  type: 'guardian' | 'kindergarten'
  kindergarten_id: string
  pet_id: string
  content: string
  selected_tags: string[]
  satisfaction: string
  reservation_id: string
  images?: { uri: string }[]
}) => {
  try {
    // Step 1: 이미지 업로드 (Storage)
    const imageUrls: string[] = []
    if (reviewData.images && reviewData.images.length > 0) {
      for (let i = 0; i < reviewData.images.length; i++) {
        const filePath = `${user.id}/${reviewData.reservation_id}_${Date.now()}_${i}.jpg`
        const response = await fetch(reviewData.images[i].uri)
        const blob = await response.blob()

        const { error: uploadError } = await supabase.storage
          .from('review-images')
          .upload(filePath, blob, {
            contentType: 'image/jpeg',
            upsert: false,
          })

        if (uploadError) {
          Alert.alert('오류', `이미지 업로드 실패: ${uploadError.message}`)
          return
        }

        const { data: { publicUrl } } = supabase.storage
          .from('review-images')
          .getPublicUrl(filePath)

        imageUrls.push(publicUrl)
      }
    }

    // Step 2: 리뷰 INSERT
    const tableName = reviewData.type === 'guardian'
      ? 'guardian_reviews'
      : 'kindergarten_reviews'

    const { error } = await supabase
      .from(tableName)
      .insert({
        member_id: user.id,
        kindergarten_id: reviewData.kindergarten_id,
        pet_id: reviewData.pet_id,
        content: reviewData.content,
        selected_tags: reviewData.selected_tags,
        satisfaction: reviewData.satisfaction,
        reservation_id: reviewData.reservation_id,
        image_urls: imageUrls.length > 0 ? imageUrls : null,
      })

    if (error) {
      Alert.alert('오류', error.message)
      return
    }
    Alert.alert('완료', '후기가 등록되었습니다')
  } catch (error) {
    Alert.alert('오류', '서버와 통신할 수 없습니다')
  }
}
```

**변환 포인트**:
- 테이블 분리: `type` 파라미터 → `guardian_reviews` / `kindergarten_reviews` 테이블
- 이미지: FormData → Storage `review-images` 버킷 + `image_urls` (jsonb 배열)
- Storage 경로: `review-images/{user.id}/{reservation_id}_{timestamp}_{index}.jpg`
- `tags` (JSON 문자열) → `selected_tags` (jsonb 배열)
- `satisfaction` 신규 필드 추가
- `partner_id` → `kindergarten_id`

**응답 매핑**: #40과 동일

---

## 9. 즐겨찾기

> **가이드 참조**: `APP_MIGRATION_GUIDE.md §4 즐겨찾기 CRUD`

### API #46. set_partner_favorite_add.php → favorite_kindergartens UPSERT

**전환 방식**: 자동 API | **난이도**: 쉬움
**관련 파일**: `utils/handleFavorite.ts` → `addPartnerFavorite()`
**Supabase 대응**: `supabase.from('favorite_kindergartens').upsert({ member_id, kindergarten_id, is_favorite: true })`

**Before**:
```typescript
// TODO
```

**After**:
```typescript
// TODO
```

**변환 포인트**:
<!-- TODO -->

---

### API #47. set_partner_favorite_remove.php → favorite_kindergartens UPDATE (is_favorite=false)

**전환 방식**: 자동 API | **난이도**: 쉬움
**관련 파일**: `utils/handleFavorite.ts` → `removePartnerFavorite()`
**Supabase 대응**: `supabase.from('favorite_kindergartens').update({ is_favorite: false }).eq('member_id', userId).eq('kindergarten_id', kgId)`

**Before**:
```typescript
// TODO
```

**After**:
```typescript
// TODO
```

**변환 포인트**:
<!-- TODO -->

---

### API #48. set_user_favorite_add.php → favorite_pets UPSERT

**전환 방식**: 자동 API | **난이도**: 쉬움
**관련 파일**: `utils/handleFavorite.ts` → `addUserFavorite()`
**Supabase 대응**: `supabase.from('favorite_pets').upsert({ member_id, pet_id, is_favorite: true })`

**Before**:
```typescript
// TODO
```

**After**:
```typescript
// TODO
```

**변환 포인트**:
<!-- TODO -->

---

### API #49. set_user_favorite_remove.php → favorite_pets UPDATE (is_favorite=false)

**전환 방식**: 자동 API | **난이도**: 쉬움
**관련 파일**: `utils/handleFavorite.ts` → `removeUserFavorite()`
**Supabase 대응**: `supabase.from('favorite_pets').update({ is_favorite: false }).eq('member_id', userId).eq('pet_id', petId)`

**Before**:
```typescript
// TODO
```

**After**:
```typescript
// TODO
```

**변환 포인트**:
<!-- TODO -->

---

## 10. 알림/FCM

> **가이드 참조**: `APP_MIGRATION_GUIDE.md §5 알림/FCM`

### API #50. fcm_token.php → fcm_tokens UPSERT

**전환 방식**: 자동 API | **난이도**: 쉬움
**관련 파일**: `hooks/useFcmToken.ts` → `getFcmToken()`
**Supabase 대응**: `supabase.from('fcm_tokens').upsert({ member_id, token, platform, device_id })`

**Before**:
```typescript
// TODO
```

**After**:
```typescript
// TODO
```

**변환 포인트**:
<!-- TODO -->

---

### API #51. get_notification.php → notifications SELECT

**전환 방식**: 자동 API | **난이도**: 쉬움
**관련 파일**: `hooks/useNotification.ts` (추정)
**Supabase 대응**: `supabase.from('notifications').select('*').eq('member_id', userId).order('created_at', { ascending: false })`

**Before**:
```typescript
// TODO
```

**After**:
```typescript
// TODO
```

**변환 포인트**:
<!-- TODO -->

---

### API #52. delete_notification.php → notifications DELETE

**전환 방식**: 자동 API | **난이도**: 쉬움
**관련 파일**: 알림 화면
**Supabase 대응**: `supabase.from('notifications').delete().eq('id', notificationId)` 또는 `.eq('member_id', userId)` (전체 삭제)

**Before**:
```typescript
// TODO
```

**After**:
```typescript
// TODO
```

**변환 포인트**:
<!-- TODO -->

---

## 11. 콘텐츠

> **가이드 참조**: `APP_MIGRATION_GUIDE.md §6 콘텐츠 조회`

### API #53. get_banner.php → banners SELECT

**전환 방식**: 자동 API | **난이도**: 쉬움
**Supabase 대응**: `supabase.from('banners').select('*').eq('visible', true).order('sort_order')`

**Before**:
```typescript
// TODO
```

**After**:
```typescript
// TODO
```

**변환 포인트**:
<!-- TODO -->

---

### API #54. get_notice.php → notices SELECT

**전환 방식**: 자동 API | **난이도**: 쉬움
**Supabase 대응**: `supabase.from('notices').select('*').eq('visible', true).order('created_at', { ascending: false })`

**Before**:
```typescript
// TODO
```

**After**:
```typescript
// TODO
```

**변환 포인트**:
<!-- TODO -->

---

### API #55. get_notice_detail.php → notices SELECT (단건)

**전환 방식**: 자동 API | **난이도**: 쉬움
**Supabase 대응**: `supabase.from('notices').select('*').eq('id', noticeId).single()`

**Before**:
```typescript
// TODO
```

**After**:
```typescript
// TODO
```

**변환 포인트**:
<!-- TODO -->

---

### API #56. get_faq.php → faqs SELECT

**전환 방식**: 자동 API | **난이도**: 쉬움
**Supabase 대응**: `supabase.from('faqs').select('*').order('display_order')`

**Before**:
```typescript
// TODO
```

**After**:
```typescript
// TODO
```

**변환 포인트**:
<!-- TODO -->

---

### API #57. get_policy.php → terms SELECT

**전환 방식**: 자동 API | **난이도**: 쉬움
**Supabase 대응**: `supabase.from('terms').select('*').eq('category', category)`

**Before**:
```typescript
// TODO
```

**After**:
```typescript
// TODO
```

**변환 포인트**:
<!-- TODO -->

---

## 12. 차단

> **가이드 참조**: `APP_MIGRATION_GUIDE.md §7 차단/신고`

### API #58. set_block_user.php → member_blocks INSERT/DELETE (토글)

**전환 방식**: 자동 API | **난이도**: 쉬움
**Supabase 대응**: 차단 토글 (INSERT or DELETE)

**Before**:
```typescript
// TODO
```

**After**:
```typescript
// TODO
```

**변환 포인트**:
<!-- TODO -->

---

### API #59. get_block_user.php → member_blocks SELECT

**전환 방식**: 자동 API | **난이도**: 쉬움
**Supabase 대응**: `supabase.from('member_blocks').select('*').eq('blocker_id', userId).eq('blocked_id', targetId)`

**Before**:
```typescript
// TODO
```

**After**:
```typescript
// TODO
```

**변환 포인트**:
<!-- TODO -->

---

### API #60. get_blocked_list.php → member_blocks SELECT + members JOIN

**전환 방식**: 자동 API | **난이도**: 쉬움
**Supabase 대응**: `supabase.from('member_blocks').select('*, blocked:members!blocked_id(*)').eq('blocker_id', userId)`

**Before**:
```typescript
// TODO
```

**After**:
```typescript
// TODO
```

**변환 포인트**:
<!-- TODO -->

---

## 13. 기타

> **가이드 참조**: `APP_MIGRATION_GUIDE.md §10 기타 자동 API`, `§13 리뷰/정산/교육 RPC`

### API #61. get_education.php → RPC `app_get_education_with_progress`

**전환 방식**: RPC | **난이도**: 중
**관련 파일**: `app/kindergarten/tutorial/index.tsx`
**Supabase 대응**: `supabase.rpc('app_get_education_with_progress', { p_kindergarten_id })`

**Before**:
```typescript
// 파일: app/kindergarten/tutorial/index.tsx
// 교육 주제 목록 + 이수 현황 조회
const fetchEducation = async () => {
  try {
    const formData = new FormData()
    formData.append('mb_id', user.mb_id)
    // ca_name: 카테고리 (선택)

    const response = await apiClient.post('api/get_education.php', formData)
    if (response.result === 'Y') {
      setEducationList(response.data.educations)  // 교육 주제 배열
      setSolvedList(response.data.solved ?? [])     // 이수 완료 ID 배열
      return response.data
    }
    return null
  } catch (error) {
    Alert.alert('오류', '서버와 통신할 수 없습니다')
    return null
  }
}
```

**After**:
```typescript
// 파일: app/kindergarten/tutorial/index.tsx (수정)
import { supabase } from '@/lib/supabase'

// 교육 주제 + 퀴즈 + 이수 현황 통합 조회
const fetchEducation = async (kindergartenId: string) => {
  try {
    const { data, error } = await supabase.rpc('app_get_education_with_progress', {
      p_kindergarten_id: kindergartenId,   // 유치원 UUID
    })

    if (error) {
      Alert.alert('오류', error.message)
      return null
    }

    if (!data?.success) {
      Alert.alert('오류', data?.error ?? '교육 조회 실패')
      return null
    }

    // data.data: { completion, topics }
    //
    // completion: 이수 현황 (이수 기록 미존재 시 기본값 자동 반환)
    //   { kindergarten_id, total_topics, completed_topics, progress_rate,
    //     completion_status ('미시작'|'진행중'|'완료'),
    //     checklist_confirmed, pledge_agreed, all_completed_at }
    //
    // topics: 교육 주제 배열 (display_order 순)
    //   [{ topic_id, display_order, title, top_image_url,
    //      principle_text, principle_details,
    //      correct_behavior_1, correct_behavior_2, wrong_behavior_1,
    //      is_completed, completed_at,
    //      quiz: { quiz_id, question_text, question_image_url,
    //              choice_a, choice_b, correct_answer,
    //              correct_explanation, wrong_explanation } | null }]

    setCompletion(data.data.completion)
    setTopics(data.data.topics ?? [])
    return data.data
  } catch (error) {
    Alert.alert('오류', '서버와 통신할 수 없습니다')
    return null
  }
}
```

**변환 포인트**:
- `mb_id` → `p_kindergarten_id` (유치원 UUID) — 교육은 유치원 단위
- `ca_name` (카테고리 필터) 파라미터 제거 → `visibility='공개'` 교육만 전체 조회 (클라이언트에서 필터링)
- POST FormData → `.rpc()` JSON 파라미터
- `educations` + `solved` (2개 배열) → `topics[].is_completed`로 통합 (각 주제에 이수 여부 포함)
- 퀴즈 데이터: PHP에서 JSON 문자열 파싱 → RPC에서 `education_quizzes` LEFT JOIN으로 `quiz` 객체 직접 반환 (null이면 퀴즈 없음)
- 이수 기록 미존재(첫 진입): `completion`에 기본값 반환 (`progress_rate: 0`, `completion_status: '미시작'` 등) — 앱에서 별도 null 체크 불필요
- `total_topics`: 공개 교육 주제 수를 동적 계산 (하드코딩 아님)

**응답 매핑**:

| PHP 응답 필드 | Supabase 응답 필드 | 변환 필요 |
|---|---|---|
| `data.educations[]` | `data.data.topics[]` | 예 — 키 이름 변경, 구조 확장 |
| `data.educations[].id` | `data.data.topics[].topic_id` (UUID) | 예 — 키 이름 + 타입 |
| `data.educations[].title` | `data.data.topics[].title` | 아니오 |
| `data.educations[].quiz` (JSON 문자열) | `data.data.topics[].quiz` (객체) | 예 — 문자열→객체 (JSON.parse 불필요) |
| `data.solved[]` (ID 배열) | `data.data.topics[].is_completed` (boolean) | 예 — 배열→주제별 개별 플래그 |
| — | `data.data.completion` (신규) | 이수 현황 요약 |
| — | `data.data.topics[].completed_at` (신규) | 주제별 완료 일시 |

---

### API #62. set_solved.php → education_completions INSERT

**전환 방식**: 자동 API | **난이도**: 쉬움
**관련 파일**: `app/kindergarten/tutorial/index.tsx`
**Supabase 대응**: `supabase.from('education_completions').insert({ member_id, topic_id })`
**Supabase 테이블**: `education_completions`

**Before**:
```typescript
// 파일: app/kindergarten/tutorial/index.tsx
// 교육 퀴즈 이수 완료 저장
const markSolved = async (educationId: string) => {
  try {
    const formData = new FormData()
    formData.append('mb_id', user.mb_id)
    formData.append('education_id', educationId)

    const response = await apiClient.post('api/set_solved.php', formData)
    if (response.result === 'Y') {
      // 이수 완료 표시 업데이트
      setSolvedList(prev => [...prev, educationId])
    }
  } catch (error) {
    Alert.alert('오류', '서버와 통신할 수 없습니다')
  }
}
```

**After**:
```typescript
// 파일: app/kindergarten/tutorial/index.tsx (수정)
import { supabase } from '@/lib/supabase'

// 교육 퀴즈 이수 완료 저장
const markSolved = async (topicId: string) => {
  try {
    const { error } = await supabase
      .from('education_completions')
      .insert({
        member_id: user.id,
        topic_id: topicId,
      })

    if (error) {
      // 23505: unique_violation — 이미 이수한 교육은 무시
      if (error.code === '23505') return
      Alert.alert('오류', error.message)
      return
    }
    setSolvedList(prev => [...prev, topicId])
  } catch (error) {
    Alert.alert('오류', '서버와 통신할 수 없습니다')
  }
}
```

**변환 포인트**:
- `mb_id` → `member_id` (UUID), `education_id` → `topic_id` (UUID)
- 중복 체크: PHP에서 서버 측 처리 → Supabase는 UNIQUE 제약 위반 시 `23505` 에러 코드 → 앱에서 무시 처리
- `.insert()` 단순 호출 (반환값 불필요)

**응답 매핑**:

| PHP 응답 필드 | Supabase 응답 필드 | 변환 필요 |
|---|---|---|
| `result` (`'Y'`/`'N'`) | `error` (`null`이면 성공) | 예 |

---

### API #63. get_bank_list.php → banks SELECT

**전환 방식**: 자동 API | **난이도**: 쉬움
**관련 파일**: `hooks/useBankList.ts`
**Supabase 대응**: `supabase.from('banks').select('*').eq('is_active', true).order('sort_order')`
**Supabase 테이블**: `banks`

**Before**:
```typescript
// 파일: hooks/useBankList.ts
// 은행 목록 조회
const fetchBankList = async () => {
  try {
    const response = await apiClient.get('api/get_bank_list.php', {})
    if (response.result === 'Y') {
      setBankList(response.data)  // [{ code, name }, ...]
    }
  } catch (error) {
    setBankList([])
  }
}
```

**After**:
```typescript
// 파일: hooks/useBankList.ts (수정)
import { supabase } from '@/lib/supabase'

// 은행 목록 조회
const fetchBankList = async () => {
  try {
    const { data, error } = await supabase
      .from('banks')
      .select('id, code, name')
      .eq('is_active', true)
      .order('sort_order')

    if (error) {
      setBankList([])
      return
    }
    setBankList(data)
  } catch (error) {
    setBankList([])
  }
}
```

**변환 포인트**:
- 파라미터 없음 (마스터 데이터 전체 조회)
- `is_active=true`: 사용 중인 은행만 필터
- `sort_order`: 정렬 순서 (은행 코드 순 등)

**응답 매핑**:

| PHP 응답 필드 | Supabase 응답 필드 | 변환 필요 |
|---|---|---|
| `data[].code` | `data[].code` | 아니오 |
| `data[].name` | `data[].name` | 아니오 |
| — | `data[].id` (UUID) | 예 — 신규 |

---

### API #64. get_favorite_animal_list.php → favorite_pets SELECT + pets JOIN

**전환 방식**: 자동 API | **난이도**: 쉬움
**관련 파일**: `hooks/useFavoriteAnimalList.ts` (유치원 모드 — 찜한 반려동물 목록)
**Supabase 대응**: `supabase.from('favorite_pets').select('*, pet:pets(*)').eq('member_id', userId).eq('is_favorite', true)`
**Supabase 테이블**: `favorite_pets`, `pets`

**Before**:
```typescript
// 파일: hooks/useFavoriteAnimalList.ts
// 찜한 반려동물 목록 (유치원 모드)
const fetchFavoriteAnimals = async () => {
  try {
    const response = await apiClient.get('api/get_favorite_animal_list.php', {
      mb_id: user.mb_id,
    })
    if (response.result === 'Y') {
      setFavoriteList(response.data)
    }
  } catch (error) {
    setFavoriteList([])
  }
}
```

**After**:
```typescript
// 파일: hooks/useFavoriteAnimalList.ts (수정)
import { supabase } from '@/lib/supabase'

// 찜한 반려동물 목록 (유치원 모드)
const fetchFavoritePets = async () => {
  try {
    const { data, error } = await supabase
      .from('favorite_pets')
      .select(`
        id,
        pet_id,
        created_at,
        pet:pets (
          id, name, breed, gender, birth_date, weight,
          size_class, photo_urls, is_neutered, is_vaccinated,
          member_id
        )
      `)
      .eq('member_id', user.id)
      .eq('is_favorite', true)
      .order('created_at', { ascending: false })

    if (error) {
      setFavoriteList([])
      return
    }
    setFavoriteList(data)
  } catch (error) {
    setFavoriteList([])
  }
}
```

**변환 포인트**:
- `mb_id` → `member_id` (UUID), `is_favorite=true` 필터 추가
- **임베디드 JOIN**: `pet:pets(...)` 구문으로 반려동물 정보를 한 번에 가져옴 (별도 쿼리 불필요)
- 응답 구조: `data[].pet.name`, `data[].pet.breed` 등 중첩 객체

**응답 매핑**:

| PHP 응답 필드 | Supabase 응답 필드 | 변환 필요 |
|---|---|---|
| `data[].wr_id` | `data[].pet.id` | 예 — 중첩 구조 |
| `data[].wr_subject` | `data[].pet.name` | 예 — 중첩 + 키 이름 |
| `data[].wr_4` | `data[].pet.breed` | 예 — 중첩 + 키 이름 |
| `data[].animal_img1` | `data[].pet.photo_urls[0]` | 예 — 중첩 + 배열 |

---

### API #65. get_favorite_partner_list.php → favorite_kindergartens SELECT + kindergartens JOIN

**전환 방식**: 자동 API | **난이도**: 쉬움
**관련 파일**: `hooks/useFavoritePartnerList.ts` (보호자 모드 — 찜한 유치원 목록)
**Supabase 대응**: `supabase.from('favorite_kindergartens').select('*, kindergarten:kindergartens(*)').eq('member_id', userId).eq('is_favorite', true)`
**Supabase 테이블**: `favorite_kindergartens`, `kindergartens`

**Before**:
```typescript
// 파일: hooks/useFavoritePartnerList.ts
// 찜한 유치원 목록 (보호자 모드)
const fetchFavoritePartners = async () => {
  try {
    const response = await apiClient.get('api/get_favorite_partner_list.php', {
      mb_id: user.mb_id,
    })
    if (response.result === 'Y') {
      setFavoriteList(response.data)
    }
  } catch (error) {
    setFavoriteList([])
  }
}
```

**After**:
```typescript
// 파일: hooks/useFavoritePartnerList.ts (수정)
import { supabase } from '@/lib/supabase'

// 찜한 유치원 목록 (보호자 모드)
const fetchFavoriteKindergartens = async () => {
  try {
    const { data, error } = await supabase
      .from('favorite_kindergartens')
      .select(`
        id,
        kindergarten_id,
        created_at,
        kindergarten:kindergartens (
          id, name, description, address_road, address_complex,
          photo_urls, business_status, latitude, longitude,
          freshness_current, member_id
        )
      `)
      .eq('member_id', user.id)
      .eq('is_favorite', true)
      .order('created_at', { ascending: false })

    if (error) {
      setFavoriteList([])
      return
    }
    setFavoriteList(data)
  } catch (error) {
    setFavoriteList([])
  }
}
```

**변환 포인트**:
- `mb_id` → `member_id` (UUID), `is_favorite=true` 필터 추가
- **임베디드 JOIN**: `kindergarten:kindergartens(...)` 구문으로 유치원 정보를 한 번에 가져옴
- `partner` → `kindergarten` (용어 변환)
- 응답 구조: `data[].kindergarten.name`, `data[].kindergarten.photo_urls` 등 중첩 객체

**응답 매핑**:

| PHP 응답 필드 | Supabase 응답 필드 | 변환 필요 |
|---|---|---|
| `data[].wr_subject` | `data[].kindergarten.name` | 예 — 중첩 + 키 이름 |
| `data[].wr_content` | `data[].kindergarten.description` | 예 — 중첩 + 키 이름 |
| `data[].partner_img1` | `data[].kindergarten.photo_urls[0]` | 예 — 중첩 + 배열 |
| `data[].business_status` | `data[].kindergarten.business_status` | 예 — 중첩 |

---

### API #66. scheduler.php → Edge Function `scheduler`

**전환 방식**: Edge Function | **난이도**: 상
**Supabase 대응**: Edge Function `scheduler` (pg_cron 또는 외부 cron 트리거 — 앱에서 직접 호출하지 않음)

**Before**:
```
# 기존: 서버 crontab에 등록된 PHP 스크립트
*/5 * * * * php /var/www/html/api/scheduler.php
# → MariaDB의 payment_request 테이블에서 상태 변경 대상 조회
# → 등원/하원 30분 전 알림, 돌봄 시작/종료 자동 처리
# → FCM 푸시 발송 (PHP Firebase Admin SDK)
```

**After**:
```sql
-- 방법 1: Supabase pg_cron (권장)
SELECT cron.schedule(
  'scheduler-every-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/scheduler',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
```

```bash
# 방법 2: 외부 cron (pg_cron 미사용 시)
*/5 * * * * curl -X POST \
  https://<project-ref>.supabase.co/functions/v1/scheduler \
  -H "Authorization: Bearer <service_role_key>" \
  -H "Content-Type: application/json"
```

**변환 포인트**:
- **앱 코드 변경 없음**: `scheduler`는 서버 측에서만 실행되므로 앱 코드 수정이 필요 없습니다
- **PHP cron → pg_cron/외부 cron**: 서버 crontab 설정 → Supabase pg_cron 또는 외부 cron 서비스로 변경
- **테이블명 변경**: `payment_request` → `reservations`, `inicis_payments` → `payments`
- **알림 중복 방지**: `reminder_start_sent_at`, `reminder_end_sent_at`, `care_start_sent_at`, `care_end_sent_at` 타임스탬프 컬럼으로 발송 이력 관리 (IS NULL 조건 → 미발송 건만 대상)
- **FCM 발송**: PHP Firebase Admin SDK → `send-push` Edge Function 내부 호출
- **시스템 메시지**: PHP에서 MariaDB INSERT → Supabase `chat_messages` INSERT + Realtime 자동 전파
- **자동 완료**: `auto_complete_scheduled_at` 컬럼 도달 시 양측 미확인 예약 자동 완료 (`status='돌봄완료'`)

---

## 부록: Storage 업로드 공통 패턴

> 여러 API에서 반복적으로 사용하는 Storage 업로드 패턴입니다.

```typescript
// 파일: utils/uploadImage.ts (신규 생성 — 공통 유틸)
import { supabase } from '@/lib/supabase'

/**
 * Supabase Storage에 이미지를 업로드하고 공개 URL을 반환
 * 여러 API에서 공통으로 사용 (#6, #7, #13, #14, #21, #45)
 *
 * @param bucket  Storage 버킷명 (예: 'pet-images')
 * @param path    저장 경로 (예: '{userId}/{timestamp}.jpg')
 * @param fileUri 로컬 이미지 URI (React Native file URI)
 * @param contentType MIME 타입 (기본값: 'image/jpeg')
 * @returns 공개 URL 문자열 또는 null (실패 시)
 */
export const uploadImage = async (
  bucket: string,
  path: string,
  fileUri: string,
  contentType: string = 'image/jpeg'
): Promise<string | null> => {
  try {
    const response = await fetch(fileUri)
    const blob = await response.blob()

    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, blob, {
        contentType,
        upsert: false,
      })

    if (error) return null

    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(path)

    return publicUrl
  } catch {
    return null
  }
}

/**
 * 여러 이미지를 순차 업로드
 * @returns 성공한 URL 배열 (실패한 이미지는 건너뜀)
 */
export const uploadImages = async (
  bucket: string,
  userId: string,
  images: { uri: string }[],
  prefix: string = ''
): Promise<string[]> => {
  const urls: string[] = []
  for (let i = 0; i < images.length; i++) {
    const path = `${userId}/${prefix}${Date.now()}_${i}.jpg`
    const url = await uploadImage(bucket, path, images[i].uri)
    if (url) urls.push(url)
  }
  return urls
}
```

### 버킷 목록

| 버킷 | 용도 | 사용 API |
|------|------|---------|
| `profile-images` | 프로필 이미지 | #6 |
| `pet-images` | 반려동물 이미지 | #13, #14 |
| `kindergarten-images` | 유치원 이미지 | #21 |
| `chat-files` | 채팅 파일/이미지 | #25 |
| `review-images` | 후기 이미지 | #45 |
| `address-docs` | 주소 인증 서류 | #7 |

---

## 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-04-17 | 초안 — 66개 API 전체 플레이스홀더 확정, 번호 체계 `MIGRATION_PLAN.md §5`와 동기화 |
| 2026-04-17 | 리뷰 반영 — R4: 즐겨찾기 #46~#49 전환방식 수정 (DELETE→UPDATE is_favorite=false, INSERT→UPSERT is_favorite=true) |
| 2026-04-17 | **R1 본문 작성** — §1 인증/회원 (#1~#6) Before/After 코드 + 응답 매핑 + §2 주소 인증 (#7~#8) Before/After 코드 + 응답 매핑. 총 8개 API 전환 코드 완성 |
| 2026-04-17 | **R1 리뷰 반영 (Issue 2~8)** — §1 #4~#6 선행 작성 사유 노트 추가(Issue 3), #3 `convertBirthDate` 유틸 추가+params 변환 반영(Issue 4), #3 `convertGender` 유틸+CHECK 제약 명시+upsert 변환 적용 반영(Issue 5), #8 카카오 REST API 키 보안 경고 강조 박스 추가(Issue 6) |
| 2026-04-17 | **R2 본문 작성** — §3 반려동물 (#9~#16) 8개 API Before/After 코드 + 응답 매핑, §4 유치원 프로필 (#21) 코드, §5 채팅 자동 API (#24, #26~#29) 5개 코드, 채팅 템플릿 (#30~#33) 4개 코드, §6 돌봄 후기 (#40) 코드, §7 정산 (#42~#43) 2개 코드, §8 리뷰 (#45) 코드, §13 기타 (#62~#65) 4개 코드, 부록 Storage 공통 유틸 작성. 총 R2에서 26개 API 코드 완성 |
| 2026-04-17 | **R2 리뷰 반영 (Issue 1~3)** — Issue 1: #21 가격 컬럼 `price_*_add` 3개 → `price_*_24h` + `price_*_pickup` 6개로 교정 (총 12개 컬럼 정확 반영), Issue 2: #11 RLS 안내 명확화 (본인 전용 API, 타인 반려동물은 RPC `app_get_guardian_detail` 사용 안내), Issue 3: #10 `!inner` JOIN → 별도 2회 조회 패턴 교정 (찜하지 않은 반려동물 조회 실패 방지) |
| 2026-04-18 | **R3 본문 작성** — §4 유치원/보호자 RPC (#17~#20) 4개 API Before/After 코드 + 응답 매핑 (유치원 상세: prices 중첩객체·review_count 실제값·금융정보 제외, 유치원 목록: 거리순+safety cap, 보호자 상세: 반려동물별 찜·주소 비대칭, 보호자 목록: pet_thumbnails), §6 예약 RPC (#37~#38) 2개 API (보호자/유치원 2개 RPC 분기·LATERAL JOIN 결제·refunds 분리), §7 정산 RPC (#41) 1개 API (2개 PHP 통합·4파트 구조·날짜 검증), §8 리뷰 RPC (#44, #44b) 2개 API (태그 집계 7개·is_guardian_only 분기), §13 교육 RPC (#61) 1개 API (topics+quiz+completion 통합·기본값 자동). 총 R3에서 10개 API 코드 완성 |
| 2026-04-18 | **R4 본문 작성** — §5 채팅 (#22 create_room RPC: SECURITY DEFINER·중복방지·방복원, #23 get_rooms RPC: 미읽음 서브쿼리·상대방 프로필·ChatRoom 인터페이스, #25 send_message Edge Function: 텍스트/이미지 전송·Realtime 구독/해제·postgres_changes 콜백·WebSocket 코드 제거). #28·#29 FK 교정 (room_id → chat_room_id, sql/41_08 스키마와 동기화). 총 R4에서 3개 API 코드 완성 + 2개 기존 코드 교정 |
| 2026-04-18 | **R4 리뷰 반영 (Issue 4)** — #23 변환 포인트의 미읽음 서브쿼리 설명 교정: `id > last_read_message_id` UUID 비교 → `created_at > (서브쿼리)` 타임스탬프 비교로 변경 + UUID v4 순서 미보장 경고 추가 |
| 2026-04-18 | **R5 본문 작성** — §6 결제/돌봄 (#34 inicis-callback: WebView P_RETURN_URL 변경·P_NOTI 파라미터 매핑·onMessage 응답 정규화·payment_id 추가, #35 set_inicis_approval 삭제: saveInicisApproval 함수 전체 제거·inicis-callback 내부 흡수·3단계→1단계 축소, #36 create-reservation: FormData→JSON body·날짜 ISO 8601 통합·price 파라미터 제거(변조 방지)·생성/업데이트 모드 통합·부가처리 원자적 통합, #39 complete-care: 양측 하원 확인 로직·both_confirmed 상세 응답·EF 내부 시스템 메시지+FCM), §13 기타 (#66 scheduler: PHP cron→pg_cron 전환·테이블명 변경·알림 중복 방지 컬럼 설명·자동 완료 로직). 총 R5에서 4개 API 코드 완성 + 1개 변환 포인트 완성 |
