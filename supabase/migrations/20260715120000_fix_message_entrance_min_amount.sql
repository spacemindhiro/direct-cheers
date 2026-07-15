-- メッセージ・エントランスの最低金額が誤って1000円/300円になっていたのを500円に修正
UPDATE public.product_type_configs SET min_amount = 500 WHERE type = 'message'  AND min_amount = 1000;
UPDATE public.product_type_configs SET min_amount = 500 WHERE type = 'entrance' AND min_amount = 300;
