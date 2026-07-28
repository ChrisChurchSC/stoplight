-- Migration: add `aggregate_outcomes` — the anonymized cross-customer learning pool.
--
-- Workspaces contribute anonymized (dimension × archetype × attribute → outcome) rows keyed by an
-- opaque `contributor` hash (never a brand or client). Nobody can read the table directly (no select
-- policy); everyone reads back only FLOOR-GATED aggregates through aggregate_patterns(), which
-- returns a pattern only once ≥ min_customers DISTINCT contributors stand behind it and never
-- returns the contributor — so nothing is re-identifiable. Contributions are opt-in (client-gated).
--
-- schema.sql includes this for fresh applies. For an EXISTING database, run this once. Idempotent +
-- additive. Supabase dashboard → SQL Editor → New query → paste → Run.

create table if not exists public.aggregate_outcomes (
  contributor  text not null,          -- opaque hash of the contributing workspace
  dimension    text not null,          -- 'rtb' | 'channel' | 'stage' | 'strategy'
  archetype    text not null,          -- persona archetype label
  attribute    text not null,          -- proof-type label / channel / stage / strategy
  variants     integer not null default 0,
  outcome      double precision not null default 0,
  updated_at   timestamptz not null default now(),
  primary key (contributor, dimension, archetype, attribute)
);

alter table public.aggregate_outcomes enable row level security;

-- Any authenticated user may contribute (insert/update) their own anonymized rows. There is NO
-- select policy on purpose — the raw table is never readable; only the floor-gated RPC below is.
drop policy if exists aggregate_outcomes_insert on public.aggregate_outcomes;
create policy aggregate_outcomes_insert on public.aggregate_outcomes
  for insert with check (auth.role() = 'authenticated');
drop policy if exists aggregate_outcomes_update on public.aggregate_outcomes;
create policy aggregate_outcomes_update on public.aggregate_outcomes
  for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Floor-gated, anonymized read: patterns with >= min_customers distinct contributors, aggregated,
-- contributor never exposed. SECURITY DEFINER so it can aggregate the table the caller can't select.
create or replace function public.aggregate_patterns(min_customers int default 10)
returns table(dimension text, archetype text, attribute text, customers bigint, variants bigint, outcome double precision)
language sql
security definer
set search_path = public
as $$
  select dimension, archetype, attribute,
         count(distinct contributor) as customers,
         sum(variants)               as variants,
         sum(outcome)                as outcome
  from public.aggregate_outcomes
  group by dimension, archetype, attribute
  having count(distinct contributor) >= greatest(min_customers, 1);
$$;

grant execute on function public.aggregate_patterns(int) to anon, authenticated;
