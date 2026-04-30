alter table public.transactions
  alter column stripe_payment_intent_id drop not null;
