-- develop限定で追加された新規テーブルに、既存テーブル（20260409204650_remote_schema.sql）と
-- 同じ標準権限（anon/authenticated/service_roleへのテーブル権限）を明示的に付与する。
--
-- 背景: Supabaseのマネージドプロジェクト（本番・ステージング・ローカル開発環境）は
-- postgresロールが作成する将来のテーブルに自動でこの権限を付与するALTER DEFAULT
-- PRIVILEGES設定を標準で持つため、これまで明示的なGRANT文を書かなくても問題なく
-- 動作していた。しかしCI環境（supabase/setup-cli@v2のlatestバージョン）では、
-- このデフォルト設定の挙動が異なり、新規テーブルへの権限が一切付与されず
-- 「permission denied」でテストが失敗する。暗黙のプラットフォーム設定に依存せず、
-- 明示的にGRANTすることでCLIバージョン差異の影響を受けないようにする。
-- 実際のアクセス制御は各テーブルのRLSポリシーが担う（テーブル権限はその前提条件）。

grant delete, insert, references, select, trigger, truncate, update on table "public"."account_merge_tokens" to "anon";
grant delete, insert, references, select, trigger, truncate, update on table "public"."account_merge_tokens" to "authenticated";
grant delete, insert, references, select, trigger, truncate, update on table "public"."account_merge_tokens" to "service_role";

grant delete, insert, references, select, trigger, truncate, update on table "public"."admin_messages" to "anon";
grant delete, insert, references, select, trigger, truncate, update on table "public"."admin_messages" to "authenticated";
grant delete, insert, references, select, trigger, truncate, update on table "public"."admin_messages" to "service_role";

grant delete, insert, references, select, trigger, truncate, update on table "public"."booth_devices" to "anon";
grant delete, insert, references, select, trigger, truncate, update on table "public"."booth_devices" to "authenticated";
grant delete, insert, references, select, trigger, truncate, update on table "public"."booth_devices" to "service_role";

grant delete, insert, references, select, trigger, truncate, update on table "public"."wallet_device_registrations" to "anon";
grant delete, insert, references, select, trigger, truncate, update on table "public"."wallet_device_registrations" to "authenticated";
grant delete, insert, references, select, trigger, truncate, update on table "public"."wallet_device_registrations" to "service_role";

grant delete, insert, references, select, trigger, truncate, update on table "public"."device_tokens" to "anon";
grant delete, insert, references, select, trigger, truncate, update on table "public"."device_tokens" to "authenticated";
grant delete, insert, references, select, trigger, truncate, update on table "public"."device_tokens" to "service_role";

grant delete, insert, references, select, trigger, truncate, update on table "public"."display_devices" to "anon";
grant delete, insert, references, select, trigger, truncate, update on table "public"."display_devices" to "authenticated";
grant delete, insert, references, select, trigger, truncate, update on table "public"."display_devices" to "service_role";

grant delete, insert, references, select, trigger, truncate, update on table "public"."display_schedules" to "anon";
grant delete, insert, references, select, trigger, truncate, update on table "public"."display_schedules" to "authenticated";
grant delete, insert, references, select, trigger, truncate, update on table "public"."display_schedules" to "service_role";

grant delete, insert, references, select, trigger, truncate, update on table "public"."display_tracks" to "anon";
grant delete, insert, references, select, trigger, truncate, update on table "public"."display_tracks" to "authenticated";
grant delete, insert, references, select, trigger, truncate, update on table "public"."display_tracks" to "service_role";

grant delete, insert, references, select, trigger, truncate, update on table "public"."entrance_reservations" to "anon";
grant delete, insert, references, select, trigger, truncate, update on table "public"."entrance_reservations" to "authenticated";
grant delete, insert, references, select, trigger, truncate, update on table "public"."entrance_reservations" to "service_role";

grant delete, insert, references, select, trigger, truncate, update on table "public"."event_evidences" to "anon";
grant delete, insert, references, select, trigger, truncate, update on table "public"."event_evidences" to "authenticated";
grant delete, insert, references, select, trigger, truncate, update on table "public"."event_evidences" to "service_role";

grant delete, insert, references, select, trigger, truncate, update on table "public"."follow_notifications" to "anon";
grant delete, insert, references, select, trigger, truncate, update on table "public"."follow_notifications" to "authenticated";
grant delete, insert, references, select, trigger, truncate, update on table "public"."follow_notifications" to "service_role";

grant delete, insert, references, select, trigger, truncate, update on table "public"."follows" to "anon";
grant delete, insert, references, select, trigger, truncate, update on table "public"."follows" to "authenticated";
grant delete, insert, references, select, trigger, truncate, update on table "public"."follows" to "service_role";

grant delete, insert, references, select, trigger, truncate, update on table "public"."invitation_codes" to "anon";
grant delete, insert, references, select, trigger, truncate, update on table "public"."invitation_codes" to "authenticated";
grant delete, insert, references, select, trigger, truncate, update on table "public"."invitation_codes" to "service_role";

grant delete, insert, references, select, trigger, truncate, update on table "public"."invitations" to "anon";
grant delete, insert, references, select, trigger, truncate, update on table "public"."invitations" to "authenticated";
grant delete, insert, references, select, trigger, truncate, update on table "public"."invitations" to "service_role";

grant delete, insert, references, select, trigger, truncate, update on table "public"."notifications" to "anon";
grant delete, insert, references, select, trigger, truncate, update on table "public"."notifications" to "authenticated";
grant delete, insert, references, select, trigger, truncate, update on table "public"."notifications" to "service_role";

grant delete, insert, references, select, trigger, truncate, update on table "public"."passkey_challenges" to "anon";
grant delete, insert, references, select, trigger, truncate, update on table "public"."passkey_challenges" to "authenticated";
grant delete, insert, references, select, trigger, truncate, update on table "public"."passkey_challenges" to "service_role";

grant delete, insert, references, select, trigger, truncate, update on table "public"."passkey_credentials" to "anon";
grant delete, insert, references, select, trigger, truncate, update on table "public"."passkey_credentials" to "authenticated";
grant delete, insert, references, select, trigger, truncate, update on table "public"."passkey_credentials" to "service_role";

grant delete, insert, references, select, trigger, truncate, update on table "public"."pending_connect_transfers" to "anon";
grant delete, insert, references, select, trigger, truncate, update on table "public"."pending_connect_transfers" to "authenticated";
grant delete, insert, references, select, trigger, truncate, update on table "public"."pending_connect_transfers" to "service_role";

grant delete, insert, references, select, trigger, truncate, update on table "public"."platform_config" to "anon";
grant delete, insert, references, select, trigger, truncate, update on table "public"."platform_config" to "authenticated";
grant delete, insert, references, select, trigger, truncate, update on table "public"."platform_config" to "service_role";

grant delete, insert, references, select, trigger, truncate, update on table "public"."product_type_configs" to "anon";
grant delete, insert, references, select, trigger, truncate, update on table "public"."product_type_configs" to "authenticated";
grant delete, insert, references, select, trigger, truncate, update on table "public"."product_type_configs" to "service_role";

grant delete, insert, references, select, trigger, truncate, update on table "public"."provisional_users" to "anon";
grant delete, insert, references, select, trigger, truncate, update on table "public"."provisional_users" to "authenticated";
grant delete, insert, references, select, trigger, truncate, update on table "public"."provisional_users" to "service_role";

grant delete, insert, references, select, trigger, truncate, update on table "public"."qr_config_thanks" to "anon";
grant delete, insert, references, select, trigger, truncate, update on table "public"."qr_config_thanks" to "authenticated";
grant delete, insert, references, select, trigger, truncate, update on table "public"."qr_config_thanks" to "service_role";

grant delete, insert, references, select, trigger, truncate, update on table "public"."reconciliation_logs" to "anon";
grant delete, insert, references, select, trigger, truncate, update on table "public"."reconciliation_logs" to "authenticated";
grant delete, insert, references, select, trigger, truncate, update on table "public"."reconciliation_logs" to "service_role";

grant delete, insert, references, select, trigger, truncate, update on table "public"."terms_agreements" to "anon";
grant delete, insert, references, select, trigger, truncate, update on table "public"."terms_agreements" to "authenticated";
grant delete, insert, references, select, trigger, truncate, update on table "public"."terms_agreements" to "service_role";

grant delete, insert, references, select, trigger, truncate, update on table "public"."tickets" to "anon";
grant delete, insert, references, select, trigger, truncate, update on table "public"."tickets" to "authenticated";
grant delete, insert, references, select, trigger, truncate, update on table "public"."tickets" to "service_role";

grant delete, insert, references, select, trigger, truncate, update on table "public"."transfer_fee_reversals" to "anon";
grant delete, insert, references, select, trigger, truncate, update on table "public"."transfer_fee_reversals" to "authenticated";
grant delete, insert, references, select, trigger, truncate, update on table "public"."transfer_fee_reversals" to "service_role";

