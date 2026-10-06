-- 未ログイン（公開鍵）のまま他人のデータが読めていた2経路を塞ぐ。
--
-- 1. view_withdrawable_balances
--    ビューは既定で作成者（postgres）権限で実行されるため、元テーブルのRLSを素通りし、
--    anon/authenticated から全員分の profile_id・表示名・出金可能額・負債額が読めていた
--    （2026-10-06に本番で64件の露出を確認）。アプリコードからの参照は無いため、
--    security_invoker で呼び出し元のRLSを効かせた上で、anon/authenticated の権限自体も外す。
--
-- 2. 予約一覧系 SECURITY DEFINER 関数
--    メール・Stripe顧客ID・支払い方法IDを返すが、EXECUTE が PUBLIC に付いたままで
--    anon から実行できていた。呼び出し元は Edge Function（service_role）のみ。

ALTER VIEW public.view_withdrawable_balances SET (security_invoker = true);
REVOKE ALL ON public.view_withdrawable_balances FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.get_pending_card_check_reservations() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_pending_charge_reservations(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_charge_type_a_reservations() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_pending_card_check_reservations() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_pending_charge_reservations(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.auto_charge_type_a_reservations() TO service_role;
