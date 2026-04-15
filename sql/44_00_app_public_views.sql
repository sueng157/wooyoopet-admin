-- ============================================================
-- SQL 44-0: 공개 VIEW 3개 생성 (RLS 충돌 해결용)
-- ============================================================
-- 실행 방법: Supabase SQL Editor에 전체 복사하여 실행
-- 목적: SECURITY INVOKER RPC 함수에서 타 회원 데이터를 JOIN할 때
--        원본 테이블의 RLS 정책(본인만 SELECT)이 차단하는 문제를 해결.
--        원본 테이블에 공개 SELECT 정책을 추가하는 대신,
--        VIEW를 통해 필요한 컬럼만 안전하게 노출한다.
-- 참조: MIGRATION_PLAN.md 섹션 2.5 — 공통 RLS 충돌 해결 방안 A
-- ============================================================
--
-- [설계 원칙]
-- 1. VIEW는 SECURITY DEFINER (뷰 소유자 권한)로 실행되므로
--    기저 테이블의 RLS 정책을 우회하여 전체 행을 읽을 수 있다.
-- 2. VIEW에는 앱에서 타 회원 조회 시 실제 필요한 컬럼만 포함한다.
-- 3. 개인정보(전화번호, 주소, 주민번호, 금융정보 등)는 절대 노출하지 않는다.
-- 4. authenticated 역할에 SELECT 권한만 부여한다 (INSERT/UPDATE/DELETE 불가).
-- 5. 원본 테이블의 기존 RLS 정책(본인만 CRUD)은 변경하지 않는다.
--
-- [대상 RPC 함수] — 이 VIEW를 사용할 함수 목록:
--   members_public_profile  → #1,#2 유치원 상세/목록, #3,#4 보호자 상세/목록,
--                              #5,#6 예약 목록/상세, #9 리뷰, #10 정산
--   pets_public_info        → #1,#2 유치원 상세/목록, #3,#4 보호자 상세/목록,
--                              #9 리뷰
--   settlement_infos_public → #1,#2 유치원 상세/목록 (유치원 활성화 상태 확인)
-- ============================================================


-- ============================================================
-- VIEW 1: members_public_profile
-- ============================================================
-- 용도: 타 회원의 프로필을 조회할 때 사용
-- 사용처: 유치원 상세(운영자 프로필), 보호자 상세/목록, 예약 상대방 정보,
--         리뷰 작성자 정보, 채팅 상대방 정보
--
-- [포함 컬럼과 근거]
--   id              — 회원 식별자 (JOIN 키)
--   name            — 유치원 운영자 이름 표시 (get_partner.php: member.mb_name)
--   nickname        — 프로필 닉네임 표시 (보호자 목록 등)
--   nickname_tag    — 닉네임 태그 (#1001 형태, 동명이인 구분)
--   profile_image   — 프로필 사진 URL
--   current_mode    — 현재 역할 (보호자/유치원 구분 필터링)
--   address_complex — 아파트/단지명 (유치원 주소가 아닌 회원 주소 단지명, 같은 단지 표시)
--   latitude        — 위도 (거리 기반 보호자 목록 정렬)
--   longitude       — 경도
--   status          — 계정 상태 (탈퇴/정지 회원 필터링)
--   created_at      — 가입일 (신규 회원 표시)
--
-- [제외 컬럼과 사유]
--   phone             — 개인정보: 전화번호
--   birth_date        — 개인정보: 생년월일
--   gender            — 개인정보: 성별
--   carrier           — 개인정보: 통신사
--   address_road      — 개인정보: 도로명주소 (상세 주소)
--   address_building_dong — 개인정보: 동
--   address_building_ho   — 개인정보: 호수
--   address_direct    — 개인정보: 직접입력 주소
--   address_doc_urls  — 개인정보: 주소 인증 서류
--   address_auth_status — 개인정보: 주소 인증 상태
--   address_auth_date — 개인정보: 주소 인증 일시
--   identity_*        — 개인정보: 본인인증 관련 4개 컬럼
--   noshow_count/sanction/* — 내부 관리: 노쇼 제재 정보
--   suspend_*         — 내부 관리: 정지 사유/기간
--   withdraw_reason   — 내부 관리: 탈퇴 사유
--   withdrawn_at      — 내부 관리: 탈퇴 일시
--   language          — 내부 설정: 앱 언어
--   app_version       — 내부 설정: 앱 버전
--   *_notify          — 내부 설정: 알림 설정 5개 (chat, reservation, checkinout, review, new_kindergarten)
-- ============================================================

DROP VIEW IF EXISTS members_public_profile;

CREATE VIEW members_public_profile
  WITH (security_invoker = false)     -- = SECURITY DEFINER (뷰 소유자 권한으로 실행)
AS
SELECT
  id,
  name,
  nickname,
  nickname_tag,
  profile_image,
  current_mode,
  address_complex,
  latitude,
  longitude,
  status,
  created_at
FROM members;

COMMENT ON VIEW members_public_profile IS
  '타 회원 프로필 공개 VIEW — 개인정보(전화번호, 상세주소, 생년월일 등) 제외. '
  'SECURITY INVOKER RPC에서 타 회원 데이터 JOIN 시 원본 members 대신 사용. '
  '원본: MIGRATION_PLAN.md 섹션 2.5 공통 RLS 충돌 해결 방안 A';

-- authenticated 역할에 SELECT만 허용
GRANT SELECT ON members_public_profile TO authenticated;


-- ============================================================
-- VIEW 2: pets_public_info
-- ============================================================
-- 용도: 타 회원의 반려동물 정보를 조회할 때 사용
-- 사용처: 유치원 상세(보호자 반려동물 목록), 보호자 상세/목록,
--         리뷰(반려동물 정보), 찜한 반려동물 목록
--
-- [포함 컬럼과 근거]
--   id                    — 반려동물 식별자 (JOIN 키)
--   member_id             — 소유자 식별 (보호자별 반려동물 필터링)
--   name                  — 반려동물 이름
--   breed                 — 품종 (유치원이 돌봄 가능 여부 판단)
--   gender                — 성별 (프로필 표시)
--   birth_date            — 생년월일 (나이 계산)
--   is_birth_date_unknown — 생일 미상 여부
--   weight                — 몸무게 (크기 분류 표시)
--   size_class            — 소형/중형/대형 (유치원 가격표 연동)
--   is_neutered           — 중성화 여부 (프로필 표시)
--   is_vaccinated         — 백신 접종 여부 (유치원 수락 판단)
--   photo_urls            — 사진 URL 배열 (프로필 이미지)
--   is_representative     — 대표 동물 여부 (firstYN → is_representative)
--   is_draft              — 임시저장 여부 (미완성 프로필 제외 필터)
--   description           — 반려동물 소개
--
-- [제외 컬럼과 사유]
--   deleted               — 내부 관리: soft delete 플래그
--                           → VIEW에서 WHERE deleted = false 조건으로 처리
--   created_at, updated_at — 내부 관리: 타임스탬프 (타 회원 조회 시 불필요)
-- ============================================================

DROP VIEW IF EXISTS pets_public_info;

CREATE VIEW pets_public_info
  WITH (security_invoker = false)     -- = SECURITY DEFINER
AS
SELECT
  id,
  member_id,
  name,
  breed,
  gender,
  birth_date,
  is_birth_date_unknown,
  weight,
  size_class,
  is_neutered,
  is_vaccinated,
  photo_urls,
  is_representative,
  is_draft,
  description
FROM pets
WHERE deleted = false;               -- 삭제된 반려동물은 노출하지 않음

COMMENT ON VIEW pets_public_info IS
  '타 회원 반려동물 공개 VIEW — 삭제된 레코드 제외, 내부 관리 컬럼 제외. '
  'SECURITY INVOKER RPC에서 타 회원 반려동물 데이터 JOIN 시 원본 pets 대신 사용. '
  '원본: MIGRATION_PLAN.md 섹션 2.5 공통 RLS 충돌 해결 방안 A';

-- authenticated 역할에 SELECT만 허용
GRANT SELECT ON pets_public_info TO authenticated;


-- ============================================================
-- VIEW 3: settlement_infos_public
-- ============================================================
-- 용도: 유치원의 정산 등록 상태만 확인 (활성 유치원 필터링)
-- 사용처: 유치원 목록/상세에서 settlement_infos.inicis_status = 'active'인
--         유치원만 돌봄 예약 가능하게 필터링
--
-- [포함 컬럼과 근거]
--   id              — 식별자 (JOIN 키)
--   member_id       — 정산정보 소유자 (유치원 운영자 매칭)
--   kindergarten_id — 유치원 FK (유치원 테이블과 JOIN)
--   inicis_status   — 이니시스 등록 상태 (active/pending/rejected 등)
--                     유치원 목록에서 결제 가능 여부 판단에 필수
--
-- [제외 컬럼과 사유]
--   business_type       — 금융정보: 사업자 유형
--   business_name       — 금융정보: 사업자명
--   business_category   — 금융정보: 업종
--   business_reg_number — 금융정보: 사업자등록번호
--   operator_name       — 개인정보: 대표자명
--   operator_birth_date — 개인정보: 대표자 생년월일
--   operator_phone      — 개인정보: 대표자 전화번호
--   operator_email      — 개인정보: 이메일
--   operator_ssn_masked — 개인정보: 주민등록번호(마스킹)
--   account_bank        — 금융정보: 은행명
--   account_number      — 금융정보: 계좌번호
--   account_holder      — 금융정보: 예금주
--   inicis_seller_id    — 내부 관리: 이니시스 판매자 ID
--   inicis_requested_at — 내부 관리: 이니시스 심사 요청일
--   inicis_completed_at — 내부 관리: 이니시스 심사 완료일
--   submall_code        — 내부 관리: 서브몰 코드
--   created_at          — 내부 관리: 생성일
-- ============================================================

DROP VIEW IF EXISTS settlement_infos_public;

CREATE VIEW settlement_infos_public
  WITH (security_invoker = false)     -- = SECURITY DEFINER
AS
SELECT
  id,
  member_id,
  kindergarten_id,
  inicis_status
FROM settlement_infos;

COMMENT ON VIEW settlement_infos_public IS
  '정산정보 공개 VIEW — 유치원 활성화 상태(inicis_status)만 노출. '
  '금융정보(계좌, 사업자번호), 개인정보(주민번호, 전화번호) 완전 제외. '
  'SECURITY INVOKER RPC에서 유치원 목록/상세 JOIN 시 원본 settlement_infos 대신 사용. '
  '원본: MIGRATION_PLAN.md 섹션 2.5 공통 RLS 충돌 해결 방안 A';

-- authenticated 역할에 SELECT만 허용
GRANT SELECT ON settlement_infos_public TO authenticated;


-- ============================================================
-- 완료 알림
-- ============================================================

DO $$
DECLARE
  v_view_count bigint;
BEGIN
  SELECT COUNT(*) INTO v_view_count
  FROM information_schema.views
  WHERE table_schema = 'public'
    AND table_name IN (
      'members_public_profile',
      'pets_public_info',
      'settlement_infos_public'
    );

  RAISE NOTICE '[44-0] 공개 VIEW % 개 생성 완료 (기대값: 3)', v_view_count;
  RAISE NOTICE '  - members_public_profile:    타 회원 프로필 (11 컬럼)';
  RAISE NOTICE '  - pets_public_info:          타 회원 반려동물 (15 컬럼, deleted=false만)';
  RAISE NOTICE '  - settlement_infos_public:   정산 활성화 상태 (4 컬럼)';
  RAISE NOTICE '  ※ 원본 테이블 RLS 정책은 변경 없음';
  RAISE NOTICE '  ※ VIEW는 authenticated 역할에 SELECT 권한만 부여';
END $$;
