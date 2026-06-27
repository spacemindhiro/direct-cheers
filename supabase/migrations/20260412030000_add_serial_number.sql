-- ==========================================
-- シリアルナンバー採番機能
-- ==========================================

-- events にシリアル番号のスコープ設定を追加
-- 'event': イベント内通し番号（全アーティスト合算）
-- 'artist': アーティスト別の番号
ALTER TABLE public.events
  ADD COLUMN serial_scope text NOT NULL DEFAULT 'event'
    CHECK (serial_scope IN ('event', 'artist'));

-- ==========================================
-- 採番 RPC（排他制御付き）
-- transactions テーブルを直接 MAX+1 で採番する。
-- pg_advisory_xact_lock でイベント単位の排他制御をかけ、
-- 同時決済での重複番号を防ぐ。
-- ==========================================
CREATE OR REPLACE FUNCTION assign_serial_number(
  p_transaction_id  uuid,
  p_event_id        uuid,
  p_artist_id       uuid DEFAULT NULL  -- serial_scope='artist' のときのみ使用
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_scope     text;
  v_next_seq  integer;
  v_lock_key  bigint;
BEGIN
  -- スコープ取得
  SELECT serial_scope INTO v_scope
    FROM public.events
   WHERE event_id = p_event_id;

  IF v_scope IS NULL THEN
    v_scope := 'event';
  END IF;

  -- Advisory lock（イベント単位 or イベント×アーティスト単位）
  -- hashtext で bigint に変換してロックキーを生成
  IF v_scope = 'artist' AND p_artist_id IS NOT NULL THEN
    v_lock_key := hashtext(p_event_id::text || ':' || p_artist_id::text);
  ELSE
    v_lock_key := hashtext(p_event_id::text);
  END IF;

  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- qr_config_id を通じて event に紐づく transactions の最大シリアル番号を取得
  IF v_scope = 'artist' AND p_artist_id IS NOT NULL THEN
    -- アーティスト別：同じ event + 同じ artist_id の products に紐づく transactions
    SELECT COALESCE(MAX(t.sequence_number_in_event), 0) + 1
      INTO v_next_seq
      FROM public.transactions t
      JOIN public.qr_configs qc ON qc.qr_config_id = t.qr_config_id
      JOIN public.qr_config_targets qct ON qct.qr_config_id = qc.qr_config_id
     WHERE qc.event_id = p_event_id
       AND qct.profile_id = p_artist_id
       AND t.status = 'completed'
       AND t.transaction_id <> p_transaction_id;
  ELSE
    -- イベント通し：event に紐づく全 transactions
    SELECT COALESCE(MAX(t.sequence_number_in_event), 0) + 1
      INTO v_next_seq
      FROM public.transactions t
      JOIN public.qr_configs qc ON qc.qr_config_id = t.qr_config_id
     WHERE qc.event_id = p_event_id
       AND t.status = 'completed'
       AND t.transaction_id <> p_transaction_id;
  END IF;

  -- sequence_number_in_event を更新
  UPDATE public.transactions
     SET sequence_number_in_event = v_next_seq
   WHERE transaction_id = p_transaction_id;

  RETURN v_next_seq;
END;
$$;
