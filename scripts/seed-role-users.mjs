/**
 * Creates one demo login per system role and attaches it to your company.
 *
 *   node --env-file=.env.local scripts/seed-role-users.mjs
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.
 * Idempotent: re-running re-uses existing accounts and upserts memberships.
 * All accounts use the password below — for DEVELOPMENT/TESTING only.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const PASSWORD = "test1234";
const ROLE_USERS = [
  { email: "owner@example.com", full_name: "Owner Demo", role: "Owner" },
  { email: "admin@example.com", full_name: "Admin Demo", role: "Admin" },
  { email: "hr@example.com", full_name: "HR Manager Demo", role: "HR Manager" },
  { email: "payroll@example.com", full_name: "Payroll Officer Demo", role: "Payroll Officer" },
  { email: "approver@example.com", full_name: "Payroll Approver Demo", role: "Payroll Approver" },
  { email: "employee@example.com", full_name: "Employee Demo", role: "Employee" },
];

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// 1) Pick the company to attach the demo users to (the first one created).
const { data: companies, error: companyErr } = await admin
  .from("companies")
  .select("id, legal_name")
  .order("created_at", { ascending: true })
  .limit(1);
if (companyErr) throw companyErr;
if (!companies || companies.length === 0) {
  console.error("No company found. Sign up and complete onboarding first, then re-run.");
  process.exit(1);
}
const company = companies[0];
console.log(`Attaching role accounts to company: ${company.legal_name} (${company.id})\n`);

// 2) Map system role name -> id.
const { data: roles, error: rolesErr } = await admin
  .from("roles")
  .select("id, name")
  .is("company_id", null);
if (rolesErr) throw rolesErr;
const roleIdByName = new Map(roles.map((r) => [r.name, r.id]));

// 3) Create each account and upsert its membership.
for (const u of ROLE_USERS) {
  let userId;

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: u.email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: u.full_name },
  });

  if (createErr) {
    // Most likely already exists — look up the mirrored profile row.
    const { data: existing } = await admin
      .from("users")
      .select("id")
      .eq("email", u.email)
      .maybeSingle();
    if (!existing) {
      console.error(`  ✗ ${u.email}: ${createErr.message}`);
      continue;
    }
    userId = existing.id;
    console.log(`  • ${u.email} (already existed)`);
  } else {
    userId = created.user.id;
    console.log(`  ✓ created ${u.email}`);
  }

  const roleId = roleIdByName.get(u.role);
  if (!roleId) {
    console.error(`    ✗ role "${u.role}" not found (did seed.sql run?)`);
    continue;
  }

  const { error: memberErr } = await admin
    .from("company_members")
    .upsert(
      { user_id: userId, company_id: company.id, role_id: roleId, is_active: true },
      { onConflict: "user_id,company_id" },
    );
  if (memberErr) {
    console.error(`    ✗ membership: ${memberErr.message}`);
    continue;
  }
  console.log(`    → role: ${u.role}`);

  // Link the Employee-role account to an existing employee so the
  // self-service portal has data to show.
  if (u.role === "Employee") {
    const { data: emps } = await admin
      .from("employees")
      .select("id")
      .eq("company_id", company.id)
      .limit(1);
    if (emps && emps.length > 0) {
      await admin
        .from("company_members")
        .update({ employee_id: emps[0].id })
        .eq("user_id", userId)
        .eq("company_id", company.id);
      await admin.from("employees").update({ user_id: userId }).eq("id", emps[0].id);
      console.log(`    → linked to employee ${emps[0].id} for portal access`);
    }
  }
}

console.log(`\nDone. All accounts use password: ${PASSWORD}`);
console.log("Sign in at /login with any of the emails above.");
