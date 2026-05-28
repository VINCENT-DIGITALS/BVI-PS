-- ============================================================
-- BVI-PS — combined setup script (migrations 0001-0011 + seed)
-- Paste this whole file into the Supabase SQL Editor and Run.
-- Safe to run once on a fresh project. Idempotent seed at the end.
-- ============================================================



-- >>>>>>>>>> supabase/migrations/0001_init_extensions_enums.sql <<<<<<<<<<

-- =============================================================================
-- 0001_init_extensions_enums.sql
-- Extensions, shared enum types, and the generic updated_at helper.
-- =============================================================================

create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "citext";      -- case-insensitive email

-- -----------------------------------------------------------------------------
-- Enum types (well-bounded sets). Use lookup tables where values must be
-- admin-configurable; enums are reserved for sets that are part of the domain
-- contract and rarely change.
-- -----------------------------------------------------------------------------
create type pay_frequency       as enum ('weekly', 'biweekly', 'semimonthly', 'monthly');
create type employment_type     as enum ('full_time', 'part_time', 'contract', 'temporary');
create type employee_status     as enum ('active', 'on_leave', 'suspended', 'terminated');
create type pay_type            as enum ('salaried', 'hourly');
create type document_type       as enum ('id', 'passport', 'work_permit', 'contract', 'certificate', 'tax_form', 'other');
create type attendance_status   as enum ('present', 'absent', 'late', 'half_day', 'holiday', 'on_leave');
create type leave_type          as enum ('annual', 'sick', 'maternity', 'paternity', 'unpaid', 'bereavement', 'other');
create type leave_status        as enum ('pending', 'approved', 'rejected', 'cancelled');
create type payroll_run_status  as enum ('draft', 'processing', 'pending_approval', 'approved', 'locked', 'paid', 'cancelled');
create type payroll_tax_class   as enum ('class_1', 'class_2');
create type contribution_type   as enum ('social_security', 'nhi');
create type earning_category    as enum ('basic', 'overtime', 'allowance', 'bonus', 'commission', 'holiday', 'leave', 'other');
create type deduction_category  as enum ('payroll_tax', 'social_security', 'nhi', 'loan', 'advance', 'other');
create type notification_type   as enum ('info', 'success', 'warning', 'error', 'payroll', 'leave', 'system');
create type audit_action        as enum ('insert', 'update', 'delete', 'login', 'logout', 'approve', 'lock', 'unlock', 'export');

-- -----------------------------------------------------------------------------
-- Generic trigger to maintain updated_at columns.
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;


-- >>>>>>>>>> supabase/migrations/0002_organization.sql <<<<<<<<<<

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


-- >>>>>>>>>> supabase/migrations/0003_rbac.sql <<<<<<<<<<

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


-- >>>>>>>>>> supabase/migrations/0004_employees.sql <<<<<<<<<<

-- =============================================================================
-- 0004_employees.sql
-- Employees and their documents.
-- =============================================================================

create table public.employees (
  id                        uuid primary key default gen_random_uuid(),
  company_id                uuid not null references public.companies (id) on delete cascade,
  branch_id                 uuid references public.branches (id) on delete set null,
  department_id             uuid references public.departments (id) on delete set null,
  position_id               uuid references public.positions (id) on delete set null,
  user_id                   uuid references public.users (id) on delete set null,
  employee_number           text not null,

  -- identity
  first_name                text not null,
  middle_name               text,
  last_name                 text not null,
  preferred_name            text,
  email                     citext,
  phone                     text,
  date_of_birth             date,
  gender                    text,

  -- statutory identifiers
  national_id               text,
  ss_number                 text,
  nhi_number                text,
  tax_id                    text,

  -- employment
  hire_date                 date not null,
  termination_date          date,
  employment_type           employment_type not null default 'full_time',
  status                    employee_status not null default 'active',

  -- compensation
  pay_type                  pay_type not null default 'salaried',
  pay_frequency             pay_frequency not null default 'monthly',
  annual_salary             numeric(14, 2) check (annual_salary >= 0),
  hourly_rate               numeric(14, 2) check (hourly_rate >= 0),
  standard_hours_per_period numeric(8, 2) check (standard_hours_per_period >= 0),

  -- statutory applicability (overrides; defaults follow BVI norms)
  subject_to_payroll_tax    boolean not null default true,
  subject_to_social_security boolean not null default true,
  subject_to_nhi            boolean not null default true,

  -- banking
  bank_name                 text,
  bank_account_number       text,
  bank_routing              text,

  -- address
  address_line1             text,
  address_line2             text,
  city                      text,
  territory                 text,
  postal_code               text,

  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  unique (company_id, employee_number),
  constraint employees_pay_basis_chk check (
    (pay_type = 'salaried' and annual_salary is not null)
    or (pay_type = 'hourly' and hourly_rate is not null)
  ),
  constraint employees_termination_chk check (
    termination_date is null or termination_date >= hire_date
  )
);
create index idx_employees_company on public.employees (company_id);
create index idx_employees_department on public.employees (department_id);
create index idx_employees_status on public.employees (company_id, status);
create index idx_employees_user on public.employees (user_id);
create trigger trg_employees_updated_at
  before update on public.employees
  for each row execute function public.set_updated_at();

-- Now that employees exists, link company_members.employee_id to it.
alter table public.company_members
  add constraint company_members_employee_fk
  foreign key (employee_id) references public.employees (id) on delete set null;

create table public.employee_documents (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies (id) on delete cascade,
  employee_id   uuid not null references public.employees (id) on delete cascade,
  document_type document_type not null default 'other',
  title         text not null,
  storage_path  text not null,           -- path inside the Supabase Storage bucket
  file_name     text,
  mime_type     text,
  file_size     bigint,
  issued_date   date,
  expiry_date   date,
  uploaded_by   uuid references public.users (id) on delete set null,
  created_at    timestamptz not null default now()
);
create index idx_employee_documents_employee on public.employee_documents (employee_id);


-- >>>>>>>>>> supabase/migrations/0005_time_and_leave.sql <<<<<<<<<<

-- =============================================================================
-- 0005_time_and_leave.sql
-- Holidays, shift scheduling, attendance, and leave management.
-- =============================================================================

create table public.holidays (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies (id) on delete cascade,
  name         text not null,
  holiday_date date not null,
  is_paid      boolean not null default true,
  is_recurring boolean not null default false,  -- repeats annually on month/day
  created_at   timestamptz not null default now(),
  unique (company_id, holiday_date, name)
);
create index idx_holidays_company_date on public.holidays (company_id, holiday_date);

-- shifts: a scheduled shift. A row with null employee_id / shift_date acts as a
-- reusable template; with both set it is an assignment on the schedule.
create table public.shifts (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies (id) on delete cascade,
  employee_id   uuid references public.employees (id) on delete cascade,
  name          text,
  shift_date    date,
  start_time    time not null,
  end_time      time not null,
  break_minutes integer not null default 0 check (break_minutes >= 0),
  crosses_midnight boolean not null default false,
  color         text,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index idx_shifts_company on public.shifts (company_id);
create index idx_shifts_employee_date on public.shifts (employee_id, shift_date);
create trigger trg_shifts_updated_at
  before update on public.shifts
  for each row execute function public.set_updated_at();

create table public.attendance_logs (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies (id) on delete cascade,
  employee_id    uuid not null references public.employees (id) on delete cascade,
  shift_id       uuid references public.shifts (id) on delete set null,
  work_date      date not null,
  clock_in       timestamptz,
  clock_out      timestamptz,
  break_minutes  integer not null default 0 check (break_minutes >= 0),
  worked_hours   numeric(8, 2) not null default 0 check (worked_hours >= 0),
  overtime_hours numeric(8, 2) not null default 0 check (overtime_hours >= 0),
  status         attendance_status not null default 'present',
  source         text not null default 'manual',
  notes          text,
  approved_by    uuid references public.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (employee_id, work_date)
);
create index idx_attendance_company_date on public.attendance_logs (company_id, work_date);
create index idx_attendance_employee_date on public.attendance_logs (employee_id, work_date);
create trigger trg_attendance_updated_at
  before update on public.attendance_logs
  for each row execute function public.set_updated_at();

create table public.leave_requests (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies (id) on delete cascade,
  employee_id    uuid not null references public.employees (id) on delete cascade,
  leave_type     leave_type not null,
  start_date     date not null,
  end_date       date not null,
  days_requested numeric(6, 2) not null check (days_requested > 0),
  is_paid        boolean not null default true,
  reason         text,
  status         leave_status not null default 'pending',
  requested_by   uuid references public.users (id) on delete set null,
  reviewed_by    uuid references public.users (id) on delete set null,
  reviewed_at    timestamptz,
  review_note    text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint leave_date_range_chk check (end_date >= start_date)
);
create index idx_leave_company_status on public.leave_requests (company_id, status);
create index idx_leave_employee on public.leave_requests (employee_id);
create trigger trg_leave_updated_at
  before update on public.leave_requests
  for each row execute function public.set_updated_at();


-- >>>>>>>>>> supabase/migrations/0006_government_rules.sql <<<<<<<<<<

-- =============================================================================
-- 0006_government_rules.sql
-- Effective-dated statutory rules. NOTHING in the payroll engine hardcodes a
-- rate; every figure is read from one of these tables as of the pay date.
--
-- tax_rules / contribution_rules are national (jurisdiction-scoped, company_id
-- absent) because BVI payroll tax, Social Security and NHI rates are uniform
-- across employers. government_rules supports both national and per-company
-- effective-dated parameters (overtime multiplier, minimum wage, etc.).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- government_rules : generic effective-dated key/value statutory parameters.
-- -----------------------------------------------------------------------------
create table public.government_rules (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid references public.companies (id) on delete cascade, -- null = national default
  jurisdiction   text not null default 'BVI',
  rule_key       text not null,
  numeric_value  numeric(18, 6),
  text_value     text,
  json_value     jsonb,
  effective_from date not null,
  effective_to   date,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint government_rules_date_chk check (effective_to is null or effective_to >= effective_from)
);
create index idx_government_rules_lookup
  on public.government_rules (jurisdiction, rule_key, effective_from desc);
create index idx_government_rules_company
  on public.government_rules (company_id, rule_key, effective_from desc);
create trigger trg_government_rules_updated_at
  before update on public.government_rules
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- tax_rules : BVI Payroll Tax. The employee always pays 8%; the employer pays a
-- class-dependent share (Class 1 vs Class 2). The first `annual_exemption` of
-- each employee's annual remuneration is exempt.
-- -----------------------------------------------------------------------------
create table public.tax_rules (
  id                   uuid primary key default gen_random_uuid(),
  jurisdiction         text not null default 'BVI',
  name                 text not null default 'Payroll Tax',
  employee_rate        numeric(9, 6) not null check (employee_rate between 0 and 1),
  employer_class1_rate numeric(9, 6) not null check (employer_class1_rate between 0 and 1),
  employer_class2_rate numeric(9, 6) not null check (employer_class2_rate between 0 and 1),
  annual_exemption     numeric(14, 2) not null default 0 check (annual_exemption >= 0),
  effective_from       date not null,
  effective_to         date,
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint tax_rules_date_chk check (effective_to is null or effective_to >= effective_from),
  constraint tax_rules_period_uniq unique (jurisdiction, effective_from)
);
create index idx_tax_rules_lookup on public.tax_rules (jurisdiction, effective_from desc);
create trigger trg_tax_rules_updated_at
  before update on public.tax_rules
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- contribution_rules : Social Security and National Health Insurance. Both are
-- levied on insurable earnings up to a ceiling, split employer/employee.
-- -----------------------------------------------------------------------------
create table public.contribution_rules (
  id                        uuid primary key default gen_random_uuid(),
  jurisdiction              text not null default 'BVI',
  contribution_type         contribution_type not null,
  name                      text not null,
  employee_rate             numeric(9, 6) not null check (employee_rate between 0 and 1),
  employer_rate             numeric(9, 6) not null check (employer_rate between 0 and 1),
  annual_insurable_ceiling  numeric(14, 2) check (annual_insurable_ceiling >= 0),  -- null = uncapped
  monthly_insurable_ceiling numeric(14, 2) check (monthly_insurable_ceiling >= 0),
  effective_from            date not null,
  effective_to              date,
  notes                     text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  constraint contribution_rules_date_chk check (effective_to is null or effective_to >= effective_from),
  constraint contribution_rules_period_uniq unique (jurisdiction, contribution_type, effective_from)
);
create index idx_contribution_rules_lookup
  on public.contribution_rules (jurisdiction, contribution_type, effective_from desc);
create trigger trg_contribution_rules_updated_at
  before update on public.contribution_rules
  for each row execute function public.set_updated_at();


-- >>>>>>>>>> supabase/migrations/0007_payroll.sql <<<<<<<<<<

-- =============================================================================
-- 0007_payroll.sql
-- Payroll runs and their immutable, history-preserving line items.
--
-- Money is NUMERIC(14,2); all arithmetic is performed in the application layer
-- with decimal.js and the rounded results are persisted here. payroll_run_employees
-- stores a JSONB snapshot of every input used so a finalized run can be
-- reproduced exactly even after employees or rules change.
-- =============================================================================

create table public.payroll_runs (
  id                            uuid primary key default gen_random_uuid(),
  company_id                    uuid not null references public.companies (id) on delete cascade,
  name                          text not null,
  pay_frequency                 pay_frequency not null,
  period_start                  date not null,
  period_end                    date not null,
  pay_date                      date not null,
  status                        payroll_run_status not null default 'draft',
  notes                         text,

  -- cached totals (recomputed when lines change while still in draft)
  employee_count                integer not null default 0,
  total_gross                   numeric(14, 2) not null default 0,
  total_employee_deductions     numeric(14, 2) not null default 0,
  total_employer_contributions  numeric(14, 2) not null default 0,
  total_net                     numeric(14, 2) not null default 0,
  total_employer_cost           numeric(14, 2) not null default 0,

  created_by                    uuid references public.users (id) on delete set null,
  approved_by                   uuid references public.users (id) on delete set null,
  approved_at                   timestamptz,
  locked_by                     uuid references public.users (id) on delete set null,
  locked_at                     timestamptz,
  paid_at                       timestamptz,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),
  constraint payroll_runs_period_chk check (period_end >= period_start)
);
create index idx_payroll_runs_company on public.payroll_runs (company_id, period_start desc);
create index idx_payroll_runs_status on public.payroll_runs (company_id, status);
create trigger trg_payroll_runs_updated_at
  before update on public.payroll_runs
  for each row execute function public.set_updated_at();

create table public.payroll_run_employees (
  id                           uuid primary key default gen_random_uuid(),
  company_id                   uuid not null references public.companies (id) on delete cascade,
  payroll_run_id               uuid not null references public.payroll_runs (id) on delete cascade,
  employee_id                  uuid not null references public.employees (id) on delete restrict,
  gross_pay                    numeric(14, 2) not null default 0,
  total_earnings               numeric(14, 2) not null default 0,
  total_deductions             numeric(14, 2) not null default 0,  -- employee-side
  total_employer_contributions numeric(14, 2) not null default 0,
  net_pay                      numeric(14, 2) not null default 0,
  employer_cost                numeric(14, 2) not null default 0,
  worked_hours                 numeric(8, 2) not null default 0,
  overtime_hours               numeric(8, 2) not null default 0,
  snapshot                     jsonb,  -- frozen inputs (employee, rates, YTD) at compute time
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now(),
  unique (payroll_run_id, employee_id)
);
create index idx_pre_run on public.payroll_run_employees (payroll_run_id);
create index idx_pre_employee on public.payroll_run_employees (employee_id);
create trigger trg_pre_updated_at
  before update on public.payroll_run_employees
  for each row execute function public.set_updated_at();

create table public.payroll_earnings (
  id                         uuid primary key default gen_random_uuid(),
  company_id                 uuid not null references public.companies (id) on delete cascade,
  run_employee_id            uuid not null references public.payroll_run_employees (id) on delete cascade,
  category                   earning_category not null default 'basic',
  code                       text,
  description                text,
  quantity                   numeric(12, 2),
  rate                       numeric(14, 4),
  amount                     numeric(14, 2) not null,
  is_taxable                 boolean not null default true,  -- subject to payroll tax
  subject_to_social_security boolean not null default true,
  subject_to_nhi             boolean not null default true,
  created_at                 timestamptz not null default now()
);
create index idx_payroll_earnings_re on public.payroll_earnings (run_employee_id);

create table public.payroll_deductions (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies (id) on delete cascade,
  run_employee_id uuid not null references public.payroll_run_employees (id) on delete cascade,
  category        deduction_category not null default 'other',
  code            text,
  description     text,
  amount          numeric(14, 2) not null,
  is_statutory    boolean not null default false,
  created_at      timestamptz not null default now()
);
create index idx_payroll_deductions_re on public.payroll_deductions (run_employee_id);

create table public.payroll_employer_contributions (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies (id) on delete cascade,
  run_employee_id uuid not null references public.payroll_run_employees (id) on delete cascade,
  category        deduction_category not null,  -- payroll_tax | social_security | nhi
  code            text,
  description     text,
  amount          numeric(14, 2) not null,
  created_at      timestamptz not null default now()
);
create index idx_payroll_empcontrib_re on public.payroll_employer_contributions (run_employee_id);

create table public.payslips (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies (id) on delete cascade,
  payroll_run_id   uuid not null references public.payroll_runs (id) on delete cascade,
  run_employee_id  uuid not null references public.payroll_run_employees (id) on delete cascade,
  employee_id      uuid not null references public.employees (id) on delete restrict,
  payslip_number   text not null,
  gross_pay        numeric(14, 2) not null,
  total_deductions numeric(14, 2) not null,
  net_pay          numeric(14, 2) not null,
  currency         char(3) not null default 'USD',
  data             jsonb not null,  -- full rendered payslip snapshot (immutable)
  pdf_path         text,            -- Supabase Storage path once generated
  issued_at        timestamptz,
  created_at       timestamptz not null default now(),
  unique (run_employee_id),
  unique (company_id, payslip_number)
);
create index idx_payslips_employee on public.payslips (employee_id);
create index idx_payslips_run on public.payslips (payroll_run_id);


-- >>>>>>>>>> supabase/migrations/0008_notifications_audit.sql <<<<<<<<<<

-- =============================================================================
-- 0008_notifications_audit.sql
-- In-app notifications and the immutable audit trail.
-- =============================================================================

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies (id) on delete cascade,
  user_id    uuid not null references public.users (id) on delete cascade,
  type       notification_type not null default 'info',
  title      text not null,
  body       text,
  link       text,
  is_read    boolean not null default false,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index idx_notifications_user on public.notifications (user_id, is_read, created_at desc);

create table public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid references public.companies (id) on delete set null,
  actor_id    uuid references public.users (id) on delete set null,
  action      audit_action not null,
  entity_type text,
  entity_id   uuid,
  summary     text,
  old_data    jsonb,
  new_data    jsonb,
  ip_address  inet,
  created_at  timestamptz not null default now()
);
create index idx_audit_company_time on public.audit_logs (company_id, created_at desc);
create index idx_audit_entity on public.audit_logs (entity_type, entity_id);


-- >>>>>>>>>> supabase/migrations/0009_triggers.sql <<<<<<<<<<

-- =============================================================================
-- 0009_triggers.sql
-- Auth provisioning, audit logging, and payroll immutability enforcement.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Mirror new auth.users into public.users automatically.
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.users (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Generic audit trigger. Writes old/new row snapshots to audit_logs and infers
-- company_id / entity_id from the row when present.
-- -----------------------------------------------------------------------------
create or replace function public.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_action     audit_action;
  v_old        jsonb;
  v_new        jsonb;
  v_company_id uuid;
  v_entity_id  uuid;
begin
  if tg_op = 'INSERT' then
    v_action := 'insert'; v_new := to_jsonb(new);
  elsif tg_op = 'UPDATE' then
    v_action := 'update'; v_new := to_jsonb(new); v_old := to_jsonb(old);
  else
    v_action := 'delete'; v_old := to_jsonb(old);
  end if;

  v_company_id := nullif(coalesce(v_new ->> 'company_id', v_old ->> 'company_id'), '')::uuid;
  v_entity_id  := nullif(coalesce(v_new ->> 'id', v_old ->> 'id'), '')::uuid;

  insert into public.audit_logs (company_id, actor_id, action, entity_type, entity_id, old_data, new_data)
  values (v_company_id, auth.uid(), v_action, tg_table_name, v_entity_id, v_old, v_new);

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger trg_audit_companies        after insert or update or delete on public.companies        for each row execute function public.audit_trigger();
create trigger trg_audit_company_members  after insert or update or delete on public.company_members  for each row execute function public.audit_trigger();
create trigger trg_audit_employees        after insert or update or delete on public.employees        for each row execute function public.audit_trigger();
create trigger trg_audit_leave_requests   after insert or update or delete on public.leave_requests   for each row execute function public.audit_trigger();
create trigger trg_audit_payroll_runs     after insert or update or delete on public.payroll_runs     for each row execute function public.audit_trigger();
create trigger trg_audit_tax_rules        after insert or update or delete on public.tax_rules        for each row execute function public.audit_trigger();
create trigger trg_audit_contribution_rules after insert or update or delete on public.contribution_rules for each row execute function public.audit_trigger();
create trigger trg_audit_government_rules after insert or update or delete on public.government_rules for each row execute function public.audit_trigger();

-- -----------------------------------------------------------------------------
-- Immutability: a locked or paid payroll run (and its lines) cannot change.
-- "Finalized payroll must be immutable; preserve payroll history."
-- -----------------------------------------------------------------------------
create or replace function public.prevent_finalized_run_change()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.status in ('locked', 'paid') then
      raise exception 'Payroll run % is finalized (%) and cannot be deleted', old.id, old.status;
    end if;
    return old;
  end if;

  if old.status = 'paid' then
    raise exception 'Payroll run % is paid and fully immutable', old.id;
  end if;

  if old.status = 'locked' then
    if new.period_start <> old.period_start
       or new.period_end <> old.period_end
       or new.pay_date <> old.pay_date
       or new.total_gross <> old.total_gross
       or new.total_net <> old.total_net
       or new.total_employee_deductions <> old.total_employee_deductions
       or new.total_employer_contributions <> old.total_employer_contributions then
      raise exception 'Payroll run % is locked; financial fields are immutable', old.id;
    end if;
    if new.status not in ('locked', 'paid') then
      raise exception 'Locked payroll run % can only transition to paid', old.id;
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_prevent_finalized_run
  before update or delete on public.payroll_runs
  for each row execute function public.prevent_finalized_run_change();

create or replace function public.assert_run_mutable()
returns trigger
language plpgsql
as $$
declare
  v_row    jsonb;
  v_run    uuid;
  v_status payroll_run_status;
begin
  v_row := coalesce(to_jsonb(new), to_jsonb(old));

  if tg_table_name = 'payroll_run_employees' then
    v_run := (v_row ->> 'payroll_run_id')::uuid;
  else
    select pre.payroll_run_id
      into v_run
      from public.payroll_run_employees pre
     where pre.id = (v_row ->> 'run_employee_id')::uuid;
  end if;

  select status into v_status from public.payroll_runs where id = v_run;

  if v_status in ('locked', 'paid') then
    raise exception 'Payroll run % is finalized (%); line items are immutable', v_run, v_status;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger trg_assert_pre_mutable
  before insert or update or delete on public.payroll_run_employees
  for each row execute function public.assert_run_mutable();
create trigger trg_assert_earnings_mutable
  before insert or update or delete on public.payroll_earnings
  for each row execute function public.assert_run_mutable();
create trigger trg_assert_deductions_mutable
  before insert or update or delete on public.payroll_deductions
  for each row execute function public.assert_run_mutable();
create trigger trg_assert_empcontrib_mutable
  before insert or update or delete on public.payroll_employer_contributions
  for each row execute function public.assert_run_mutable();


-- >>>>>>>>>> supabase/migrations/0010_rls_policies.sql <<<<<<<<<<

-- =============================================================================
-- 0010_rls_policies.sql
-- Enable Row Level Security and define policies for every table.
--
-- Conventions (permissive policies are OR-combined):
--   * read access  -> has_permission(company_id, '<area>.read') OR self-service
--   * write access -> has_permission(company_id, '<area>.manage') ("rw" for-all)
--   * national rule tables are readable by any authenticated user
--   * the service role (server-side) bypasses RLS entirely
-- Membership (has_company_access) only proves tenancy; sensitive reads still
-- require an explicit permission so a self-service employee cannot read peers.
-- =============================================================================

-- Helper: do the current user and target user share an active company?
create or replace function public.shares_company(target_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.company_members a
    join public.company_members b on a.company_id = b.company_id
    where a.user_id = auth.uid()
      and b.user_id = target_user
      and a.is_active and b.is_active
  );
$$;
grant execute on function public.shares_company(uuid) to authenticated;

alter table public.users                          enable row level security;
alter table public.companies                      enable row level security;
alter table public.branches                       enable row level security;
alter table public.departments                    enable row level security;
alter table public.positions                      enable row level security;
alter table public.permissions                    enable row level security;
alter table public.roles                          enable row level security;
alter table public.role_permissions               enable row level security;
alter table public.company_members                enable row level security;
alter table public.employees                      enable row level security;
alter table public.employee_documents             enable row level security;
alter table public.holidays                       enable row level security;
alter table public.shifts                         enable row level security;
alter table public.attendance_logs                enable row level security;
alter table public.leave_requests                 enable row level security;
alter table public.government_rules               enable row level security;
alter table public.tax_rules                      enable row level security;
alter table public.contribution_rules             enable row level security;
alter table public.payroll_runs                   enable row level security;
alter table public.payroll_run_employees          enable row level security;
alter table public.payroll_earnings               enable row level security;
alter table public.payroll_deductions             enable row level security;
alter table public.payroll_employer_contributions enable row level security;
alter table public.payslips                       enable row level security;
alter table public.notifications                  enable row level security;
alter table public.audit_logs                     enable row level security;

-- ----------------------------------------------------------------- users ----
create policy users_select on public.users for select
  using (id = auth.uid() or public.is_super_admin() or public.shares_company(id));
create policy users_insert on public.users for insert
  with check (id = auth.uid());
create policy users_update on public.users for update
  using (id = auth.uid() or public.is_super_admin())
  with check (id = auth.uid() or public.is_super_admin());
create policy users_delete on public.users for delete
  using (public.is_super_admin());

-- ------------------------------------------------------------- companies ----
create policy companies_select on public.companies for select
  using (public.has_company_access(id));
create policy companies_insert on public.companies for insert
  with check (owner_id = auth.uid() or public.is_super_admin());
create policy companies_update on public.companies for update
  using (public.has_permission(id, 'companies.manage'))
  with check (public.has_permission(id, 'companies.manage'));
create policy companies_delete on public.companies for delete
  using (public.is_super_admin() or owner_id = auth.uid());

-- ------------------------------------------- branches/departments/positions ----
create policy branches_read on public.branches for select using (public.has_company_access(company_id));
create policy branches_rw   on public.branches for all
  using (public.has_permission(company_id, 'settings.manage'))
  with check (public.has_permission(company_id, 'settings.manage'));

create policy departments_read on public.departments for select using (public.has_company_access(company_id));
create policy departments_rw   on public.departments for all
  using (public.has_permission(company_id, 'settings.manage'))
  with check (public.has_permission(company_id, 'settings.manage'));

create policy positions_read on public.positions for select using (public.has_company_access(company_id));
create policy positions_rw   on public.positions for all
  using (public.has_permission(company_id, 'settings.manage'))
  with check (public.has_permission(company_id, 'settings.manage'));

-- ------------------------------------------------- permissions / roles ----
create policy permissions_read on public.permissions for select using (auth.uid() is not null);
create policy permissions_rw   on public.permissions for all
  using (public.is_super_admin()) with check (public.is_super_admin());

create policy roles_read on public.roles for select
  using (company_id is null or public.has_company_access(company_id));
create policy roles_rw on public.roles for all
  using (public.is_super_admin() or (company_id is not null and public.has_permission(company_id, 'members.manage')))
  with check (public.is_super_admin() or (company_id is not null and public.has_permission(company_id, 'members.manage')));

create policy role_permissions_read on public.role_permissions for select
  using (exists (
    select 1 from public.roles r
    where r.id = role_id and (r.company_id is null or public.has_company_access(r.company_id))
  ));
create policy role_permissions_rw on public.role_permissions for all
  using (exists (
    select 1 from public.roles r
    where r.id = role_id
      and (public.is_super_admin() or (r.company_id is not null and public.has_permission(r.company_id, 'members.manage')))
  ))
  with check (exists (
    select 1 from public.roles r
    where r.id = role_id
      and (public.is_super_admin() or (r.company_id is not null and public.has_permission(r.company_id, 'members.manage')))
  ));

-- ---------------------------------------------------- company_members ----
create policy company_members_read on public.company_members for select
  using (user_id = auth.uid() or public.has_company_access(company_id));
create policy company_members_rw on public.company_members for all
  using (public.has_permission(company_id, 'members.manage'))
  with check (public.has_permission(company_id, 'members.manage'));

-- ------------------------------------------------------------ employees ----
create policy employees_read on public.employees for select
  using (public.has_permission(company_id, 'employees.read') or id = public.current_employee_id(company_id));
create policy employees_rw on public.employees for all
  using (public.has_permission(company_id, 'employees.manage'))
  with check (public.has_permission(company_id, 'employees.manage'));

create policy employee_documents_read on public.employee_documents for select
  using (public.has_permission(company_id, 'employees.read') or employee_id = public.current_employee_id(company_id));
create policy employee_documents_rw on public.employee_documents for all
  using (public.has_permission(company_id, 'employees.manage'))
  with check (public.has_permission(company_id, 'employees.manage'));

-- ----------------------------------------------- holidays / shifts / attendance ----
create policy holidays_read on public.holidays for select using (public.has_company_access(company_id));
create policy holidays_rw   on public.holidays for all
  using (public.has_permission(company_id, 'settings.manage'))
  with check (public.has_permission(company_id, 'settings.manage'));

create policy shifts_read on public.shifts for select
  using (public.has_permission(company_id, 'attendance.read') or employee_id = public.current_employee_id(company_id));
create policy shifts_rw on public.shifts for all
  using (public.has_permission(company_id, 'attendance.manage'))
  with check (public.has_permission(company_id, 'attendance.manage'));

create policy attendance_read on public.attendance_logs for select
  using (public.has_permission(company_id, 'attendance.read') or employee_id = public.current_employee_id(company_id));
create policy attendance_rw on public.attendance_logs for all
  using (public.has_permission(company_id, 'attendance.manage'))
  with check (public.has_permission(company_id, 'attendance.manage'));

-- ------------------------------------------------------- leave_requests ----
create policy leave_read on public.leave_requests for select
  using (public.has_permission(company_id, 'leave.read') or employee_id = public.current_employee_id(company_id));
create policy leave_rw on public.leave_requests for all
  using (public.has_permission(company_id, 'leave.manage'))
  with check (public.has_permission(company_id, 'leave.manage'));
-- employees may file and edit their own pending requests
create policy leave_self_insert on public.leave_requests for insert
  with check (employee_id = public.current_employee_id(company_id) and status = 'pending');
create policy leave_self_update on public.leave_requests for update
  using (employee_id = public.current_employee_id(company_id) and status = 'pending')
  with check (employee_id = public.current_employee_id(company_id) and status in ('pending', 'cancelled'));

-- --------------------------------------------------- government rules ----
create policy government_rules_read on public.government_rules for select
  using (company_id is null or public.has_company_access(company_id));
create policy government_rules_rw on public.government_rules for all
  using (public.is_super_admin() or (company_id is not null and public.has_permission(company_id, 'settings.manage')))
  with check (public.is_super_admin() or (company_id is not null and public.has_permission(company_id, 'settings.manage')));

-- national statutory tables: readable by all authenticated, writable by super admin
create policy tax_rules_read on public.tax_rules for select using (auth.uid() is not null);
create policy tax_rules_rw   on public.tax_rules for all
  using (public.is_super_admin()) with check (public.is_super_admin());

create policy contribution_rules_read on public.contribution_rules for select using (auth.uid() is not null);
create policy contribution_rules_rw   on public.contribution_rules for all
  using (public.is_super_admin()) with check (public.is_super_admin());

-- -------------------------------------------------------------- payroll ----
create policy payroll_runs_read on public.payroll_runs for select
  using (public.has_permission(company_id, 'payroll.read'));
create policy payroll_runs_rw on public.payroll_runs for all
  using (public.has_permission(company_id, 'payroll.manage')
      or public.has_permission(company_id, 'payroll.approve')
      or public.has_permission(company_id, 'payroll.lock'))
  with check (public.has_permission(company_id, 'payroll.manage')
      or public.has_permission(company_id, 'payroll.approve')
      or public.has_permission(company_id, 'payroll.lock'));

create policy pre_read on public.payroll_run_employees for select
  using (public.has_permission(company_id, 'payroll.read') or employee_id = public.current_employee_id(company_id));
create policy pre_rw on public.payroll_run_employees for all
  using (public.has_permission(company_id, 'payroll.manage'))
  with check (public.has_permission(company_id, 'payroll.manage'));

create policy earnings_read on public.payroll_earnings for select
  using (public.has_permission(company_id, 'payroll.read'));
create policy earnings_rw on public.payroll_earnings for all
  using (public.has_permission(company_id, 'payroll.manage'))
  with check (public.has_permission(company_id, 'payroll.manage'));

create policy deductions_read on public.payroll_deductions for select
  using (public.has_permission(company_id, 'payroll.read'));
create policy deductions_rw on public.payroll_deductions for all
  using (public.has_permission(company_id, 'payroll.manage'))
  with check (public.has_permission(company_id, 'payroll.manage'));

create policy empcontrib_read on public.payroll_employer_contributions for select
  using (public.has_permission(company_id, 'payroll.read'));
create policy empcontrib_rw on public.payroll_employer_contributions for all
  using (public.has_permission(company_id, 'payroll.manage'))
  with check (public.has_permission(company_id, 'payroll.manage'));

create policy payslips_read on public.payslips for select
  using (public.has_permission(company_id, 'payroll.read') or employee_id = public.current_employee_id(company_id));
create policy payslips_rw on public.payslips for all
  using (public.has_permission(company_id, 'payroll.manage'))
  with check (public.has_permission(company_id, 'payroll.manage'));

-- -------------------------------------------------------- notifications ----
create policy notifications_read on public.notifications for select
  using (user_id = auth.uid() or public.is_super_admin());
create policy notifications_insert on public.notifications for insert
  with check (public.is_super_admin() or public.has_company_access(company_id) or user_id = auth.uid());
create policy notifications_update on public.notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete on public.notifications for delete
  using (user_id = auth.uid() or public.is_super_admin());

-- ----------------------------------------------------------- audit_logs ----
-- Insert happens via the SECURITY DEFINER audit trigger (bypasses RLS).
-- Read is restricted; no update/delete policy => the trail is immutable.
create policy audit_read on public.audit_logs for select
  using (public.is_super_admin() or public.has_permission(company_id, 'audit.read'));


-- >>>>>>>>>> supabase/migrations/0011_storage.sql <<<<<<<<<<

-- =============================================================================
-- 0011_storage.sql
-- Private Storage bucket for employee documents, with company-scoped access.
--
-- Object key convention:  <company_id>/<employee_id>/<filename>
-- The first path segment is the company UUID, which drives the access check via
-- the same has_permission() helper used by the database RLS policies.
-- =============================================================================

insert into storage.buckets (id, name, public)
values ('employee-documents', 'employee-documents', false)
on conflict (id) do nothing;

-- storage.objects already has RLS enabled by Supabase; just add scoped policies.
create policy "employee_docs_read" on storage.objects
  for select
  using (
    bucket_id = 'employee-documents'
    and public.has_permission(((storage.foldername(name))[1])::uuid, 'employees.read')
  );

create policy "employee_docs_insert" on storage.objects
  for insert
  with check (
    bucket_id = 'employee-documents'
    and public.has_permission(((storage.foldername(name))[1])::uuid, 'employees.manage')
  );

create policy "employee_docs_update" on storage.objects
  for update
  using (
    bucket_id = 'employee-documents'
    and public.has_permission(((storage.foldername(name))[1])::uuid, 'employees.manage')
  )
  with check (
    bucket_id = 'employee-documents'
    and public.has_permission(((storage.foldername(name))[1])::uuid, 'employees.manage')
  );

create policy "employee_docs_delete" on storage.objects
  for delete
  using (
    bucket_id = 'employee-documents'
    and public.has_permission(((storage.foldername(name))[1])::uuid, 'employees.manage')
  );


-- >>>>>>>>>> supabase/seed.sql <<<<<<<<<<

-- =============================================================================
-- seed.sql  —  Core, idempotent seed data (safe to run on every environment).
--
-- Contents:
--   1. Permission catalogue
--   2. System role templates (company_id = null) + their permissions
--   3. create_company() onboarding RPC (bootstraps owner membership)
--   4. Effective-dated BVI statutory rules: payroll tax, Social Security, NHI
--   5. National government rules (overtime, hours, minimum wage)
--
-- ⚠️  COMPLIANCE WARNING — VERIFY ALL RATES BEFORE PRODUCTION USE
--     The statutory figures below are best-effort DEFAULTS for development and
--     MUST be confirmed against the authoritative BVI sources and current
--     effective dates before running real payroll:
--       • Payroll Tax .......... BVI Inland Revenue Department
--       • Social Security ...... BVI Social Security Board (insurable ceiling!)
--       • NHI .................. BVI National Health Insurance / SSB
--       • Labour parameters .... BVI Labour Code / Dept. of Labour
--     Because every rate is effective-dated and stored in a table (never in
--     code), correcting a figure is an INSERT with a new effective_from — no
--     code change and no rewriting of historical payroll.
-- =============================================================================

-- 1. -------------------------------------------------------- permissions ----
insert into public.permissions (key, module, description) values
  ('companies.manage',  'companies',  'Edit company profile and settings'),
  ('members.manage',    'members',    'Manage users, roles and memberships'),
  ('settings.manage',   'settings',   'Manage org structure, holidays and rules'),
  ('employees.read',    'employees',  'View employee records'),
  ('employees.manage',  'employees',  'Create and edit employee records'),
  ('attendance.read',   'attendance', 'View attendance and schedules'),
  ('attendance.manage', 'attendance', 'Record attendance and manage shifts'),
  ('leave.read',        'leave',      'View leave requests'),
  ('leave.manage',      'leave',      'Create and edit leave requests'),
  ('leave.approve',     'leave',      'Approve or reject leave requests'),
  ('payroll.read',      'payroll',    'View payroll runs and payslips'),
  ('payroll.manage',    'payroll',    'Create and edit payroll runs'),
  ('payroll.approve',   'payroll',    'Approve payroll runs'),
  ('payroll.lock',      'payroll',    'Lock and mark payroll as paid'),
  ('reports.read',      'reports',    'View reports and analytics'),
  ('audit.read',        'audit',      'View the audit trail')
on conflict (key) do nothing;

-- 2. ------------------------------------------------------- system roles ----
insert into public.roles (company_id, name, description, is_system) values
  (null, 'Owner',            'Full access to everything in the company', true),
  (null, 'Admin',            'Administrative access to all modules',     true),
  (null, 'HR Manager',       'Manages employees, attendance and leave',  true),
  (null, 'Payroll Officer',  'Prepares payroll runs and payslips',       true),
  (null, 'Payroll Approver', 'Approves and locks payroll runs',          true),
  (null, 'Employee',         'Self-service portal access only',          true)
on conflict on constraint roles_company_name_uniq do nothing;

-- Owner + Admin: every permission.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r cross join public.permissions p
where r.company_id is null and r.name in ('Owner', 'Admin')
on conflict do nothing;

-- HR Manager.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r join public.permissions p on p.key in (
  'employees.read', 'employees.manage',
  'attendance.read', 'attendance.manage',
  'leave.read', 'leave.manage', 'leave.approve',
  'settings.manage', 'reports.read'
)
where r.company_id is null and r.name = 'HR Manager'
on conflict do nothing;

-- Payroll Officer.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r join public.permissions p on p.key in (
  'employees.read', 'attendance.read', 'leave.read',
  'payroll.read', 'payroll.manage', 'reports.read'
)
where r.company_id is null and r.name = 'Payroll Officer'
on conflict do nothing;

-- Payroll Approver.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r join public.permissions p on p.key in (
  'payroll.read', 'payroll.approve', 'payroll.lock', 'reports.read'
)
where r.company_id is null and r.name = 'Payroll Approver'
on conflict do nothing;

-- 'Employee' intentionally has no permissions: access is purely self-service.

-- 3. -------------------------------------------- onboarding RPC ----
-- Creates a company and the caller's Owner membership atomically. SECURITY
-- DEFINER so the first membership can be written before any RLS grant exists.
create or replace function public.create_company(
  p_legal_name        text,
  p_trading_name      text default null,
  p_payroll_tax_class payroll_tax_class default 'class_1'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company    uuid;
  v_owner_role uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.companies (legal_name, trading_name, payroll_tax_class, owner_id)
  values (p_legal_name, nullif(p_trading_name, ''), p_payroll_tax_class, auth.uid())
  returning id into v_company;

  select id into v_owner_role
  from public.roles
  where company_id is null and name = 'Owner'
  limit 1;

  insert into public.company_members (user_id, company_id, role_id, is_active)
  values (auth.uid(), v_company, v_owner_role, true);

  update public.users
  set default_company_id = coalesce(default_company_id, v_company)
  where id = auth.uid();

  return v_company;
end;
$$;
grant execute on function public.create_company(text, text, payroll_tax_class) to authenticated;

-- 4. ---------------------------------------- BVI statutory rules (VERIFY) ----
-- Payroll Tax: employee pays 8%; employer pays 2% (Class 1) or 6% (Class 2);
-- first $10,000 of each employee's annual remuneration is exempt.
insert into public.tax_rules
  (jurisdiction, name, employee_rate, employer_class1_rate, employer_class2_rate, annual_exemption, effective_from, notes)
values
  ('BVI', 'Payroll Tax', 0.080000, 0.020000, 0.060000, 10000.00, date '2010-01-01',
   'DEFAULT — verify against BVI Inland Revenue Dept. Employee 8%; employer Class 1 2% / Class 2 6%; first $10,000/yr exempt.')
on conflict (jurisdiction, effective_from) do nothing;

-- Social Security: employee 4.0%, employer 4.5% on insurable earnings up to a
-- ceiling. ⚠️ The ceiling below is a PLACEHOLDER — confirm the current annual
-- insurable earnings ceiling with the BVI Social Security Board.
insert into public.contribution_rules
  (jurisdiction, contribution_type, name, employee_rate, employer_rate, annual_insurable_ceiling, effective_from, notes)
values
  ('BVI', 'social_security', 'Social Security', 0.040000, 0.045000, 43680.00, date '2023-01-01',
   'DEFAULT — verify rates AND annual insurable ceiling with BVI Social Security Board. Ceiling shown is a placeholder.')
on conflict (jurisdiction, contribution_type, effective_from) do nothing;

-- NHI: employee 3.75%, employer 3.75% on the same insurable earnings ceiling.
insert into public.contribution_rules
  (jurisdiction, contribution_type, name, employee_rate, employer_rate, annual_insurable_ceiling, effective_from, notes)
values
  ('BVI', 'nhi', 'National Health Insurance', 0.037500, 0.037500, 43680.00, date '2023-01-01',
   'DEFAULT — verify rates AND ceiling with BVI NHI / SSB. NHI typically shares the SSB insurable ceiling.')
on conflict (jurisdiction, contribution_type, effective_from) do nothing;

-- 5. ------------------------------------------ national labour parameters ----
insert into public.government_rules (jurisdiction, rule_key, numeric_value, effective_from, notes)
select 'BVI', v.rule_key, v.numeric_value, date '2016-01-01', v.notes
from (values
  ('overtime_multiplier',     1.5,  'Overtime pay multiplier (e.g. 1.5x). Verify BVI Labour Code.'),
  ('holiday_pay_multiplier',  2.0,  'Public holiday / rest-day pay multiplier. Verify BVI Labour Code.'),
  ('standard_weekly_hours',   40.0, 'Standard working week in hours.'),
  ('minimum_wage_hourly',     6.0,  'Statutory minimum hourly wage in USD. VERIFY current value.')
) as v(rule_key, numeric_value, notes)
where not exists (
  select 1 from public.government_rules g
  where g.jurisdiction = 'BVI' and g.company_id is null
    and g.rule_key = v.rule_key and g.effective_from = date '2016-01-01'
);
