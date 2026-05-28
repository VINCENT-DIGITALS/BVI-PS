# Deployment Guide — BVI Payroll Management System

This guide walks through deploying the app to production using **Supabase** (Postgres, Auth,
Storage) and **Vercel** (hosting). Follow the steps in order.

> ⚠️ **COMPLIANCE REMINDER — verify statutory rates before going live.**
> The BVI **Payroll Tax**, **Social Security**, and **NHI** rates, ceilings, and exemptions
> shipped in `supabase/seed.sql` are **development DEFAULTS only**. Before processing real
> payroll you **MUST** verify every figure (and its `effective_from` date) against the
> authoritative BVI sources — the **Inland Revenue Department** (Payroll Tax), the
> **Social Security Board** (Social Security insurable ceiling), **NHI / SSB** (NHI), and the
> **BVI Labour Code / Department of Labour** (overtime multiplier, standard hours, minimum
> wage). All rates are stored in effective-dated tables (`tax_rules`, `contribution_rules`,
> `government_rules`), so correcting a value is an **INSERT with a new `effective_from`** —
> no code change and no rewriting of historical payroll.

---

## 1. Create a Supabase project

1. Sign in at <https://supabase.com> and create a **new project**.
2. Choose a strong database password and a region close to your users.
3. Once provisioned, note these values from **Project Settings → API**:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon / publishable key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY` (secret — server only)

---

## 2. Apply the database schema and seed

You can use **either** the Supabase SQL editor **or** the Supabase CLI.

### Option A — Supabase SQL editor (copy/paste)

In the dashboard, open **SQL Editor** and run the migration files **in numeric order**,
one at a time:

```
supabase/migrations/0001_init_extensions_enums.sql
supabase/migrations/0002_organization.sql
supabase/migrations/0003_rbac.sql
supabase/migrations/0004_employees.sql
supabase/migrations/0005_time_and_leave.sql
supabase/migrations/0006_government_rules.sql
supabase/migrations/0007_payroll.sql
supabase/migrations/0008_notifications_audit.sql
supabase/migrations/0009_triggers.sql
supabase/migrations/0010_rls_policies.sql
supabase/migrations/0011_storage.sql
```

Then run the seed:

```
supabase/seed.sql
```

### Option B — Supabase CLI

```bash
# Install the CLI: https://supabase.com/docs/guides/cli
supabase link --project-ref <your-project-ref>
supabase db push          # applies migrations 0001–0011
```

Then apply the seed (the CLI does not auto-run seed.sql against a linked remote project).
Either paste `supabase/seed.sql` into the SQL editor, or run it with psql:

```bash
psql "$SUPABASE_DB_URL" -f supabase/seed.sql
```

The seed is **idempotent** (safe to re-run): it loads the permission catalogue, the system
role templates, the `create_company` onboarding RPC, and the **DEFAULT** BVI statutory rules.

---

## 3. Enable Email authentication

1. In the dashboard go to **Authentication → Providers → Email** and enable it.
2. Configure your **Site URL** and **Redirect URLs** under **Authentication → URL
   Configuration** to point at your production domain (e.g. `https://your-app.vercel.app`).
3. Optionally configure SMTP / email templates for confirmation and password-reset mail.

---

## 4. Create the Storage bucket

Migration `0011_storage.sql` already creates a **private** Storage bucket named
**`employee-documents`** along with company-scoped access policies. Verify it exists under
**Storage** in the dashboard; if it is missing, re-run `0011_storage.sql`.

> The bucket is **private**. Object keys follow `<company_id>/<employee_id>/<filename>`, and
> access is gated by the same `has_permission()` helper used by the database RLS policies.

---

## 5. Set Vercel environment variables

In your Vercel project, add the following under **Settings → Environment Variables** (for
Production, Preview, and Development as appropriate):

| Variable | Value | Scope |
| -------- | ----- | ----- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase Project URL        | Public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key           | Public |
| `SUPABASE_SERVICE_ROLE_KEY`     | Supabase service_role key   | **Secret** |
| `RESEND_API_KEY`                | Resend API key (email)      | **Secret** |

See [`.env.example`](./.env.example) for the canonical list.

---

## 6. Deploy to Vercel

1. Push the repository to GitHub/GitLab/Bitbucket.
2. In Vercel, **Add New → Project** and **import** the repository.
3. Vercel auto-detects the framework as **Next.js** — keep the defaults
   (Build command `next build`, no custom output directory needed).
4. Add the environment variables from step 5.
5. Click **Deploy**.

---

## 7. Post-deploy: create the first company

1. Open the deployed URL and **sign up** for an account (`/register`).
2. After authenticating you'll be routed to **`/onboarding`**, which calls the
   `create_company` RPC. This creates your company **and** grants you an **Owner** membership
   in a single step. You're then redirected to the dashboard.

---

## 8. Promote a user to super admin (optional)

Super admins have platform-wide visibility. To grant it, run this in the Supabase SQL editor
(replace the email with the target user's):

```sql
update public.users
set is_super_admin = true
where email = 'admin@example.com';
```

---

## Final compliance check before processing real payroll

Before running production payroll, re-confirm in **Settings → Rules** (or directly in the
`tax_rules`, `contribution_rules`, and `government_rules` tables) that every BVI figure —
Payroll Tax employee/employer rates and annual exemption, Social Security and NHI rates and
insurable ceilings, and labour parameters — matches the **current official BVI rates and
effective dates**. Update any incorrect value by inserting a new effective-dated row.
