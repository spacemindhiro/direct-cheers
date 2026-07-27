-- タッチ決済(WisePad等のcard_present)は、オンラインカード決済(card-not-present)
-- とStripeの実手数料率が異なる。本番の初回照合実績で確認:
--   - card_present(WisePadタッチ決済): 実測 約3.55%（消費税上乗せなし）
--   - オンラインカード決済(Visa/JCB): 実測 3.96〜4.00%（3.6% × 消費税1.1相当）
-- これまでは両方とも同じ stripe_rate(オンライン想定の3.96%)で見積もっていた
-- ため、card_present側の見積り誤差が常に発生し、照合のたびに配分が
-- 訂正される状態になっていた。card_present専用のレートを追加し、
-- app/api/entrance/terminal/complete/route.ts (WisePadタッチ決済の完了処理)
-- で使う。
--
-- 3.55%はこの時点で確認できた実測値からの近似であり、今後の照合実績を
-- 重ねてさらに精度を上げていく前提（照合による事後訂正の仕組み自体は
-- 引き続き必要）。

ALTER TABLE public.platform_config
  ADD COLUMN IF NOT EXISTS stripe_present_rate numeric(7,5) NOT NULL DEFAULT 0.03550;

UPDATE public.platform_config
SET stripe_present_rate = 0.03550,
    updated_at = now()
WHERE config_id = (
  SELECT config_id FROM public.platform_config ORDER BY updated_at DESC LIMIT 1
);
