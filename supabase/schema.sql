-- Cuentas: libro de caja mensual
-- 1. Crea un proyecto gratis en https://supabase.com
-- 2. SQL Editor → New query → pega este archivo → Run
-- 3. Authentication → Providers → Email. Desactiva "Confirm email"
--    para entrar apenas crees la cuenta.
-- 4. Settings → API: copia Project URL y anon public key en Ajustes de la app.

create table if not exists public.categories (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('ingreso', 'gasto', 'servicio')),
  color text not null default '#6b5e53',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.periods (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  label text not null,
  year int not null,
  covered_month int not null check (covered_month between 0 and 11),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.entries (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  period_id uuid not null references public.periods (id) on delete cascade,
  category_id uuid references public.categories (id) on delete set null,
  kind text not null check (kind in ('ingreso', 'gasto', 'servicio')),
  description text not null default '',
  amount bigint not null default 0,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists categories_user_idx on public.categories (user_id, kind, sort_order);
create index if not exists periods_user_idx on public.periods (user_id, year, sort_order);
create index if not exists entries_user_idx on public.entries (user_id, period_id, kind, sort_order);

create table if not exists public.templates (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  category_id uuid references public.categories (id) on delete set null,
  kind text not null check (kind in ('ingreso', 'gasto', 'servicio')),
  description text not null default '',
  amount bigint not null default 0,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.entries add column if not exists template_id uuid references public.templates (id) on delete cascade;
alter table public.entries add column if not exists paid boolean not null default false;
alter table public.entries add column if not exists due_day smallint;
alter table public.entries add column if not exists term_id uuid;
alter table public.entries add column if not exists term_total smallint;
alter table public.entries add column if not exists term_index smallint;

create index if not exists templates_user_idx on public.templates (user_id, kind, sort_order);

alter table public.categories enable row level security;
alter table public.periods enable row level security;
alter table public.entries enable row level security;
alter table public.templates enable row level security;

drop policy if exists "categories_own" on public.categories;
drop policy if exists "periods_own" on public.periods;
drop policy if exists "entries_own" on public.entries;
drop policy if exists "templates_own" on public.templates;

create policy "categories_own" on public.categories
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "periods_own" on public.periods
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "entries_own" on public.entries
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "templates_own" on public.templates
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.categories to authenticated;
grant select, insert, update, delete on public.periods to authenticated;
grant select, insert, update, delete on public.entries to authenticated;
grant select, insert, update, delete on public.templates to authenticated;
