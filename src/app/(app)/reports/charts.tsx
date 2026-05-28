"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/payroll";
import type {
  HeadcountPoint,
  PayrollCostPoint,
  StatutoryTotals,
} from "@/lib/services/reports";

const PALETTE = [
  "hsl(221, 83%, 53%)",
  "hsl(142, 71%, 45%)",
  "hsl(38, 92%, 50%)",
  "hsl(346, 84%, 61%)",
  "hsl(262, 83%, 58%)",
  "hsl(199, 89%, 48%)",
  "hsl(173, 58%, 39%)",
  "hsl(24, 95%, 53%)",
] as const;

const COLOR_GROSS = PALETTE[0];
const COLOR_NET = PALETTE[1];
const COLOR_EMPLOYER = PALETTE[2];

const COLOR_PAYROLL_TAX = PALETTE[3];
const COLOR_SOCIAL_SECURITY = PALETTE[4];
const COLOR_NHI = PALETTE[5];

const AXIS_STYLE = { fontSize: 12, fill: "hsl(215, 16%, 47%)" } as const;

/** Compact currency for axis ticks (e.g. $12.5k) so labels do not overflow. */
function formatAxisCurrency(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(1)}k`;
  return `$${value.toFixed(0)}`;
}

function currencyTooltipFormatter(value: number | string): string {
  const n = typeof value === "number" ? value : Number(value);
  return formatMoney(Number.isFinite(n) ? n : 0);
}

export type ReportsChartsProps = {
  payrollByRun: PayrollCostPoint[];
  headcount: HeadcountPoint[];
  statutory: StatutoryTotals;
};

export function ReportsCharts({ payrollByRun, headcount, statutory }: ReportsChartsProps) {
  const hasPayroll = payrollByRun.length > 0;
  const hasHeadcount = headcount.length > 0;

  const statutoryData = [
    { name: "Payroll Tax", amount: statutory.payrollTax, fill: COLOR_PAYROLL_TAX },
    { name: "Social Security", amount: statutory.socialSecurity, fill: COLOR_SOCIAL_SECURITY },
    { name: "NHI", amount: statutory.nhi, fill: COLOR_NHI },
  ];
  const hasStatutory = statutoryData.some((d) => d.amount > 0);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Payroll cost per run</CardTitle>
          <CardDescription>Gross, net and total employer cost across processed runs.</CardDescription>
        </CardHeader>
        <CardContent>
          {hasPayroll ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={payrollByRun} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(214, 32%, 91%)" vertical={false} />
                <XAxis dataKey="name" tick={AXIS_STYLE} tickLine={false} axisLine={false} />
                <YAxis
                  tick={AXIS_STYLE}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={formatAxisCurrency}
                  width={72}
                />
                <Tooltip formatter={currencyTooltipFormatter} />
                <Legend />
                <Bar dataKey="gross" name="Gross" fill={COLOR_GROSS} radius={[4, 4, 0, 0]} />
                <Bar dataKey="net" name="Net" fill={COLOR_NET} radius={[4, 4, 0, 0]} />
                <Bar
                  dataKey="employerCost"
                  name="Employer cost"
                  fill={COLOR_EMPLOYER}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmpty message="No processed payroll runs yet." />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Net pay trend</CardTitle>
          <CardDescription>Net payout movement across processed runs.</CardDescription>
        </CardHeader>
        <CardContent>
          {hasPayroll ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={payrollByRun} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(214, 32%, 91%)" vertical={false} />
                <XAxis dataKey="name" tick={AXIS_STYLE} tickLine={false} axisLine={false} />
                <YAxis
                  tick={AXIS_STYLE}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={formatAxisCurrency}
                  width={72}
                />
                <Tooltip formatter={currencyTooltipFormatter} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="net"
                  name="Net pay"
                  stroke={COLOR_NET}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="gross"
                  name="Gross"
                  stroke={COLOR_GROSS}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmpty message="No processed payroll runs yet." />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Headcount by department</CardTitle>
          <CardDescription>Active employees grouped by department.</CardDescription>
        </CardHeader>
        <CardContent>
          {hasHeadcount ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Tooltip formatter={(value: number | string) => `${value} employee(s)`} />
                <Legend />
                <Pie
                  data={headcount}
                  dataKey="count"
                  nameKey="department"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  innerRadius={50}
                  paddingAngle={2}
                  label={(entry: { department?: string; count?: number }) =>
                    `${entry.department ?? ""}: ${entry.count ?? 0}`
                  }
                >
                  {headcount.map((entry, index) => (
                    <Cell
                      key={entry.department}
                      fill={PALETTE[index % PALETTE.length]}
                    />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmpty message="No active employees yet." />
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Statutory totals</CardTitle>
          <CardDescription>
            Combined employee deductions and employer contributions across processed runs.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {hasStatutory ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={statutoryData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(214, 32%, 91%)" vertical={false} />
                <XAxis dataKey="name" tick={AXIS_STYLE} tickLine={false} axisLine={false} />
                <YAxis
                  tick={AXIS_STYLE}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={formatAxisCurrency}
                  width={72}
                />
                <Tooltip formatter={currencyTooltipFormatter} />
                <Bar dataKey="amount" name="Amount" radius={[4, 4, 0, 0]}>
                  {statutoryData.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmpty message="No statutory amounts recorded yet." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ChartEmpty({ message }: { message: string }) {
  return (
    <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}
