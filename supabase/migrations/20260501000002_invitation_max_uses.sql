-- 招待コードに上限人数を追加（null = 1人限り）
alter table public.invitation_codes
  add column if not exists max_uses integer;

-- トランザクションに招待コードIDを追加（どのコードで入ったか追跡）
alter table public.transactions
  add column if not exists invitation_code_id uuid references public.invitation_codes(code_id);
