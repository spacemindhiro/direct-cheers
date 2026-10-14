-- ブラウザから Supabase を直接叩く経路（anon key + 本人のJWT）で、APIを通さずに
-- 権限・金額を書き換えられた穴を塞ぐ（2026-10-13 再監査）。
--
-- 方針: 書き込みはAPI（サーバー・service_role）だけで行う。APIはそれぞれ権限確認済み。
-- ブラウザから直接書いている画面は profiles の2画面（初回プロフィール登録・クリエイター申請）
-- だけなので、profiles はポリシーを残して管理用の列をトリガーで守る。
-- それ以外のテーブルは、本人・役割ベースの書き込みポリシーを削除する（読み取りは変えない）。

-- ============================================================
-- 1. profiles: 管理用の列は本人が変えられない
--    （role を admin に、出金凍結の解除、手数料率の変更などができた）
-- ============================================================
create or replace function public.protect_profile_privileged_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- サーバー（service_role）と SECURITY DEFINER 関数（所有者 postgres）は対象外
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- 本人が作る行は一般ユーザーの初期値に固定する
    new.role                 := 'user';
    new.status               := 'pending_onboarding';
    new.verification_status  := 'unverified';
    new.pending_role         := null;
    new.stripe_connect_id    := null;
    new.stripe_customer_id   := null;
    new.stripe_restricted    := false;
    new.responsible_agent_id := null;
    new.base_fee_rate        := 0.1;
    new.chargeback_count     := 0;
    new.balance_frozen       := false;
    new.balance_frozen_at    := null;
    new.follower_count       := 0;
    new.follower_milestone   := 0;
    new.wallet_address       := null;
    new.deleted_at           := null;
    return new;
  end if;

  -- UPDATE: 管理用の列は元の値に戻す（初回登録画面の upsert が role:'user' を送ってくるため、
  -- エラーにせず黙って戻す。既存の主催者等が降格されることもなくなる）
  new.role                 := old.role;
  new.status               := old.status;
  new.stripe_connect_id    := old.stripe_connect_id;
  new.stripe_customer_id   := old.stripe_customer_id;
  new.stripe_restricted    := old.stripe_restricted;
  new.responsible_agent_id := old.responsible_agent_id;
  new.base_fee_rate        := old.base_fee_rate;
  new.chargeback_count     := old.chargeback_count;
  new.balance_frozen       := old.balance_frozen;
  new.balance_frozen_at    := old.balance_frozen_at;
  new.follower_count       := old.follower_count;
  new.follower_milestone   := old.follower_milestone;
  new.wallet_address       := old.wallet_address;
  new.deleted_at           := old.deleted_at;
  new.created_at           := old.created_at;

  -- クリエイター申請（未審査・差戻し → 審査待ち）だけは本人に許す
  if new.verification_status is distinct from old.verification_status
     and not (new.verification_status = 'pending'
              and old.verification_status in ('unverified', 'rejected')) then
    new.verification_status := old.verification_status;
  end if;

  return new;
end;
$$;

drop trigger if exists protect_profile_privileged_columns on public.profiles;
create trigger protect_profile_privileged_columns
  before insert or update on public.profiles
  for each row execute function public.protect_profile_privileged_columns();

-- ============================================================
-- 2. 本人・役割ベースの書き込みポリシーを削除（書き込みはAPIのみ）
-- ============================================================
-- 一般ユーザーが他人を主催者にした公開済みイベントを作れた／主催者が承認なしで公開できた
drop policy if exists "events_insert_active_only"      on public.events;
drop policy if exists "events_insert_organizer_active" on public.events;
drop policy if exists "events_update"                  on public.events;

-- アーティストが自分の出演行を別イベントへ移して出演確定にできた
drop policy if exists "event_artists_insert" on public.event_artists;
drop policy if exists "event_artists_update" on public.event_artists;

-- 購入者が前売り予約の請求額を書き換えられた（5000円→1円）。読み取りだけ残す
drop policy if exists "reservations_owner" on public.entrance_reservations;
drop policy if exists "reservations_owner_select" on public.entrance_reservations;
create policy "reservations_owner_select" on public.entrance_reservations
  for select using (
    profile_id = auth.uid()
    or email = (select provisional_users.email from public.provisional_users
                where provisional_users.profile_id = auth.uid())
  );

-- 主催者が決済後の配分比率を書き換えられた（マイナスも可）
drop policy if exists "qr_config_targets_insert" on public.qr_config_targets;
drop policy if exists "qr_config_targets_update" on public.qr_config_targets;

-- 受取人が自分宛QRの全項目を書き換えられた（APIは画像のみ許可）
drop policy if exists "qr_configs_insert" on public.qr_configs;
drop policy if exists "qr_configs_update" on public.qr_configs;
drop policy if exists "products_insert"   on public.products;

-- パスキーを step-up 登録APIを通さずに追加・削除できた
drop policy if exists "passkey_credentials_insert" on public.passkey_credentials;
drop policy if exists "passkey_credentials_delete" on public.passkey_credentials;

-- 運営メッセージを「運営から」に偽装できた
drop policy if exists "user insert reply" on public.admin_messages;
drop policy if exists "user mark read"    on public.admin_messages;

-- 規約同意の記録を任意の内容で作れた
drop policy if exists "users can insert own agreements" on public.terms_agreements;

-- 招待を任意の状態・期限で作れた
drop policy if exists "invitations_insert" on public.invitations;

-- 主催者なら誰でも他人のブースのNFCの飛び先を書き換えられた
drop policy if exists "booth_devices_insert"     on public.booth_devices;
drop policy if exists "booth_devices_update"     on public.booth_devices;
drop policy if exists "booth_holders_insert"     on public.booth_holders;
drop policy if exists "booth_holders_update"     on public.booth_holders;
drop policy if exists "equipment_devices_insert" on public.equipment_devices;
drop policy if exists "equipment_devices_update" on public.equipment_devices;
drop policy if exists "venues_insert"            on public.venues;
drop policy if exists "venues_update"            on public.venues;

-- ============================================================
-- 3. 配分比率は 0〜1。合計100%だけの確認では「1.09 と -0.09」が通った
--    既存行の検査で本番マイグレーションが止まらないよう NOT VALID（新しい書き込みだけ検査）
-- ============================================================
alter table public.qr_config_targets
  drop constraint if exists qr_config_targets_ratio_range;
alter table public.qr_config_targets
  add constraint qr_config_targets_ratio_range
  check (distribution_ratio >= 0 and distribution_ratio <= 1) not valid;

-- ============================================================
-- 4. 招待の受諾: 呼び出した本人にしか適用できないようにする
--    （p_user_id を照合しておらず、未ログインでも任意のユーザーに役割を付けられた）
-- ============================================================
create or replace function public.accept_invitation(
  p_token    uuid,
  p_user_id  uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv                    record;
  v_inviter_role           text;
  v_current_role           text;
  v_inherited_agent_id     uuid;
  v_current_rank           int;
  v_target_rank            int;
  v_user_email             text;
  v_rank_of                jsonb := '{"user":0,"artist":1,"organizer":2,"agent":3,"admin":4}'::jsonb;
begin
  -- 0. 本人確認（サーバーの service_role からの呼び出しは auth.uid() が無いので対象外）
  if auth.role() is distinct from 'service_role'
     and (auth.uid() is null or auth.uid() <> p_user_id) then
    return jsonb_build_object('error', 'wrong_recipient');
  end if;

  -- 1. トークン検証
  select * into v_inv
  from public.invitations
  where token      = p_token
    and status     = 'pending'
    and expires_at > now()
    and deleted_at is null;

  if not found then
    return jsonb_build_object('error', 'invalid_token');
  end if;

  -- 2. 自己受諾チェック
  if v_inv.invited_by_profile_id = p_user_id then
    return jsonb_build_object('error', 'self_accept');
  end if;

  -- 3. 宛先本人チェック（指名招待は本人のみ。メール宛の招待はメールアドレス一致のみ）
  if v_inv.target_profile_id is not null then
    if v_inv.target_profile_id != p_user_id then
      return jsonb_build_object('error', 'wrong_recipient');
    end if;
  elsif v_inv.target_email is not null then
    select email into v_user_email from auth.users where id = p_user_id;
    if v_user_email is null or lower(v_user_email) <> lower(v_inv.target_email) then
      return jsonb_build_object('error', 'wrong_recipient');
    end if;
  end if;

  -- 招待者のロール・担当エージェント取得
  select role, responsible_agent_id
  into v_inviter_role, v_inherited_agent_id
  from public.profiles
  where profile_id = v_inv.invited_by_profile_id;

  -- 受諾者の現在ロール取得
  select role into v_current_role
  from public.profiles
  where profile_id = p_user_id;

  -- 4. invitations を accepted に更新
  update public.invitations
  set
    status                 = 'accepted',
    accepted_by_profile_id = p_user_id,
    accepted_at            = now()
  where invitation_id = v_inv.invitation_id;

  -- 5. role + status 更新（上位互換: 招待のroleが現在より高い場合のみ昇格、降格はしない）
  v_current_rank := coalesce((v_rank_of->>v_current_role)::int, 0);
  v_target_rank  := coalesce((v_rank_of->>v_inv.target_role)::int, 0);

  if v_target_rank > v_current_rank then
    update public.profiles
    set
      role   = v_inv.target_role,
      status = 'active'
    where profile_id = p_user_id;
  else
    update public.profiles
    set status = 'active'
    where profile_id = p_user_id
      and status != 'active';
  end if;

  -- 6. responsible_agent_id 設定（未設定の場合のみ）
  if v_inviter_role in ('admin', 'agent') then
    update public.profiles
    set responsible_agent_id = v_inv.invited_by_profile_id
    where profile_id = p_user_id
      and responsible_agent_id is null;
  elsif v_inviter_role = 'organizer' and v_inherited_agent_id is not null then
    update public.profiles
    set responsible_agent_id = v_inherited_agent_id
    where profile_id = p_user_id
      and responsible_agent_id is null;
  end if;

  -- 7. connection 作成（artist 招待 かつ 招待者が organizer の場合）
  if v_inv.target_role = 'artist' and v_inviter_role = 'organizer' then
    insert into public.connections (
      organizer_profile_id,
      artist_profile_id,
      status,
      invitation_id
    )
    values (
      v_inv.invited_by_profile_id,
      p_user_id,
      'active',
      v_inv.invitation_id
    )
    on conflict (organizer_profile_id, artist_profile_id) do nothing;
  end if;

  return jsonb_build_object('success', true, 'role', v_inv.target_role);
end;
$$;

revoke execute on function public.accept_invitation(uuid, uuid) from public, anon;
grant  execute on function public.accept_invitation(uuid, uuid) to authenticated, service_role;

-- ============================================================
-- 5. 未ログインでも他人のフォロワー数・チャージバック回数を増減できた
--    呼び出し元はサーバー（admin client）とSECURITY DEFINER関数だけ
-- ============================================================
revoke execute on function public.increment_follower_count(uuid)   from public, anon, authenticated;
revoke execute on function public.decrement_follower_count(uuid)   from public, anon, authenticated;
revoke execute on function public.increment_chargeback_count(uuid) from public, anon, authenticated;
grant  execute on function public.increment_follower_count(uuid)   to service_role;
grant  execute on function public.decrement_follower_count(uuid)   to service_role;
grant  execute on function public.increment_chargeback_count(uuid) to service_role;
