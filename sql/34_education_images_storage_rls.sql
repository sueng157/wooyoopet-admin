-- ============================================================
-- SQL 34: 교육관리 — education-images 버킷 Storage RLS 정책
-- ============================================================
-- 실행 방법: Supabase SQL Editor에 전체 복사하여 실행
-- 목적: education-images 버킷에 대한 업로드(INSERT) 및 삭제(DELETE) 권한 허용
-- 배경: 버킷 생성 후 이미지 업로드 시
--        "new row violates row level security policy" 에러 발생하여 추가
-- ============================================================

-- 업로드 허용
CREATE POLICY "Allow public upload to education-images"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'education-images');

-- 삭제 허용 (이미지 교체/삭제 시 기존 파일 제거용)
CREATE POLICY "Allow public delete from education-images"
ON storage.objects
FOR DELETE
USING (bucket_id = 'education-images');
