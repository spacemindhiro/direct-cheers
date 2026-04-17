-- プラットフォーム手数料設定テーブル（no.51対応）
-- 手数料率をコード内にハードコードせず、ここで一元管理する

CREATE TABLE public.platform_config (
  config_id  uuid       PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_rate    numeric(6,4) NOT NULL DEFAULT 0.0360, -- Stripe 決済手数料
  platform_rate  numeric(6,4) NOT NULL DEFAULT 0.1000, -- プラットフォーム利用料
  updated_at     timestamptz  NOT NULL DEFAULT now()
);

-- admin のみ参照・更新可
ALTER TABLE public.platform_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_config_select" ON public.platform_config
  FOR SELECT USING (true); -- 全ロールから読み取り可（計算に使うため）

CREATE POLICY "platform_config_update" ON public.platform_config
  FOR UPDATE USING (
    (SELECT role FROM public.profiles WHERE profile_id = auth.uid()) = 'admin'
  );

-- 初期値を挿入
INSERT INTO public.platform_config (stripe_rate, platform_rate)
VALUES (0.0360, 0.1000);
