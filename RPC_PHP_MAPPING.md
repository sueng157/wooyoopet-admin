# RPC 12개 — PHP 원본 매핑표

> **작성일**: 2026-04-15
> **작성 기준**: `legacy_php_api_all.txt` PHP 소스 코드 분석 + `MOBILE_APP_ANALYSIS.md` 앱 호출 파일 참조
> **용도**: 외주개발자에게 각 RPC 함수의 앱 화면 매핑 확인 요청

## 확인 요청사항
1. 각 RPC 함수의 '앱 화면 추정' 열이 맞는지 확인/수정해 주세요.
2. #3(`app_get_guardian_detail`), #4(`app_get_guardians`)는 PHP 소스가 없어 역추론했습니다. 실제 앱에서 어떤 화면/기능에서 호출되는지 알려주세요.
3. `app_get_kindergartens`(#2)에서 지도 클러스터링(핀 안에 유치원 개수 표시)은 클라이언트에서 처리하는지, 서버에서 집계값을 내려주는지 알려주세요.

---

## 매핑표

| 순서 | 파일 | RPC 함수명 | 원본 PHP 파일 | PHP에서의 용도 (한 줄 요약) | 앱 화면 추정 |
|------|------|-----------|-------------|--------------------------|------------|
| 1 | sql/44_01 | `app_get_kindergarten_detail` | `get_partner.php` | `mb_id`(운영자)+`user_id`(조회자) 받아 유치원 1건 + 정산상태 + 찜여부 + 반려동물 목록 반환 | 유치원 상세 화면 (`hooks/useKinderGarten.ts`) |
| 2 | sql/44_02 | `app_get_kindergartens` | `get_partner_list.php` | `mb_id`(보호자) 받아 전체 유치원 목록 + `settlement_info.status='active'` 필터 + 리뷰수 서브쿼리 + 찜여부 LEFT JOIN 반환 (페이지네이션 없음) | 유치원 지도/목록 화면 (`utils/fetchPartnerList.ts`) |
| 3 | sql/44_03 | `app_get_guardian_detail` | 소스 없음 (역추론) | PHP 파일 미존재. `get_partner.php`의 보호자 버전으로 추정: members + pets + favorite JOIN으로 보호자 상세 조회 | 보호자 상세 화면 (`hooks/useProtector.ts`) |
| 4 | sql/44_04 | `app_get_guardians` | 소스 없음 (역추론) | PHP 파일 미존재. `get_partner_list.php`의 보호자 버전으로 추정: members + pets JOIN 목록 + 페이지네이션 | 보호자 목록 화면 (`utils/fetchProtectorList.ts`) |
| 5 | sql/44_05 | `app_get_reservations` | `get_payment_request.php` | `mb_id`/`to_mb_id`/`pet_id` 필터로 예약 목록 + 반려동물 + 유치원 + 회원 각 1건 JOIN, 페이지네이션(page/perPage=50) 적용 | 결제/돌봄 내역 목록 (`hooks/usePaymentRequestList.ts`) |
| 6 | sql/44_06 | `app_get_reservation_detail` | `get_payment_request_by_id.php` | `id`(예약ID) 받아 예약 1건 + 결제승인정보 + 반려동물 + 유치원 + 회원 JOIN 반환 | 결제/돌봄 상세 (`hooks/usePaymentRequest.ts`) |
| 7 | sql/44_07 | `app_withdraw_member` | `set_member_leave.php` | `mb_id`+`reason` 받아 탈퇴 이관 테이블 INSERT → 회원/동물/유치원 hard DELETE (트랜잭션 주석처리됨) | 회원 탈퇴 (`user/withdraw/index.tsx`) |
| 8 | sql/44_08 | `app_set_representative_pet` | `set_first_animal_set.php` | `mb_id`+`wr_id`(동물ID) 받아 전체 `firstYN='N'` → 선택 건만 `firstYN='Y'` batch UPDATE | 대표 반려동물 설정 (`pet/default.tsx`) |
| 9 | sql/44_09 | `app_get_guardian_reviews` | `get_review.php` (`type='pet'`) | `type='pet'`+`id`(pet_id) 받아 리뷰 목록 + 6개 기본 태그별 COUNT 집계(CTE) + 반려동물/유치원/회원 JOIN 반환 | 보호자(반려동물) 리뷰 목록 (`hooks/useReviewList.ts`) |
| 10 | sql/44_10 | `app_get_settlement_summary` | `get_settlement.php` | `mb_id`+`start_date`+`end_date` 받아 정산완료/미정산 SUM 집계 + 기간별 상세 내역(date별 그룹) + 회원 JOIN | 정산 요약/내역 (`hooks/useSettlement.ts`) |
| 11 | sql/44_11 | `app_get_education_with_progress` | `get_education.php` | `mb_id`+`ca_name`(선택) 받아 교육 주제 + 퀴즈 데이터(JSON 파싱) + 풀이 여부(solved) LEFT JOIN 반환 | 교육/튜토리얼 (`kindergarten/tutorial/index.tsx`) |
| 12 | sql/44_12 | `app_get_kindergarten_reviews` | `get_review.php` (`type='partner'`) | `type='partner'`+`id`(partner_id) 받아 리뷰 목록 + 6개 기본 태그별 COUNT 집계(CTE) + 반려동물/유치원/회원 JOIN 반환 | 유치원 리뷰 목록 (`hooks/useReviewList.ts`) |

---

## 비고

- **#3, #4 (보호자 상세/목록)**: `legacy_php_api_all.txt`에 `get_protector.php`, `get_protector_list.php` 파일이 존재하지 않음. `MOBILE_APP_ANALYSIS.md`에서 앱 호출 파일(`hooks/useProtector.ts`, `utils/fetchProtectorList.ts`)만 확인됨. 유치원 상세/목록(`get_partner.php`/`get_partner_list.php`)의 보호자 버전으로 역추론하여 설계 예정.
- **#9, #12 (리뷰 분리)**: PHP에서는 `get_review.php` 하나로 `type` 파라미터로 분기. Supabase에서는 RPC를 분리하여 각각 별도 함수로 구현 (`app_get_guardian_reviews` + `app_get_kindergarten_reviews`).
- **구현 완료**: #1 (`app_get_kindergarten_detail`), #8 (`app_set_representative_pet`), #11 (`app_get_education_with_progress`) — 총 3개 완료.
