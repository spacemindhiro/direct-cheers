-- get_role_income_summary: outstanding_balance(未出金Stripe残高)の基準日を修正
--
-- outstanding_balanceはp_end_utc（表示対象月の月末）を基準に計算していたため、
-- 過去月を表示すると「その月末時点ではまだ出金していなかった」という過去の
-- スナップショットが表示され、実際には既に出金済みでも残高が残っているように
-- 誤表示されていた（例: 7月度を表示すると、8月に既に出金済みの¥78,200が
-- 「未出金」として表示され続ける）。
--
-- outstanding_balanceは月次P/L(gross/reversed/net)とは性質が異なるB/S項目
-- （"今この瞬間"のStripe残高）のため、常にnow()（クエリ実行時点の実時刻）を
-- 基準にするよう修正する。

CREATE OR REPLACE FUNCTION get_role_income_summary(
  p_profile_ids uuid[],
  p_start_utc   timestamptz,
  p_end_utc     timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  WITH
  -- platform層: 着金日=決済確定日
  platform_gross AS (
    SELECT COALESCE(SUM(td.actual_amount), 0)::bigint AS amount
    FROM transaction_distributions td
    JOIN transactions t ON t.transaction_id = td.transaction_id
    WHERE td.profile_id = ANY(p_profile_ids)
      AND td.distribution_role = 'platform'
      AND td.distribution_status IN ('accrued', 'paid')
      AND td.deleted_at IS NULL
      AND t.status = 'completed'
      AND t.created_at >= p_start_utc
      AND t.created_at <  p_end_utc
  ),
  platform_reversed AS (
    SELECT COALESCE(SUM(td.actual_amount), 0)::bigint AS amount
    FROM transaction_distributions td
    WHERE td.profile_id = ANY(p_profile_ids)
      AND td.distribution_role = 'platform'
      AND td.distribution_status = 'reversed'
      AND td.updated_at >= p_start_utc
      AND td.updated_at <  p_end_utc
  ),
  -- agent/organizer/artist層: 金額はtransaction_distributions.actual_amountの
  -- role別実額をそのまま使う（按分・比率計算はしない。既に厳密に確定済みの実額）。
  -- 着金日の判定にだけsettle_transfersを使う: そのevent+profileへの送金が
  -- 対象月内に1件でもあれば、そのevent+profileのrole別実額全額を対象月の
  -- 着金として計上する。
  -- ロールをprofiles.role（静的1人1ロール）で判定しないのは、過去に同一プロフィールが
  -- 特定イベントでagent兼organizerとして扱われたことが実際にあったため
  -- （20260727020000_fix_spacemind_hideaway_distribution_data.sql参照。本番でも
  -- 現に2イベントで同一profileがagent行とorganizer行の両方を持つ状態を確認済み）。
  -- reversedも含める: 一度着金した実額は、後日reversedになっても「着金した月」の
  -- grossからは消えない（消える分はreversed_by_role側でnetから引かれる）。
  -- voidedのみ除外（settle前キャンセルで金銭移動ゼロのため）。
  role_amount_by_event_profile AS (
    SELECT event_id, profile_id, distribution_role,
           SUM(actual_amount)::bigint AS amount
    FROM transaction_distributions
    WHERE profile_id = ANY(p_profile_ids)
      AND distribution_role IN ('agent', 'organizer', 'artist')
      AND distribution_status IN ('accrued', 'paid', 'reversed')
      AND deleted_at IS NULL
    GROUP BY event_id, profile_id, distribution_role
  ),
  transfer_gross_by_role AS (
    SELECT
      ra.distribution_role AS role,
      COALESCE(SUM(ra.amount), 0)::bigint AS amount
    FROM role_amount_by_event_profile ra
    WHERE EXISTS (
      SELECT 1 FROM settle_transfers st
      WHERE st.event_id = ra.event_id
        AND st.profile_id = ra.profile_id
        AND st.created_at >= p_start_utc
        AND st.created_at <  p_end_utc
    )
    GROUP BY ra.distribution_role
  ),
  reversed_by_role AS (
    SELECT
      td.distribution_role AS role,
      COALESCE(SUM(td.actual_amount), 0)::bigint AS amount
    FROM transaction_distributions td
    WHERE td.profile_id = ANY(p_profile_ids)
      AND td.distribution_role IN ('agent', 'organizer', 'artist')
      AND td.distribution_status = 'reversed'
      AND td.updated_at >= p_start_utc
      AND td.updated_at <  p_end_utc
    GROUP BY td.distribution_role
  ),
  -- 未出金Stripe残高（B/S）: profile単位でsettle_transfers累計-payout_requests累計を出し、
  -- profiles.roleでgroupする。
  -- 既知の限界: payout_requestsはevent単位ではなくprofile単位（Stripe残高は
  -- イベント横断でfungible）のため、1つのprofileが複数roleの分配を受けている
  -- 場合（過去に実例あり）は出金額をrole別に厳密分割できない。この場合は
  -- profiles.role側に寄せて近似する（grossの着金額算出とは異なりここだけ簡略化）。
  --
  -- outstanding_balanceは月次P/L(gross/reversed/net)とは性質が異なるB/S項目
  -- （"今この瞬間"のStripe残高）のため、p_end_utc（表示対象月の月末）ではなく
  -- 常にnow()（クエリ実行時点の実時刻）を基準にする。
  settle_cum_by_profile AS (
    SELECT profile_id, COALESCE(SUM(amount), 0)::bigint AS total
    FROM settle_transfers
    WHERE profile_id = ANY(p_profile_ids)
      AND created_at < now()
    GROUP BY profile_id
  ),
  payout_cum_by_profile AS (
    SELECT profile_id, COALESCE(SUM(requested_amount), 0)::bigint AS total
    FROM payout_requests
    WHERE profile_id = ANY(p_profile_ids)
      AND status = 'completed'
      AND created_at < now()
    GROUP BY profile_id
  ),
  -- 一度Transferされた後、settle後返金でreversedになった分はStripe残高から既に
  -- 出て行っているため、outstanding_balanceから差し引く（updated_at基準）
  reversed_cum_by_profile AS (
    SELECT profile_id, COALESCE(SUM(actual_amount), 0)::bigint AS total
    FROM transaction_distributions
    WHERE profile_id = ANY(p_profile_ids)
      AND distribution_role IN ('agent', 'organizer', 'artist')
      AND distribution_status = 'reversed'
      AND updated_at < now()
    GROUP BY profile_id
  ),
  outstanding_by_role AS (
    SELECT
      p.role,
      GREATEST(0, SUM(COALESCE(sc.total, 0) - COALESCE(pc.total, 0) - COALESCE(rc.total, 0)))::bigint AS balance
    FROM profiles p
    LEFT JOIN settle_cum_by_profile   sc ON sc.profile_id = p.profile_id
    LEFT JOIN payout_cum_by_profile   pc ON pc.profile_id = p.profile_id
    LEFT JOIN reversed_cum_by_profile rc ON rc.profile_id = p.profile_id
    WHERE p.profile_id = ANY(p_profile_ids)
    GROUP BY p.role
  ),
  -- 最終集計値（role別に1行ずつ）
  agent_row AS (
    SELECT
      COALESCE((SELECT amount FROM transfer_gross_by_role WHERE role = 'agent'), 0) AS gross,
      COALESCE((SELECT amount FROM reversed_by_role       WHERE role = 'agent'), 0) AS reversed,
      COALESCE((SELECT balance FROM outstanding_by_role   WHERE role = 'agent'), 0) AS outstanding
  ),
  organizer_artist_row AS (
    SELECT
      COALESCE((SELECT SUM(amount) FROM transfer_gross_by_role WHERE role IN ('organizer','artist')), 0) AS gross,
      COALESCE((SELECT SUM(amount) FROM reversed_by_role       WHERE role IN ('organizer','artist')), 0) AS reversed,
      COALESCE((SELECT SUM(balance) FROM outstanding_by_role   WHERE role IN ('organizer','artist')), 0) AS outstanding
  )
  SELECT jsonb_build_object(
    'platform', jsonb_build_object(
      'gross',    pg.amount,
      'reversed', pr.amount,
      'net',      pg.amount - pr.amount
    ),
    'agent', jsonb_build_object(
      'gross',                ar.gross,
      'reversed',             ar.reversed,
      'net',                  ar.gross - ar.reversed,
      'outstanding_balance',  ar.outstanding
    ),
    'organizer_artist', jsonb_build_object(
      'gross',                oar.gross,
      'reversed',             oar.reversed,
      'net',                  oar.gross - oar.reversed,
      'outstanding_balance',  oar.outstanding
    ),
    'total_net', (pg.amount - pr.amount) + (ar.gross - ar.reversed) + (oar.gross - oar.reversed)
  )
  INTO v_result
  FROM platform_gross pg, platform_reversed pr, agent_row ar, organizer_artist_row oar;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_role_income_summary(uuid[], timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION get_role_income_summary(uuid[], timestamptz, timestamptz)
  TO service_role;
