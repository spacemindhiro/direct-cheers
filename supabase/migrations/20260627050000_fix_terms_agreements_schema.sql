-- terms_agreements は20260411160000で古いスキーマ（agreement_id/agreed_roles/
-- signature_storage_path等、署名画像ベースの設計）として先に作られていたため、
-- 20260524000000の "create table if not exists" が本番・ステージング両方で
-- 無効化され、その後のAPIコード（/api/terms/agree, /api/terms/status等）が
-- 前提とするterms_type/versionカラムが存在しないままになっていた
-- （20260524000001のadd column if not existsだけは効いていたため
-- confirmed_at/confirmed_byは存在するという、ちぐはぐな状態）。
--
-- このため利用規約の同意ボタンを押すとPostgRESTエラーになり、UIは
-- エラーを無視するためユーザーには「同意しても何も起きない」ように見えていた。
-- 本番・ステージング共にデータ0件であることを確認済みのため、安全に作り直す。

drop table if exists public.terms_agreements;

create table public.terms_agreements (
  id           uuid        primary key default gen_random_uuid(),
  profile_id   uuid        not null references public.profiles(profile_id) on delete cascade,
  terms_type   text        not null check (terms_type in ('base', 'organizer', 'agent')),
  version      text        not null,
  agreed_at    timestamptz not null default now(),
  confirmed_at timestamptz,
  confirmed_by uuid references public.profiles(profile_id),
  unique (profile_id, terms_type, version)
);

alter table public.terms_agreements enable row level security;

create policy "users can read own agreements"
  on public.terms_agreements for select
  using (auth.uid() = profile_id);

create policy "users can insert own agreements"
  on public.terms_agreements for insert
  with check (auth.uid() = profile_id);

grant delete, insert, references, select, trigger, truncate, update on table "public"."terms_agreements" to "anon";
grant delete, insert, references, select, trigger, truncate, update on table "public"."terms_agreements" to "authenticated";
grant delete, insert, references, select, trigger, truncate, update on table "public"."terms_agreements" to "service_role";
