import { Decimal, clampNonNegative, min, money, round2 } from "../money";
import type { ContributionResult, ResolvedContributionRule } from "../types";

export interface ContributionInput {
  /** Insurable earnings in THIS period. */
  insurableThisPeriod: Decimal;
  /** Insurable earnings already counted earlier this year (for the annual cap). */
  ytdInsurable: Decimal;
  rule: ResolvedContributionRule;
}

/**
 * Generic BVI social contribution (Social Security and NHI share this shape):
 * a percentage of insurable earnings up to an annual ceiling, split between
 * employee and employer. A null ceiling means uncapped.
 *
 * The annual ceiling is enforced cumulatively: once year-to-date insurable
 * earnings reach the ceiling, no further earnings are insurable.
 */
export function computeContribution(input: ContributionInput): ContributionResult {
  const employeeRate = money(input.rule.employeeRate);
  const employerRate = money(input.rule.employerRate);
  const ceiling = input.rule.annualInsurableCeiling;

  let base: Decimal;
  if (ceiling === null || ceiling === undefined || ceiling === "") {
    base = input.insurableThisPeriod;
  } else {
    const remainingRoom = clampNonNegative(money(ceiling).minus(input.ytdInsurable));
    base = min(input.insurableThisPeriod, remainingRoom);
  }

  return {
    base: input.insurableThisPeriod,
    cappedAmount: base,
    employee: round2(base.times(employeeRate)),
    employer: round2(base.times(employerRate)),
  };
}
