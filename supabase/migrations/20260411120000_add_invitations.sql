-- ==========================================
-- Add invitations table (招待制度)
-- ==========================================

-- invitations テーブル
create table public.invitations (
  invitation_id         uuid default gen_random_uuid() primary key,
  token                 uuid default gen_random_uuid() unique not null,
  invited_by_profile_id uuid references public.profiles(profile_id) on delete restrict not null,
  target_role           text check (target_role in ('agent', 'organizer', 'artist')) not null,
  target_email          text,
  status                text check (status in ('pending', 'accepted', 'expired')) default 'pending' not null,
  expires_at            timestamptz default now() + interval '30 days' not null,
  accepted_by_profile_id uuid references public.profiles(profile_id) on delete set null,
  accepted_at           timestamptz,
  created_at            timestamptz default now() not null,
  updated_at            timestamptz default now() not null,
  deleted_at            timestamptz
);

-- updated_at 自動更新トリガー
create trigger update_invitations_modtime
  before update on public.invitations
  for each row execute function update_modified_column();

-- connections に invitation_id カラムを追加
alter table public.connections
  add column if not exists invitation_id uuid references public.invitations(invitation_id) on delete set null;

-- ==========================================
-- RLS
-- ==========================================
alter table public.invitations enable row level security;

-- SELECT: 自分が発行した招待、または自分宛て(target_email)の招待のみ
create policy "invitations_select" on public.invitations
  for select using (
    auth.uid() = invited_by_profile_id
    or target_email = (select email from auth.users where id = auth.uid())
  );

-- INSERT: 権限マトリクスに基づく
--   admin      → agent / organizer / artist 招待可
--   agent      → organizer / artist 招待可
--   organizer  → artist のみ招待可
create policy "invitations_insert" on public.invitations
  for insert with check (
    auth.uid() = invited_by_profile_id
    and (
      (
        target_role in ('agent', 'organizer', 'artist')
        and (select role from public.profiles where profile_id = auth.uid()) = 'admin'
      )
      or
      (
        target_role in ('organizer', 'artist')
        and (select role from public.profiles where profile_id = auth.uid()) = 'agent'
      )
      or
      (
        target_role = 'artist'
        and (select role from public.profiles where profile_id = auth.uid()) = 'organizer'
      )
    )
  );

-- UPDATE: ポリシーなし = 一般ユーザーからの UPDATE は拒否
--         サービスロール (API サーバー) のみ実行可能

-- ==========================================
-- accept_invitation RPC（security definer = RLS バイパス）
-- ==========================================
create or replace function public.accept_invitation(
  p_token    uuid,
  p_user_id  uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv          record;
  v_inviter_role text;
  v_current_role text;
begin
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

  -- 招待者のロール取得
  select role into v_inviter_role
  from public.profiles
  where profile_id = v_inv.invited_by_profile_id;

  -- 受諾者の現在ロール取得
  select role into v_current_role
  from public.profiles
  where profile_id = p_user_id;

  -- 3. invitations を accepted に更新
  update public.invitations
  set
    status                 = 'accepted',
    accepted_by_profile_id = p_user_id,
    accepted_at            = now()
  where invitation_id = v_inv.invitation_id;

  -- 4. role 更新（現在 'user' の場合のみ）
  if v_current_role = 'user' then
    update public.profiles
    set role = v_inv.target_role
    where profile_id = p_user_id;
  end if;

  -- 5. responsible_agent_id 設定（未設定の場合のみ）
  update public.profiles
  set responsible_agent_id = v_inv.invited_by_profile_id
  where profile_id  = p_user_id
    and responsible_agent_id is null;

  -- 6. connection 作成（artist 招待 かつ 招待者が organizer の場合）
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

-- authenticated ロールに EXECUTE 権限を付与
grant execute on function public.accept_invitation(uuid, uuid) to authenticated;
