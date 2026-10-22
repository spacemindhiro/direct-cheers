-- 開催承認（キャプチャ）とタッチ決済の自動キャプチャの記録（2026-10-22）
--
-- 背景:
--   開催承認ボタンはStripeでキャプチャするだけで、DBには何も残していなかった。
--   精算管理の画面は「全件照合済み」になるまで「要承認」のままで、押しても承認済みに見えなかった。
--   またタッチ決済は Amex の対面オーソリ期限が2日しかなく、開催承認を待つと回収できないことがあるため、
--   締め時刻（終了＋3時間）かオーソリから24時間の早い方で自動キャプチャする。キャプチャ済みかどうかを
--   DBで判別できないと、現場取消の案内（オーソリ取消＝手数料なし／返金＝手数料は主催者負担）を出し分けられない。
--
-- 書き込みはサーバー（service_role）だけ。events / transactions はブラウザからの書き込みポリシーを
-- 20261014000000_lockdown_direct_writes.sql で外してあるので、列の追加で書ける経路は増えない。

alter table public.events
  add column if not exists capture_approved_at timestamptz;

comment on column public.events.capture_approved_at is
  '開催承認（全件キャプチャ）を実行した日時。NULL=未承認。精算管理の表示段階に使う';

alter table public.transactions
  add column if not exists captured_at timestamptz;

comment on column public.transactions.captured_at is
  'Stripeでキャプチャした日時（開催承認・タッチ決済の自動キャプチャ）。NULL=オーソリ中または即時売上の経路';
