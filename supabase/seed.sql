-- Seed data for local development. Loaded automatically by `supabase start`
-- / `supabase db reset`. Safe to run repeatedly (idempotent upserts).

-- A demo admin role mapping is intentionally omitted here because it requires a
-- real auth.users id. After creating a user in Studio, grant a role with:
--   insert into alphaforge.user_roles (user_id, role)
--   values ('<uuid-from-auth.users>', 'admin')
--   on conflict (user_id) do update set role = excluded.role;

-- Nothing else to seed: the C++ crawler + pipeline populate prices/runs/alphas.
select 'alphaforge schema ready' as status;
