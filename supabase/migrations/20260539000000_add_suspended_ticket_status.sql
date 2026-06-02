-- tickets.status に suspended を追加
-- suspended: 決済問題（カードエラー/5日前オーソリ失敗）による一時保留。
--            リカバリ成功後に valid に復活する。cancelled とは別扱い。

ALTER TABLE public.tickets DROP CONSTRAINT IF EXISTS tickets_status_check;
ALTER TABLE public.tickets
  ADD CONSTRAINT tickets_status_check
  CHECK (status IN ('valid', 'used', 'cancelled', 'suspended'));

-- entrance_reservations に card_error ステータスが既に存在するか確認済み。
-- checkin_ticket RPC は suspended チケットに対して専用エラーを返すよう更新。
CREATE OR REPLACE FUNCTION public.checkin_ticket(
  p_ticket_code  text,
  p_organizer_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket_id uuid;
  v_status    text;
BEGIN
  SELECT ticket_id, status
    INTO v_ticket_id, v_status
    FROM public.tickets
   WHERE ticket_code = p_ticket_code;

  IF v_ticket_id IS NULL THEN
    RAISE EXCEPTION 'TICKET_NOT_FOUND';
  END IF;

  IF v_status = 'used' THEN
    RAISE EXCEPTION 'ALREADY_USED';
  END IF;

  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'TICKET_CANCELLED';
  END IF;

  IF v_status = 'suspended' THEN
    RAISE EXCEPTION 'TICKET_SUSPENDED';
  END IF;

  UPDATE public.tickets
     SET status         = 'used',
         checked_in_at  = now(),
         checked_in_by  = p_organizer_id
   WHERE ticket_id = v_ticket_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.checkin_ticket FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.checkin_ticket TO service_role;
