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
