-- reconcile_error が残ったままのトランザクションの reconciled_at をリセット
-- （エラー時に誤って reconciled_at をセットしてしまったバグの修正）
UPDATE public.transactions
SET reconciled_at = NULL
WHERE reconcile_error IS NOT NULL;

-- 上記トランザクションを持つイベントの reconciled_at もリセット
UPDATE public.events
SET reconciled_at = NULL
WHERE event_id IN (
  SELECT DISTINCT qc.event_id
  FROM public.transactions t
  JOIN public.qr_configs qc ON qc.qr_config_id = t.qr_config_id
  WHERE t.reconcile_error IS NOT NULL
);
