-- accept_invitation RPC の responsible_agent_id 設定を修正。
-- 旧: 招待者が誰であれ invited_by_profile_id をそのまま設定。
-- 問題: organizer が artist を招待した場合、artist の responsible_agent_id が
--       organizer になってしまう（organizer はエージェントではない）。
-- 修正:
--   - inviter = admin/agent: invited_by_profile_id をそのまま設定
--   - inviter = organizer: organizer の responsible_agent_id を引き継ぐ
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

  -- 招待者のロール・担当エージェント取得
  select role, responsible_agent_id
  into v_inviter_role, v_inherited_agent_id
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

  -- 4. role + status 更新（現在 'user' の場合のみ role を変更、status は常に 'active' に）
  if v_current_role = 'user' then
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

  -- 5. responsible_agent_id 設定（未設定の場合のみ）
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
