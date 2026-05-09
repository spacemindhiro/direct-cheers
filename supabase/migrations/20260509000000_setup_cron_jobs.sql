-- pg_cron が有効な場合のみ Edge Function スケジュールを設定する
-- pg_cron が無効な場合は Supabase Dashboard > Edge Functions > Schedules から手動設定すること
--
-- Vault に以下を事前登録すること（登録後に db push または手動実行）:
--   select vault.create_secret('https://{project-ref}.supabase.co', 'SUPABASE_URL');
--   select vault.create_secret('{service-role-key}', 'SUPABASE_SERVICE_ROLE_KEY');

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron not enabled — skipping cron job setup';
    return;
  end if;

  -- 既存ジョブを削除（冪等）
  if exists (select 1 from cron.job where jobname = 'charge-type-a') then
    perform cron.unschedule('charge-type-a');
  end if;
  if exists (select 1 from cron.job where jobname = 'check-card-validity') then
    perform cron.unschedule('check-card-validity');
  end if;

  -- タイプA: 5日前自動オーソリ (毎日 0:00 JST = 15:00 UTC)
  perform cron.schedule(
    'charge-type-a',
    '0 15 * * *',
    $job$
    select net.http_post(
      url     := (select decrypted_secret from vault.decrypted_secrets where name = 'SUPABASE_URL') || '/functions/v1/charge-type-a',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'SUPABASE_SERVICE_ROLE_KEY')
      ),
      body    := '{}'::jsonb
    );
    $job$
  );

  -- 10日前カード有効性チェック (毎日 0:30 JST = 15:30 UTC)
  perform cron.schedule(
    'check-card-validity',
    '30 15 * * *',
    $job$
    select net.http_post(
      url     := (select decrypted_secret from vault.decrypted_secrets where name = 'SUPABASE_URL') || '/functions/v1/check-card-validity',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'SUPABASE_SERVICE_ROLE_KEY')
      ),
      body    := '{}'::jsonb
    );
    $job$
  );

  raise notice 'cron jobs registered: charge-type-a, check-card-validity';
end;
$$;
