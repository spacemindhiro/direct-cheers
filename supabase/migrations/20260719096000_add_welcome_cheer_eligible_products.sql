-- ウェルカムチア（2階）に含める演者チアを、QR作成時に主催者が明示的に選ぶための
-- 紐付けテーブル。金額が一致するだけの商品が誰でも候補に出てしまうと、
-- 主催者が意図しない相手がウェルカムチアの受け皿になりうるため、
-- 「主催者が選んだ既存のワンプライスチアQR」だけを候補に限定する。

CREATE TABLE public.welcome_cheer_eligible_products (
  eligible_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entrance_product_id UUID NOT NULL REFERENCES public.products(product_id) ON DELETE CASCADE,
  cheer_product_id    UUID NOT NULL REFERENCES public.products(product_id) ON DELETE CASCADE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entrance_product_id, cheer_product_id)
);

COMMENT ON TABLE public.welcome_cheer_eligible_products IS
  'entrance_product_id（1階のエントランス商品）ごとに、2階（ウェルカムチア）の宛先として選択可能なcheer_product_idを列挙する。QR作成時に主催者が既存のワンプライスチアQRから選ぶ。';

CREATE INDEX idx_welcome_cheer_eligible_products_entrance
  ON public.welcome_cheer_eligible_products (entrance_product_id);

ALTER TABLE public.welcome_cheer_eligible_products ENABLE ROW LEVEL SECURITY;

-- サービスロールのみ書き込み。閲覧はentranceの主催者/エージェント/admin、
-- および誰でも「候補一覧を見る」ために必要（確定APIはservice roleで動くため
-- 実質的にはservice role経由のみで完結するが、将来クライアント直読みする
-- 可能性に備えて認証済みユーザーへのSELECTも許可しておく）。
CREATE POLICY "welcome_cheer_eligible_products_select_authenticated"
  ON public.welcome_cheer_eligible_products FOR SELECT
  TO authenticated
  USING (true);

GRANT SELECT ON public.welcome_cheer_eligible_products TO authenticated;
GRANT ALL    ON public.welcome_cheer_eligible_products TO service_role;
