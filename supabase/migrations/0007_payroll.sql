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
