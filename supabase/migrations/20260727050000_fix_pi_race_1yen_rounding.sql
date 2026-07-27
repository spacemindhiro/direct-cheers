-- 2026-07-27 本番データ修正: PI pi_3Tx6NgRyZnZH287E1r7w7Q79 の
-- ウェルカムチア2階行(d80ba368-1bc9-45e7-8424-7525080e1305)が、手動照合の
-- 同時実行レースにより兄弟行(1階)と揃わずに単独処理され、
-- Math.floor()のみで按分された結果 stripe_fee_actual=19/stripe_net_actual=480 と
-- なっていた(Stripe実測ではこのPI全体でfee=119/net=2881、1階側と合わせた
-- 正しい按分は fee=20/net=481)。連動して organizer 配分(a7407a12,
-- 0d9554bc-2f67-4c85-92b5-bb4cf63ccb30)も 430→431 に訂正する。

update public.transactions
set stripe_fee_actual = 20,
    stripe_net_actual = 481
where transaction_id = 'd80ba368-1bc9-45e7-8424-7525080e1305'
  and stripe_fee_actual = 19
  and stripe_net_actual = 480;

update public.transaction_distributions
set actual_amount = 431
where transaction_distribution_id = '0d9554bc-2f67-4c85-92b5-bb4cf63ccb30'
  and actual_amount = 430;
