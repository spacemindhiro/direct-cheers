-- signed_documents.terms_version は "署名した3種類の規約(base/organizer/agent)全体で
-- 1個の文字列" という設計になっており、実装（app/api/admin/terms/sign/[profileId]/route.ts）も
-- 常に TERMS_VERSIONS.base の値だけを書き込んでいた。base/organizer/agentが将来別々に
-- 改定されバージョンがずれると、この1個の文字列では organizer/agent側の実際の署名バージョンを
-- 正しく表せない。
--
-- terms_types の各要素ごとに、署名当時のバージョンを個別に記録する terms_versions(jsonb) に
-- 置き換える。既存2件のレコードは、署名当時 base/organizer/agent が全て '2026-05-24' だった
-- ことをコードのバージョン履歴（lib/terms.ts の TERMS_HISTORY）と突き合わせて確認済みのため、
-- 既存の terms_version の値を全ての terms_types に対して割り当てる形でバックフィルする。

alter table public.signed_documents
  add column terms_versions jsonb not null default '{}'::jsonb;

update public.signed_documents
set terms_versions = (
  select coalesce(jsonb_object_agg(t, terms_version), '{}'::jsonb)
  from unnest(terms_types) as t
);

alter table public.signed_documents
  drop column terms_version;
