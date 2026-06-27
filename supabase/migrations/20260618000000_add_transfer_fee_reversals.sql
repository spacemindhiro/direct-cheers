-- 出金手数料回収（Reverse Transfer）の実行ログテーブル
-- 1件の payout_request に対し、複数 transfer を分割 reversal する場合があるため別テーブルで管理する

CREATE TABLE public.transfer_fee_reversals (
  reversal_id          uuid        NOT NULL DEFAULT gen_random_uuid(),
  payout_request_id    uuid        NOT NULL REFERENCES public.payout_requests(request_id) ON DELETE CASCADE,
  source_transfer_id   text        NOT NULL,  -- Stripe Transfer ID (tr_xxx or tr_live_xxx)
  stripe_reversal_id   text        NOT NULL,  -- Stripe Reversal ID (trr_xxx) — 冪等性保証
  amount               bigint      NOT NULL CHECK (amount > 0),
  status               text        NOT NULL DEFAULT 'succeeded',
  created_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT transfer_fee_reversals_pkey PRIMARY KEY (reversal_id),
  CONSTRAINT transfer_fee_reversals_stripe_reversal_id_key UNIQUE (stripe_reversal_id)
);

ALTER TABLE public.transfer_fee_reversals ENABLE ROW LEVEL SECURITY;
-- RLS ポリシーなし = service_role（admin client）のみアクセス可
