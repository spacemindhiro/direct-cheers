-- connections は RLS 有効なのに SELECT ポリシーが無く、ユーザー権限では常に 0 件だった。
-- そのためイベント作成画面の「コネクション済みアーティスト」が誰にも表示されていなかった。
-- 本人（主催者側・アーティスト側）と admin に読み取りを許可する。
drop policy if exists "connections_select" on public.connections;
create policy "connections_select" on public.connections
  for select using (
    auth.uid() = organizer_profile_id
    or auth.uid() = artist_profile_id
    or (select role from public.profiles where profile_id = auth.uid()) = 'admin'
  );
