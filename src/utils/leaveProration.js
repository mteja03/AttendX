import { toJSDate } from './index';

/**
 * Pro-rate annual leave allowance for employees who joined mid–calendar year.
 */
export function calculateProRatedAllowance(annualAllowance, joiningDate) {
  if (annualAllowance == null || Number.isNaN(Number(annualAllowance))) return 0;
  const n = Number(annualAllowance);
  if (!joiningDate) return n;
  const joining = toJSDate(joiningDate);
  if (!joining || Number.isNaN(joining.getTime())) return n;
  const currentYear = new Date().getFullYear();
  const joiningYear = joining.getFullYear();
  if (joiningYear < currentYear) return n;
  if (joiningYear > currentYear) return 0;
  const joiningMonth = joining.getMonth();
  const monthsRemaining = 12 - joiningMonth;
  return Math.round((n * monthsRemaining) / 12);
}

export function isMidYearJoinerThisYear(joiningDate) {
  const joining = toJSDate(joiningDate);
  if (!joining || Number.isNaN(joining.getTime())) return false;
  return joining.getFullYear() === new Date().getFullYear() && joining.getMonth() > 0;
}
