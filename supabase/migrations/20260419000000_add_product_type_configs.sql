-- 商品タイプ定義をDBで管理（No.6対応）
-- コード上のハードコードを廃止し、ここで一元管理する

CREATE TABLE public.product_type_configs (
  type        text    PRIMARY KEY,
  label       text    NOT NULL,
  min_amount  bigint  NOT NULL,
  max_amount  bigint  NOT NULL,
  is_enabled  boolean NOT NULL DEFAULT true,  -- false = エージェント承認後のみ
  sort_order  smallint NOT NULL DEFAULT 0
);

ALTER TABLE public.product_type_configs ENABLE ROW LEVEL SECURITY;

-- 全ロールから参照可（計算・表示に使うため）
CREATE POLICY "product_type_configs_select" ON public.product_type_configs
  FOR SELECT USING (true);

-- admin のみ更新可
CREATE POLICY "product_type_configs_update" ON public.product_type_configs
  FOR ALL USING (
    (SELECT role FROM public.profiles WHERE profile_id = auth.uid()) = 'admin'
  );

-- 初期値（No.6 の正しいレンジ）
INSERT INTO public.product_type_configs (type, label, min_amount, max_amount, is_enabled, sort_order) VALUES
  ('standard', 'スタンダード', 500,   3000,   true,  1),
  ('message',  'メッセージ',  1000,  5000,   true,  2),
  ('entrance', 'エントランス', 300,   30000,  true,  3),
  ('custom',   'カスタム',    500,   100000, false, 4);
