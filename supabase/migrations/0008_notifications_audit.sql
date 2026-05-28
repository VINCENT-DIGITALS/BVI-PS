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
