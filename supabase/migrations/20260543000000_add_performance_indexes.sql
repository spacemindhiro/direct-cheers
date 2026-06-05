-- パフォーマンスチューニング: 頻繁にスキャンされるカラムへのインデックス追加
-- RLS評価・JOIN・WHERE条件で毎回フルスキャンされていた箇所を解消する

-- ── transactions ──────────────────────────────────────────────────────────
-- dashboard・statistics で sender_profile_id = auth.uid() で毎回ヒット
CREATE INDEX IF NOT EXISTS transactions_sender_profile_id_idx
  ON public.transactions (sender_profile_id)
  WHERE deleted_at IS NULL;

-- settlement/reconcile で qr_config_id IN (...) のJOIN
CREATE INDEX IF NOT EXISTS transactions_qr_config_id_idx
  ON public.transactions (qr_config_id)
  WHERE deleted_at IS NULL;

-- 全ページの status = 'completed' フィルタ
CREATE INDEX IF NOT EXISTS transactions_status_idx
  ON public.transactions (status)
  WHERE deleted_at IS NULL;

-- ── transaction_distributions ──────────────────────────────────────────────
-- payout・statistics・dashboard で profile_id = userId で毎回ヒット
CREATE INDEX IF NOT EXISTS tx_distributions_profile_id_idx
  ON public.transaction_distributions (profile_id)
  WHERE deleted_at IS NULL;

-- settlement report で event_id でまとめて取得
CREATE INDEX IF NOT EXISTS tx_distributions_event_id_idx
  ON public.transaction_distributions (event_id)
  WHERE deleted_at IS NULL;

-- settlement の transaction_id JOIN
CREATE INDEX IF NOT EXISTS tx_distributions_transaction_id_idx
  ON public.transaction_distributions (transaction_id)
  WHERE deleted_at IS NULL;

-- ── events ────────────────────────────────────────────────────────────────
-- RLS評価・dashboard で organizer_profile_id = auth.uid() を毎回評価
CREATE INDEX IF NOT EXISTS events_organizer_profile_id_idx
  ON public.events (organizer_profile_id)
  WHERE deleted_at IS NULL;

-- RLS評価・dashboard で agent_id = auth.uid() を毎回評価
CREATE INDEX IF NOT EXISTS events_agent_id_idx
  ON public.events (agent_id)
  WHERE deleted_at IS NULL;

-- settlements・dashboard で lifecycle_status フィルタ
CREATE INDEX IF NOT EXISTS events_lifecycle_status_idx
  ON public.events (lifecycle_status)
  WHERE deleted_at IS NULL;

-- ── qr_configs ────────────────────────────────────────────────────────────
-- 全ページの中心: event_id でQR一覧を取得
CREATE INDEX IF NOT EXISTS qr_configs_event_id_idx
  ON public.qr_configs (event_id)
  WHERE deleted_at IS NULL;

-- ── event_artists ─────────────────────────────────────────────────────────
-- dashboard・RLS で event_id + artist_profile_id を評価
CREATE INDEX IF NOT EXISTS event_artists_event_id_idx
  ON public.event_artists (event_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS event_artists_artist_profile_id_idx
  ON public.event_artists (artist_profile_id)
  WHERE deleted_at IS NULL;

-- ── display_schedules ─────────────────────────────────────────────────────
-- タイムテーブル自動切り替え: event_id + 時刻範囲で毎30秒評価
CREATE INDEX IF NOT EXISTS display_schedules_event_id_time_idx
  ON public.display_schedules (event_id, start_at, end_at)
  WHERE deleted_at IS NULL;

-- ── entrance_reservations ────────────────────────────────────────────────
-- reservations ページで profile_id フィルタ
CREATE INDEX IF NOT EXISTS entrance_reservations_profile_id_idx
  ON public.entrance_reservations (profile_id)
  WHERE deleted_at IS NULL;

-- ── debt_claims ───────────────────────────────────────────────────────────
-- settlement report で original_transaction_id IN (...) のJOIN
CREATE INDEX IF NOT EXISTS debt_claims_original_tx_id_idx
  ON public.debt_claims (original_transaction_id)
  WHERE deleted_at IS NULL;
