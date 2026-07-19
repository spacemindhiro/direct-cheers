-- タイプC（当日決済）は「事前予約→カード保存→チェックイン時課金」という
-- 設計と、実際の運用（タッチ決済 or 当日QR自己決済のみ、事前予約は無い）が
-- 食い違っていたための撤去。本番でこの経路を通った決済は一度も無いため、
-- データ移行は不要。

DROP FUNCTION IF EXISTS complete_entrance_typec_checkin(
  TEXT, UUID, BIGINT, BIGINT, BIGINT, BIGINT, UUID, UUID
);

DROP FUNCTION IF EXISTS complete_entrance_typec_reserve(
  UUID, TEXT, UUID, UUID, TEXT
);
