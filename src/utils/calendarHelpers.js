import { toJSDate } from './index';

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const INDIAN_HOLIDAYS_2026 = [
  { title: "New Year's Day", date: '2026-01-01', type: 'holiday' },
  { title: 'Republic Day', date: '2026-01-26', type: 'holiday' },
  { title: 'Holi', date: '2026-03-03', type: 'holiday' },
  { title: 'Good Friday', date: '2026-04-03', type: 'holiday' },
  { title: 'Dr. Ambedkar Jayanti', date: '2026-04-14', type: 'holiday' },
  { title: 'Labour Day', date: '2026-05-01', type: 'holiday' },
  { title: 'Independence Day', date: '2026-08-15', type: 'holiday' },
  { title: 'Gandhi Jayanti', date: '2026-10-02', type: 'holiday' },
  { title: 'Dussehra', date: '2026-10-20', type: 'holiday' },
  { title: 'Diwali', date: '2026-11-08', type: 'holiday' },
  { title: 'Diwali Holiday', date: '2026-11-09', type: 'holiday' },
  { title: 'Christmas', date: '2026-12-25', type: 'holiday' },
];

export const COLOR_PRESETS = ['#1B6B6B', '#4ECDC4', '#3B82F6', '#8B5CF6', '#F59E0B', '#EF4444', '#10B981'];

export function getEventStyle(type) {
  const m = {
    holiday: 'bg-red-100 text-red-700',
    company_event: 'bg-blue-100 text-blue-700',
    birthday: 'bg-green-100 text-green-700',
    anniversary: 'bg-purple-100 text-purple-700',
    leave: 'bg-amber-100 text-amber-700',
  };
  return m[type] || 'bg-gray-100 text-gray-700';
}

export function dateKey(d) {
  if (!d) return '';
  const x = d instanceof Date ? d : toJSDate(d);
  if (!x || Number.isNaN(x.getTime())) return '';
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function buildCalendarDays(year, month) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const days = [];

  const startDow = firstDay.getDay() || 7;
  for (let i = startDow - 1; i > 0; i--) {
    const d = new Date(year, month, 1 - i);
    days.push({ date: d, currentMonth: false });
  }

  for (let i = 1; i <= lastDay.getDate(); i++) {
    days.push({ date: new Date(year, month, i), currentMonth: true });
  }

  const remaining = 42 - days.length;
  for (let i = 1; i <= remaining; i++) {
    const d = new Date(year, month + 1, i);
    days.push({ date: d, currentMonth: false });
  }

  return days;
}

export function expandEventDays(ev) {
  const start = toJSDate(ev.date);
  if (!start) return [];
  const end = ev.endDate ? toJSDate(ev.endDate) : start;
  if (!end) return [{ ...ev, _day: start }];
  const out = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endNorm = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (cur <= endNorm) {
    out.push({ ...ev, _day: new Date(cur) });
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}
