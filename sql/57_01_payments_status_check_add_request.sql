-- ============================================================
-- SQL 57-1: payments.status CHECK 제약에 '돌봄요청' 추가
-- ============================================================
-- 실행 방법: Supabase SQL Editor에 전체 복사하여 실행
-- 목적: 결제내역 상태를 사양에 맞게 3가지로 확장
--       기존: 결제완료 / 결제취소
--       변경: 돌봄요청 / 결제완료 / 결제취소
--
-- 사양 (모바일앱 결제내역 표시 상태):
--   · 보호자 결제+돌봄요청 → "돌봄요청"
--   · 유치원 수락          → "결제완료"
--   · 보호자 요청 취소 / 유치원 거절 / 자동취소 / 관리자취소 / 노쇼 → "결제취소"
--
-- 이전 이력:
--   - SQL 18: '결제완료', '결제취소' 2개로 정리
--   - SQL 57-1(본 파일): '돌봄요청' 값 추가
-- ============================================================

-- 1) 기존 CHECK 제약 삭제
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_status_check;

-- 2) 기존 데이터 백필
--    reservations.status='수락대기'(유치원 응답 대기) 상태의 결제 건은
--    새 모델 기준 '돌봄요청'이 맞음 → 일괄 업데이트
--    (그 외 상태의 payments는 결제완료/결제취소 그대로 유지)
UPDATE payments p
   SET status = '돌봄요청'
  FROM reservations r
 WHERE p.reservation_id = r.id
   AND r.status = '수락대기'
   AND p.status = '결제완료';

-- 3) 새 CHECK 제약 추가 (3개 값 허용)
ALTER TABLE payments ADD CONSTRAINT payments_status_check
  CHECK (status IN ('돌봄요청', '결제완료', '결제취소'));

-- 4) 결과 확인용 NOTICE
DO $$
DECLARE
  v_request   int;
  v_paid      int;
  v_canceled  int;
BEGIN
  SELECT COUNT(*) INTO v_request  FROM payments WHERE status = '돌봄요청';
  SELECT COUNT(*) INTO v_paid     FROM payments WHERE status = '결제완료';
  SELECT COUNT(*) INTO v_canceled FROM payments WHERE status = '결제취소';

  RAISE NOTICE '[57-1] payments.status CHECK 제약 변경 완료';
  RAISE NOTICE '  - 허용 값: 돌봄요청 / 결제완료 / 결제취소';
  RAISE NOTICE '  - 현재 분포: 돌봄요청 %건, 결제완료 %건, 결제취소 %건',
               v_request, v_paid, v_canceled;
END $$;
