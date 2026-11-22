-- Finova initial schema.
-- Apply in the Supabase SQL Editor. All user-owned records are isolated by RLS.

create extension if not exists pgcrypto;

create type public.account_type as enum
  ('pea', 'cto', 'crypto', 'savings', 'current', 'other');

create type public.asset_type as enum
  ('stock', 'etf', 'crypto', 'fund', 'other');

create type public.transaction_type as enum
  ('buy', 'sell', 'dividend', 'fee', 'deposit', 'withdrawal',
   'transfer_in', 'transfer_out', 'split', 'correction');

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  account_type public.account_type not null,
  broker text,
  currency char(3) not null default 'EUR',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  ticker text,
  isin text,
  asset_type public.asset_type not null,
  exchange text,
  currency char(3) not null default 'EUR',
  quote_provider text,
  quote_symbol text,
  is_manual_quote boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assets_user_isin_unique unique (user_id, isin)
);

create table public.positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete restrict,
  asset_id uuid not null references public.assets(id) on delete restrict,
  quantity numeric(28, 10) not null default 0 check (quantity >= 0),
  average_cost numeric(20, 8) not null default 0 check (average_cost >= 0),
  cost_currency char(3) not null default 'EUR',
  opened_at date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint positions_account_asset_unique unique (account_id, asset_id)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete restrict,
  asset_id uuid references public.assets(id) on delete restrict,
  transaction_type public.transaction_type not null,
  trade_date date not null,
  quantity numeric(28, 10),
  unit_price numeric(20, 8),
  gross_amount numeric(20, 2),
  fees numeric(20, 2) not null default 0,
  currency char(3) not null default 'EUR',
  external_reference text,
  import_fingerprint text,
  notes text,
  created_at timestamptz not null default now()
);

create unique index transactions_import_dedupe
  on public.transactions(user_id, account_id, import_fingerprint)
  where import_fingerprint is not null;

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  price numeric(24, 10) not null check (price >= 0),
  currency char(3) not null,
  price_eur numeric(24, 10),
  provider text not null,
  quoted_at timestamptz,
  fetched_at timestamptz not null default now(),
  unique (user_id, asset_id)
);

create table public.price_history (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  price numeric(24, 10) not null check (price >= 0),
  currency char(3) not null,
  price_eur numeric(24, 10),
  provider text not null,
  quoted_at timestamptz,
  recorded_at timestamptz not null default now()
);
create index price_history_asset_date
  on public.price_history(user_id, asset_id, recorded_at desc);

create table public.portfolio_snapshots (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  snapshot_date date not null default current_date,
  gross_assets numeric(20, 2) not null default 0,
  debts numeric(20, 2) not null default 0,
  net_worth numeric(20, 2) not null default 0,
  breakdown jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, snapshot_date)
);

create table public.manual_valuations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  amount numeric(20, 2) not null check (amount >= 0),
  currency char(3) not null default 'EUR',
  valuation_date date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);

create table public.debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  remaining_amount numeric(20, 2) not null check (remaining_amount >= 0),
  currency char(3) not null default 'EUR',
  valuation_date date not null default current_date,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.dca_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete set null,
  amount numeric(20, 2) not null check (amount > 0),
  currency char(3) not null default 'EUR',
  frequency text not null check (frequency in ('weekly', 'monthly', 'quarterly')),
  next_purchase_date date,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Ensure referenced records belong to the same user.
create or replace function public.check_position_ownership()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.accounts a
    where a.id = new.account_id and a.user_id = new.user_id
  ) then
    raise exception 'Account does not belong to this user';
  end if;
  if not exists (
    select 1 from public.assets a
    where a.id = new.asset_id and a.user_id = new.user_id
  ) then
    raise exception 'Asset does not belong to this user';
  end if;
  return new;
end;
$$;

create trigger positions_check_ownership
before insert or update on public.positions
for each row execute function public.check_position_ownership();

-- RLS: only the authenticated owner can access their own rows.
do $$
declare t text;
begin
  foreach t in array array[
    'accounts','assets','positions','transactions','quotes',
    'price_history','portfolio_snapshots','manual_valuations','debts','dca_plans'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      t || '_owner_all', t
    );
  end loop;
end $$;

-- Do not grant anonymous access.
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
