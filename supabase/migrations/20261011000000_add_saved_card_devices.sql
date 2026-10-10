-- QR決済で保存カードを出すための「この端末で実際に払ったStripe顧客」の対応表。
--
-- 背景: 保存カード（2026-09-06〜）はフォームに入力されたメールアドレスで Stripe 顧客を
-- 引いていたため、他人のメールを入れるとその人の保存カードが Checkout の選択肢に出た。
-- メールは誰でも入力できるので本人の証明にならない。代わりに、決済を完了したブラウザに
-- 推測できない合言葉（token）を httpOnly Cookie で渡し、その端末が実際に払った顧客の
-- 保存カードだけを出す。
--
-- - 発行は決済（checkout_session_id）1回につき最初の1回だけ（サンクス画面のURLが
--   他人に渡っても後から合言葉を取得できない）
-- - email は発行時の決済メール。フォームのメールが一致するときだけ使う
-- - サービスロール専用（RLS有効・ポリシー無し・anon/authenticated の権限剥奪）

CREATE TABLE IF NOT EXISTS public.saved_card_devices (
  token               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_customer_id  text        NOT NULL,
  email               text        NOT NULL,
  checkout_session_id text        NOT NULL UNIQUE,
  created_at          timestamptz NOT NULL DEFAULT now(),
  last_used_at        timestamptz
);

ALTER TABLE public.saved_card_devices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.saved_card_devices FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_card_devices TO service_role;
