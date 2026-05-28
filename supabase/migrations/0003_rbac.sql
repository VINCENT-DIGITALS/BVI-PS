-- =============================================================================
-- 0003_rbac.sql
-- Roles, permissions, company membership, and the SECURITY DEFINER helper
-- functions used by every RLS policy.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- permissions : global catalogue of permission keys (e.g. 'payroll.approve').
-- -----------------------------------------------------------------------------
create table public.permissions (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  module      text not null,
  description text
);

-- -----------------------------------------------------------------------------
-- roles : either a system template (company_id null) or company-scoped.
-- -----------------------------------------------------------------------------
create table public.roles (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid references public.companies (id) on delete cascade,
  name        text not null,
  description text,
  is_system   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint roles_company_name_uniq unique nulls not distinct (company_id, name)
);
create index idx_roles_company on public.roles (company_id);
create trigger trg_roles_updated_at
  before update on public.roles
  for each row execute function public.set_updated_at();

create table public.role_permissions (
  role_id       uuid not null references public.roles (id) on delete cascade,
  permission_id uuid not null references public.permissions (id) on delete cascade,
  primary key (role_id, permission_id)
);

-- -----------------------------------------------------------------------------
-- company_members : a user's membership of a company, with a role.
-- employee_id (FK added in 0004) links a member to their employee record so the
-- self-service portal can scope rows to "my data".
-- -----------------------------------------------------------------------------
create table public.company_members (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users (id) on delete cascade,
  company_id  uuid not null references public.companies (id) on delete cascade,
  role_id     uuid not null references public.roles (id) on delete restrict,
  employee_id uuid,
  is_active   boolean not null default true,
  invited_by  uuid references public.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, company_id)
);
create index idx_company_members_user on public.company_members (user_id);
create index idx_company_members_company on public.company_members (company_id);
create trigger trg_company_members_updated_at
  before update on public.company_members
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Authorization helpers. SECURITY DEFINER so they read membership/role tables
-- without tripping the very RLS policies they support (no recursion).
-- -----------------------------------------------------------------------------
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select u.is_super_admin from public.users u where u.id = auth.uid()), false);
$$;

create or replace function public.has_company_access(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_super_admin() or exists (
    select 1
    from public.company_members m
    where m.user_id = auth.uid()
      and m.company_id = cid
      and m.is_active
  );
$$;

create or replace function public.has_permission(cid uuid, perm text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_super_admin() or exists (
    select 1
    from public.company_members m
    join public.role_permissions rp on rp.role_id = m.role_id
    join public.permissions p on p.id = rp.permission_id
    where m.user_id = auth.uid()
      and m.company_id = cid
      and m.is_active
      and p.key = perm
  );
$$;

-- Employee record bound to the current user within a company (self-service).
create or replace function public.current_employee_id(cid uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.employee_id
  from public.company_members m
  where m.user_id = auth.uid()
    and m.company_id = cid
    and m.is_active
  limit 1;
$$;

grant execute on function public.is_super_admin() to authenticated, anon;
grant execute on function public.has_company_access(uuid) to authenticated, anon;
grant execute on function public.has_permission(uuid, text) to authenticated, anon;
grant execute on function public.current_employee_id(uuid) to authenticated, anon;
