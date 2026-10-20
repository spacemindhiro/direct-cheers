-- チアリー(AI) の利用上限のための記録。会話の中身は一切持たない（回数とトークン数・概算費用だけ）。
--   ① 1人1日あたりの回数上限 … cheery_usage_daily.request_count
--   ② DC全体の月額上限 … cheery_usage_daily.cost_usd の月合計。超えたら cheery_monthly_guard に止めた記録と運営への通知済みを残す
-- どちらもサーバー（service_role）だけが読み書きする。利用者の画面やAPIキーから直接は触らせない。

create table if not exists public.cheery_usage_daily (
  profile_id         uuid        not null references public.profiles(profile_id) on delete cascade,
  usage_date         date        not null,              -- 日本時間の日付
  request_count      integer     not null default 0,
  input_tokens       bigint      not null default 0,    -- キャッシュを使わなかった入力
  cache_read_tokens  bigint      not null default 0,
  cache_write_tokens bigint      not null default 0,
  output_tokens      bigint      not null default 0,
  cost_usd           numeric(12,6) not null default 0, -- モデルの単価から計算した概算
  updated_at         timestamptz not null default now(),
  primary key (profile_id, usage_date)
);

create index if not exists cheery_usage_daily_date_idx on public.cheery_usage_daily (usage_date);

create table if not exists public.cheery_monthly_guard (
  month       text        primary key,  -- 'YYYY-MM'（日本時間）
  stopped_at  timestamptz,
  notified_at timestamptz
);

alter table public.cheery_usage_daily enable row level security;
alter table public.cheery_monthly_guard enable row level security;
-- ポリシーは作らない（＝ anon / authenticated からは読めも書けもしない）。既定の権限付与も外しておく
revoke all on table public.cheery_usage_daily from anon, authenticated;
revoke all on table public.cheery_monthly_guard from anon, authenticated;

-- 1回分の利用枠を確保する。月の上限で止まっている／その日の回数が上限なら確保しない。
-- 戻り値: 'ok' | 'daily_limit' | 'monthly_limit'
create or replace function public.cheery_reserve_request(
  p_profile_id uuid,
  p_usage_date date,
  p_daily_limit integer,
  p_month text,
  p_month_start date,
  p_month_end date,
  p_monthly_limit_usd numeric
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_spent numeric;
  v_count integer;
begin
  if exists (select 1 from cheery_monthly_guard where month = p_month and stopped_at is not null) then
    return 'monthly_limit';
  end if;

  select coalesce(sum(cost_usd), 0) into v_spent
    from cheery_usage_daily
   where usage_date >= p_month_start and usage_date < p_month_end;
  if v_spent >= p_monthly_limit_usd then
    return 'monthly_limit';
  end if;

  insert into cheery_usage_daily as u (profile_id, usage_date, request_count)
  values (p_profile_id, p_usage_date, 1)
  on conflict (profile_id, usage_date) do update
    set request_count = u.request_count + 1, updated_at = now()
    where u.request_count < p_daily_limit
  returning u.request_count into v_count;

  if v_count is null then
    return 'daily_limit';
  end if;
  return 'ok';
end;
$$;

-- 応答が終わったあとに、使ったトークン数と概算費用を足す
create or replace function public.cheery_record_usage(
  p_profile_id uuid,
  p_usage_date date,
  p_input_tokens bigint,
  p_cache_read_tokens bigint,
  p_cache_write_tokens bigint,
  p_output_tokens bigint,
  p_cost_usd numeric
) returns void
language sql
security definer
set search_path = public
as $$
  insert into cheery_usage_daily as u
    (profile_id, usage_date, input_tokens, cache_read_tokens, cache_write_tokens, output_tokens, cost_usd)
  values (p_profile_id, p_usage_date, p_input_tokens, p_cache_read_tokens, p_cache_write_tokens, p_output_tokens, p_cost_usd)
  on conflict (profile_id, usage_date) do update set
    input_tokens       = u.input_tokens + excluded.input_tokens,
    cache_read_tokens  = u.cache_read_tokens + excluded.cache_read_tokens,
    cache_write_tokens = u.cache_write_tokens + excluded.cache_write_tokens,
    output_tokens      = u.output_tokens + excluded.output_tokens,
    cost_usd           = u.cost_usd + excluded.cost_usd,
    updated_at         = now();
$$;

-- 月の合計が上限に達していたら止める。運営への通知が必要なとき（この月で初めて止めたとき）だけ true を返す
create or replace function public.cheery_stop_month_if_over(
  p_month text,
  p_month_start date,
  p_month_end date,
  p_monthly_limit_usd numeric
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_spent numeric;
  v_notify boolean;
begin
  select coalesce(sum(cost_usd), 0) into v_spent
    from cheery_usage_daily
   where usage_date >= p_month_start and usage_date < p_month_end;
  if v_spent < p_monthly_limit_usd then
    return false;
  end if;

  insert into cheery_monthly_guard (month, stopped_at, notified_at)
  values (p_month, now(), now())
  on conflict (month) do nothing
  returning true into v_notify;

  return coalesce(v_notify, false);
end;
$$;

revoke execute on function public.cheery_reserve_request(uuid, date, integer, text, date, date, numeric) from public, anon, authenticated;
revoke execute on function public.cheery_record_usage(uuid, date, bigint, bigint, bigint, bigint, numeric) from public, anon, authenticated;
revoke execute on function public.cheery_stop_month_if_over(text, date, date, numeric) from public, anon, authenticated;
grant execute on function public.cheery_reserve_request(uuid, date, integer, text, date, date, numeric) to service_role;
grant execute on function public.cheery_record_usage(uuid, date, bigint, bigint, bigint, bigint, numeric) to service_role;
grant execute on function public.cheery_stop_month_if_over(text, date, date, numeric) to service_role;
