-- Bug 115 追加修正: 招待受諾済みの既存ユーザーの status を active に更新
-- accept_invitation RPC の修正は新規受諾にしか効かないため、既存ユーザーを遡及修正する

update public.profiles
set status = 'active'
where profile_id in (
  select accepted_by_profile_id
  from public.invitations
  where status = 'accepted'
    and accepted_by_profile_id is not null
)
and status = 'pending_onboarding';
