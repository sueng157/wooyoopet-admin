# 모바일 앱 (wooyoopet-app) 분석 보고서

> 최종 업데이트: 2026-04-09
> 분석 대상: https://github.com/sueng157/wooyoopet-app (Private)
> 목적: Phase 5 – 모바일 앱 백엔드를 PHP/MariaDB → Supabase로 전환하기 위한 사전 분석

---

## 1. 프로젝트 개요

| 항목 | 내용 |
|------|------|
| 앱 이름 | 우유펫 (wooyoopet) |
| 기술 스택 | React Native (Expo) + TypeScript |
| 패키지 매니저 | Yarn 4.9.2 |
| React Native 버전 | 0.81.5 |
| 라우팅 | Expo Router (파일 기반) |
| 상태 관리 | Jotai + MMKV (로컬 영구 저장) |
| CSS | NativeWind (TailwindCSS for RN) |
| 번들 식별자 | com.wooyoopet |
| 앱 버전 | 1.0.10 (iOS build 38, Android versionCode 13) |

### 소스 규모

| 항목 | 수치 |
|------|------|
| TypeScript 소스 파일 | ~175개 |
| 총 코드 라인 | **31,342줄** |
| 앱 페이지 (라우트) | 약 60개 |
| 커스텀 훅 | 25개 |
| 재사용 컴포넌트 | 30개 |
| 상태 Atom | 10개 |

### 가장 큰 파일 (Top 10)

| 파일 | 줄수 | 기능 |
|------|------|------|
| `app/chat/[room]/index.tsx` | 1,482 | 채팅방 |
| `app/payment/request.tsx` | 1,206 | 결제 요청 |
| `components/ChatMessage.tsx` | 1,165 | 채팅 메시지 컴포넌트 |
| `components/PetRegisterForm.tsx` | 1,064 | 반려동물 등록 폼 |
| `app/(tabs)/mypage.tsx` | 993 | 마이페이지 |
| `app/kindergarten/register.tsx` | 912 | 유치원 등록 |
| `app/settlement/info.tsx` | 873 | 정산 상세 |
| `app/(tabs)/paymentHistory.tsx` | 850 | 결제 내역 |
| `app/kindergarten/[id]/index.tsx` | 783 | 유치원 상세 |
| `app/kindergarten/tutorial/index.tsx` | 720 | 유치원 교육 |

---

## 2. 현재 아키텍처

```
┌─────────────────────────────────────────────────────┐
│                   모바일 앱 (React Native)            │
│                                                       │
│  apiClient.ts ──── GET/POST ────┐                    │
│  (FormData 방식)                 │                    │
│                                  ▼                    │
│                    PHP API 서버 (SmileServ)           │
│                    https://woo1020.iwinv.net          │
│                    /api/*.php (약 55개)                │
│                           │                           │
│                           ▼                           │
│                    MariaDB (같은 서버)                 │
│                                                       │
│  useChat.ts ─── WebSocket ──── 채팅 서버 (카페24)     │
│                    wss://wooyoopet.store/ws           │
│                                                       │
│  Firebase FCM ─────────────── 푸시 알림               │
│                    wooyoopet.firebasestorage.app      │
│                                                       │
│  이니시스 SDK ──── WebView ──── 결제 (확정 PG)        │
│                    mobile.inicis.com                  │
│                    callback → /api/inicis_payment.php │
└─────────────────────────────────────────────────────┘
```

### 환경 변수 (.env)

| 변수 | 값 | 용도 |
|------|-----|------|
| `EXPO_PUBLIC_API_URL` | `https://woo1020.iwinv.net` | PHP API 서버 |
| `EXPO_PUBLIC_WEBSOCKET_URL` | `wss://wooyoopet.store/ws` | 채팅 WebSocket |
| `EXPO_PUBLIC_SIGNALING_SERVER_URL` | `ws://wooyoopet.store:10443` | 시그널링 (미사용) |
| `EXPO_PUBLIC_STUN_URL` | `stun:wooyoopet.store:3478` | STUN (미사용) |
| `EXPO_PUBLIC_TURN_URL` | `turn:wooyoopet.store:3478` | TURN (미사용) |
| `EXPO_PUBLIC_TURN_SECURE_URL` | `turns:wooyoopet.store:5349` | TURN TLS (미사용) |
| `EXPO_PUBLIC_TURN_USERNAME` | `webrtc-coturn` | TURN 인증 (미사용) |
| `EXPO_PUBLIC_TURN_CREDENTIAL` | `webrtccoturn!` | TURN 비밀번호 (미사용) |

> 시그널링/STUN/TURN은 음성통화(WebRTC)용으로 코드에 존재하나, **기능 미구현 상태**이므로 전환 대상에서 제외

---

## 3. API 통신 방식

### apiClient.ts 구조

```typescript
const BASE_URL = process.env.EXPO_PUBLIC_API_URL;
// https://woo1020.iwinv.net

apiClient.get(endpoint, payload)
// → GET https://woo1020.iwinv.net/{endpoint}?key=value
// → 응답: JSON

apiClient.post(endpoint, payload)
// → POST https://woo1020.iwinv.net/{endpoint}
// → body: FormData (multipart/form-data)
// → 응답: JSON
```

**특징:**
- 모든 POST는 FormData 방식 (JSON body 아님)
- 인증 헤더(Authorization) 없음
- `mb_id`(핸드폰번호)를 파라미터로 전달하여 사용자 식별

---

## 4. PHP API 엔드포인트 전체 목록

### 4-1. 인증/회원 (7개)

| # | 엔드포인트 | 메서드 | 설명 | 호출 파일 |
|---|-----------|--------|------|----------|
| 1 | `/api/auth_request.php` | GET | 핸드폰 인증번호 확인 | `authentication/authNumber.tsx` |
| 2 | `/api/alimtalk.php` | GET | 카카오 알림톡 (인증번호 발송) | `authentication/authNumber.tsx` |
| 3 | `/api/set_join.php` | POST | 회원가입 / 주소 업데이트 | `hooks/useJoin.ts`, `authentication/selectMode.tsx` |
| 4 | `api/set_member_leave.php` | POST | 회원 탈퇴 | `user/withdraw/index.tsx` |
| 5 | `api/set_mypage_mode_update.php` | POST | 보호자↔유치원 모드 전환 | `(tabs)/mypage.tsx` |
| 6 | `api/set_profile_update.php` | POST | 프로필 수정 | `protector/[id]/updateProfile.tsx` |
| 7 | `api/set_address_verification.php` | POST | 위치 인증 | `authentication/addressVerify.tsx` |

### 4-2. 주소/지도 (1개)

| # | 엔드포인트 | 메서드 | 설명 | 호출 파일 |
|---|-----------|--------|------|----------|
| 8 | `/api/kakao-address.php` | GET | 카카오 주소 검색 프록시 | `authentication/address.tsx`, `addressDetail.tsx`, `location.tsx` |

### 4-3. 반려동물 (7개)

| # | 엔드포인트 | 메서드 | 설명 | 호출 파일 |
|---|-----------|--------|------|----------|
| 9 | `api/get_my_animal.php` | GET | 내 반려동물 목록 | `hooks/usePetList.ts` |
| 10 | `api/get_animal_by_id.php` | GET | 반려동물 상세 | `hooks/usePetDetail.ts` |
| 11 | `api/get_animal_by_mb_id.php` | GET | 회원별 반려동물 목록 | `hooks/usePetList.ts` |
| 12 | `api/get_animal_kind.php` | GET | 품종 검색 | `pet/searchBreed.tsx` |
| 13 | `api/set_animal_insert.php` | POST | 반려동물 등록 | `pet/register.tsx` |
| 14 | `api/set_animal_update.php` | POST | 반려동물 수정 | `pet/register.tsx` |
| 15 | `/api/set_animal_delete.php` | POST | 반려동물 삭제 | `hooks/usePetList.ts` |
| 16 | `api/set_first_animal_set.php` | POST | 대표 반려동물 설정 | `pet/default.tsx` |

### 4-4. 유치원/파트너 (3개)

| # | 엔드포인트 | 메서드 | 설명 | 호출 파일 |
|---|-----------|--------|------|----------|
| 17 | `api/get_partner.php` | GET | 유치원 상세 | `hooks/useKinderGarten.ts` |
| 18 | `api/get_partner_list.php` | GET | 유치원 목록 (지도/필터) | `utils/fetchPartnerList.ts` |
| 19 | `/api/set_partner_update.php` | POST | 유치원 정보 수정 | `hooks/useJoin.ts`, `kindergarten/register.tsx` |

### 4-5. 보호자 (2개)

| # | 엔드포인트 | 메서드 | 설명 | 호출 파일 |
|---|-----------|--------|------|----------|
| 20 | `api/get_protector.php` | GET | 보호자 상세 | `hooks/useProtector.ts` |
| 21 | `api/get_protector_list.php` | GET | 보호자 목록 | `utils/fetchProtectorList.ts` |

### 4-6. 채팅 (6개)

| # | 엔드포인트 | 메서드/파라미터 | 설명 | 호출 파일 |
|---|-----------|---------------|------|----------|
| 22 | `api/chat.php` | GET, method=get_messages | 메시지 히스토리 조회 | `hooks/useChat.ts` |
| 23 | `api/chat.php` | POST, method=send_message | 메시지 전송 (텍스트/파일) | `hooks/useChat.ts` |
| 24 | `api/chat.php` | POST, method=leave_room | 채팅방 나가기 | `hooks/useChat.ts` |
| 25 | `api/chat.php` | POST, method=muted | 음소거 설정 | `hooks/useChat.ts` |
| 26 | `api/read_chat.php` | GET | 메시지 읽음 처리 | `hooks/useChat.ts` |
| 27 | `api/chat.php` | GET | 채팅방 목록/정보 | `hooks/useChatRoom.ts`, `chat/[room]/index.tsx` |

### 4-7. 결제 (6개)

| # | 엔드포인트 | 메서드 | 설명 | 호출 파일 |
|---|-----------|--------|------|----------|
| 28 | `/api/set_inicis_approval.php` | POST | 이니시스 결제 승인 저장 | `payment/inicisApproval.tsx` |
| 29 | `/api/inicis_payment.php` | (callback) | 이니시스 서버 콜백 URL | `payment/inicisPayment.tsx` |
| 30 | `/api/set_payment_request.php` | POST | 돌봄 결제요청 생성/수정 | `payment/approval.tsx`, `inicisApproval.tsx` |
| 31 | `/api/get_payment_request.php` | GET | 결제요청 목록 | `hooks/usePaymentRequestList.ts` |
| 32 | `/api/get_payment_request_by_id.php` | GET | 결제요청 상세 | `hooks/usePaymentRequest.ts` |
| 33 | `/api/toss_payment.php` | POST | ~~토스 결제 승인~~ (제외) | ~~`payment/approval.tsx`~~ |

> `toss_payment.php`는 토스페이먼츠 연동용으로, 최종 PG사가 이니시스로 확정되어 전환 대상에서 **제외**

### 4-8. 정산 (3개)

| # | 엔드포인트 | 메서드 | 설명 | 호출 파일 |
|---|-----------|--------|------|----------|
| 34 | `/api/get_settlement.php` | GET | 정산 목록 | `hooks/useSettlement.ts` |
| 35 | `/api/get_settlement_info.php` | GET | 정산 상세 | `hooks/useSettlementInfo.ts` |
| 36 | `/api/set_settlement_info.php` | POST | 정산 계좌 정보 수정 | `settlement/account.tsx`, `settlement/info.tsx` |

### 4-9. 리뷰/평가 (3개)

| # | 엔드포인트 | 메서드 | 설명 | 호출 파일 |
|---|-----------|--------|------|----------|
| 37 | `/api/get_review.php` | GET | 리뷰 목록 | `hooks/useReviewList.ts` |
| 38 | `/api/set_review.php` | POST | 리뷰 작성 | `review/kindergartenWrite.tsx`, `review/petWrite.tsx` |
| 39 | `/api/set_care_review.php` | POST | 돌봄 리뷰 상태 업데이트 | `review/kindergartenWrite.tsx`, `review/petWrite.tsx` |
| 40 | `/api/set_care_complete.php` | POST | 돌봄 완료 처리 | `(tabs)/paymentHistory.tsx` |

### 4-10. 즐겨찾기 (6개)

| # | 엔드포인트 | 메서드 | 설명 | 호출 파일 |
|---|-----------|--------|------|----------|
| 41 | `/api/set_partner_favorite_add.php` | POST | 유치원 즐겨찾기 추가 | `hooks/useFavorite.ts` |
| 42 | `/api/set_partner_favorite_remove.php` | POST | 유치원 즐겨찾기 삭제 | `hooks/useFavorite.ts` |
| 43 | `/api/set_user_favorite_add.php` | POST | 보호자 즐겨찾기 추가 | `hooks/useFavorite.ts` |
| 44 | `/api/set_user_favorite_remove.php` | POST | 보호자 즐겨찾기 삭제 | `hooks/useFavorite.ts` |
| 45 | `api/get_favorite_partner_list.php` | GET | 즐겨찾기 유치원 목록 | `hooks/useFavoritePartnerList.ts` |
| 46 | `api/get_favorite_animal_list.php` | GET | 즐겨찾기 동물 목록 | `hooks/useFavoriteAnimalList.ts` |

### 4-11. 알림/FCM (3개)

| # | 엔드포인트 | 메서드 | 설명 | 호출 파일 |
|---|-----------|--------|------|----------|
| 47 | `api/get_notification.php` | GET | 알림 목록 | `notification/index.tsx` |
| 48 | `api/delete_notification.php` | - | 알림 삭제 | `notification/index.tsx` |
| 49 | `/api/fcm_token.php` | POST | FCM 토큰 저장 | `hooks/useFcmToken.ts` |

### 4-12. 콘텐츠/지원 (5개)

| # | 엔드포인트 | 메서드 | 설명 | 호출 파일 |
|---|-----------|--------|------|----------|
| 50 | `api/get_banner.php` | GET | 배너 목록 | `hooks/useBannerList.ts` |
| 51 | `/api/get_faq.php` | GET | FAQ 목록 | `support/customerService.tsx` |
| 52 | `/api/get_notice.php` | GET | 공지사항 목록 | `support/notice.tsx` |
| 53 | `/api/get_notice_detail.php` | GET | 공지사항 상세 | `support/noticeDetail.tsx` |
| 54 | `/api/get_policy.php` | GET | 취소/환불 정책 | `hooks/usePolicy.ts` |

### 4-13. 차단/신고 (3개)

| # | 엔드포인트 | 메서드 | 설명 | 호출 파일 |
|---|-----------|--------|------|----------|
| 55 | `/api/set_block_user.php` | POST | 사용자 차단 | `hooks/useBlockUser.ts` |
| 56 | `/api/get_block_user.php` | POST | 차단 여부 확인 | `hooks/useBlockUser.ts` |
| 57 | `api/get_blocked_list.php` | GET | 차단 목록 | `hooks/useBlockList.ts` |

### 4-14. 기타 (5개)

| # | 엔드포인트 | 메서드 | 설명 | 호출 파일 |
|---|-----------|--------|------|----------|
| 58 | `/api/get_bank_list.php` | GET | 은행 목록 | `hooks/useBankList.ts` |
| 59 | `api/get_education.php` | POST | 교육 콘텐츠 조회 | `kindergarten/tutorial/index.tsx` |
| 60 | `/api/set_message_template.php` | POST | 상용문구 저장 | `chat/commonPhrase.tsx` |
| 61 | `/api/get_message_template.php` | GET | 상용문구 조회 | `chat/[room]/index.tsx` |
| 62 | `/api/delete_message_template.php` | - | 상용문구 삭제 | `chat/commonPhrase.tsx` |
| 63 | `api/set_solved.php` | POST | 신고 처리 완료 | `chat/report/write.tsx` |

**총 API 수: 63개** (토스 결제 1개 제외 → 실질 전환 대상 62개)

---

## 5. 인증 방식 분석

| 항목 | 현재 방식 |
|------|----------|
| 인증 수단 | 핸드폰 번호 + SMS 인증 (카카오 알림톡) |
| 인증 흐름 | 번호 입력 → 알림톡 발송(`alimtalk.php`) → 6자리 입력 → 확인(`auth_request.php`) |
| 세션/토큰 | **없음** – JWT, 세션 쿠키, Authorization 헤더 모두 미사용 |
| 사용자 식별 | `mb_id` (핸드폰번호)를 매 API 요청마다 파라미터로 전송 |
| 로컬 저장 | Jotai `userAtom` + MMKV → 앱 재시작 시 자동 로그인 |
| 보안 수준 | **매우 취약** – mb_id만 알면 누구나 타인의 API 호출 가능 |

### Supabase Auth 전환 시 개선 사항
- Supabase Auth의 Phone OTP 사용 → SMS 인증 유지하면서 JWT 토큰 기반 인증으로 전환
- 모든 API 호출에 Authorization 헤더 자동 포함
- RLS(Row Level Security)로 본인 데이터만 접근 가능
- 세션 자동 갱신 (refresh token)

---

## 6. 채팅 시스템 분석

| 항목 | 내용 |
|------|------|
| 실시간 프로토콜 | WebSocket (`wss://wooyoopet.store/ws`) |
| 서버 | 카페24 채팅 서버 (별도 운영) |
| 메시지 저장/조회 | PHP API (`chat.php`)의 method 파라미터로 분기 |
| 클라이언트 라이브러리 | `react-use-websocket` |
| Heartbeat | ping/pong, 25초 간격, 60초 타임아웃 |

### 채팅 기능 목록
- 텍스트 메시지 전송/수신
- 이미지/파일 전송 (FormData로 업로드)
- 메시지 히스토리 (페이지네이션)
- 읽음 처리 (`read_chat.php`)
- 채팅방 나가기/음소거
- 상용문구 관리 (CRUD)
- 신고 기능

### Supabase Realtime 전환 방안
- WebSocket → Supabase Realtime (Postgres Changes) 또는 Broadcast
- 메시지 저장 → Supabase 테이블 INSERT (자동 API)
- 파일 전송 → Supabase Storage
- 읽음 처리 → Supabase RPC 또는 테이블 업데이트

---

## 7. 결제 시스템 분석

### 확정 PG: 이니시스

| 항목 | 내용 |
|------|------|
| PG사 | KG이니시스 (확정, 계약 완료) |
| 현재 상태 | 테스트 MID 사용 중 (`INIpayTest`) |
| 결제 방식 | WebView로 이니시스 모바일 결제창 호출 |
| 지원 수단 | 신용카드(CARD), 계좌이체(BANK), 가상계좌(VBANK) |
| 콜백 URL | `{API_URL}/api/inicis_payment.php` |
| 승인 저장 | `/api/set_inicis_approval.php` |

### 결제 흐름
```
1. 앱에서 결제 정보 입력 (반려동물, 날짜, 시간, 산책, 픽드랍)
2. WebView로 이니시스 모바일 결제창 표시
3. 사용자 결제 완료 → inicis_payment.php (서버 콜백)
4. 앱으로 결과 전달 → set_inicis_approval.php (승인 정보 DB 저장)
5. set_payment_request.php (돌봄 결제요청 생성)
6. 결제 완료 화면 표시
```

### 제외 항목: 토스페이먼츠
- 코드에 토스 SDK(`@tosspayments/widget-sdk-react-native`)와 `toss_payment.php`가 존재
- 초기 검토 단계에서 테스트했으나, **최종 PG사는 이니시스로 확정**
- 전환 시 토스 관련 코드는 제거 대상

---

## 8. 외부 서비스 의존성

| 서비스 | 용도 | 현재 서버/URL | 전환 방향 |
|--------|------|-------------|----------|
| SmileServ (iwinv) | PHP API + MariaDB | `woo1020.iwinv.net` | Supabase API + PostgreSQL |
| 카페24 | WebSocket 채팅 서버 | `wooyoopet.store` | Supabase Realtime |
| Firebase | FCM 푸시 알림 | `wooyoopet.firebasestorage.app` | 유지 (Edge Functions에서 호출) |
| 카카오 | 주소 검색 API (프록시) | PHP 경유 | 앱에서 직접 호출 또는 Edge Function |
| 카카오 | 알림톡 (SMS 인증) | PHP 경유 | Supabase Auth Phone OTP |
| 이니시스 | 결제 (확정 PG) | WebView + PHP callback | Edge Functions로 callback 처리 |

---

## 9. Supabase 전환 난이도 평가

| 영역 | 난이도 | API 수 | 설명 |
|------|--------|--------|------|
| CRUD API (조회/등록/수정/삭제) | 쉬움 | ~35개 | Supabase 자동 API로 대부분 대체 가능 |
| 인증 | 쉬움 | 3개 | Supabase Auth Phone OTP → 보안 대폭 강화 |
| 채팅 | 보통 | 6개 | Supabase Realtime 전환, 파일전송 로직 구현 필요 |
| 결제 (이니시스) | 보통 | 3개 | PHP callback → Edge Functions 전환 |
| FCM 푸시 | 보통 | 1개 | Edge Functions + Firebase Admin SDK |
| 카카오 주소검색 | 쉬움 | 1개 | 앱에서 직접 호출 가능 (프록시 불필요) |
| 정산/리뷰/즐겨찾기 | 쉬움 | ~12개 | 단순 CRUD, Supabase 자동 API |

### 총평
- **전체 62개 엔드포인트** 중 약 35개는 단순 CRUD → Supabase 자동 API로 즉시 대체
- 나머지 ~27개는 비즈니스 로직 포함 → Edge Functions 또는 RPC로 구현
- **핵심 선행 조건: PHP API 소스 확보** (서버 로직 없이는 역추론 필요)

---

## 10. 제외 항목

| 항목 | 이유 |
|------|------|
| WebRTC 음성통화 | 코드에 존재하나 **기능 미구현** (개발자 테스트용) |
| 토스페이먼츠 | 초기 검토용, **최종 PG는 이니시스로 확정** |
| 시그널링 서버 | 음성통화용 → 미구현이므로 제외 |
| STUN/TURN 서버 | 음성통화용 → 미구현이므로 제외 |

---

## 11. 개발자 요청 자료 현황

### 필수 자료

| # | 자료 | 상태 | 비고 |
|---|------|------|------|
| 1 | PHP API 소스코드 전체 (/api/*.php) | 요청 예정 | 62개 엔드포인트 서버 로직 |
| 2 | MariaDB 스키마 dump | 요청 예정 | 테이블 구조만 (데이터 불필요) |
| 3 | WebSocket 채팅 서버 소스 | 요청 예정 | 카페24 서버 채팅 로직 |

### 추가 자료

| # | 자료 | 상태 | 비고 |
|---|------|------|------|
| 4 | API 문서 | 요청 예정 | 있으면 분석 시간 단축 |
| 5 | 카카오 알림톡 API 키/비즈채널 | 요청 예정 | SMS 인증 재구현용 |
| 6 | 카카오 주소 API 키 | 요청 예정 | 주소검색 기능 유지 |
| 7 | 이니시스 상용 MID/키 | 요청 예정 | 실결제 전환 시 |
| 8 | Firebase 프로젝트 접근 권한 | 요청 예정 | FCM 서버 키 확인 |

---

## 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-04-09 | 최초 작성 – 앱 소스 분석 완료, API 62개 목록화 |
