-- event_thanks（イベント単位のお礼特典）はqr_config_thanks（QR単位）に役割が
-- 移行済みで廃止予定とされていたまま放置されていた。利用しているコード（API・画面）は
-- 既に削除済みのため、テーブル本体・RLSポリシー・専用トリガーを削除する。
--
-- 共有トリガー関数 touch_event_thanks_updated_at() は entrance_tickets関連テーブルでも
-- 使用中のため削除しない（DROP TABLEで該当トリガー定義自体は自動的に消えるが、関数本体は残る）。
drop table if exists public.event_thanks;
