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
