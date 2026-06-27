-- 20260627030000で発行したGRANT文一覧に settle_transfers / signed_documents が
-- 漏れていたため追加で付与する（CI環境でのpermission denied対策、経緯は
-- 20260627030000のコメント参照）。

grant delete, insert, references, select, trigger, truncate, update on table "public"."settle_transfers" to "anon";
grant delete, insert, references, select, trigger, truncate, update on table "public"."settle_transfers" to "authenticated";
grant delete, insert, references, select, trigger, truncate, update on table "public"."settle_transfers" to "service_role";

grant delete, insert, references, select, trigger, truncate, update on table "public"."signed_documents" to "anon";
grant delete, insert, references, select, trigger, truncate, update on table "public"."signed_documents" to "authenticated";
grant delete, insert, references, select, trigger, truncate, update on table "public"."signed_documents" to "service_role";
