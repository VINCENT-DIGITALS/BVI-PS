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
