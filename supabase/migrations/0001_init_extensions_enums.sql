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
