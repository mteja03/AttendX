import { toJSDate } from './index';

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

let indiaHolidaysPromise = null;

async function getIndiaHolidays() {
  if (!indiaHolidaysPromise) {
    indiaHolidaysPromise = import('date-holidays').then((mod) => {
      const Holidays = mod.default ?? mod;
      const holidays = new Holidays('IN');
      try {
        holidays.setLanguages('en');
      } catch {
        // Keep the library default if the English locale is unavailable.
      }
      return holidays;
    });
  }
  return indiaHolidaysPromise;
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function getIndianHolidayEvents(year) {
  const indiaHolidays = await getIndiaHolidays();
  return indiaHolidays
    .getHolidays(year)
    .filter((holiday) => holiday?.type === 'public')
    .map((holiday) => {
      const start = holiday.start instanceof Date ? holiday.start : new Date(holiday.date);
      const safeStart = Number.isNaN(start.getTime()) ? new Date(year, 0, 1, 12, 0, 0) : start;
      return {
        id: `holiday_${year}_${dateKey(safeStart)}_${slugify(holiday.name)}`,
        title: holiday.name,
        type: 'holiday',
        date: safeStart,
        endDate: null,
        description: '',
        color: '#EF4444',
        isPublic: true,
        source: 'builtin',
      };
    });
}

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
