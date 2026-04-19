-- ============================================================
-- SQL 47-01: scheduler Edge Function — pg_cron 자동 호출 설정
-- ============================================================
-- 실행 방법: Supabase SQL Editor에 전체 복사하여 실행
-- 목적: scheduler EF를 5분 간격으로 자동 호출하는 cron Job 등록
-- 보안: Vault에 시크릿 저장 → cron SQL에서 참조 (하드코딩 금지)
--
-- 선행 조건:
--   1. pg_cron 확장 활성화 (Dashboard > Database > Extensions)
--   2. pg_net 확장 활성화 (Dashboard > Database > Extensions)
--   3. scheduler EF 배포 완료:
--      supabase functions deploy scheduler --no-verify-jwt
--
-- 참조:
--   - https://supabase.com/docs/guides/functions/schedule-functions
--   - APP_MIGRATION_GUIDE.md §16-8 (scheduler cron 설정)
--   - STEP4_WORK_PLAN.md R5
-- ============================================================


-- ============================================================
-- Step 1: Vault에 시크릿 저장
-- ============================================================
-- Supabase Vault는 pgsodium 기반 암호화 저장소입니다.
-- service_role_key를 SQL에 하드코딩하지 않고 Vault에 안전하게 보관합니다.
--
-- ※ 아래 두 값을 실제 프로젝트 값으로 교체하세요:
--   - project_url     : Supabase Dashboard > Settings > API > Project URL
--   - service_role_key : Supabase Dashboard > Settings > API > service_role (secret)
-- ============================================================

-- 1-1. 프로젝트 URL 저장
--      (이미 존재하면 에러 → 무시하고 Step 2로 진행)
SELECT vault.create_secret(
  'https://ieeodlkvfnjikdpcumfa.supabase.co',
  'project_url',
  'Supabase 프로젝트 URL — pg_cron에서 Edge Function 호출 시 사용'
);

-- 1-2. Service Role Key 저장
--      ★★★ 아래 값을 실제 service_role_key로 교체하세요 ★★★
SELECT vault.create_secret(
  '여기에_실제_SERVICE_ROLE_KEY를_붙여넣으세요',
  'service_role_key',
  'Supabase Service Role Key — pg_cron에서 Edge Function 인증 시 사용'
);


-- ============================================================
-- Step 2: 기존 동일 이름 Job 삭제 (재실행 안전)
-- ============================================================

SELECT cron.unschedule('scheduler-every-5min')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'scheduler-every-5min'
);


-- ============================================================
-- Step 3: cron Job 등록 (5분 간격)
-- ============================================================
-- Vault에서 project_url과 service_role_key를 동적으로 읽어서 사용합니다.
-- SQL에 키가 노출되지 않으므로 git에 커밋해도 안전합니다.
-- ============================================================

SELECT cron.schedule(
  'scheduler-every-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := (
      SELECT decrypted_secret
      FROM vault.decrypted_secrets
      WHERE name = 'project_url'
      LIMIT 1
    ) || '/functions/v1/scheduler',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret
        FROM vault.decrypted_secrets
        WHERE name = 'service_role_key'
        LIMIT 1
      )
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);


-- ============================================================
-- Step 4: 등록 확인
-- ============================================================

SELECT jobid, jobname, schedule, active
FROM cron.job
WHERE jobname = 'scheduler-every-5min';


-- ============================================================
-- 완료 알림
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE '[47-01] scheduler cron Job 등록 완료';
  RAISE NOTICE '  - Job: scheduler-every-5min';
  RAISE NOTICE '  - 주기: */5 * * * * (5분 간격)';
  RAISE NOTICE '  - 대상: /functions/v1/scheduler';
  RAISE NOTICE '  - 인증: Vault → service_role_key';
  RAISE NOTICE '';
  RAISE NOTICE '확인 방법:';
  RAISE NOTICE '  SELECT * FROM cron.job;';
  RAISE NOTICE '  SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;';
  RAISE NOTICE '  SELECT * FROM scheduler_history ORDER BY started_at DESC LIMIT 5;';
END $$;


-- ============================================================
-- [참고] Vault 시크릿 수정이 필요한 경우
-- ============================================================
-- Vault 시크릿은 한번 생성하면 update_secret으로 수정합니다:
--
--   SELECT vault.update_secret(
--     (SELECT id FROM vault.secrets WHERE name = 'service_role_key'),
--     '새로운_SERVICE_ROLE_KEY'
--   );
--
-- 삭제 후 재생성도 가능합니다:
--   DELETE FROM vault.secrets WHERE name = 'service_role_key';
--   SELECT vault.create_secret('새로운_키', 'service_role_key');
-- ============================================================


-- ============================================================
-- [참고] cron Job 관리 명령어
-- ============================================================
-- 일시 중지:
--   UPDATE cron.job SET active = false WHERE jobname = 'scheduler-every-5min';
--
-- 재개:
--   UPDATE cron.job SET active = true WHERE jobname = 'scheduler-every-5min';
--
-- 삭제:
--   SELECT cron.unschedule('scheduler-every-5min');
--
-- 실행 이력 확인:
--   SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;
--
-- 실행 이력 정리 (오래된 기록 삭제):
--   DELETE FROM cron.job_run_details WHERE end_time < NOW() - INTERVAL '7 days';
-- ============================================================
