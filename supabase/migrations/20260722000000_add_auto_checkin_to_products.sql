-- エントランス×Cタイプ限定: 自己QR決済（/api/pay/complete）でチケットを
-- 発行する際、QRスキャンによるチェックインを待たず、決済完了と同時に
-- status='used'（入場確定）にするかどうかのフラグ。
-- タッチ決済（対面/Case④）は元々スタッフがその場にいるため常にused発行済みで、
-- このフラグの対象外（/api/entrance/terminal/complete は無改修）。
ALTER TABLE public.products
  ADD COLUMN auto_checkin boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.products.auto_checkin IS
  'エントランス×Cタイプのみ有効: 自己QR決済の完了と同時にticketをused化し、入場QRスキャンのステップを省略する。';
