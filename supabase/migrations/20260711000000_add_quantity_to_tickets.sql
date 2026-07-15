-- 当日現地QR決済（エントランスCタイプ）で複数人分をまとめて購入できるようにする。
-- 1決済=1チケット行のまま、人数はquantity列で表現する（QRは1枚、チェックインで
-- まとめて入場・使用済みに更新する運用のため）。
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1);
