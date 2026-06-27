-- ==========================================
-- qr_config_thanks: サンクス特典をQRコード単位に変更（no.4対応）
-- 既存の event_thanks はイベント単位のため廃止予定
-- ==========================================
CREATE TABLE public.qr_config_thanks (
  qr_config_thanks_id uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  qr_config_id        uuid        NOT NULL REFERENCES public.qr_configs(qr_config_id) ON DELETE CASCADE,
  thanks_message      text,
  thanks_link_url     text,
  thanks_media_url    text,
  published_at        timestamptz,          -- NULL = 下書き, NOT NULL = 公開済み
  created_by          uuid        NOT NULL REFERENCES public.profiles(profile_id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE(qr_config_id)                      -- 1 QR = 1 特典
);

ALTER TABLE public.qr_config_thanks ENABLE ROW LEVEL SECURITY;

-- オーガナイザー・エージェント・管理者：イベントに紐づくQRの特典を管理
CREATE POLICY "qr_config_thanks_manage" ON public.qr_config_thanks
  FOR ALL USING (
    created_by = auth.uid()
    OR (SELECT role FROM public.profiles WHERE profile_id = auth.uid()) = 'admin'
    OR exists (
      select 1 from public.qr_configs qc
      join public.get_event_principals(qc.event_id) p on true
      where qc.qr_config_id = qr_config_thanks.qr_config_id
        and (p.organizer_profile_id = auth.uid() or p.agent_id = auth.uid())
    )
  );

-- updated_at 自動更新トリガー
CREATE TRIGGER trg_qr_config_thanks_updated_at
  BEFORE UPDATE ON public.qr_config_thanks
  FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();
