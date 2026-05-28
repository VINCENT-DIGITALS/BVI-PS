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
