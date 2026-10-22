-- チアリー(AI) のイベント作成（P5）のための DB 変更。
--   ① 会場のピンの位置（緯度・経度）。Google の店舗から登録したときは Places の location、名前の無い場所は本人が置いたピン。
--      既存の会場と、作成画面から手で登録した会場は空のまま
--   ② Google の地図サービスの利用記録。呼んだ1回ごとに時刻付きで残し、集計はあとから好きな区切りで行う
--      （無料の回数は毎月1日の太平洋時間0時に戻るので、その区切りで数えて上限に来たら止める）。
--      本人が入力した店名・地域などの文字は残さない
--   ③ 確認カードの使用済みの記録。1枚のカードからは1回しか書き込めない（二度押しで2つできない）
-- ②③はサーバー（service_role）だけが読み書きする。

-- ① 会場のピンの位置
alter table public.venues
  add column if not exists latitude  double precision,
  add column if not exists longitude double precision;

alter table public.venues
  add constraint venues_lat_lng_pair check ((latitude is null) = (longitude is null)),
  add constraint venues_latitude_range check (latitude is null or latitude between -90 and 90),
  add constraint venues_longitude_range check (longitude is null or longitude between -180 and 180);

-- ② Google の地図サービスの利用記録
create table if not exists public.google_api_calls (
  call_id    bigint generated always as identity primary key,
  called_at  timestamptz not null default now(),
  service    text not null check (service in ('places_text_search', 'geocoding', 'maps_js')),
  sku        text not null,                                  -- 料金区分（例 'text_search_pro'）
  profile_id uuid references public.profiles(profile_id) on delete set null,
  -- pending: 呼ぶ前に枠を確保した / found: 見つかった / not_found / closed: 閉店 / error: 失敗
  outcome    text not null default 'pending' check (outcome in ('pending', 'found', 'not_found', 'closed', 'error'))
);

create index if not exists google_api_calls_service_time_idx on public.google_api_calls (service, called_at);

alter table public.google_api_calls enable row level security;
revoke all on table public.google_api_calls from anon, authenticated;

-- 1回分の枠を確保する。太平洋時間の今月の回数が上限に来ていたら確保しない（null を返す）。
-- 同じサービスの確保が同時に走っても上限を超えないよう、サービスごとに順番に処理する
create or replace function public.google_api_reserve(
  p_service text,
  p_sku text,
  p_profile_id uuid,
  p_monthly_limit integer
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month_start timestamptz;
  v_count integer;
  v_id bigint;
begin
  perform pg_advisory_xact_lock(hashtext('google_api_reserve:' || p_service));
  v_month_start := date_trunc('month', now() at time zone 'America/Los_Angeles') at time zone 'America/Los_Angeles';
  select count(*) into v_count
    from google_api_calls
   where service = p_service and called_at >= v_month_start;
  if v_count >= p_monthly_limit then
    return null;
  end if;
  insert into google_api_calls (service, sku, profile_id) values (p_service, p_sku, p_profile_id)
  returning call_id into v_id;
  return v_id;
end;
$$;

create or replace function public.google_api_finish(p_call_id bigint, p_outcome text) returns void
language sql
security definer
set search_path = public
as $$
  update google_api_calls set outcome = p_outcome where call_id = p_call_id and outcome = 'pending';
$$;

revoke execute on function public.google_api_reserve(text, text, uuid, integer) from public, anon, authenticated;
revoke execute on function public.google_api_finish(bigint, text) from public, anon, authenticated;
grant execute on function public.google_api_reserve(text, text, uuid, integer) to service_role;
grant execute on function public.google_api_finish(bigint, text) to service_role;

-- ③ 確認カードの使用済みの記録
create table if not exists public.cheery_card_uses (
  card_id    uuid primary key,
  profile_id uuid not null references public.profiles(profile_id) on delete cascade,
  kind       text not null,           -- 'venue_register' | 'event_draft'
  result_id  uuid,                    -- できた会場・イベント
  created_at timestamptz not null default now()
);

alter table public.cheery_card_uses enable row level security;
revoke all on table public.cheery_card_uses from anon, authenticated;
