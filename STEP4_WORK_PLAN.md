# Step 4 작업계획서: Edge Functions + RPC 구현

> **최종 업데이트**: 2026-04-19 (Step 4 전체 완료 — R1~R5 구현·배포 + R6 크로스체크 PASS, Step 3 가이드 정합성 검증 완료)
> **작업 브랜치**: `genspark_ai_developer`
> **PR 대상**: `develop`

---

## 1. 개요

### 1-1. 목표

앱에서 직접 처리할 수 없는 **서버 사이드 로직**을 Supabase Edge Functions(Deno TypeScript)와 추가 RPC(PostgreSQL)로 구현한다.

### 1-2. 산출물

| 유형 | 파일 수 | 위치 | 형태 |
|------|---------|------|------|
| Edge Function | 7개 | `supabase/functions/{name}/index.ts` | Deno TypeScript (배포 가능 코드) |
| RPC SQL | 3개 | `sql/44_13~15_*.sql` | PostgreSQL DDL (Supabase SQL Editor 실행용) |
| 공통 유틸 | 2~3개 | `supabase/functions/_shared/` | FCM 헬퍼, Supabase 클라이언트, 응답 포맷 |

### 1-3. 전체 항목 (10개)

| # | 기능 | 유형 | 난이도 | 의존 | 상태 |
|---|------|------|--------|------|------|
| 4-6 | `send-push` (FCM 푸시) | EF | 중 | — (기반 모듈) | ✅ R1 배포 완료 |
| 4-5 | `send-alimtalk` (카카오 알림톡) | EF | 중 | — | ✅ R1 배포 완료 |
| 4-10 | `app_get_blocked_list` (차단 목록) | RPC | 하 | — | ✅ R1 SQL 실행 완료 |
| 4-8 | `app_create_chat_room` (채팅방 생성) | RPC | 상 | — | ✅ R2 구현 완료 |
| 4-9 | `app_get_chat_rooms` (채팅방 목록) | RPC | 상 | 4-8 | ✅ R2 구현 완료 |
| 4-2 | `send-chat-message` (채팅 메시지) | EF | 상 | 4-6 | ✅ R3 배포 완료 |
| 4-1 | `inicis-callback` (결제 콜백) | EF | 상 | — | ✅ R4 배포 완료 |
| 4-3 | `create-reservation` (예약 생성) | EF | 상 | 4-6, 4-8 | ✅ R4 배포 완료 |
| 4-4 | `complete-care` (돌봄 완료) | EF | 중 | 4-6 | ✅ R4 배포 완료 |
| 4-7 | `scheduler` (자동 상태 변경) | EF | 상 | 4-6, 4-4 | ✅ R5 구현 완료 |

---

## 2. 라운드 분할

### R1: 기반 모듈 + 독립 RPC (3개)

**목표**: 모든 EF가 의존하는 `send-push`를 먼저 구현하고, 독립적인 `send-alimtalk`과 `app_get_blocked_list`를 완료한다.

| 순서 | # | 기능 | 유형 | 산출물 |
|------|---|------|------|--------|
| 1 | 4-6 | `send-push` | EF | `supabase/functions/send-push/index.ts` + `_shared/fcm.ts` + `_shared/supabase.ts` + `_shared/response.ts` |
| 2 | 4-5 | `send-alimtalk` | EF | `supabase/functions/send-alimtalk/index.ts` |
| 3 | 4-10 | `app_get_blocked_list` | RPC | `sql/44_13_app_rpc_get_blocked_list.sql` |

**R1 완료 기준**: ✅ **전항 충족 (2026-04-18 구현 + 배포 완료)**
- `send-push`: ✅ FCM v1 HTTP API 멀티캐스트 발송 + 만료 토큰 정리 + `notifications` INSERT
- `send-alimtalk`: ✅ Supabase Auth SMS 훅 (standardwebhooks 서명 검증) + 루나소프트 API 호출
- `app_get_blocked_list`: ✅ SECURITY DEFINER + internal VIEW JOIN + 플랫 구조 반환

**R1 배포 기록** (2026-04-18):
- `send-push` EF: `supabase functions deploy send-push` 배포 완료
- `send-alimtalk` EF: `supabase functions deploy send-alimtalk --no-verify-jwt` 배포 완료
- `send-alimtalk` Auth Hook: Supabase Dashboard > Auth > Hooks > Send SMS Hook HTTPS 등록 완료
- `AUTH_WEBHOOK_SECRET`: `supabase secrets set` 등록 완료
- `44_13_app_rpc_get_blocked_list.sql`: Supabase SQL Editor 실행 완료
- 배포 환경: Supabase CLI (Windows PowerShell, scoop), `supabase link --project-ref ieeodlkvfnjikdpcumfa`

### R2: 채팅 RPC (2개)

**목표**: 채팅 시스템의 DB 레벨 로직(방 생성, 방 목록)을 RPC로 구현한다.

| 순서 | # | 기능 | 유형 | 산출물 |
|------|---|------|------|--------|
| 1 | 4-8 | `app_create_chat_room` | RPC | `sql/44_14_app_rpc_create_chat_room.sql` |
| 2 | 4-9 | `app_get_chat_rooms` | RPC | `sql/44_15_app_rpc_get_chat_rooms.sql` |

**R2 완료 기준**: ✅ **전항 충족 (2026-04-18 구현 완료, 2026-04-18 UNIQUE 제약 반영)**
- `app_create_chat_room`: ✅ SECURITY DEFINER + guardian_id/kindergarten_id 중복 방 검사 + 비활성 방 복원 + `chat_room_members` 2건 INSERT + race condition(unique_violation) 처리 + **`chat_rooms` UNIQUE(guardian_id, kindergarten_id) 제약 추가 (44_14 파일 내 ALTER TABLE)**
- `app_get_chat_rooms`: ✅ 미읽음 카운트(`created_at` 타임스탬프 비교, UUID v4 비교 금지) + 상대방 프로필(chat_rooms FK → kindergartens.member_id → internal VIEW, chat_room_members RLS 우회) + `reservation_count` + `last_message_type` 서브쿼리

**R2 주요 설계 결정**:
- `app_create_chat_room`: 역할 판별은 `members.current_mode`로 수행, guardian_id는 보호자 members.id, kindergarten_id는 kindergartens.id(FK)
- `app_get_chat_rooms`: SECURITY INVOKER 유지 — `chat_room_members` RLS가 상대방 행을 차단하므로 `chat_rooms.guardian_id/kindergarten_id` + `kindergartens.member_id`로 상대방 도출
- `last_message_type`: chat_rooms 테이블에 컬럼 부재 → chat_messages 서브쿼리로 가장 최근 비시스템 메시지의 message_type 조회 (영문 10종: text/image/file/reservation_request/reservation_confirmed/reservation_rejected/reservation_cancelled/care_start/care_end/review)

### R3: 채팅 EF (1개)

**목표**: `send-chat-message` Edge Function을 구현한다. R1의 `send-push`와 R2의 RPC를 활용한다.

| 순서 | # | 기능 | 유형 | 산출물 |
|------|---|------|------|--------|
| 1 | 4-2 | `send-chat-message` | EF | `supabase/functions/send-chat-message/index.ts` |

**R3 완료 기준**: ✅ **전항 충족 (2026-04-19 구현 완료, 2026-04-19 배포 완료)**
- 텍스트/이미지/파일 메시지 전송
- Storage 업로드 (`chat-files/{room_id}/{msg_id}/`)
- `chat_messages` INSERT + `chat_rooms` UPDATE
- `send-push` 내부 호출 (`await` + `try/catch`, is_muted 체크)
- `notifications` INSERT
- `message_type` 영문 8종 DB 직접 저장 (`MESSAGE_TYPE_MAP` 제거)
- `file` 타입 미리보기 분기 (`'동영상을 보냈습니다.'`)

**R3 배포 기록** (2026-04-19):
- `send-chat-message` EF: `supabase functions deploy send-chat-message` 배포 완료
- `sql/45_01_chat_messages_type_migration.sql`: Supabase SQL Editor 실행 완료 (한글→영문 CHECK 제약 전환)

### R4: 결제/돌봄 (3개)

**목표**: 결제 콜백, 예약 생성, 돌봄 완료를 구현한다. 가장 복잡한 비즈니스 로직.

| 순서 | # | 기능 | 유형 | 산출물 |
|------|---|------|------|--------|
| 1 | 4-1 | `inicis-callback` | EF | `supabase/functions/inicis-callback/index.ts` |
| 2 | 4-3 | `create-reservation` | EF | `supabase/functions/create-reservation/index.ts` |
| 3 | 4-4 | `complete-care` | EF | `supabase/functions/complete-care/index.ts` |

**R4 완료 기준**: ✅ **전항 충족 (2026-04-19 구현 완료, 2026-04-19 배포 완료)**
- `inicis-callback`: ✅ PG POST 수신 + `payments` UPSERT + `raw_response` jsonb 저장 + `parseAuthDt()` 헬퍼로 `paid_at` ISO+09:00 변환 + HTML postMessage 반환 + `INICIS_MID` 검증 (JWT 없음, `--no-verify-jwt`)
- `create-reservation`: ✅ 예약 INSERT (`status='수락대기'`) + 채팅방 자동생성 (`findOrCreateChatRoom`) + 시스템 메시지 10종 (`reservation_request`/`reservation_confirmed`/`reservation_rejected`/`reservation_cancelled`) + FCM (생성/상태변경 통합) + 동적 `dbStatus` 매핑 (`'거절'→'유치원거절'`, `'취소'→isGuardian?'보호자취소':'유치원취소'`) + `ALLOWED_TRANSITIONS` 상태 전이 검증
- `complete-care`: ✅ 양측 하원 확인 로직 + 시스템 메시지 (`care_end`/`review`) + FCM + `auto_complete_scheduled_at` 24h 설정 + `SYSTEM_MESSAGE_PREVIEW` 맵 + `total_message_count` 증분

**R4 배포 기록** (2026-04-19):
- `inicis-callback` EF: `supabase functions deploy inicis-callback --no-verify-jwt` 배포 완료
- `create-reservation` EF: `supabase functions deploy create-reservation` 배포 완료
- `complete-care` EF: `supabase functions deploy complete-care` 배포 완료
- `sql/46_01_r4_schema_updates.sql`: Supabase SQL Editor 실행 완료 (`payments.raw_response` jsonb 컬럼 추가 + `chat_messages.message_type` CHECK 8→10종 확장: `reservation_rejected`, `reservation_cancelled` 추가)

**R4 주요 설계 결정**:
- **inicis-callback**: JWT 없음 (`--no-verify-jwt`). `P_MID` = `INICIS_MID` env 검증으로 인증 대체. `parseAuthDt()` 헬퍼가 이니시스 `P_AUTH_DT` (yyyyMMddHHmmss) → ISO 8601 +09:00 변환. `raw_response` jsonb로 PG 원본 응답 전체 보존
- **create-reservation**: 생성/업데이트 통합 EF (`reservation_id` 유무로 분기). API 파라미터 `'거절'`/`'취소'`는 EF 내부에서 DB 값으로 동적 매핑 — `'거절'→'유치원거절'`, `'취소'→isGuardian?'보호자취소':'유치원취소'`. `ALLOWED_TRANSITIONS` 맵으로 상태 전이 유효성 검증 (예: `'수락대기'→['예약확정','유치원거절','보호자취소','유치원취소']`). 위약금/환불 로직은 TODO (GUIDE.md §15-4 참조)
- **complete-care**: `auth.uid()`로 호출자 역할 자동 판별. 양측 확인 시에만 `'돌봄완료'` 전환, 한쪽만 확인 시 `auto_complete_scheduled_at` = 24h 후 설정
- **공통**: `insertSystemMessage` 헬퍼에서 `total_message_count` 증분 + `SYSTEM_MESSAGE_PREVIEW` 맵 (7종 한글 미리보기) 적용 (create-reservation, complete-care 양쪽)

### R5: 스케줄러 (1개)

**목표**: 마지막으로 전체 시스템을 아우르는 스케줄러를 구현한다.

| 순서 | # | 기능 | 유형 | 산출물 |
|------|---|------|------|--------|
| 1 | 4-7 | `scheduler` | EF | `supabase/functions/scheduler/index.ts` |

**R5 완료 기준**: ✅ **전항 충족 (2026-04-19 구현 완료)**
- 등원/하원 30분 전 알림: ✅ Task 1, 2 — `reminder_start_sent_at`/`reminder_end_sent_at` IS NULL + CAS-style UPDATE + 보호자/유치원 양쪽 FCM
- 돌봄 시작/종료 시점 시스템 메시지 + Realtime: ✅ Task 3 (`care_start` 시스템 메시지 + status→'돌봄진행중'), Task 4 (`care_end` + `review` 시스템 메시지 + FCM)
- `auto_complete_scheduled_at` 도달 시 자동 완료: ✅ Task 5 — status='돌봄진행중'→'돌봄완료' + checkout_actual=NOW() + FCM
- `scheduler_history` 기록: ✅ 시작/완료 시각 + result jsonb (5개 Task별 처리/에러 카운트, duration_ms)
- pg_cron 또는 외부 cron 연동 가이드: ✅ GUIDE.md §16-8 참조 (pg_cron SQL + 외부 cron curl 예시)
- **배포 완료**: ✅ `supabase functions deploy scheduler --no-verify-jwt` (2026-04-19)
- **pg_cron + pg_net 확장 활성화**: ✅ Dashboard > Database > Extensions 에서 활성화 완료
- **`sql/47_01_scheduler_cron_setup.sql` 실행 완료**: ✅ Vault 방식 시크릿 관리 (project_url + service_role_key)
- **cron Job 등록 확인**: ✅ `scheduler-every-5min`, `*/5 * * * *`, `active=true` (jobid=1)
- **실행 확인**: ✅ `scheduler_history` 테이블에 정상 실행 기록 확인 (total_processed=3, total_errors=0, duration_ms=4991)

**R5 주요 설계 결정**:
- **배포 방식**: `--no-verify-jwt` (pg_cron이 service_role_key로 호출)
- **중복 방지**: CAS-style UPDATE (`*_sent_at IS NULL` 조건 + `.select('id')` 반환값 체크) — 다중 인스턴스 경합 방지
- **Task 실행 순서**: PHP 원본(scheduler.php)과 동일 — 등원 알림 → 하원 알림 → 돌봄 시작 → 돌봄 종료 → 자동 완료
- **Task 3 (돌봄 시작)**: status='예약확정'→'돌봄진행중' + `checkin_actual=NOW()` 자동 설정. PHP 원본에서 WebSocket 발송하던 부분은 Supabase Realtime이 `chat_messages` INSERT를 자동 전파하므로 불필요
- **Task 4 (돌봄 종료)**: PHP 원본과 달리 `status` 변경 없음 — 양측 하원 확인은 `complete-care` EF로 위임. `auto_complete_scheduled_at` 미설정 시 24시간 후 자동 설정
- **Task 5 (자동 완료)**: `auto_complete_scheduled_at ≤ NOW()` 조건. complete-care에서 한쪽 확인 시 설정된 값 또는 Task 4에서 설정된 값 사용
- **공통 헬퍼**: `insertSystemMessage` (C11 total_message_count + C12 SYSTEM_MESSAGE_PREVIEW), `callSendPush` (send-push EF 내부 호출), `getChatRoomId`, `getKgMemberId` — complete-care와 동일 패턴

### R6: 크로스체크

**목표**: Step 4 전체 산출물과 Step 3 문서(GUIDE.md, CODE.md)의 정합성을 검증한다.

| 점검 항목 | 대상 |
|-----------|------|
| 함수명 일치 | EF 7개 함수명 ↔ CODE.md `supabase.functions.invoke()` 호출명 |
| RPC명 일치 | RPC 3개 함수명 ↔ CODE.md `supabase.rpc()` 호출명 |
| 입력 파라미터 일치 | EF/RPC 입력 ↔ CODE.md body/params |
| 출력 구조 일치 | EF/RPC 응답 JSON ↔ CODE.md 응답 매핑 테이블 |
| 에러 코드/메시지 | EF 에러 응답 ↔ CODE.md 에러 처리 패턴 |
| GUIDE.md 설계 부합 | §14 채팅, §15 결제, §16 EF 인터페이스 |
| MIGRATION_PLAN.md §7-2 | 상세 설계 입출력 일치 |

---

## 3. 코드 작성 규칙

### 3-1. Edge Function 표준 구조

```typescript
// supabase/functions/{function-name}/index.ts

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, jsonResponse, errorResponse } from '../_shared/response.ts'

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Supabase 클라이언트 (서비스 역할)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // 2. JWT에서 사용자 추출 (인증 필요한 EF)
    const authHeader = req.headers.get('Authorization')!
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (authError || !user) {
      return errorResponse('인증이 필요합니다', 401)
    }

    // 3. 요청 파싱
    const body = await req.json()

    // 4. 비즈니스 로직
    // ...

    // 5. 성공 응답
    return jsonResponse({ success: true, data: { ... } })

  } catch (error) {
    console.error(`[{function-name}] Error:`, error)
    return errorResponse(error.message ?? '서버 오류가 발생했습니다', 500)
  }
})
```

### 3-2. 공통 유틸 (`_shared/`)

#### `_shared/response.ts` — 응답 포맷 통일

```typescript
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

export function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

export function errorResponse(message: string, status = 400) {
  return new Response(
    JSON.stringify({ success: false, error: message }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
}
```

#### `_shared/supabase.ts` — Supabase 클라이언트 팩토리

```typescript
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

// 서비스 역할 클라이언트 (RLS 무시)
export function createAdminClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}

// 사용자 역할 클라이언트 (RLS 적용)
export function createUserClient(authHeader: string): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
}
```

#### `_shared/fcm.ts` — FCM 푸시 헬퍼

```typescript
// Firebase Admin SDK (Deno 호환) 사용
// Google OAuth2 토큰 → FCM v1 HTTP API 호출
// 만료/무효 토큰 자동 정리 (fcm_tokens DELETE)
```

### 3-3. RPC SQL 표준 구조

기존 `sql/44_01~44_12` 패턴을 **그대로** 따른다:

```sql
-- ============================================================
-- SQL 44-XX: {함수명} RPC 함수
-- ============================================================
-- 실행 방법: Supabase SQL Editor에 전체 복사하여 실행
-- 원본 PHP: {원본 파일명}
-- 용도: {한줄 설명}
-- 보안: SECURITY INVOKER | SECURITY DEFINER
-- ============================================================
--
-- [사전 조건]
--   (필요 시)
--
-- [PHP 원본 로직]
--   (요약)
--
-- [Supabase 전환]
--   (요약)
--
-- [RLS 영향 분석]
--   (테이블별 정책 통과 여부)
-- ============================================================

DROP FUNCTION IF EXISTS public.{함수명}({파라미터 시그니처});

CREATE OR REPLACE FUNCTION public.{함수명}(
  -- 파라미터
)
RETURNS json
LANGUAGE plpgsql
STABLE | VOLATILE
SECURITY INVOKER | SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- 변수
BEGIN
  -- 인증 확인
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('success', false, 'error', '인증이 필요합니다');
  END IF;

  -- 비즈니스 로직
  -- ...

  -- 성공 반환
  RETURN json_build_object(
    'success', true,
    'data', json_build_object(...)
  );

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;

-- 권한 설정
ALTER FUNCTION public.{함수명}({시그니처}) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.{함수명}({시그니처}) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.{함수명}({시그니처}) FROM anon;

-- 함수 설명
COMMENT ON FUNCTION public.{함수명}({시그니처}) IS '{설명}';

-- 확인 메시지
DO $$
BEGIN
  RAISE NOTICE '[44-XX] {함수명} 함수 생성 완료';
  RAISE NOTICE '  - 인자: ...';
  RAISE NOTICE '  - 반환: json {success, data: {...}}';
  RAISE NOTICE '  - 보안: ...';
END $$;
```

### 3-4. 네이밍 규칙

| 대상 | 규칙 | 예시 |
|------|------|------|
| Edge Function 디렉토리명 | kebab-case | `send-push`, `inicis-callback` |
| RPC 함수명 | snake_case, `app_` 접두사 | `app_create_chat_room` |
| RPC 파라미터 | snake_case, `p_` 접두사 | `p_target_member_id` |
| SQL 파일명 | `44_{번호}_{설명}.sql` | `sql/44_13_app_rpc_get_blocked_list.sql` |
| TypeScript 변수 | camelCase | `chatRoomId`, `senderId` |
| 상수 | UPPER_SNAKE_CASE | `SUPABASE_URL`, `FCM_ENDPOINT` |

### 3-5. 응답 형식 통일

#### Edge Function 성공 응답

```json
{
  "success": true,
  "data": { /* 결과 데이터 */ }
}
```

#### Edge Function 에러 응답

```json
{
  "success": false,
  "error": "에러 메시지 (한글)"
}
```

#### RPC 성공 응답

```json
{
  "success": true,
  "data": { /* 결과 데이터 */ }
}
```

#### RPC 에러 응답

```json
{
  "success": false,
  "error": "에러 메시지"
}
```

> **중요**: 이 응답 형식은 Step 3 CODE.md에서 앱 측 코드가 `data?.success` / `data?.error`로 체크하는 패턴과 **반드시 일치**해야 한다.

### 3-6. 보안 원칙

| 원칙 | 적용 |
|------|------|
| JWT 검증 | 모든 EF에서 `Authorization` 헤더 → `supabaseAdmin.auth.getUser()` |
| 예외: inicis-callback | PG사가 호출하므로 JWT 없음 → `INICIS_MID` 검증 |
| RPC SECURITY INVOKER | 기본 원칙 (RLS 자동 적용) |
| RPC SECURITY DEFINER | 4-8(`app_create_chat_room`)만 — `chat_room_members` INSERT RLS 부재 |
| 서비스 역할 키 | EF 내부에서만 사용 (`SUPABASE_SERVICE_ROLE_KEY`), 앱에 노출 금지 |
| Secrets 참조 | `Deno.env.get('SECRET_NAME')` — 코드에 하드코딩 금지 |

### 3-7. Supabase Secrets (등록 완료)

| Secret | 사용처 |
|--------|--------|
| `KAKAO_ALIMTALK_API_KEY` | send-alimtalk |
| `KAKAO_ALIMTALK_USER_ID` | send-alimtalk |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | send-push, send-chat-message, create-reservation, complete-care, scheduler |
| `INICIS_MID` | inicis-callback |
| `AUTH_WEBHOOK_SECRET` | send-alimtalk (Supabase Auth SMS Hook 서명 검증용) |

> `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`는 Supabase가 기본 제공.
> ⚠️ Supabase CLI는 `SUPABASE_` 접두사 Secret 등록을 차단하므로, Webhook Secret은 `AUTH_WEBHOOK_SECRET` 이름으로 등록.

---

## 4. Step 3 인터페이스 정합성 체크리스트

Step 4에서 구현하는 서버 코드의 입출력은 Step 3 CODE.md에서 약속한 인터페이스와 **반드시 일치**해야 한다. 각 라운드 완료 시 아래 항목을 확인한다.

### 4-1. Edge Function 인터페이스 (CODE.md 기준)

#### `send-push` (4-6)
- **CODE.md 참조**: 직접 호출하는 앱 코드 없음 (내부 호출 전용)
- **GUIDE.md §16**: 입력 `member_id(s)`, `title`, `body`, `data`
- **출력**: `{ success, data: { sent_count, failed_count } }`

#### `send-alimtalk` (4-5)
- **CODE.md #1**: 앱에서 직접 호출 없음 — Supabase Auth SMS 훅으로 동작
- **GUIDE.md §1-2**: `signInWithOtp({ phone })` 호출 시 Supabase Auth가 내부적으로 호출
- **입력**: Supabase Auth가 전달하는 phone + OTP
- **출력**: SMS 발송 결과 (Auth 훅 규격)

#### `send-chat-message` (4-2)
- **CODE.md #25**: `supabase.functions.invoke('send-chat-message', { body })`
- **입력**: `{ room_id: UUID, content: string, message_type: 'text'|'image'|'file', image_files?: File[] }` (DB에는 영문 8종 저장, 사용자 전송용 3종)
- **출력**: `{ success: true, data: { message_id: UUID, image_urls?: string[] } }` 또는 `{ success: false, error: string }`

#### `inicis-callback` (4-1)
- **CODE.md #34**: PG사가 POST로 직접 호출 (앱 호출 아님)
- **입력**: 이니시스 POST 파라미터 (`P_STATUS`, `P_OID`, `P_TID`, `P_AMT`, `P_NOTI` 등)
- **출력**: HTML 페이지 (ReactNativeWebView.postMessage 포함)
  ```json
  { "result": "Y"|"N", "payment_id": "UUID", "pg_transaction_id": "string", "amount": number, "message": "string" }
  ```

#### `create-reservation` (4-3)
- **CODE.md #36**: `supabase.functions.invoke('create-reservation', { body })`
- **생성 모드 입력**: `{ kindergarten_id, pet_id, checkin_scheduled, checkout_scheduled, walk_count, pickup_requested, payment_id, room_id? }`
- **업데이트 모드 입력**: `{ reservation_id, status, reject_reason?, reject_detail?, cancel_reason? }`
- **출력**: `{ success: true, data: { reservation_id: UUID, room_id: UUID, status: string } }`

#### `complete-care` (4-4)
- **CODE.md #39**: `supabase.functions.invoke('complete-care', { body: { reservation_id } })`
- **입력**: `{ reservation_id: UUID }`
- **출력**:
  ```json
  {
    "success": true,
    "data": {
      "status": "돌봄완료" | "돌봄진행중",
      "both_confirmed": boolean,
      "guardian_checkout_confirmed": boolean,
      "kg_checkout_confirmed": boolean
    }
  }
  ```

#### `scheduler` (4-7)
- **CODE.md 참조**: 앱에서 직접 호출 없음 (cron 트리거)
- **MIGRATION_PLAN.md §7-2-7**: 5분 간격 실행
- **출력**: `scheduler_history` 기록 (내부 처리)

### 4-2. RPC 인터페이스 (CODE.md 기준)

#### `app_get_blocked_list` (4-10)
- **CODE.md #60**: `supabase.rpc('app_get_blocked_list')` — 파라미터 없음
- **출력**: `{ success: true, data: [{ blocked_id, nickname, profile_image, blocked_at }] }`
- **보안**: SECURITY DEFINER + `internal.members_public_profile` VIEW

#### `app_create_chat_room` (4-8)
- **CODE.md #22**: `supabase.rpc('app_create_chat_room', { p_target_member_id: UUID })`
- **출력**: `{ success: true, data: { room_id: UUID, is_new: boolean } }`
- **보안**: SECURITY DEFINER (chat_room_members INSERT RLS 부재)

#### `app_get_chat_rooms` (4-9)
- **CODE.md #23**: `supabase.rpc('app_get_chat_rooms')` — 파라미터 없음
- **출력**:
  ```json
  {
    "success": true,
    "data": [{
      "room_id": "UUID",
      "status": "활성",
      "last_message": "string",
      "last_message_at": "timestamptz",
      "last_message_type": "string",
      "unread_count": 0,
      "is_muted": false,
      "opponent": {
        "id": "UUID",
        "nickname": "string",
        "profile_image": "string|null",
        "role": "보호자|유치원"
      },
      "reservation_count": 0
    }]
  }
  ```

---

## 5. 기술 제약사항 및 주의사항

### 5-1. 반드시 지켜야 할 사항

| # | 항목 | 상세 |
|---|------|------|
| ⚠️ 1 | **UUID v4 정렬 금지** | `app_get_chat_rooms`에서 미읽음 카운트 시 `cm.id > last_read_id` 비교 사용 금지. `cm.created_at > (last_read_message_id의 created_at 서브쿼리)` 타임스탬프 비교만 허용 |
| ⚠️ 2 | **SECURITY DEFINER 제한** | 4-8(`app_create_chat_room`)만 SECURITY DEFINER. `auth.uid() IS NOT NULL` + 본인 검증 수동 구현 필수. `chat_room_members`에 INSERT RLS가 **의도적으로 없음** |
| ⚠️ 6 | **chat_rooms UNIQUE 제약 필수** | `app_create_chat_room`의 race condition 처리(`EXCEPTION WHEN unique_violation`)는 `chat_rooms(guardian_id, kindergarten_id)` UNIQUE 제약에 의존. `sql/44_14_app_rpc_create_chat_room.sql` 상단에서 `ALTER TABLE`로 자동 추가됨. 이 제약이 없으면 동시 요청 시 중복 방 생성 가능 |
| ⚠️ 3 | **관리자 페이지 공존** | 같은 DB 사용. 테이블 구조 변경 시 관리자 JS 코드 영향 확인. 4-8 RPC의 `chat_room_members` INSERT가 관리자 페이지에 영향 없는지 확인 |
| ⚠️ 4 | **inicis-callback JWT 없음** | PG사가 호출하므로 `Authorization` 헤더 없음. `INICIS_MID` 검증 + `P_NOTI` JSON 파싱으로 인증 대체 |
| ⚠️ 5 | **Step 3 인터페이스 일치** | 섹션 4의 체크리스트 준수 필수. 함수명·파라미터명·응답 구조가 CODE.md와 불일치하면 외주 개발자 혼란 |

### 5-2. Deno 런타임 주의

| 항목 | 설명 |
|------|------|
| npm 패키지 | 직접 사용 불가. `esm.sh` CDN 경유 (`https://esm.sh/패키지명`) |
| Firebase Admin SDK | Deno 네이티브 없음. Google OAuth2 → FCM HTTP v1 API 직접 호출 또는 `esm.sh/firebase-admin` |
| 환경변수 | `Deno.env.get('KEY')` — `process.env` 사용 불가 |
| fetch | Deno 내장 `fetch` 사용 (node-fetch 불필요) |
| 타임존 | Supabase EF는 UTC 기본. 한국 시간 필요 시 `+09:00` 명시 |

### 5-3. 기존 RLS 정책 참조

| 테이블 | SELECT | INSERT | UPDATE | 비고 |
|--------|--------|--------|--------|------|
| `chat_rooms` | ✅ 참여자만 | — | ✅ 참여자만 | `chat_room_members` EXISTS 체크, **UNIQUE(guardian_id, kindergarten_id)** |
| `chat_room_members` | ✅ `member_id = auth.uid()` | ❌ **없음** (RPC 전용) | ✅ `member_id = auth.uid()` | INSERT는 SECURITY DEFINER RPC에서만 |
| `chat_messages` | ✅ 참여자만 | ✅ 참여자만 | — | |
| `chat_room_reservations` | ✅ 참여자만 | — | — | |
| `payments` | ✅ `member_id = auth.uid()` | ✅ `member_id = auth.uid()` | ✅ `member_id = auth.uid()` | |
| `reservations` | ✅ 본인 관련 | ✅ | ✅ | 보호자/유치원 양쪽 |
| `notifications` | ✅ `member_id = auth.uid()` | ✅ | ✅ | |
| `fcm_tokens` | ✅ `member_id = auth.uid()` | ✅ | ✅ | |
| `member_blocks` | ✅ `blocker_id = auth.uid()` | ✅ | — | |
| `scheduler_history` | ❌ 앱 접근 불가 | — | — | EF 전용 (서비스 역할 키) |

---

## 6. 레퍼런스 문서

각 라운드 작업 시 참조해야 할 문서:

| 문서 | 역할 | 핵심 참조 위치 |
|------|------|---------------|
| `APP_MIGRATION_CODE.md` | 앱 측 호출 코드 (입출력 인터페이스 확정) | #1, #22, #23, #25, #34, #35, #36, #39, #60 |
| `APP_MIGRATION_GUIDE.md` | 전환 가이드 (설계·처리흐름·입출력 스펙) | §14(채팅), §15(결제/돌봄), §16(EF 인터페이스), §1(인증) |
| `MIGRATION_PLAN.md` | 전체 설계서 | §7-2(EF 7개 상세 설계), §9-5(Secrets), Step 4 표 |
| `legacy_php_api_all.txt` | 원본 PHP 로직 (8,034줄) | `inicis_payment.php`(L3950), `set_care_complete.php`(L5103), `scheduler.php`(L7751), `chat.php` |
| `sql/44_00~44_12` | 기존 RPC 패턴 (SECURITY INVOKER 표준) | 44_10(정산 요약), 44_07(회원 탈퇴), 44_01(유치원 상세) |
| `sql/43_01_app_rls_policies.sql` | RLS 정책 전체 | chat 관련(L235~L300, L634~L650) |
| `sql/43_02_app_storage_policies.sql` | Storage 정책 | chat-files 버킷 |
| `DB_MAPPING_REFERENCE.md` | 테이블·컬럼 매핑 | payments, reservations, chat 테이블 컬럼 |
| `REVIEW_REPORT.md` | Step 3 검수 결과 | 치명/중요 이슈 수정 이력 |

---

## 7. 라운드별 프롬프트 템플릿

새 채팅방에서 각 라운드를 시작할 때 사용하는 프롬프트 템플릿:

```markdown
## Step 4 — R{N} 작업 요청

### 작업 대상
- {작업 항목 목록}

### 작업 규칙
1. **코드 작성 규칙**: `STEP4_WORK_PLAN.md` §3 준수
2. **인터페이스 정합성**: `STEP4_WORK_PLAN.md` §4 체크리스트 준수
3. **기술 제약사항**: `STEP4_WORK_PLAN.md` §5 준수

### 참조 문서 (반드시 읽기)
- `STEP4_WORK_PLAN.md` — 전체 작업계획 (§3 코드규칙, §4 인터페이스 체크리스트, §5 기술 제약)
- `APP_MIGRATION_CODE.md` — 앱 측 호출 코드 (해당 API # 확인)
- `APP_MIGRATION_GUIDE.md` — 전환 가이드 (해당 §섹션 확인)
- `MIGRATION_PLAN.md §7-2` — EF 상세 설계
- {라운드별 추가 참조}

### 산출물
- {파일 목록}

### 완료 기준
- {라운드별 완료 기준}

### 작업 흐름
1. 참조 문서 읽기 (STEP4_WORK_PLAN.md → CODE.md 해당 API → GUIDE.md 해당 섹션 → PHP 원본)
2. 코드 작성
3. Step 3 인터페이스 정합성 체크 (§4 체크리스트)
4. genspark_ai_developer 브랜치에 커밋·푸시 (PR은 요청 시에만)
```

### R1 프롬프트

```markdown
## Step 4 — R1 작업 요청: 기반 모듈 + 독립 RPC

### 작업 대상
1. **4-6 send-push** (FCM 푸시 발송 Edge Function)
2. **4-5 send-alimtalk** (카카오 알림톡 Edge Function — Supabase Auth SMS 훅)
3. **4-10 app_get_blocked_list** (차단 목록 RPC SQL)

### 참조 문서
- `STEP4_WORK_PLAN.md` §3~5 (코드 규칙, 인터페이스, 제약사항)
- `APP_MIGRATION_CODE.md` #1(send-alimtalk 앱 측), #60(app_get_blocked_list 앱 측)
- `APP_MIGRATION_GUIDE.md` §1-2(인증 전환), §7-2(#60 RLS 제약)
- `MIGRATION_PLAN.md` §7-2-5(send-alimtalk 설계), §7-2-6(send-push 설계), §9-5(Secrets)
- `sql/44_10_app_rpc_get_settlement_summary.sql` (RPC 패턴 참고)
- `sql/44_00_app_public_views.sql` (internal VIEW 패턴 참고)

### 산출물
1. `supabase/functions/_shared/response.ts`
2. `supabase/functions/_shared/supabase.ts`
3. `supabase/functions/_shared/fcm.ts`
4. `supabase/functions/send-push/index.ts`
5. `supabase/functions/send-alimtalk/index.ts`
6. `sql/44_13_app_rpc_get_blocked_list.sql`

### 완료 기준
- send-push: FCM v1 HTTP API 멀티캐스트 + 만료 토큰 정리 + notifications INSERT
- send-alimtalk: 루나소프트 API 호출 + Supabase Auth SMS 훅 형식
- app_get_blocked_list: SECURITY DEFINER + internal.members_public_profile JOIN
- 응답 형식: §3-5 통일 (success/error)

### 작업 브랜치: genspark_ai_developer (PR은 요청 시에만)
```

### R2 프롬프트

```markdown
## Step 4 — R2 작업 요청: 채팅 RPC

### 작업 대상
1. **4-8 app_create_chat_room** (채팅방 생성 RPC — SECURITY DEFINER)
2. **4-9 app_get_chat_rooms** (채팅방 목록 RPC)

### 참조 문서
- `STEP4_WORK_PLAN.md` §3~5
- `APP_MIGRATION_CODE.md` #22(app_create_chat_room 앱 측), #23(app_get_chat_rooms 앱 측)
- `APP_MIGRATION_GUIDE.md` §14-3(채팅방 생성), §14-4(채팅방 목록), §14-8(미읽음 카운트 — UUID v4 주의)
- `MIGRATION_PLAN.md` §7(Step 4 표 4-8, 4-9), §9-1(SECURITY DEFINER 예외 사유)
- `sql/43_01_app_rls_policies.sql` L634~L650 (chat_room_members RLS — INSERT 정책 없음)
- `sql/44_00_app_public_views.sql` (internal VIEW 패턴)
- R1 산출물: `sql/44_13_app_rpc_get_blocked_list.sql` (SECURITY DEFINER 패턴 참조)

### 산출물
1. `sql/44_14_app_rpc_create_chat_room.sql`
2. `sql/44_15_app_rpc_get_chat_rooms.sql`

### 핵심 주의사항
- ⚠️ app_create_chat_room: SECURITY DEFINER 유일 — auth.uid() IS NOT NULL + 본인 검증 수동 구현
- ⚠️ app_get_chat_rooms: 미읽음 카운트에서 UUID v4 직접 비교 금지 → created_at 타임스탬프 서브쿼리 비교
- ⚠️ chat_room_members INSERT RLS 없음 — RPC 내부에서만 INSERT

### 작업 브랜치: genspark_ai_developer (PR은 요청 시에만)
```

### R3 프롬프트

```markdown
## Step 4 — R3 작업 요청: 채팅 Edge Function

### 작업 대상
1. **4-2 send-chat-message** (채팅 메시지 전송 Edge Function)

### 참조 문서
- `STEP4_WORK_PLAN.md` §3~5
- `APP_MIGRATION_CODE.md` #25(send-chat-message 앱 측 — 텍스트/이미지 전송 + Realtime 구독)
- `APP_MIGRATION_GUIDE.md` §14-5(send-chat-message 처리흐름), §14-6(Realtime), §14-7(Storage 이미지)
- `MIGRATION_PLAN.md` §7-2-2(send-chat-message 설계)
- `sql/43_02_app_storage_policies.sql` (chat-files 버킷 정책)
- R1 산출물: `supabase/functions/_shared/` (공통 유틸), `send-push` (FCM 내부 호출)

### 산출물
1. `supabase/functions/send-chat-message/index.ts`

### 핵심 처리 흐름
1. JWT → sender_id 추출
2. chat_room_members 참여 검증
3. 파일 → Storage 업로드 (chat-files/{room_id}/{msg_id}/)
4. chat_messages INSERT
5. chat_rooms UPDATE (last_message, last_message_at, total_message_count +1)
6. 상대방 is_muted 체크 → FCM (send-push 호출)
7. notifications INSERT

### 작업 브랜치: genspark_ai_developer (PR은 요청 시에만)
```

### R4 프롬프트

```markdown
## Step 4 — R4 작업 요청: 결제/돌봄

### 작업 대상
1. **4-1 inicis-callback** (이니시스 결제 콜백 Edge Function)
2. **4-3 create-reservation** (예약 생성/상태변경 Edge Function)
3. **4-4 complete-care** (돌봄 완료 Edge Function)

### 참조 문서
- `STEP4_WORK_PLAN.md` §3~5
- `APP_MIGRATION_CODE.md` #34(inicis-callback), #35(inicis-callback 내부 흡수), #36(create-reservation), #39(complete-care)
- `APP_MIGRATION_GUIDE.md` §15-1~15-6(결제/예약 전환 전체)
- `MIGRATION_PLAN.md` §7-2-1(inicis-callback), §7-2-3(create-reservation), §7-2-4(complete-care)
- `legacy_php_api_all.txt` L3950(inicis_payment.php), L3825(set_inicis_approval.php), L5103(set_care_complete.php)
- R1 산출물: `send-push` (FCM 내부 호출)
- R2 산출물: `app_create_chat_room` (create-reservation에서 채팅방 자동생성 시 호출)

### 핵심 주의사항
- ⚠️ inicis-callback: JWT 없음 (PG사 직접 호출). INICIS_MID 검증. HTML postMessage 반환
- ⚠️ create-reservation: 생성 + 상태변경 통합 EF. reservation_id 유무로 모드 분기
- ⚠️ complete-care: 양측(보호자/유치원) 하원 확인 로직. auth.uid()로 호출자 역할 자동 판별

### 산출물
1. `supabase/functions/inicis-callback/index.ts`
2. `supabase/functions/create-reservation/index.ts`
3. `supabase/functions/complete-care/index.ts`

### 작업 브랜치: genspark_ai_developer (PR은 요청 시에만)
```

### R5 프롬프트

```markdown
## Step 4 — R5 작업 요청: 스케줄러

### 작업 대상
1. **4-7 scheduler** (자동 상태 변경 Edge Function)

### 참조 문서
- `STEP4_WORK_PLAN.md` §3~5
- `MIGRATION_PLAN.md` §7-2-7(scheduler 설계)
- `APP_MIGRATION_GUIDE.md` §15-5(돌봄 완료 — auto_complete_scheduled_at)
- `legacy_php_api_all.txt` L7751(scheduler.php 원본 — 전체 로직)
- `sql/42_03_reservations_add_scheduler_columns.sql` (scheduler 컬럼: reminder_start_sent_at 등 4개 + partial index)
- `sql/41_09_app_scheduler_history.sql` (scheduler_history 테이블)
- R1 산출물: `send-push` (FCM)
- R4 산출물: `complete-care` (자동 완료 호출)

### 핵심 처리 흐름 (5분 간격)
1. 등원 30분 전 알림 (reminder_start_sent_at IS NULL, 보호자+유치원 양쪽 FCM)
2. 하원 30분 전 알림 (reminder_end_sent_at IS NULL)
3. 돌봄 시작 시점: chat_messages INSERT (care_start) + Realtime
4. 돌봄 종료 시점: chat_messages INSERT (care_end + review) + Realtime + FCM + status 변경
5. auto_complete_scheduled_at 도달 시 자동 돌봄완료 처리
6. scheduler_history 기록

### 산출물
1. `supabase/functions/scheduler/index.ts`

### 작업 브랜치: genspark_ai_developer (PR은 요청 시에만)
```

### R6 (크로스체크) 프롬프트

```markdown
## Step 4 — R6 크로스체크 요청

### 작업 대상
Step 4 전체 산출물 (EF 7개 + RPC 3개)과 Step 3 문서의 정합성 검증

### 점검 항목 (STEP4_WORK_PLAN.md §4 전체)
1. EF 7개 함수명 ↔ CODE.md invoke() 호출명
2. RPC 3개 함수명 ↔ CODE.md rpc() 호출명
3. 입력 파라미터 이름·타입 일치
4. 출력 JSON 구조 일치 (success/data/error)
5. 에러 메시지·코드 패턴 일치
6. GUIDE.md §14~16 설계 부합
7. MIGRATION_PLAN.md §7-2 상세 설계 부합

### 추가 점검
- Step 3 REVIEW_REPORT.md에서 수정한 C1~C3, I1, I3이 Step 4 코드와 충돌 없는지
- RPC SQL 패턴이 기존 44_01~44_12와 일관되는지
- Edge Function 패턴이 _shared/ 규칙과 일관되는지

### 산출물
- 점검 결과 보고 + 필요 시 수정사항 반영

### 작업 브랜치: genspark_ai_developer (PR은 요청 시에만)
```

---

## 8. 의존관계 다이어그램

```
                    ┌─────────────────┐
                    │   send-push     │ ← 모든 EF가 의존하는 기반 모듈
                    │   (4-6, R1)     │
                    └────────┬────────┘
                             │
            ┌────────────────┼────────────────┐
            │                │                │
   ┌────────▼───────┐  ┌────▼─────────┐  ┌───▼──────────────┐
   │ send-chat-msg  │  │ complete-care│  │ create-reservation│
   │ (4-2, R3)      │  │ (4-4, R4)   │  │ (4-3, R4)        │
   └────────────────┘  └─────────────┘  └────────┬─────────┘
                                                  │
                                         ┌────────▼────────┐
                                         │ app_create_chat  │
                                         │ _room (4-8, R2)  │
                                         └─────────────────┘

   ┌─────────────────┐  ┌──────────────────┐  ┌────────────────┐
   │  send-alimtalk  │  │  inicis-callback │  │ app_get_blocked │
   │  (4-5, R1)      │  │  (4-1, R4)       │  │ _list (4-10,R1)│
   │  (독립)         │  │  (독립, 흐름연결) │  │ (독립)          │
   └─────────────────┘  └──────────────────┘  └────────────────┘

   ┌─────────────────┐  ┌──────────────────┐
   │ app_get_chat    │  │    scheduler     │
   │ _rooms (4-9,R2) │  │   (4-7, R5)      │
   │ (4-8 전제)      │  │  (전체 의존)     │
   └─────────────────┘  └──────────────────┘
```

---

## 9. 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-04-18 | 초판 작성 — 라운드 R1~R6 분할, 코드 규칙, 인터페이스 체크리스트, 프롬프트 템플릿 |
| 2026-04-18 | **R1 구현 + 배포 완료** — send-push EF, send-alimtalk EF(배포 + Auth Hook 등록), 44_13 RPC SQL 실행, 공통 유틸 3개. `AUTH_WEBHOOK_SECRET` Secret 추가 (Supabase CLI `SUPABASE_` 접두사 제약 반영) |
| 2026-04-18 | **R2 구현 완료** — 44_14 app_create_chat_room (SECURITY DEFINER, 방 생성/복원/race condition), 44_15 app_get_chat_rooms (SECURITY INVOKER, 미읽음 created_at 비교, 상대방 FK 도출) |
| 2026-04-18 | **R2 검토 피드백 반영** — `chat_rooms` 테이블에 `UNIQUE(guardian_id, kindergarten_id)` 제약 누락 확인 → `sql/44_14_app_rpc_create_chat_room.sql` 상단에 `ALTER TABLE` 추가 (idempotent `IF NOT EXISTS` 패턴). race condition 처리(`EXCEPTION WHEN unique_violation`)의 전제 조건으로 DB 레벨 UNIQUE 제약 필수. §5-1에 ⚠️6 항목 추가 |
| 2026-04-19 | **R3 구현 + 배포 완료** — send-chat-message EF (텍스트/이미지/파일 + Storage 업로드 + FCM + notifications). `sql/45_01_chat_messages_type_migration.sql` 실행 (한글→영문 CHECK 전환) |
| 2026-04-19 | **R4 구현 + 배포 완료** — inicis-callback EF (`--no-verify-jwt`, `parseAuthDt`, `raw_response` jsonb), create-reservation EF (동적 `dbStatus` 매핑, `ALLOWED_TRANSITIONS`, 시스템 메시지 10종), complete-care EF (양측 하원 확인, `auto_complete_scheduled_at`). `sql/46_01_r4_schema_updates.sql` 실행 (`payments.raw_response` + `message_type` CHECK 8→10종). GUIDE.md/CODE.md R4 반영 (DB 상태값 매핑 노트 추가) |
| 2026-04-19 | **R5 구현 완료** — scheduler EF (5개 Task: 등원/하원 30분 전 알림, 돌봄 시작/종료 자동 처리, auto_complete 자동 완료). CAS-style UPDATE 중복 방지, scheduler_history 기록, send-push 내부 호출, insertSystemMessage 공통 헬퍼 (C11/C12 패턴). `--no-verify-jwt` 배포 (pg_cron 연동) |
| 2026-04-19 | **R5 배포 + pg_cron 설정 완료** — `supabase functions deploy scheduler --no-verify-jwt` 배포 완료. pg_cron·pg_net 확장 활성화. `sql/47_01_scheduler_cron_setup.sql` 실행 (Vault 방식 — `vault.create_secret`으로 project_url·service_role_key 암호화 저장, cron job에서 `vault.decrypted_secrets` 참조). cron Job 등록 확인 (`scheduler-every-5min`, `*/5 * * * *`, active=true, jobid=1). scheduler_history 실행 기록 정상 확인 (16:50 — total_processed=3, care_start=1, care_end=2, errors=0, 4991ms / 16:55 — total_processed=0, 중복 방지 정상 동작) |
| 2026-04-19 | **R6 크로스체크 완료** — Step 4 전체 산출물(EF 7개 + RPC 3개) vs Step 3 문서 정합성 검증. 종합 PASS. 경미 수정 1건(I1: CODE.md #60 `app_get_blocked_list` 앱 코드의 `data?.success` 체크 추가). 정보 이슈 4건(N1~N3, P1) 기록. 별도 보고서 불필요 판단 — 검증 결과는 본 문서 및 MIGRATION_PLAN.md 변경 이력에 기록 |
| 2026-04-19 | **Step 4 작업 종료** — MIGRATION_PLAN.md Step 4 표 전항 ✅ 완료 반영, HANDOVER.md Phase 5 작업 로드맵 5-9 ✅ 완료 반영. STEP4_R6_CROSSCHECK_REPORT.md 삭제 (별도 보고서 불필요). 다음 단계: Step 5 통합 테스트 |
