-- QR受取人（アーティスト本人）がimage_url/strip_image_urlを更新できるよう
-- qr_configs_update RLSポリシーにrecipient_profile_id条件を追加する。
-- カラム単位の制限（受取人はimage_url/strip_image_urlのみ更新可）は
-- app/api/qr/[qrConfigId]/route.ts側のアプリケーション層で検証済み。
-- RLSはあくまで行単位のアクセス境界として、受取人自身の行を許可する。
drop policy if exists "qr_configs_update" on public.qr_configs;
create policy "qr_configs_update" on public.qr_configs
  for update using (
    exists (
      select 1 from public.get_event_principals(qr_configs.event_id) p
      where p.organizer_profile_id = auth.uid() or p.agent_id = auth.uid()
    )
    or recipient_profile_id = auth.uid()
    or (select role from public.profiles where profile_id = auth.uid()) = 'admin'
  );
