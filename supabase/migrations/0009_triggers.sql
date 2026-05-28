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
