-- Bug 115 修正: accept_invitation RPC でロール変更時に status も 'active' に更新
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

  -- 4. role + status 更新（現在 'user' の場合のみ role を変更、status は常に 'active' に）
  if v_current_role = 'user' then
    update public.profiles
    set
      role   = v_inv.target_role,
      status = 'active'
    where profile_id = p_user_id;
  else
    -- role はそのままで status だけ active にする
    update public.profiles
    set status = 'active'
    where profile_id = p_user_id
      and status != 'active';
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
