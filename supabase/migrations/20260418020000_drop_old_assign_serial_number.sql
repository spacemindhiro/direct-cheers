-- 20260418000000 で引数変更時に旧版が残ったため明示的に削除
-- CREATE OR REPLACE は引数数が変わると新関数を追加してしまうため
DROP FUNCTION IF EXISTS public.assign_serial_number(uuid, uuid, uuid);
