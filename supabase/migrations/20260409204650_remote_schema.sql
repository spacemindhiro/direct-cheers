drop extension if exists "pg_net";


  create table "public"."asset_access_logs" (
    "log_id" uuid not null default gen_random_uuid(),
    "transaction_id" uuid not null,
    "ip_address" text,
    "user_agent" text,
    "accessed_at" timestamp with time zone not null default now()
      );


alter table "public"."asset_access_logs" enable row level security;


  create table "public"."connections" (
    "connection_id" uuid not null default gen_random_uuid(),
    "organizer_profile_id" uuid not null,
    "artist_profile_id" uuid not null,
    "status" text not null default 'pending'::text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "deleted_at" timestamp with time zone
      );


alter table "public"."connections" enable row level security;


  create table "public"."debt_claims" (
    "claim_id" uuid not null default gen_random_uuid(),
    "profile_id" uuid not null,
    "original_transaction_id" uuid,
    "claim_amount" bigint not null,
    "stripe_dispute_fee" bigint default 0,
    "recovered_amount" bigint not null default 0,
    "status" text not null default 'active'::text,
    "description" text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "deleted_at" timestamp with time zone
      );


alter table "public"."debt_claims" enable row level security;


  create table "public"."distribution_configs" (
    "config_id" uuid not null default gen_random_uuid(),
    "event_id" uuid not null,
    "platform_fee_rate" numeric(8,6) not null default 0.100000,
    "agent_fee_rate" numeric(8,6) not null default 0.100000,
    "organizer_rate" numeric(8,6) not null default 0.400000,
    "artist_rate" numeric(8,6) not null default 0.400000,
    "nft_cost_bearer" text default 'platform'::text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "deleted_at" timestamp with time zone
      );


alter table "public"."distribution_configs" enable row level security;


  create table "public"."event_artists" (
    "event_artist_id" uuid not null default gen_random_uuid(),
    "event_id" uuid not null,
    "artist_profile_id" uuid not null,
    "performance_order" integer,
    "scheduled_start_at" timestamp with time zone,
    "slot_duration_minutes" integer,
    "thanks_message" text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "deleted_at" timestamp with time zone
      );


alter table "public"."event_artists" enable row level security;


  create table "public"."events" (
    "event_id" uuid not null default gen_random_uuid(),
    "organizer_profile_id" uuid not null,
    "agent_id" uuid not null,
    "lifecycle_status" text not null default 'draft'::text,
    "evidence_page_slug" text,
    "title" text not null,
    "base_flyer_url" text,
    "start_at" timestamp with time zone not null,
    "end_at" timestamp with time zone not null,
    "settlement_deadline" timestamp with time zone,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "deleted_at" timestamp with time zone
      );


alter table "public"."events" enable row level security;


  create table "public"."payout_requests" (
    "request_id" uuid not null default gen_random_uuid(),
    "profile_id" uuid not null,
    "requested_amount" bigint not null,
    "stripe_fee_deducted" bigint not null,
    "net_payout_amount" bigint not null,
    "status" text not null default 'pending'::text,
    "stripe_transfer_id" text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "deleted_at" timestamp with time zone
      );


alter table "public"."payout_requests" enable row level security;


  create table "public"."products" (
    "product_id" uuid not null default gen_random_uuid(),
    "event_id" uuid not null,
    "artist_id" uuid not null,
    "name" text not null,
    "min_amount" bigint not null default 500,
    "digital_asset_url" text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "deleted_at" timestamp with time zone
      );


alter table "public"."products" enable row level security;


  create table "public"."profiles" (
    "profile_id" uuid not null,
    "role" text not null default 'artist'::text,
    "display_name" text not null,
    "avatar_url" text,
    "social_links" jsonb default '{}'::jsonb,
    "stripe_connect_id" text,
    "stripe_customer_id" text,
    "wallet_address" text,
    "verification_status" text not null default 'unverified'::text,
    "responsible_agent_id" uuid,
    "base_fee_rate" numeric(8,6) not null default 0.100000,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "deleted_at" timestamp with time zone
      );


alter table "public"."profiles" enable row level security;


  create table "public"."qr_config_targets" (
    "qr_config_target_id" uuid not null default gen_random_uuid(),
    "qr_config_id" uuid not null,
    "profile_id" uuid not null,
    "distribution_ratio" numeric(8,6) not null,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "deleted_at" timestamp with time zone
      );


alter table "public"."qr_config_targets" enable row level security;


  create table "public"."qr_configs" (
    "qr_config_id" uuid not null default gen_random_uuid(),
    "event_id" uuid not null,
    "creator_profile_id" uuid not null,
    "label" text,
    "is_personal" boolean not null default false,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "deleted_at" timestamp with time zone
      );


alter table "public"."qr_configs" enable row level security;


  create table "public"."receipts" (
    "receipt_id" uuid not null default gen_random_uuid(),
    "transaction_id" uuid not null,
    "item_name" text not null,
    "unit_price" bigint not null,
    "wallet_pass_url" text,
    "issued_at" timestamp with time zone not null default now(),
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "deleted_at" timestamp with time zone
      );


alter table "public"."receipts" enable row level security;


  create table "public"."settlement_summaries" (
    "summary_id" uuid not null default gen_random_uuid(),
    "event_id" uuid not null,
    "is_approved_for_payout" boolean not null default false,
    "approved_at" timestamp with time zone,
    "approved_by_profile_id" uuid,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "deleted_at" timestamp with time zone
      );


alter table "public"."settlement_summaries" enable row level security;


  create table "public"."transaction_distributions" (
    "transaction_distribution_id" uuid not null default gen_random_uuid(),
    "transaction_id" uuid not null,
    "event_id" uuid not null,
    "profile_id" uuid not null,
    "distribution_role" text not null,
    "actual_amount" bigint not null,
    "distribution_status" text not null default 'accrued'::text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "deleted_at" timestamp with time zone
      );


alter table "public"."transaction_distributions" enable row level security;


  create table "public"."transactions" (
    "transaction_id" uuid not null default gen_random_uuid(),
    "stripe_payment_intent_id" text not null,
    "product_id" uuid,
    "qr_config_id" uuid,
    "sender_profile_id" uuid,
    "sender_name" text,
    "sender_comment" text,
    "status" text not null default 'pending'::text,
    "total_gross_amount" bigint not null,
    "nft_serial_number" text,
    "sequence_number_in_event" integer default 1,
    "cumulative_amount_at_tx" bigint,
    "display_grade" text default 'normal'::text,
    "stripe_funds_status" text not null default 'held_in_platform'::text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "deleted_at" timestamp with time zone
      );


alter table "public"."transactions" enable row level security;

CREATE UNIQUE INDEX asset_access_logs_pkey ON public.asset_access_logs USING btree (log_id);

CREATE UNIQUE INDEX connections_organizer_profile_id_artist_profile_id_key ON public.connections USING btree (organizer_profile_id, artist_profile_id);

CREATE UNIQUE INDEX connections_pkey ON public.connections USING btree (connection_id);

CREATE UNIQUE INDEX debt_claims_pkey ON public.debt_claims USING btree (claim_id);

CREATE UNIQUE INDEX distribution_configs_event_id_key ON public.distribution_configs USING btree (event_id);

CREATE UNIQUE INDEX distribution_configs_pkey ON public.distribution_configs USING btree (config_id);

CREATE UNIQUE INDEX event_artists_event_id_artist_profile_id_key ON public.event_artists USING btree (event_id, artist_profile_id);

CREATE UNIQUE INDEX event_artists_pkey ON public.event_artists USING btree (event_artist_id);

CREATE UNIQUE INDEX events_evidence_page_slug_key ON public.events USING btree (evidence_page_slug);

CREATE UNIQUE INDEX events_pkey ON public.events USING btree (event_id);

CREATE UNIQUE INDEX payout_requests_pkey ON public.payout_requests USING btree (request_id);

CREATE UNIQUE INDEX payout_requests_stripe_transfer_id_key ON public.payout_requests USING btree (stripe_transfer_id);

CREATE UNIQUE INDEX products_pkey ON public.products USING btree (product_id);

CREATE UNIQUE INDEX profiles_pkey ON public.profiles USING btree (profile_id);

CREATE UNIQUE INDEX profiles_stripe_connect_id_key ON public.profiles USING btree (stripe_connect_id);

CREATE UNIQUE INDEX profiles_wallet_address_key ON public.profiles USING btree (wallet_address);

CREATE UNIQUE INDEX qr_config_targets_pkey ON public.qr_config_targets USING btree (qr_config_target_id);

CREATE UNIQUE INDEX qr_configs_pkey ON public.qr_configs USING btree (qr_config_id);

CREATE UNIQUE INDEX receipts_pkey ON public.receipts USING btree (receipt_id);

CREATE UNIQUE INDEX settlement_summaries_event_id_key ON public.settlement_summaries USING btree (event_id);

CREATE UNIQUE INDEX settlement_summaries_pkey ON public.settlement_summaries USING btree (summary_id);

CREATE UNIQUE INDEX transaction_distributions_pkey ON public.transaction_distributions USING btree (transaction_distribution_id);

CREATE UNIQUE INDEX transactions_nft_serial_number_key ON public.transactions USING btree (nft_serial_number);

CREATE UNIQUE INDEX transactions_pkey ON public.transactions USING btree (transaction_id);

CREATE UNIQUE INDEX transactions_stripe_payment_intent_id_key ON public.transactions USING btree (stripe_payment_intent_id);

alter table "public"."asset_access_logs" add constraint "asset_access_logs_pkey" PRIMARY KEY using index "asset_access_logs_pkey";

alter table "public"."connections" add constraint "connections_pkey" PRIMARY KEY using index "connections_pkey";

alter table "public"."debt_claims" add constraint "debt_claims_pkey" PRIMARY KEY using index "debt_claims_pkey";

alter table "public"."distribution_configs" add constraint "distribution_configs_pkey" PRIMARY KEY using index "distribution_configs_pkey";

alter table "public"."event_artists" add constraint "event_artists_pkey" PRIMARY KEY using index "event_artists_pkey";

alter table "public"."events" add constraint "events_pkey" PRIMARY KEY using index "events_pkey";

alter table "public"."payout_requests" add constraint "payout_requests_pkey" PRIMARY KEY using index "payout_requests_pkey";

alter table "public"."products" add constraint "products_pkey" PRIMARY KEY using index "products_pkey";

alter table "public"."profiles" add constraint "profiles_pkey" PRIMARY KEY using index "profiles_pkey";

alter table "public"."qr_config_targets" add constraint "qr_config_targets_pkey" PRIMARY KEY using index "qr_config_targets_pkey";

alter table "public"."qr_configs" add constraint "qr_configs_pkey" PRIMARY KEY using index "qr_configs_pkey";

alter table "public"."receipts" add constraint "receipts_pkey" PRIMARY KEY using index "receipts_pkey";

alter table "public"."settlement_summaries" add constraint "settlement_summaries_pkey" PRIMARY KEY using index "settlement_summaries_pkey";

alter table "public"."transaction_distributions" add constraint "transaction_distributions_pkey" PRIMARY KEY using index "transaction_distributions_pkey";

alter table "public"."transactions" add constraint "transactions_pkey" PRIMARY KEY using index "transactions_pkey";

alter table "public"."asset_access_logs" add constraint "asset_access_logs_transaction_id_fkey" FOREIGN KEY (transaction_id) REFERENCES public.transactions(transaction_id) ON DELETE RESTRICT not valid;

alter table "public"."asset_access_logs" validate constraint "asset_access_logs_transaction_id_fkey";

alter table "public"."connections" add constraint "connections_artist_profile_id_fkey" FOREIGN KEY (artist_profile_id) REFERENCES public.profiles(profile_id) ON DELETE RESTRICT not valid;

alter table "public"."connections" validate constraint "connections_artist_profile_id_fkey";

alter table "public"."connections" add constraint "connections_organizer_profile_id_artist_profile_id_key" UNIQUE using index "connections_organizer_profile_id_artist_profile_id_key";

alter table "public"."connections" add constraint "connections_organizer_profile_id_fkey" FOREIGN KEY (organizer_profile_id) REFERENCES public.profiles(profile_id) ON DELETE RESTRICT not valid;

alter table "public"."connections" validate constraint "connections_organizer_profile_id_fkey";

alter table "public"."connections" add constraint "connections_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'active'::text, 'blocked'::text]))) not valid;

alter table "public"."connections" validate constraint "connections_status_check";

alter table "public"."debt_claims" add constraint "debt_claims_original_transaction_id_fkey" FOREIGN KEY (original_transaction_id) REFERENCES public.transactions(transaction_id) not valid;

alter table "public"."debt_claims" validate constraint "debt_claims_original_transaction_id_fkey";

alter table "public"."debt_claims" add constraint "debt_claims_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES public.profiles(profile_id) ON DELETE RESTRICT not valid;

alter table "public"."debt_claims" validate constraint "debt_claims_profile_id_fkey";

alter table "public"."debt_claims" add constraint "debt_claims_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'recovered'::text, 'written_off'::text]))) not valid;

alter table "public"."debt_claims" validate constraint "debt_claims_status_check";

alter table "public"."distribution_configs" add constraint "distribution_configs_event_id_fkey" FOREIGN KEY (event_id) REFERENCES public.events(event_id) ON DELETE RESTRICT not valid;

alter table "public"."distribution_configs" validate constraint "distribution_configs_event_id_fkey";

alter table "public"."distribution_configs" add constraint "distribution_configs_event_id_key" UNIQUE using index "distribution_configs_event_id_key";

alter table "public"."distribution_configs" add constraint "distribution_configs_nft_cost_bearer_check" CHECK ((nft_cost_bearer = ANY (ARRAY['platform'::text, 'agent'::text, 'organizer'::text]))) not valid;

alter table "public"."distribution_configs" validate constraint "distribution_configs_nft_cost_bearer_check";

alter table "public"."event_artists" add constraint "event_artists_artist_profile_id_fkey" FOREIGN KEY (artist_profile_id) REFERENCES public.profiles(profile_id) ON DELETE RESTRICT not valid;

alter table "public"."event_artists" validate constraint "event_artists_artist_profile_id_fkey";

alter table "public"."event_artists" add constraint "event_artists_event_id_artist_profile_id_key" UNIQUE using index "event_artists_event_id_artist_profile_id_key";

alter table "public"."event_artists" add constraint "event_artists_event_id_fkey" FOREIGN KEY (event_id) REFERENCES public.events(event_id) ON DELETE RESTRICT not valid;

alter table "public"."event_artists" validate constraint "event_artists_event_id_fkey";

alter table "public"."events" add constraint "events_agent_id_fkey" FOREIGN KEY (agent_id) REFERENCES public.profiles(profile_id) ON DELETE RESTRICT not valid;

alter table "public"."events" validate constraint "events_agent_id_fkey";

alter table "public"."events" add constraint "events_evidence_page_slug_key" UNIQUE using index "events_evidence_page_slug_key";

alter table "public"."events" add constraint "events_lifecycle_status_check" CHECK ((lifecycle_status = ANY (ARRAY['draft'::text, 'published'::text, 'ongoing'::text, 'ended'::text, 'settled'::text]))) not valid;

alter table "public"."events" validate constraint "events_lifecycle_status_check";

alter table "public"."events" add constraint "events_organizer_profile_id_fkey" FOREIGN KEY (organizer_profile_id) REFERENCES public.profiles(profile_id) ON DELETE RESTRICT not valid;

alter table "public"."events" validate constraint "events_organizer_profile_id_fkey";

alter table "public"."payout_requests" add constraint "payout_requests_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES public.profiles(profile_id) ON DELETE RESTRICT not valid;

alter table "public"."payout_requests" validate constraint "payout_requests_profile_id_fkey";

alter table "public"."payout_requests" add constraint "payout_requests_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text]))) not valid;

alter table "public"."payout_requests" validate constraint "payout_requests_status_check";

alter table "public"."payout_requests" add constraint "payout_requests_stripe_transfer_id_key" UNIQUE using index "payout_requests_stripe_transfer_id_key";

alter table "public"."products" add constraint "products_artist_id_fkey" FOREIGN KEY (artist_id) REFERENCES public.profiles(profile_id) ON DELETE RESTRICT not valid;

alter table "public"."products" validate constraint "products_artist_id_fkey";

alter table "public"."products" add constraint "products_event_id_fkey" FOREIGN KEY (event_id) REFERENCES public.events(event_id) ON DELETE RESTRICT not valid;

alter table "public"."products" validate constraint "products_event_id_fkey";

alter table "public"."profiles" add constraint "profiles_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."profiles" validate constraint "profiles_profile_id_fkey";

alter table "public"."profiles" add constraint "profiles_responsible_agent_id_fkey" FOREIGN KEY (responsible_agent_id) REFERENCES public.profiles(profile_id) ON DELETE SET NULL not valid;

alter table "public"."profiles" validate constraint "profiles_responsible_agent_id_fkey";

alter table "public"."profiles" add constraint "profiles_role_check" CHECK ((role = ANY (ARRAY['admin'::text, 'agent'::text, 'organizer'::text, 'artist'::text, 'user'::text]))) not valid;

alter table "public"."profiles" validate constraint "profiles_role_check";

alter table "public"."profiles" add constraint "profiles_stripe_connect_id_key" UNIQUE using index "profiles_stripe_connect_id_key";

alter table "public"."profiles" add constraint "profiles_verification_status_check" CHECK ((verification_status = ANY (ARRAY['unverified'::text, 'pending'::text, 'verified'::text, 'rejected'::text]))) not valid;

alter table "public"."profiles" validate constraint "profiles_verification_status_check";

alter table "public"."profiles" add constraint "profiles_wallet_address_key" UNIQUE using index "profiles_wallet_address_key";

alter table "public"."qr_config_targets" add constraint "qr_config_targets_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES public.profiles(profile_id) ON DELETE RESTRICT not valid;

alter table "public"."qr_config_targets" validate constraint "qr_config_targets_profile_id_fkey";

alter table "public"."qr_config_targets" add constraint "qr_config_targets_qr_config_id_fkey" FOREIGN KEY (qr_config_id) REFERENCES public.qr_configs(qr_config_id) ON DELETE RESTRICT not valid;

alter table "public"."qr_config_targets" validate constraint "qr_config_targets_qr_config_id_fkey";

alter table "public"."qr_configs" add constraint "qr_configs_creator_profile_id_fkey" FOREIGN KEY (creator_profile_id) REFERENCES public.profiles(profile_id) ON DELETE RESTRICT not valid;

alter table "public"."qr_configs" validate constraint "qr_configs_creator_profile_id_fkey";

alter table "public"."qr_configs" add constraint "qr_configs_event_id_fkey" FOREIGN KEY (event_id) REFERENCES public.events(event_id) ON DELETE RESTRICT not valid;

alter table "public"."qr_configs" validate constraint "qr_configs_event_id_fkey";

alter table "public"."receipts" add constraint "receipts_transaction_id_fkey" FOREIGN KEY (transaction_id) REFERENCES public.transactions(transaction_id) ON DELETE RESTRICT not valid;

alter table "public"."receipts" validate constraint "receipts_transaction_id_fkey";

alter table "public"."settlement_summaries" add constraint "settlement_summaries_approved_by_profile_id_fkey" FOREIGN KEY (approved_by_profile_id) REFERENCES public.profiles(profile_id) not valid;

alter table "public"."settlement_summaries" validate constraint "settlement_summaries_approved_by_profile_id_fkey";

alter table "public"."settlement_summaries" add constraint "settlement_summaries_event_id_fkey" FOREIGN KEY (event_id) REFERENCES public.events(event_id) ON DELETE RESTRICT not valid;

alter table "public"."settlement_summaries" validate constraint "settlement_summaries_event_id_fkey";

alter table "public"."settlement_summaries" add constraint "settlement_summaries_event_id_key" UNIQUE using index "settlement_summaries_event_id_key";

alter table "public"."transaction_distributions" add constraint "transaction_distributions_distribution_role_check" CHECK ((distribution_role = ANY (ARRAY['platform'::text, 'agent'::text, 'organizer'::text, 'artist'::text]))) not valid;

alter table "public"."transaction_distributions" validate constraint "transaction_distributions_distribution_role_check";

alter table "public"."transaction_distributions" add constraint "transaction_distributions_distribution_status_check" CHECK ((distribution_status = ANY (ARRAY['accrued'::text, 'scheduled'::text, 'transferred'::text, 'voided'::text, 'reversed'::text]))) not valid;

alter table "public"."transaction_distributions" validate constraint "transaction_distributions_distribution_status_check";

alter table "public"."transaction_distributions" add constraint "transaction_distributions_event_id_fkey" FOREIGN KEY (event_id) REFERENCES public.events(event_id) ON DELETE RESTRICT not valid;

alter table "public"."transaction_distributions" validate constraint "transaction_distributions_event_id_fkey";

alter table "public"."transaction_distributions" add constraint "transaction_distributions_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES public.profiles(profile_id) ON DELETE RESTRICT not valid;

alter table "public"."transaction_distributions" validate constraint "transaction_distributions_profile_id_fkey";

alter table "public"."transaction_distributions" add constraint "transaction_distributions_transaction_id_fkey" FOREIGN KEY (transaction_id) REFERENCES public.transactions(transaction_id) ON DELETE RESTRICT not valid;

alter table "public"."transaction_distributions" validate constraint "transaction_distributions_transaction_id_fkey";

alter table "public"."transactions" add constraint "transactions_nft_serial_number_key" UNIQUE using index "transactions_nft_serial_number_key";

alter table "public"."transactions" add constraint "transactions_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(product_id) ON DELETE RESTRICT not valid;

alter table "public"."transactions" validate constraint "transactions_product_id_fkey";

alter table "public"."transactions" add constraint "transactions_qr_config_id_fkey" FOREIGN KEY (qr_config_id) REFERENCES public.qr_configs(qr_config_id) ON DELETE RESTRICT not valid;

alter table "public"."transactions" validate constraint "transactions_qr_config_id_fkey";

alter table "public"."transactions" add constraint "transactions_sender_profile_id_fkey" FOREIGN KEY (sender_profile_id) REFERENCES public.profiles(profile_id) ON DELETE SET NULL not valid;

alter table "public"."transactions" validate constraint "transactions_sender_profile_id_fkey";

alter table "public"."transactions" add constraint "transactions_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'succeeded'::text, 'failed'::text, 'refunded'::text]))) not valid;

alter table "public"."transactions" validate constraint "transactions_status_check";

alter table "public"."transactions" add constraint "transactions_stripe_funds_status_check" CHECK ((stripe_funds_status = ANY (ARRAY['held_in_platform'::text, 'transferred'::text, 'refunded'::text]))) not valid;

alter table "public"."transactions" validate constraint "transactions_stripe_funds_status_check";

alter table "public"."transactions" add constraint "transactions_stripe_payment_intent_id_key" UNIQUE using index "transactions_stripe_payment_intent_id_key";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_modified_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$ begin new.updated_at = now(); return new; end; $function$
;

create or replace view "public"."view_withdrawable_balances" as  WITH accrued_confirmed AS (
         SELECT td.profile_id,
            sum(td.actual_amount) AS total_accrued
           FROM (public.transaction_distributions td
             JOIN public.settlement_summaries ss ON ((td.event_id = ss.event_id)))
          WHERE ((td.deleted_at IS NULL) AND (ss.deleted_at IS NULL) AND (td.distribution_status = 'accrued'::text) AND (ss.is_approved_for_payout = true) AND (ss.approved_at <= (now() - '14 days'::interval)))
          GROUP BY td.profile_id
        ), active_debts AS (
         SELECT debt_claims.profile_id,
            sum((debt_claims.claim_amount - debt_claims.recovered_amount)) AS total_debt
           FROM public.debt_claims
          WHERE ((debt_claims.deleted_at IS NULL) AND (debt_claims.status = 'active'::text))
          GROUP BY debt_claims.profile_id
        )
 SELECT p.profile_id,
    p.display_name,
    COALESCE(a.total_accrued, (0)::numeric) AS raw_withdrawable,
    COALESCE(d.total_debt, (0)::numeric) AS active_debt,
    GREATEST((0)::numeric, (COALESCE(a.total_accrued, (0)::numeric) - COALESCE(d.total_debt, (0)::numeric))) AS final_withdrawable_amount
   FROM ((public.profiles p
     LEFT JOIN accrued_confirmed a ON ((p.profile_id = a.profile_id)))
     LEFT JOIN active_debts d ON ((p.profile_id = d.profile_id)))
  WHERE (p.deleted_at IS NULL);


grant delete on table "public"."asset_access_logs" to "anon";

grant insert on table "public"."asset_access_logs" to "anon";

grant references on table "public"."asset_access_logs" to "anon";

grant select on table "public"."asset_access_logs" to "anon";

grant trigger on table "public"."asset_access_logs" to "anon";

grant truncate on table "public"."asset_access_logs" to "anon";

grant update on table "public"."asset_access_logs" to "anon";

grant delete on table "public"."asset_access_logs" to "authenticated";

grant insert on table "public"."asset_access_logs" to "authenticated";

grant references on table "public"."asset_access_logs" to "authenticated";

grant select on table "public"."asset_access_logs" to "authenticated";

grant trigger on table "public"."asset_access_logs" to "authenticated";

grant truncate on table "public"."asset_access_logs" to "authenticated";

grant update on table "public"."asset_access_logs" to "authenticated";

grant delete on table "public"."asset_access_logs" to "service_role";

grant insert on table "public"."asset_access_logs" to "service_role";

grant references on table "public"."asset_access_logs" to "service_role";

grant select on table "public"."asset_access_logs" to "service_role";

grant trigger on table "public"."asset_access_logs" to "service_role";

grant truncate on table "public"."asset_access_logs" to "service_role";

grant update on table "public"."asset_access_logs" to "service_role";

grant delete on table "public"."connections" to "anon";

grant insert on table "public"."connections" to "anon";

grant references on table "public"."connections" to "anon";

grant select on table "public"."connections" to "anon";

grant trigger on table "public"."connections" to "anon";

grant truncate on table "public"."connections" to "anon";

grant update on table "public"."connections" to "anon";

grant delete on table "public"."connections" to "authenticated";

grant insert on table "public"."connections" to "authenticated";

grant references on table "public"."connections" to "authenticated";

grant select on table "public"."connections" to "authenticated";

grant trigger on table "public"."connections" to "authenticated";

grant truncate on table "public"."connections" to "authenticated";

grant update on table "public"."connections" to "authenticated";

grant delete on table "public"."connections" to "service_role";

grant insert on table "public"."connections" to "service_role";

grant references on table "public"."connections" to "service_role";

grant select on table "public"."connections" to "service_role";

grant trigger on table "public"."connections" to "service_role";

grant truncate on table "public"."connections" to "service_role";

grant update on table "public"."connections" to "service_role";

grant delete on table "public"."debt_claims" to "anon";

grant insert on table "public"."debt_claims" to "anon";

grant references on table "public"."debt_claims" to "anon";

grant select on table "public"."debt_claims" to "anon";

grant trigger on table "public"."debt_claims" to "anon";

grant truncate on table "public"."debt_claims" to "anon";

grant update on table "public"."debt_claims" to "anon";

grant delete on table "public"."debt_claims" to "authenticated";

grant insert on table "public"."debt_claims" to "authenticated";

grant references on table "public"."debt_claims" to "authenticated";

grant select on table "public"."debt_claims" to "authenticated";

grant trigger on table "public"."debt_claims" to "authenticated";

grant truncate on table "public"."debt_claims" to "authenticated";

grant update on table "public"."debt_claims" to "authenticated";

grant delete on table "public"."debt_claims" to "service_role";

grant insert on table "public"."debt_claims" to "service_role";

grant references on table "public"."debt_claims" to "service_role";

grant select on table "public"."debt_claims" to "service_role";

grant trigger on table "public"."debt_claims" to "service_role";

grant truncate on table "public"."debt_claims" to "service_role";

grant update on table "public"."debt_claims" to "service_role";

grant delete on table "public"."distribution_configs" to "anon";

grant insert on table "public"."distribution_configs" to "anon";

grant references on table "public"."distribution_configs" to "anon";

grant select on table "public"."distribution_configs" to "anon";

grant trigger on table "public"."distribution_configs" to "anon";

grant truncate on table "public"."distribution_configs" to "anon";

grant update on table "public"."distribution_configs" to "anon";

grant delete on table "public"."distribution_configs" to "authenticated";

grant insert on table "public"."distribution_configs" to "authenticated";

grant references on table "public"."distribution_configs" to "authenticated";

grant select on table "public"."distribution_configs" to "authenticated";

grant trigger on table "public"."distribution_configs" to "authenticated";

grant truncate on table "public"."distribution_configs" to "authenticated";

grant update on table "public"."distribution_configs" to "authenticated";

grant delete on table "public"."distribution_configs" to "service_role";

grant insert on table "public"."distribution_configs" to "service_role";

grant references on table "public"."distribution_configs" to "service_role";

grant select on table "public"."distribution_configs" to "service_role";

grant trigger on table "public"."distribution_configs" to "service_role";

grant truncate on table "public"."distribution_configs" to "service_role";

grant update on table "public"."distribution_configs" to "service_role";

grant delete on table "public"."event_artists" to "anon";

grant insert on table "public"."event_artists" to "anon";

grant references on table "public"."event_artists" to "anon";

grant select on table "public"."event_artists" to "anon";

grant trigger on table "public"."event_artists" to "anon";

grant truncate on table "public"."event_artists" to "anon";

grant update on table "public"."event_artists" to "anon";

grant delete on table "public"."event_artists" to "authenticated";

grant insert on table "public"."event_artists" to "authenticated";

grant references on table "public"."event_artists" to "authenticated";

grant select on table "public"."event_artists" to "authenticated";

grant trigger on table "public"."event_artists" to "authenticated";

grant truncate on table "public"."event_artists" to "authenticated";

grant update on table "public"."event_artists" to "authenticated";

grant delete on table "public"."event_artists" to "service_role";

grant insert on table "public"."event_artists" to "service_role";

grant references on table "public"."event_artists" to "service_role";

grant select on table "public"."event_artists" to "service_role";

grant trigger on table "public"."event_artists" to "service_role";

grant truncate on table "public"."event_artists" to "service_role";

grant update on table "public"."event_artists" to "service_role";

grant delete on table "public"."events" to "anon";

grant insert on table "public"."events" to "anon";

grant references on table "public"."events" to "anon";

grant select on table "public"."events" to "anon";

grant trigger on table "public"."events" to "anon";

grant truncate on table "public"."events" to "anon";

grant update on table "public"."events" to "anon";

grant delete on table "public"."events" to "authenticated";

grant insert on table "public"."events" to "authenticated";

grant references on table "public"."events" to "authenticated";

grant select on table "public"."events" to "authenticated";

grant trigger on table "public"."events" to "authenticated";

grant truncate on table "public"."events" to "authenticated";

grant update on table "public"."events" to "authenticated";

grant delete on table "public"."events" to "service_role";

grant insert on table "public"."events" to "service_role";

grant references on table "public"."events" to "service_role";

grant select on table "public"."events" to "service_role";

grant trigger on table "public"."events" to "service_role";

grant truncate on table "public"."events" to "service_role";

grant update on table "public"."events" to "service_role";

grant delete on table "public"."payout_requests" to "anon";

grant insert on table "public"."payout_requests" to "anon";

grant references on table "public"."payout_requests" to "anon";

grant select on table "public"."payout_requests" to "anon";

grant trigger on table "public"."payout_requests" to "anon";

grant truncate on table "public"."payout_requests" to "anon";

grant update on table "public"."payout_requests" to "anon";

grant delete on table "public"."payout_requests" to "authenticated";

grant insert on table "public"."payout_requests" to "authenticated";

grant references on table "public"."payout_requests" to "authenticated";

grant select on table "public"."payout_requests" to "authenticated";

grant trigger on table "public"."payout_requests" to "authenticated";

grant truncate on table "public"."payout_requests" to "authenticated";

grant update on table "public"."payout_requests" to "authenticated";

grant delete on table "public"."payout_requests" to "service_role";

grant insert on table "public"."payout_requests" to "service_role";

grant references on table "public"."payout_requests" to "service_role";

grant select on table "public"."payout_requests" to "service_role";

grant trigger on table "public"."payout_requests" to "service_role";

grant truncate on table "public"."payout_requests" to "service_role";

grant update on table "public"."payout_requests" to "service_role";

grant delete on table "public"."products" to "anon";

grant insert on table "public"."products" to "anon";

grant references on table "public"."products" to "anon";

grant select on table "public"."products" to "anon";

grant trigger on table "public"."products" to "anon";

grant truncate on table "public"."products" to "anon";

grant update on table "public"."products" to "anon";

grant delete on table "public"."products" to "authenticated";

grant insert on table "public"."products" to "authenticated";

grant references on table "public"."products" to "authenticated";

grant select on table "public"."products" to "authenticated";

grant trigger on table "public"."products" to "authenticated";

grant truncate on table "public"."products" to "authenticated";

grant update on table "public"."products" to "authenticated";

grant delete on table "public"."products" to "service_role";

grant insert on table "public"."products" to "service_role";

grant references on table "public"."products" to "service_role";

grant select on table "public"."products" to "service_role";

grant trigger on table "public"."products" to "service_role";

grant truncate on table "public"."products" to "service_role";

grant update on table "public"."products" to "service_role";

grant delete on table "public"."profiles" to "anon";

grant insert on table "public"."profiles" to "anon";

grant references on table "public"."profiles" to "anon";

grant select on table "public"."profiles" to "anon";

grant trigger on table "public"."profiles" to "anon";

grant truncate on table "public"."profiles" to "anon";

grant update on table "public"."profiles" to "anon";

grant delete on table "public"."profiles" to "authenticated";

grant insert on table "public"."profiles" to "authenticated";

grant references on table "public"."profiles" to "authenticated";

grant select on table "public"."profiles" to "authenticated";

grant trigger on table "public"."profiles" to "authenticated";

grant truncate on table "public"."profiles" to "authenticated";

grant update on table "public"."profiles" to "authenticated";

grant delete on table "public"."profiles" to "service_role";

grant insert on table "public"."profiles" to "service_role";

grant references on table "public"."profiles" to "service_role";

grant select on table "public"."profiles" to "service_role";

grant trigger on table "public"."profiles" to "service_role";

grant truncate on table "public"."profiles" to "service_role";

grant update on table "public"."profiles" to "service_role";

grant delete on table "public"."qr_config_targets" to "anon";

grant insert on table "public"."qr_config_targets" to "anon";

grant references on table "public"."qr_config_targets" to "anon";

grant select on table "public"."qr_config_targets" to "anon";

grant trigger on table "public"."qr_config_targets" to "anon";

grant truncate on table "public"."qr_config_targets" to "anon";

grant update on table "public"."qr_config_targets" to "anon";

grant delete on table "public"."qr_config_targets" to "authenticated";

grant insert on table "public"."qr_config_targets" to "authenticated";

grant references on table "public"."qr_config_targets" to "authenticated";

grant select on table "public"."qr_config_targets" to "authenticated";

grant trigger on table "public"."qr_config_targets" to "authenticated";

grant truncate on table "public"."qr_config_targets" to "authenticated";

grant update on table "public"."qr_config_targets" to "authenticated";

grant delete on table "public"."qr_config_targets" to "service_role";

grant insert on table "public"."qr_config_targets" to "service_role";

grant references on table "public"."qr_config_targets" to "service_role";

grant select on table "public"."qr_config_targets" to "service_role";

grant trigger on table "public"."qr_config_targets" to "service_role";

grant truncate on table "public"."qr_config_targets" to "service_role";

grant update on table "public"."qr_config_targets" to "service_role";

grant delete on table "public"."qr_configs" to "anon";

grant insert on table "public"."qr_configs" to "anon";

grant references on table "public"."qr_configs" to "anon";

grant select on table "public"."qr_configs" to "anon";

grant trigger on table "public"."qr_configs" to "anon";

grant truncate on table "public"."qr_configs" to "anon";

grant update on table "public"."qr_configs" to "anon";

grant delete on table "public"."qr_configs" to "authenticated";

grant insert on table "public"."qr_configs" to "authenticated";

grant references on table "public"."qr_configs" to "authenticated";

grant select on table "public"."qr_configs" to "authenticated";

grant trigger on table "public"."qr_configs" to "authenticated";

grant truncate on table "public"."qr_configs" to "authenticated";

grant update on table "public"."qr_configs" to "authenticated";

grant delete on table "public"."qr_configs" to "service_role";

grant insert on table "public"."qr_configs" to "service_role";

grant references on table "public"."qr_configs" to "service_role";

grant select on table "public"."qr_configs" to "service_role";

grant trigger on table "public"."qr_configs" to "service_role";

grant truncate on table "public"."qr_configs" to "service_role";

grant update on table "public"."qr_configs" to "service_role";

grant delete on table "public"."receipts" to "anon";

grant insert on table "public"."receipts" to "anon";

grant references on table "public"."receipts" to "anon";

grant select on table "public"."receipts" to "anon";

grant trigger on table "public"."receipts" to "anon";

grant truncate on table "public"."receipts" to "anon";

grant update on table "public"."receipts" to "anon";

grant delete on table "public"."receipts" to "authenticated";

grant insert on table "public"."receipts" to "authenticated";

grant references on table "public"."receipts" to "authenticated";

grant select on table "public"."receipts" to "authenticated";

grant trigger on table "public"."receipts" to "authenticated";

grant truncate on table "public"."receipts" to "authenticated";

grant update on table "public"."receipts" to "authenticated";

grant delete on table "public"."receipts" to "service_role";

grant insert on table "public"."receipts" to "service_role";

grant references on table "public"."receipts" to "service_role";

grant select on table "public"."receipts" to "service_role";

grant trigger on table "public"."receipts" to "service_role";

grant truncate on table "public"."receipts" to "service_role";

grant update on table "public"."receipts" to "service_role";

grant delete on table "public"."settlement_summaries" to "anon";

grant insert on table "public"."settlement_summaries" to "anon";

grant references on table "public"."settlement_summaries" to "anon";

grant select on table "public"."settlement_summaries" to "anon";

grant trigger on table "public"."settlement_summaries" to "anon";

grant truncate on table "public"."settlement_summaries" to "anon";

grant update on table "public"."settlement_summaries" to "anon";

grant delete on table "public"."settlement_summaries" to "authenticated";

grant insert on table "public"."settlement_summaries" to "authenticated";

grant references on table "public"."settlement_summaries" to "authenticated";

grant select on table "public"."settlement_summaries" to "authenticated";

grant trigger on table "public"."settlement_summaries" to "authenticated";

grant truncate on table "public"."settlement_summaries" to "authenticated";

grant update on table "public"."settlement_summaries" to "authenticated";

grant delete on table "public"."settlement_summaries" to "service_role";

grant insert on table "public"."settlement_summaries" to "service_role";

grant references on table "public"."settlement_summaries" to "service_role";

grant select on table "public"."settlement_summaries" to "service_role";

grant trigger on table "public"."settlement_summaries" to "service_role";

grant truncate on table "public"."settlement_summaries" to "service_role";

grant update on table "public"."settlement_summaries" to "service_role";

grant delete on table "public"."transaction_distributions" to "anon";

grant insert on table "public"."transaction_distributions" to "anon";

grant references on table "public"."transaction_distributions" to "anon";

grant select on table "public"."transaction_distributions" to "anon";

grant trigger on table "public"."transaction_distributions" to "anon";

grant truncate on table "public"."transaction_distributions" to "anon";

grant update on table "public"."transaction_distributions" to "anon";

grant delete on table "public"."transaction_distributions" to "authenticated";

grant insert on table "public"."transaction_distributions" to "authenticated";

grant references on table "public"."transaction_distributions" to "authenticated";

grant select on table "public"."transaction_distributions" to "authenticated";

grant trigger on table "public"."transaction_distributions" to "authenticated";

grant truncate on table "public"."transaction_distributions" to "authenticated";

grant update on table "public"."transaction_distributions" to "authenticated";

grant delete on table "public"."transaction_distributions" to "service_role";

grant insert on table "public"."transaction_distributions" to "service_role";

grant references on table "public"."transaction_distributions" to "service_role";

grant select on table "public"."transaction_distributions" to "service_role";

grant trigger on table "public"."transaction_distributions" to "service_role";

grant truncate on table "public"."transaction_distributions" to "service_role";

grant update on table "public"."transaction_distributions" to "service_role";

grant delete on table "public"."transactions" to "anon";

grant insert on table "public"."transactions" to "anon";

grant references on table "public"."transactions" to "anon";

grant select on table "public"."transactions" to "anon";

grant trigger on table "public"."transactions" to "anon";

grant truncate on table "public"."transactions" to "anon";

grant update on table "public"."transactions" to "anon";

grant delete on table "public"."transactions" to "authenticated";

grant insert on table "public"."transactions" to "authenticated";

grant references on table "public"."transactions" to "authenticated";

grant select on table "public"."transactions" to "authenticated";

grant trigger on table "public"."transactions" to "authenticated";

grant truncate on table "public"."transactions" to "authenticated";

grant update on table "public"."transactions" to "authenticated";

grant delete on table "public"."transactions" to "service_role";

grant insert on table "public"."transactions" to "service_role";

grant references on table "public"."transactions" to "service_role";

grant select on table "public"."transactions" to "service_role";

grant trigger on table "public"."transactions" to "service_role";

grant truncate on table "public"."transactions" to "service_role";

grant update on table "public"."transactions" to "service_role";

CREATE TRIGGER update_asset_access_logs_modtime BEFORE UPDATE ON public.asset_access_logs FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();

CREATE TRIGGER update_connections_modtime BEFORE UPDATE ON public.connections FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();

CREATE TRIGGER update_debt_claims_modtime BEFORE UPDATE ON public.debt_claims FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();

CREATE TRIGGER update_distribution_configs_modtime BEFORE UPDATE ON public.distribution_configs FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();

CREATE TRIGGER update_event_artists_modtime BEFORE UPDATE ON public.event_artists FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();

CREATE TRIGGER update_events_modtime BEFORE UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();

CREATE TRIGGER update_payout_requests_modtime BEFORE UPDATE ON public.payout_requests FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();

CREATE TRIGGER update_products_modtime BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();

CREATE TRIGGER update_profiles_modtime BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();

CREATE TRIGGER update_qr_config_targets_modtime BEFORE UPDATE ON public.qr_config_targets FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();

CREATE TRIGGER update_qr_configs_modtime BEFORE UPDATE ON public.qr_configs FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();

CREATE TRIGGER update_receipts_modtime BEFORE UPDATE ON public.receipts FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();

CREATE TRIGGER update_settlement_summaries_modtime BEFORE UPDATE ON public.settlement_summaries FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();

CREATE TRIGGER update_transaction_distributions_modtime BEFORE UPDATE ON public.transaction_distributions FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();

CREATE TRIGGER update_transactions_modtime BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();


