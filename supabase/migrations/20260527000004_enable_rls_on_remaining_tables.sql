-- ============================================================
-- RLS を有効化 — Supabase security advisor 対応
-- 対象: サービスロール専用テーブル 4 本 + settle_transfers
--
-- 方針:
--   - 全テーブルで ENABLE ROW LEVEL SECURITY
--   - サーバー専用テーブルはポリシーなし（= service_role のみアクセス可）
--   - settle_transfers は本人 + admin が SELECT 可
-- ============================================================

-- ============================================================
-- 1. webhook_failure_logs（以前の DISABLE を上書き）
-- ============================================================
ALTER TABLE public.webhook_failure_logs ENABLE ROW LEVEL SECURITY;
-- ポリシーなし: service_role（API ルート / DB 関数）のみ操作

-- ============================================================
-- 2. webhook_processed_events（以前の DISABLE を上書き）
-- ============================================================
ALTER TABLE public.webhook_processed_events ENABLE ROW LEVEL SECURITY;
-- ポリシーなし: service_role のみ

-- ============================================================
-- 3. serial_sequences
-- ============================================================
ALTER TABLE public.serial_sequences ENABLE ROW LEVEL SECURITY;
-- ポリシーなし: service_role のみ

-- ============================================================
-- 4. wallet_device_registrations（Apple Wallet Pass サーバー間通信用）
-- ============================================================
ALTER TABLE wallet_device_registrations ENABLE ROW LEVEL SECURITY;
-- ポリシーなし: service_role のみ

-- ============================================================
-- 5. settle_transfers（Stripe 送金記録）
-- ============================================================
ALTER TABLE public.settle_transfers ENABLE ROW LEVEL SECURITY;

-- 本人（profile_id 一致）は自分の送金記録を参照可
CREATE POLICY "settle_transfers_select_own" ON public.settle_transfers
  FOR SELECT
  USING (profile_id = auth.uid());

-- admin は全件参照可
CREATE POLICY "settle_transfers_select_admin" ON public.settle_transfers
  FOR SELECT
  USING (
    (SELECT role FROM public.profiles WHERE profile_id = auth.uid()) = 'admin'
  );

-- INSERT / UPDATE / DELETE は service_role のみ（ポリシーなし = 拒否）
