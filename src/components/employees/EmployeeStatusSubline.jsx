import { toJSDate } from '../../utils';
import { countOverdueOffboardingTasks } from '../../utils/employeeListHelpers.jsx';

export default function EmployeeStatusSubline({ emp }) {
  const status = emp.status;
  if (status === 'Notice Period') {
    const last = toJSDate(emp.offboarding?.expectedLastDay);
    if (!last || Number.isNaN(last.getTime())) return null;
    return (
      <span className="text-xs text-amber-600 font-medium">
        · Last day{' '}
        {last.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
      </span>
    );
  }
  if (status === 'Offboarding') {
    const overdue = countOverdueOffboardingTasks(emp);
    if (overdue === 0) return null;
    return (
      <span className="text-xs text-red-500 font-medium">
        · {overdue} task{overdue !== 1 ? 's' : ''} overdue
      </span>
    );
  }
  return null;
}
