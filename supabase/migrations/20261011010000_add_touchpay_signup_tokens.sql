-- タッチ決済後、子機に表示するサインアップQR用の使い切り合言葉。
--
-- 背景: 以前はQRにチケットIDをそのまま載せ、チケットIDだけで「入場パスの入手」
-- 「同じカードの匿名購入をまとめて自分のアカウントへ取り込む」ができた。さらに
-- QRの中身は公開Realtimeチャンネル（event-display:{event_id}）で配信しており、
-- 会場にいなくても購読すれば受け取れた。
--
-- - QRには推測できない token だけを載せる。配信はせず、子機がログイン済みセッションで取得する
-- - 最初にQRのページを開いたブラウザ（opened_device_key＝そのブラウザの httpOnly Cookie）
--   専用になる。後から別の端末で同じQRを開いても使えない（写真で読まれても無効）
-- - 有効期間は30日（会場ではすぐ登録しないため。開いたスマホからなら後日でも登録できる）
-- - 未ログインの客は開いたブラウザでメールを入力する（bound_email）。ログインリンクは
--   メールアプリ等の別ブラウザで開かれうるため、最後の紐付けは「開いたブラウザ」か
--   「そのメールでログインした人」のどちらかで通す
-- - 紐付け（claim）は1回だけ（used_at）
-- - サービスロール専用（RLS有効・ポリシー無し・anon/authenticated の権限剥奪）

CREATE TABLE IF NOT EXISTS public.touchpay_signup_tokens (
  token              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id          uuid        NOT NULL REFERENCES public.tickets(ticket_id) ON DELETE CASCADE,
  event_id           uuid        NOT NULL REFERENCES public.events(event_id) ON DELETE CASCADE,
  target_device_id   text,
  expires_at         timestamptz NOT NULL,
  opened_device_key  text,
  opened_at          timestamptz,
  bound_email        text,
  bound_at           timestamptz,
  used_at            timestamptz,
  used_by_profile_id uuid        REFERENCES public.profiles(profile_id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS touchpay_signup_tokens_event_device_idx
  ON public.touchpay_signup_tokens (event_id, target_device_id, created_at DESC);

ALTER TABLE public.touchpay_signup_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.touchpay_signup_tokens FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.touchpay_signup_tokens TO service_role;
