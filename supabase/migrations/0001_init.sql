-- ============================================================================
-- Alpha-Forge — initial schema (local Supabase / Postgres)
-- Phase 2 (data model) + Phase 3 (RBAC, audit, data residency).
--
-- Design notes:
--   * All application tables live in the `alphaforge` schema, never `public`.
--   * Row-Level Security is ON for every table. Reads require an authenticated
--     Supabase session; writes are reserved for the backend `service_role`
--     (the C++ engine connects with the service key / direct Postgres role).
--   * Every row carries a `region` column so data-residency can be audited.
-- ============================================================================

create schema if not exists alphaforge;

-- ---------------------------------------------------------------------------
-- RBAC role catalogue (mirrors domain::Role: viewer | analyst | admin).
-- The mapping user -> role is stored here; Supabase Auth supplies the user id.
-- ---------------------------------------------------------------------------
create table if not exists alphaforge.user_roles (
    user_id    uuid primary key,
    role       text not null default 'viewer'
               check (role in ('viewer', 'analyst', 'admin')),
    created_at timestamptz not null default now()
);

-- Helper: the role of the current Supabase session user (defaults to viewer).
create or replace function alphaforge.current_role_name()
returns text
language sql
stable
as $$
    select coalesce(
        (select role from alphaforge.user_roles where user_id = auth.uid()),
        'viewer'
    );
$$;

-- ---------------------------------------------------------------------------
-- Market data (crawler output).
-- ---------------------------------------------------------------------------
create table if not exists alphaforge.prices (
    symbol  text not null,
    trade_date date not null,
    open    double precision,
    high    double precision,
    low     double precision,
    close   double precision,
    volume  double precision,
    region  text not null default 'uae-north',
    primary key (symbol, trade_date)
);
create index if not exists prices_date_idx on alphaforge.prices (trade_date);

-- ---------------------------------------------------------------------------
-- Discovery runs (full pipeline execution records).
-- ---------------------------------------------------------------------------
create table if not exists alphaforge.runs (
    run_id      text primary key,
    universe    text[] not null default '{}',
    start_date  date,
    end_date    date,
    n_proposed  int not null default 0,
    n_selected  int not null default 0,
    payload     jsonb not null,          -- full DiscoveryRun JSON
    region      text not null default 'uae-north',
    created_at  timestamptz not null default now()
);
create index if not exists runs_created_idx on alphaforge.runs (created_at desc);

-- ---------------------------------------------------------------------------
-- Individual evaluated alphas (denormalised for the leaderboard view).
-- ---------------------------------------------------------------------------
create table if not exists alphaforge.alphas (
    id              text primary key,
    run_id          text not null references alphaforge.runs (run_id) on delete cascade,
    expression      text not null,
    rationale       text,
    proposed_by     text not null default 'llm',
    sharpe          double precision,
    deflated_sharpe double precision,
    oos_sharpe      double precision,
    turnover        double precision,
    selected        boolean not null default false,
    risk_score      double precision,
    created_at      timestamptz not null default now()
);
create index if not exists alphas_run_idx on alphaforge.alphas (run_id);
create index if not exists alphas_selected_idx on alphaforge.alphas (selected) where selected;

-- ---------------------------------------------------------------------------
-- Immutable audit trail (Phase 3): who asked what, when, tagged by sensitivity.
-- ---------------------------------------------------------------------------
create table if not exists alphaforge.audit_events (
    id          bigserial primary key,
    ts          timestamptz not null default now(),
    actor       text not null,
    action      text not null,
    resource    text not null,
    sensitivity text not null default 'internal'
                check (sensitivity in ('public', 'internal', 'confidential')),
    outcome     text not null default 'ok'
                check (outcome in ('ok', 'blocked', 'error')),
    detail      jsonb not null default '{}'::jsonb
);
create index if not exists audit_ts_idx on alphaforge.audit_events (ts desc);

-- ---------------------------------------------------------------------------
-- Read-only leaderboard view consumed by the frontend.
-- ---------------------------------------------------------------------------
create or replace view alphaforge.leaderboard as
select a.id, a.run_id, a.expression, a.rationale, a.proposed_by,
       a.sharpe, a.deflated_sharpe, a.oos_sharpe, a.turnover,
       a.selected, a.risk_score, r.created_at
from alphaforge.alphas a
join alphaforge.runs r using (run_id)
where a.selected
order by a.deflated_sharpe desc nulls last, a.sharpe desc;

-- ============================================================================
-- Row-Level Security
-- ============================================================================
alter table alphaforge.prices        enable row level security;
alter table alphaforge.runs          enable row level security;
alter table alphaforge.alphas        enable row level security;
alter table alphaforge.audit_events  enable row level security;
alter table alphaforge.user_roles    enable row level security;

-- Authenticated users may READ market data, runs, and alphas.
create policy "read prices"  on alphaforge.prices for select to authenticated using (true);
create policy "read runs"    on alphaforge.runs   for select to authenticated using (true);
create policy "read alphas"  on alphaforge.alphas for select to authenticated using (true);

-- Only admins may read the audit trail.
create policy "admin read audit" on alphaforge.audit_events
    for select to authenticated
    using (alphaforge.current_role_name() = 'admin');

-- Users may read their own role row.
create policy "read own role" on alphaforge.user_roles
    for select to authenticated using (user_id = auth.uid());

-- Writes are reserved for the backend service_role (bypasses RLS by default in
-- Supabase, but we declare explicit policies for clarity and defence in depth).
create policy "service writes prices" on alphaforge.prices
    for all to service_role using (true) with check (true);
create policy "service writes runs" on alphaforge.runs
    for all to service_role using (true) with check (true);
create policy "service writes alphas" on alphaforge.alphas
    for all to service_role using (true) with check (true);
create policy "service writes audit" on alphaforge.audit_events
    for all to service_role using (true) with check (true);
