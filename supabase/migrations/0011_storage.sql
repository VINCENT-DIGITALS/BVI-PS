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
