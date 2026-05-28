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
