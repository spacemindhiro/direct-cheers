-- 全商品タイプの最低金額を500円→50円に引き下げる。
-- Stripeの決済最低金額（JPY）は50円であり、500円という下限は
-- 過去の誤りをそのまま踏襲していただけで、業務上の根拠は無かった。
UPDATE public.product_type_configs SET min_amount = 50 WHERE min_amount = 500;
