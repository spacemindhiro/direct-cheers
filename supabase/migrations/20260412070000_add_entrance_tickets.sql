-- ==========================================
-- products: 決済タイプ・在庫管理
-- ==========================================
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS payment_type TEXT NOT NULL DEFAULT 'A'
    CHECK (payment_type IN ('A', 'B', 'C')),
  ADD COLUMN IF NOT EXISTS stock_limit  INTEGER,           -- NULL = 無制限
  ADD COLUMN IF NOT EXISTS sold_count   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS track_inventory BOOLEAN NOT NULL DEFAULT false;
  -- track_inventory: C タイプで在庫管理する場合に true

-- ==========================================
-- entrance_reservations: カード保存予約（タイプA / C）
-- ==========================================
CREATE TABLE public.entrance_reservations (
  reservation_id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id                uuid        NOT NULL REFERENCES public.products(product_id) ON DELETE CASCADE,
  event_id                  uuid        NOT NULL REFERENCES public.events(event_id)   ON DELETE CASCADE,
  stripe_setup_intent_id    text        NOT NULL UNIQUE,
  stripe_customer_id        text        NOT NULL,
  stripe_payment_method_id  text,                     -- SetupIntent confirm 後に設定
  email                     text        NOT NULL,
  holder_name               text,
  profile_id                uuid        REFERENCES public.profiles(profile_id) ON DELETE SET NULL,
  status                    text        NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending',       -- SetupIntent 未確認
      'reserved',      -- カード保存完了
      'card_error',    -- 10日前カード有効性チェック失敗
      'charged',       -- 決済完了（自動or当日）
      'cancelled',     -- キャンセル
      'no_show'        -- 未入場
    )),
  charge_amount             bigint      NOT NULL,
  transaction_id            uuid        REFERENCES public.transactions(transaction_id) ON DELETE SET NULL,
  card_checked_at           timestamptz,
  charged_at                timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.entrance_reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reservations_owner" ON public.entrance_reservations
  FOR ALL USING (
    profile_id = auth.uid()
    OR email = (SELECT email FROM public.provisional_users WHERE profile_id = auth.uid())
  );

CREATE POLICY "reservations_organizer" ON public.entrance_reservations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.event_id = entrance_reservations.event_id
        AND (e.organizer_profile_id = auth.uid() OR e.agent_id = auth.uid())
    )
    OR (SELECT role FROM public.profiles WHERE profile_id = auth.uid()) = 'admin'
  );

CREATE TRIGGER trg_reservations_updated_at
  BEFORE UPDATE ON public.entrance_reservations
  FOR EACH ROW EXECUTE FUNCTION public.touch_event_thanks_updated_at();  -- 共有トリガ関数を流用

-- ==========================================
-- tickets: デジタルチケット（全決済タイプ共通）
-- ==========================================
CREATE TABLE public.tickets (
  ticket_id       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id  uuid        REFERENCES public.transactions(transaction_id) ON DELETE SET NULL,
  reservation_id  uuid        REFERENCES public.entrance_reservations(reservation_id) ON DELETE SET NULL,
  product_id      uuid        NOT NULL REFERENCES public.products(product_id),
  event_id        uuid        NOT NULL REFERENCES public.events(event_id),
  email           text        NOT NULL,
  holder_profile_id uuid      REFERENCES public.profiles(profile_id) ON DELETE SET NULL,
  ticket_code     text        NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  status          text        NOT NULL DEFAULT 'valid'
    CHECK (status IN ('valid', 'used', 'cancelled')),
  checked_in_at   timestamptz,
  checked_in_by   uuid        REFERENCES public.profiles(profile_id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tickets_owner" ON public.tickets
  FOR SELECT USING (
    holder_profile_id = auth.uid()
    OR email = (
      SELECT pu.email FROM public.provisional_users pu WHERE pu.profile_id = auth.uid()
    )
  );

CREATE POLICY "tickets_organizer_read" ON public.tickets
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.event_id = tickets.event_id
        AND (e.organizer_profile_id = auth.uid() OR e.agent_id = auth.uid())
    )
    OR (SELECT role FROM public.profiles WHERE profile_id = auth.uid()) IN ('admin', 'agent')
  );

CREATE POLICY "tickets_organizer_update" ON public.tickets
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.event_id = tickets.event_id
        AND (e.organizer_profile_id = auth.uid() OR e.agent_id = auth.uid())
    )
    OR (SELECT role FROM public.profiles WHERE profile_id = auth.uid()) IN ('admin')
  );

CREATE TRIGGER trg_tickets_updated_at
  BEFORE UPDATE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.touch_event_thanks_updated_at();

-- ==========================================
-- RPC: 在庫確保（原子的）
-- 在庫ありなら sold_count を +1 して true を返す。完売なら false。
-- ==========================================
CREATE OR REPLACE FUNCTION public.reserve_product_stock(p_product_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_limit  integer;
  v_sold   integer;
BEGIN
  -- 排他ロック
  PERFORM pg_advisory_xact_lock(hashtext(p_product_id::text));

  SELECT stock_limit, sold_count
    INTO v_limit, v_sold
    FROM public.products
   WHERE product_id = p_product_id;

  -- 在庫無制限 or 残あり
  IF v_limit IS NULL OR v_sold < v_limit THEN
    UPDATE public.products
       SET sold_count = sold_count + 1,
           updated_at = now()
     WHERE product_id = p_product_id;
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

-- ==========================================
-- RPC: チェックイン（原子的）
-- ticket_code でチケットを検索し、valid なら used に更新して ticket_id を返す
-- ==========================================
CREATE OR REPLACE FUNCTION public.checkin_ticket(
  p_ticket_code    text,
  p_organizer_id   uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ticket_id uuid;
  v_status    text;
BEGIN
  SELECT ticket_id, status
    INTO v_ticket_id, v_status
    FROM public.tickets
   WHERE ticket_code = p_ticket_code
   FOR UPDATE;

  IF v_ticket_id IS NULL THEN
    RAISE EXCEPTION 'TICKET_NOT_FOUND';
  END IF;

  IF v_status = 'used' THEN
    RAISE EXCEPTION 'ALREADY_USED';
  END IF;

  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'TICKET_CANCELLED';
  END IF;

  UPDATE public.tickets
     SET status        = 'used',
         checked_in_at = now(),
         checked_in_by = p_organizer_id,
         updated_at    = now()
   WHERE ticket_id = v_ticket_id;

  RETURN v_ticket_id;
END;
$$;

-- ==========================================
-- RPC: タイプA 5日前自動決済用（pg_cron から呼ぶ）
-- 対象: status='reserved', payment_type='A', event.start_at が今から5〜6日後
-- ==========================================
CREATE OR REPLACE FUNCTION public.auto_charge_type_a_reservations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  -- 実際の Stripe 決済は外部（Edge Function / API）で行う
  -- このRPCは対象 reservation_id の一覧を返す役割のみ
  -- 呼び出し元（cron→Edge Function）が Stripe API を叩く
  RAISE NOTICE 'auto_charge_type_a: this function is a placeholder. Charge via Edge Function.';
  RETURN v_count;
END;
$$;

-- ==========================================
-- RPC: タイプA 対象予約一覧（Edge Function / cron が使う）
-- ==========================================
CREATE OR REPLACE FUNCTION public.get_pending_charge_reservations(p_days_before integer)
RETURNS TABLE (
  reservation_id            uuid,
  stripe_customer_id        text,
  stripe_payment_method_id  text,
  charge_amount             bigint,
  email                     text,
  event_id                  uuid,
  product_id                uuid
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    r.reservation_id,
    r.stripe_customer_id,
    r.stripe_payment_method_id,
    r.charge_amount,
    r.email,
    r.event_id,
    r.product_id
  FROM public.entrance_reservations r
  JOIN public.events e ON e.event_id = r.event_id
  JOIN public.products p ON p.product_id = r.product_id
  WHERE r.status = 'reserved'
    AND p.payment_type = 'A'
    AND e.start_at BETWEEN now() + (p_days_before - 1 || ' days')::interval
                       AND now() + (p_days_before     || ' days')::interval;
$$;
