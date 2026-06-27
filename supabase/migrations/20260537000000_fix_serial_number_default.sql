-- sequence_number_in_event の DEFAULT 1 を NULL に修正
--
-- 【バグの経緯】
-- transactions.sequence_number_in_event に DEFAULT 1 が設定されていたため、
-- assign_serial_number RPC の冪等チェック（IF v_existing IS NOT NULL）が
-- 全トランザクションで即座に発動し、カウンターが進まず常に 1 を返していた。
--
-- 【修正内容】
-- DEFAULT を NULL に変更し、未採番トランザクションと採番済みトランザクションを
-- NULL か否かで正しく区別できるようにする。
--
-- 【既存データへの影響】
-- DEFAULT 1 のままで挿入された既存トランザクション（sequence_number_in_event = 1）は
-- 「1番」として採番済み扱いになるため、データは変更しない。
-- ただし assign_serial_number を再実行すると冪等チェックで 1 を返すため、
-- 既存データの再採番が必要な場合は別途対応すること。

ALTER TABLE public.transactions
  ALTER COLUMN sequence_number_in_event SET DEFAULT NULL;
