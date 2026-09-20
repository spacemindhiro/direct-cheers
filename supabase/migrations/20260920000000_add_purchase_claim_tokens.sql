-- 決済後アカウント作成のメール所有証明用トークン。
--
-- 従来はサンクス画面の「パスキーでアカウント作成」がメールの所有を一切確認せず
-- auth.users を email_confirm=true で作っていた（レシートメールのリンクも
-- /auth/passkey-setup?email=… と平文メールを載せているだけで証明にならない）。
-- 今後はレシートメールに載せたこのトークン入りリンク（/auth/claim/<token>）を
-- 踏んだ人だけがアカウントを作れる。Supabase 自体の OTP（otp_expiry=3600秒）は
-- 翌日メールを開いた客に間に合わないため、長寿命（30日）の自前トークンを
-- メールに載せ、クリック時にサーバー内で短命な Supabase リンクを発行→即検証する
-- 二段構え（app/api/invitations/[token]/claim と同じ作り）。
--
-- account_merge_tokens と同じくサービスロール専用（RLS有効・ポリシーなし）。

create table public.purchase_claim_tokens (
  token_id        uuid        primary key default gen_random_uuid(),
  token           text        not null unique default encode(gen_random_bytes(32), 'hex'),
  email           text        not null,
  transaction_id  uuid        references public.transactions(transaction_id) on delete cascade,
  -- claim 完了後の遷移先（入場券なら /tickets、チアなら /dashboard/collection）
  redirect_path   text        not null default '/dashboard/collection',
  expires_at      timestamptz not null default now() + interval '30 days',
  used_at         timestamptz,
  created_at      timestamptz not null default now()
);

-- 再送の連打抑止（同一メールの直近発行時刻を引く）
create index purchase_claim_tokens_email_created_idx
  on public.purchase_claim_tokens (email, created_at desc);

alter table public.purchase_claim_tokens enable row level security;
-- サービスロールのみ操作（RLSポリシーなし）。CLIバージョン差で default privileges が
-- 効かない環境（20260627030000 参照）に備えて明示的に付与する。
grant all on public.purchase_claim_tokens to service_role;
