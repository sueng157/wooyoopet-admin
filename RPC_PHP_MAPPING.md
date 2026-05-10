# RPC 16개 — PHP 원본 매핑표

> **작성일**: 2026-04-15
> **최종 업데이트**: 2026-04-18 (R6 리뷰 반영 — 차단 목록 RPC 1개 추가, 15→16개)
> **작성 기준**: `legacy_php_api_all.txt` PHP 소스 코드 분석 + `MOBILE_APP_ANALYSIS.md` 앱 호출 파일 참조
> **용도**: 외주개발자에게 각 RPC 함수의 앱 화면 매핑 확인 요청 → ✅ 확인 완료

## 확인 요청사항 — ✅ 확인 완료 (2026-04-17)

> 아래 항목은 외주개발자 확인 완료 후 그대로 Step 2.5 작업에 반영되었습니다.

1. ~~각 RPC 함수의 '앱 화면 추정' 열이 맞는지 확인/수정해 주세요.~~ → ✅ 확인됨
2. ~~#3(`app_get_guardian_detail`), #4(`app_get_guardians`)는 PHP 소스가 없어 역추론했습니다.~~ → ✅ 확인됨, 역추론 구조대로 구현 완료
3. ~~`app_get_kindergartens`(#2)에서 지도 클러스터링~~ → ✅ 확인됨

---

## 매핑표

| 순서 | 파일 | RPC 함수명 | 원본 PHP 파일 | PHP에서의 용도 (한 줄 요약) | 앱 화면 추정 |
|------|------|-----------|-------------|--------------------------|------------|
| 1 | sql/44_01 | `app_get_kindergarten_detail` | `get_partner.php` | `mb_id`(운영자)+`user_id`(조회자) 받아 유치원 1건 + 정산상태 + 찜여부 + 반려동물 목록 반환 | 유치원 상세 화면 (`hooks/useKinderGarten.ts`) |
| 2 | sql/44_02 | `app_get_kindergartens` | `get_partner_list.php` | `mb_id`(보호자) 받아 전체 유치원 목록 + `settlement_info.status='active'` 필터 + 리뷰수 서브쿼리 + 찜여부 LEFT JOIN 반환 (페이지네이션 없음) | 유치원 지도/목록 화면 (`utils/fetchPartnerList.ts`) |
| 3 | sql/44_03 | `app_get_guardian_detail` | 소스 없음 (역추론) → ✅ 확인 | PHP 파일 미존재. `get_partner.php`의 보호자 버전으로 역추론 → 외주개발자 확인 완료. members + pets + favorite JOIN으로 보호자 상세 조회 | 보호자 상세 화면 (`hooks/useProtector.ts`) |
| 4 | sql/44_04 | `app_get_guardians` | 소스 없음 (역추론) → ✅ 확인 | PHP 파일 미존재. `get_partner_list.php`의 보호자 버전으로 역추론 → 외주개발자 확인 완료. members + pets JOIN 목록 + 페이지네이션 | 보호자 목록 화면 (`utils/fetchProtectorList.ts`) |
| 5 | sql/44_05 | `app_get_reservations_guardian` | `get_payment_request.php` | `mb_id`/`to_mb_id`/`pet_id` 필터로 예약 목록 + 반려동물 + 유치원 + 회원 각 1건 JOIN, 페이지네이션(page/perPage=50) 적용 | 결제/돌봄 내역 목록 — 보호자용 (`hooks/usePaymentRequestList.ts`) |
| 5b | sql/44_05b | `app_get_reservations_kindergarten` | `get_payment_request.php` | #5에서 분리된 유치원 운영자용 예약 목록. 보호자/유치원 비대칭 리턴 필드 (보호자: pet·kindergarten, 유치원: pet·member) | 결제/돌봄 내역 목록 — 유치원용 (`hooks/usePaymentRequestList.ts`) |
| 6 | sql/44_06 | `app_get_reservation_detail` | `get_payment_request_by_id.php` | `id`(예약ID) 받아 예약 1건 + 결제승인정보 + 반려동물 + 유치원 + 회원 JOIN 반환 | 결제/돌봄 상세 (`hooks/usePaymentRequest.ts`) |
| 7 | sql/44_07 | `app_withdraw_member` | `set_member_leave.php` | `mb_id`+`reason` 받아 soft delete (status→'탈퇴', withdrawn_at 기록, pets.deleted=true, kindergartens.registration_status='withdrawn') + Auth 삭제는 Edge Function에서 후속 처리 | 회원 탈퇴 (`user/withdraw/index.tsx`) |
| 8 | sql/44_08 | `app_set_representative_pet` | `set_first_animal_set.php` | `mb_id`+`wr_id`(동물ID) 받아 전체 `firstYN='N'` → 선택 건만 `firstYN='Y'` batch UPDATE | 대표 반려동물 설정 (`pet/default.tsx`) |
| 9 | sql/44_09 | `app_get_guardian_reviews` | `get_review.php` (`type='pet'`) | `type='pet'`+`id`(pet_id) 받아 리뷰 목록 + 7개 긍정 태그별 COUNT 집계(tag_counts CTE 분리) + 반려동물/유치원/회원 JOIN 반환 | 보호자(반려동물) 리뷰 목록 (`hooks/useReviewList.ts`) |
| 10 | sql/44_10 | `app_get_settlement_summary` | `get_settlement.php` + `get_settlement_list.php` | `auth.uid()`→유치원 자동조회. summary(정산완료/예정/보류 누적) + next_settlement(최근 예정 합산+계좌) + period_summary(기간 합산) + details(페이지네이션+보호자정보). get_settlement_list.php 월별 집계·세부 명세 기능 흡수 | 정산 요약/내역 (`hooks/useSettlement.ts`) |
| 11 | sql/44_11 | `app_get_education_with_progress` | `get_education.php` | `mb_id`+`ca_name`(선택) 받아 교육 주제 + 퀴즈 데이터(JSON 파싱) + 풀이 여부(solved) LEFT JOIN 반환 | 교육/튜토리얼 (`kindergarten/tutorial/index.tsx`) |
| 12 | sql/44_12 | `app_get_kindergarten_reviews` | `get_review.php` (`type='partner'`) | `type='partner'`+`id`(partner_id) 받아 리뷰 목록 + 7개 긍정 태그별 COUNT 집계(tag_counts CTE 분리) + 반려동물/유치원/회원 JOIN 반환 | 유치원 리뷰 목록 (`hooks/useReviewList.ts`) |

---

## 비고

- **#3, #4 (보호자 상세/목록)**: `legacy_php_api_all.txt`에 `get_protector.php`, `get_protector_list.php` 파일이 존재하지 않음. `MOBILE_APP_ANALYSIS.md`에서 앱 호출 파일(`hooks/useProtector.ts`, `utils/fetchProtectorList.ts`)만 확인됨. 유치원 상세/목록(`get_partner.php`/`get_partner_list.php`)의 보호자 버전으로 역추론하여 설계 → **외주개발자 확인 완료 (2026-04-17)**, 역추론 구조대로 구현 완료.
- **#5, #5b (예약 목록 분리)**: PHP에서는 `get_payment_request.php` 하나로 `mb_id`/`to_mb_id` 파라미터로 분기. Supabase에서는 보호자/유치원 시점 차이가 커서 2개로 분리 (`app_get_reservations_guardian` + `app_get_reservations_kindergarten`).
- **#9, #12 (리뷰 분리)**: PHP에서는 `get_review.php` 하나로 `type` 파라미터로 분기. Supabase에서는 RPC를 분리하여 각각 별도 함수로 구현 (`app_get_guardian_reviews` + `app_get_kindergarten_reviews`).
- **#10 (정산 PHP 2개 흡수)**: `get_settlement.php`(누적 집계 + 기간별 상세) + `get_settlement_list.php`(월별 집계 + 세부 명세)의 기능을 `app_get_settlement_summary` 단일 RPC로 통합. period_summary + details로 흡수.
- **구현 완료 (13/13)** ✅: 전체 RPC 구현 완료.
  - PR #133 merge — 초기 4개: #1, #2, #8, #11
  - PR #135 merge — 추가 6개: #5, #5b, #6, #9, #10, #12
  - PR #136 merge — #3, #4 (보호자 상세/목록 + VIEW/RPC 일괄 리팩터링)
  - PR #137 merge — #7 (회원 탈퇴 soft delete + DDL ALTER)
  - #5b (`app_get_reservations_kindergarten`): #5에서 분리된 유치원용 예약 목록 (신규 추가, 총 12→13개)
  - #10: get_settlement.php + get_settlement_list.php 2개 PHP 기능을 단일 RPC로 흡수
  - #7: hard DELETE → soft delete 방식으로 변경 (status='탈퇴', pets.deleted=true, kindergartens.registration_status='withdrawn'). Auth 삭제는 Edge Function에서 후속 처리.

### Step 2.5 추가 산출물

| 파일 | 내용 | PR |
|------|------|----|
| sql/44_00_app_public_views.sql | internal 스키마 VIEW 3개 (members_public_profile, pets_public_info, settlement_infos_public) | #133 |
| sql/44_00a_ddl_alter_tables.sql | DDL ALTER — pets.deleted 컬럼 추가 + kindergartens.registration_status CHECK 제약 변경 ('withdrawn' 추가) | #137 |
| sql/44_01 ~ 44_12 (+ 44_05b) | 앱용 RPC 함수 13개 (Step 2.5 범위) | #133, #135, #136, #137 |

---

## Step 4 추가 예정 RPC (3개)

> 아래 3개는 R4 채팅 Realtime 전환 설계 및 R6 차단 목록 RLS 검토 시 도출된 RPC입니다. Step 2.5 RPC(#1~#12)와 달리 SQL 구현이 아직 완료되지 않았으며, Step 4(Edge Functions + 추가 RPC)에서 함께 구현합니다.

| 순서 | RPC 함수명 | 원본 PHP | PHP에서의 용도 (한 줄 요약) | 앱 화면 추정 |
|------|-----------|---------|--------------------------|------------|
| 13 | `app_create_chat_room` | `chat.php` (`create_room`) | 채팅방 생성/복원 (SECURITY DEFINER). guardian_id + kindergarten_id 중복 체크, 나간 방 `status='활성'` 복원, `chat_room_members` 2건 INSERT | 채팅 시작 (`hooks/useChat.ts`) |
| 14 | `app_get_chat_rooms` | `chat.php` (`get_rooms`) | 채팅방 목록 + 미읽음 수 + 상대방 프로필. `last_read_message_id` 기반 `created_at` 타임스탬프 비교로 unread_count 계산 (⚠️ UUID v4 순서 미보장 → R4 리뷰 Issue 4) | 채팅 목록 (`hooks/useChatRoom.ts`) |
| 15 | `app_get_blocked_list` | `get_blocked_list.php` | 차단 목록 + 차단 대상 프로필(닉네임, 프로필 이미지). `members` RLS(`id = auth.uid()`) 제약으로 임베디드 JOIN 불가 → SECURITY DEFINER + `internal.members_public_profile` VIEW 사용. #17, #19, #23, #41과 동일 패턴 | 차단 관리 (`hooks/useBlockList.ts`) |

---

## 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-04-15 | 초안 — 13개 RPC PHP 원본 매핑표 작성 |
| 2026-04-17 | 외주개발자 확인 완료 반영, Step 2.5 구현 완료 (13/13) 기록 |
| 2026-04-18 | R3 리뷰 Issue 반영 — RPC #5 함수명 `app_get_reservations` → `app_get_reservations_guardian` 동기화, 태그 수 6개 → 7개 교정 |
| 2026-04-18 | **R4 리뷰 Issue 1 반영** — 채팅 RPC 2개 추가 (#13 `app_create_chat_room`, #14 `app_get_chat_rooms`), 제목 13→15개 업데이트. Step 4 구현 대상으로 분류 |
| 2026-04-18 | **R6 리뷰 반영** — 차단 목록 RPC 1개 추가 (#15 `app_get_blocked_list`), 제목 15→16개 업데이트. `members` RLS 제약(#60 임베디드 JOIN null 반환)으로 RPC 전환 필수 확인, Step 4 구현 대상 |
