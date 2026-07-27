-- event-evidenceバケットは元々「service_role(admin client)経由のみ書き込み可」
-- としていたが、これはアプリ側の認可ロジック（イベント本人の主催者／担当エージェント／
-- 管理者のみ）をDB側に複製し忘れていただけの設定漏れであり、意図的な制限ではない。
-- ブラウザから直接ストレージへアップロードできるよう、アプリのAPIルート
-- （app/api/events/[eventId]/evidence/upload*/route.ts）が行っているのと
-- 全く同じ認可条件をRLSポリシーとして複製する。
--
-- パスは "{event_id}/{uuid}-{filename}" 形式（storage.foldername(name)の
-- 最初の要素がevent_id）。
CREATE POLICY "event_evidence_insert_authorized" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'event-evidence'
    AND EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.event_id::text = (storage.foldername(name))[1]
        AND (
          e.organizer_profile_id = auth.uid()
          OR (e.agent_id = auth.uid() AND (SELECT role FROM public.profiles WHERE profile_id = auth.uid()) = 'agent')
          OR (SELECT role FROM public.profiles WHERE profile_id = auth.uid()) = 'admin'
        )
    )
  );
