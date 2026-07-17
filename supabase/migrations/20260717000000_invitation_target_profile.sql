-- ==========================================
-- 招待の宛先を既存ユーザー指名制に変更
--
-- 1. invitations.target_profile_id を追加（宛先ユーザーの指名）
-- 2. RLS SELECT: 自分宛て判定に target_profile_id を追加
-- 3. accept_invitation: 指名招待はリンクが転送されても本人以外は受諾不可
--    （トークンはベアラーであり、従来は誰でも受諾できた）
-- ==========================================

alter table public.invitations
  add column if not exists target_profile_id uuid references public.profiles(profile_id) on delete set null;

create index if not exists idx_invitations_target_profile_id
  on public.invitations (target_profile_id);

-- ==========================================
-- RLS SELECT ポリシー更新
-- ==========================================
drop policy if exists "invitations_select" on public.invitations;

create policy "invitations_select" on public.invitations
  for select using (
    auth.uid() = invited_by_profile_id
    or target_profile_id = auth.uid()
    or target_email = (select email from auth.users where id = auth.uid())
  );

-- ==========================================
-- accept_invitation: 宛先本人チェックを追加
-- （20260627000000 のランクベース昇格版がベース）
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
  v_inv                    record;
  v_inviter_role           text;
  v_current_role           text;
  v_inherited_agent_id     uuid;
  v_current_rank           int;
  v_target_rank            int;
  v_rank_of                jsonb := '{"user":0,"artist":1,"organizer":2,"agent":3,"admin":4}'::jsonb;
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

  -- 3. 宛先本人チェック（指名招待は本人以外受諾不可）
  if v_inv.target_profile_id is not null and v_inv.target_profile_id != p_user_id then
    return jsonb_build_object('error', 'wrong_recipient');
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

  -- 5. role + status 更新
  --    ロールは上位互換のため、招待されたroleが現在のrankより高い場合のみ昇格させる。
  --    既に同等以上のrankを持つ場合はroleを変更せず（降格させない）、statusのみactive化する。
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
  --    - 招待者が admin/agent: 招待者をそのまま担当者に設定
  --    - 招待者が organizer: organizer の担当エージェントを引き継ぐ（なければ null のまま）
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
