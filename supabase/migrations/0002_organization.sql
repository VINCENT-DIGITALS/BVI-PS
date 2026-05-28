-- =============================================================================
-- 0002_organization.sql
-- App user profiles + multi-company organizational hierarchy.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- users : application profile, 1:1 with auth.users.
-- (FK to companies.default_company_id is added after companies exists.)
-- -----------------------------------------------------------------------------
create table public.users (
  id                 uuid primary key references auth.users (id) on delete cascade,
  email              citext not null unique,
  full_name          text,
  avatar_url         text,
  phone              text,
  is_super_admin     boolean not null default false,
  default_company_id uuid,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create trigger trg_users_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- companies : the tenant. Most domain rows are scoped by company_id.
-- -----------------------------------------------------------------------------
create table public.companies (
  id                          uuid primary key default gen_random_uuid(),
  legal_name                  text not null,
  trading_name                text,
  registration_number         text,
  payroll_tax_class           payroll_tax_class not null default 'class_1',
  payroll_tax_employer_number text,
  ss_employer_registration    text,
  nhi_employer_registration   text,
  currency                    char(3) not null default 'USD',
  default_pay_frequency       pay_frequency not null default 'monthly',
  standard_weekly_hours       numeric(6, 2) not null default 40 check (standard_weekly_hours > 0),
  timezone                    text not null default 'America/Tortola',
  email                       citext,
  phone                       text,
  logo_url                    text,
  address_line1               text,
  address_line2               text,
  city                        text,
  territory                   text default 'British Virgin Islands',
  postal_code                 text,
  is_active                   boolean not null default true,
  owner_id                    uuid references public.users (id) on delete set null,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create trigger trg_companies_updated_at
  before update on public.companies
  for each row execute function public.set_updated_at();

alter table public.users
  add constraint users_default_company_fk
  foreign key (default_company_id) references public.companies (id) on delete set null;

-- -----------------------------------------------------------------------------
-- branches / departments / positions : org hierarchy under a company.
-- -----------------------------------------------------------------------------
create table public.branches (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies (id) on delete cascade,
  name          text not null,
  code          text,
  address_line1 text,
  city          text,
  phone         text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (company_id, code)
);
create index idx_branches_company on public.branches (company_id);
create trigger trg_branches_updated_at
  before update on public.branches
  for each row execute function public.set_updated_at();

create table public.departments (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  branch_id  uuid references public.branches (id) on delete set null,
  name       text not null,
  code       text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code)
);
create index idx_departments_company on public.departments (company_id);
create trigger trg_departments_updated_at
  before update on public.departments
  for each row execute function public.set_updated_at();

create table public.positions (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies (id) on delete cascade,
  department_id uuid references public.departments (id) on delete set null,
  title         text not null,
  code          text,
  description   text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (company_id, code)
);
create index idx_positions_company on public.positions (company_id);
create trigger trg_positions_updated_at
  before update on public.positions
  for each row execute function public.set_updated_at();
