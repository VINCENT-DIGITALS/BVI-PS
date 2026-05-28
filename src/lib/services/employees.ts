import { createClient } from "@/lib/supabase/server";

/**
 * Employment / compensation enums mirrored from the SQL schema
 * (supabase/migrations/0004_employees.sql).
 */
export type EmploymentType = "full_time" | "part_time" | "contract" | "temporary";
export type EmployeeStatus = "active" | "on_leave" | "suspended" | "terminated";
export type PayType = "salaried" | "hourly";
export type EmployeePayFrequency = "weekly" | "biweekly" | "semimonthly" | "monthly";

/** A single row of the `employees` table (columns relevant to this module). */
export type Employee = {
  id: string;
  company_id: string;
  branch_id: string | null;
  department_id: string | null;
  position_id: string | null;
  user_id: string | null;
  employee_number: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  preferred_name: string | null;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  gender: string | null;
  national_id: string | null;
  ss_number: string | null;
  nhi_number: string | null;
  tax_id: string | null;
  hire_date: string;
  termination_date: string | null;
  employment_type: EmploymentType;
  status: EmployeeStatus;
  pay_type: PayType;
  pay_frequency: EmployeePayFrequency;
  annual_salary: number | string | null;
  hourly_rate: number | string | null;
  standard_hours_per_period: number | string | null;
  subject_to_payroll_tax: boolean;
  subject_to_social_security: boolean;
  subject_to_nhi: boolean;
  bank_name: string | null;
  bank_account_number: string | null;
  bank_routing: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  territory: string | null;
  postal_code: string | null;
  created_at: string;
  updated_at: string;
};

/** Employee joined with its department name for list display. */
export type EmployeeListRow = Employee & {
  department_name: string | null;
};

export type DepartmentOption = {
  id: string;
  name: string;
};

export type PositionOption = {
  id: string;
  title: string;
  department_id: string | null;
};

const EMPLOYEE_COLUMNS =
  "id, company_id, branch_id, department_id, position_id, user_id, employee_number, " +
  "first_name, middle_name, last_name, preferred_name, email, phone, date_of_birth, gender, " +
  "national_id, ss_number, nhi_number, tax_id, hire_date, termination_date, employment_type, " +
  "status, pay_type, pay_frequency, annual_salary, hourly_rate, standard_hours_per_period, " +
  "subject_to_payroll_tax, subject_to_social_security, subject_to_nhi, bank_name, " +
  "bank_account_number, bank_routing, address_line1, address_line2, city, territory, " +
  "postal_code, created_at, updated_at";

/** Lists every employee for the company, with the department name resolved. */
export async function listEmployees(companyId: string): Promise<EmployeeListRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employees")
    .select(`${EMPLOYEE_COLUMNS}, departments(name)`)
    .eq("company_id", companyId)
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as (Employee & {
    departments: { name: string | null } | null;
  })[];

  return rows.map(({ departments, ...employee }) => ({
    ...employee,
    department_name: departments?.name ?? null,
  }));
}

/** Loads a single employee by id, scoped to the company. Returns null if absent. */
export async function getEmployee(companyId: string, id: string): Promise<Employee | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employees")
    .select(EMPLOYEE_COLUMNS)
    .eq("company_id", companyId)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return data as unknown as Employee;
}

/** Active departments for the company, for use in select inputs. */
export async function listDepartments(companyId: string): Promise<DepartmentOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("departments")
    .select("id, name")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as DepartmentOption[];
}

/** Active positions for the company, for use in select inputs. */
export async function listPositions(companyId: string): Promise<PositionOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("positions")
    .select("id, title, department_id")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .order("title", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as PositionOption[];
}
