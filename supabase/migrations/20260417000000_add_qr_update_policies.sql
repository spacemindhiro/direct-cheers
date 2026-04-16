-- qr_configs UPDATE（ラベル・recipient・deleted_at の更新を許可）
create policy "qr_configs_update" on public.qr_configs
  for update using (
    exists (
      select 1 from public.get_event_principals(qr_configs.event_id) p
      where p.organizer_profile_id = auth.uid() or p.agent_id = auth.uid()
    )
    or (select role from public.profiles where profile_id = auth.uid()) = 'admin'
  );

-- qr_config_targets UPDATE（deleted_at の論理削除を許可）
create policy "qr_config_targets_update" on public.qr_config_targets
  for update using (
    exists (
      select 1 from public.qr_configs qc
      join public.get_event_principals(qc.event_id) p on true
      where qc.qr_config_id = qr_config_targets.qr_config_id
        and (p.organizer_profile_id = auth.uid() or p.agent_id = auth.uid())
    )
    or (select role from public.profiles where profile_id = auth.uid()) = 'admin'
  );
