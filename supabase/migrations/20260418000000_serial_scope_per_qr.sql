-- シリアルナンバーの採番単位をQRコード単位に移動（no.1対応）

-- qr_configs に serial_scope を追加
-- 'event' : イベント内通し番号（全QR合算）
-- 'qr'    : このQRコード内だけの通し番号
-- 'artist': アーティスト別の通し番号
ALTER TABLE public.qr_configs
  ADD COLUMN IF NOT EXISTS serial_scope text NOT NULL DEFAULT 'event'
    CHECK (serial_scope IN ('event', 'qr', 'artist'));

-- 採番 RPC を QR ベースに更新
CREATE OR REPLACE FUNCTION assign_serial_number(
  p_transaction_id  uuid,
  p_event_id        uuid,
  p_artist_id       uuid DEFAULT NULL,
  p_qr_config_id    uuid DEFAULT NULL   -- QR単位スコープ参照用
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
  -- スコープをqr_configsから取得（p_qr_config_idがあれば優先）
  IF p_qr_config_id IS NOT NULL THEN
    SELECT serial_scope INTO v_scope
      FROM public.qr_configs
     WHERE qr_config_id = p_qr_config_id;
  END IF;

  -- フォールバック: eventsから取得（後方互換）
  IF v_scope IS NULL THEN
    SELECT serial_scope INTO v_scope
      FROM public.events
     WHERE event_id = p_event_id;
  END IF;

  IF v_scope IS NULL THEN
    v_scope := 'event';
  END IF;

  -- Advisory lock のキーを決定
  CASE v_scope
    WHEN 'qr' THEN
      v_lock_key := hashtext(COALESCE(p_qr_config_id::text, p_event_id::text));
    WHEN 'artist' THEN
      v_lock_key := hashtext(p_event_id::text || ':' || COALESCE(p_artist_id::text, ''));
    ELSE -- 'event'
      v_lock_key := hashtext(p_event_id::text);
  END CASE;

  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- スコープに応じて次のシリアル番号を算出
  CASE v_scope
    WHEN 'qr' THEN
      -- このQRコードだけを対象に採番
      SELECT COALESCE(MAX(t.sequence_number_in_event), 0) + 1
        INTO v_next_seq
        FROM public.transactions t
       WHERE t.qr_config_id = p_qr_config_id
         AND t.status = 'completed'
         AND t.transaction_id <> p_transaction_id;

    WHEN 'artist' THEN
      -- イベント内・同アーティスト宛てのQRを対象に採番
      SELECT COALESCE(MAX(t.sequence_number_in_event), 0) + 1
        INTO v_next_seq
        FROM public.transactions t
        JOIN public.qr_configs qc ON qc.qr_config_id = t.qr_config_id
        JOIN public.qr_config_targets qct ON qct.qr_config_id = qc.qr_config_id
       WHERE qc.event_id = p_event_id
         AND qct.profile_id = p_artist_id
         AND t.status = 'completed'
         AND t.transaction_id <> p_transaction_id;

    ELSE -- 'event'
      -- イベント内の全トランザクションを対象に採番
      SELECT COALESCE(MAX(t.sequence_number_in_event), 0) + 1
        INTO v_next_seq
        FROM public.transactions t
        JOIN public.qr_configs qc ON qc.qr_config_id = t.qr_config_id
       WHERE qc.event_id = p_event_id
         AND t.status = 'completed'
         AND t.transaction_id <> p_transaction_id;
  END CASE;

  -- sequence_number_in_event を更新
  UPDATE public.transactions
     SET sequence_number_in_event = v_next_seq
   WHERE transaction_id = p_transaction_id;

  RETURN v_next_seq;
END;
$$;
