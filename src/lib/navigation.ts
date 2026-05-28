import {
  LayoutDashboard,
  Users,
  Clock,
  CalendarDays,
  Wallet,
  BarChart3,
  Settings,
  UserRound,
  Bell,
  ScrollText,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Permission required to see this item; null = always visible to members. */
  permission: string | null;
};

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, permission: null },
  { label: "Employees", href: "/employees", icon: Users, permission: "employees.read" },
  { label: "Attendance", href: "/attendance", icon: Clock, permission: "attendance.read" },
  { label: "Leave", href: "/leave", icon: CalendarDays, permission: "leave.read" },
  { label: "Payroll", href: "/payroll", icon: Wallet, permission: "payroll.read" },
  { label: "Reports", href: "/reports", icon: BarChart3, permission: "reports.read" },
  { label: "Members", href: "/members", icon: ShieldCheck, permission: "members.manage" },
  { label: "Audit log", href: "/audit", icon: ScrollText, permission: "audit.read" },
  { label: "Settings", href: "/settings", icon: Settings, permission: "settings.manage" },
  { label: "Notifications", href: "/notifications", icon: Bell, permission: null },
  { label: "My Portal", href: "/portal", icon: UserRound, permission: null },
];
