import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { toDisplayDate, toJSDate } from '../utils';
import {
  WEEKDAYS,
  INDIAN_HOLIDAYS_2026,
  COLOR_PRESETS,
  getEventStyle,
  dateKey,
  buildCalendarDays,
  expandEventDays,
} from '../utils/calendarHelpers';
import { trackPageView } from '../utils/analytics';

export default function Calendar() {
  const { companyId } = useParams();
  const navigate = useNavigate();
  const { currentUser, role } = useAuth();
  const { success, error: showError } = useToast();
  const canManage = role === 'admin' || role === 'hrmanager';

  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [viewType, setViewType] = useState('month');
  const [hiddenTypes, setHiddenTypes] = useState(() => new Set());
  const [weekStart, setWeekStart] = useState(() => {
    const t = new Date();
    const day = t.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(t);
    monday.setDate(t.getDate() + diff);
    monday.setHours(0, 0, 0, 0);
    return monday;
  });

  const EVENT_TYPE_META = {
    holiday: { label: 'Holidays', bar: '#E24B4A', bg: '#FCEBEB', text: '#501313', dot: '#E24B4A' },
    company: { label: 'Company events', bar: '#378ADD', bg: '#E6F1FB', text: '#042C53', dot: '#378ADD' },
    birthday: { label: 'Birthdays', bar: '#639922', bg: '#EAF3DE', text: '#173404', dot: '#639922' },
    leave: { label: 'On leave', bar: '#EF9F27', bg: '#FAEEDA', text: '#412402', dot: '#EF9F27' },
    anniversary: { label: 'Anniversaries', bar: '#7F77DD', bg: '#EEEDFE', text: '#26215C', dot: '#7F77DD' },
  };

  const TYPE_ORDER = ['holiday', 'company', 'birthday', 'leave', 'anniversary'];

  const toggleType = (t) =>
    setHiddenTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  const [fsEvents, setFsEvents] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [leaveList, setLeaveList] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    trackPageView('Calendar');
  }, []);

  const [eventForm, setEventForm] = useState({
    title: '',
    type: 'company_event',
    date: new Date().toISOString().slice(0, 10),
    endDate: '',
    description: '',
    color: '#1B6B6B',
  });

  const seedHolidaysIfNeeded = useCallback(async () => {
    if (!companyId || !currentUser?.email) return;
    const colRef = collection(db, 'companies', companyId, 'events');
    const snap = await getDocs(colRef);
    const hasHoliday = snap.docs.some((d) => d.data().type === 'holiday');
    if (hasHoliday) return;
    const batch = writeBatch(db);
    const ts = serverTimestamp();
    INDIAN_HOLIDAYS_2026.forEach((h) => {
      const ref = doc(colRef);
      batch.set(ref, {
        title: h.title,
        type: 'holiday',
        date: new Date(`${h.date}T12:00:00`),
        endDate: null,
        description: '',
        color: '#EF4444',
        isPublic: true,
        createdAt: ts,
        createdBy: currentUser.email,
      });
    });
    await batch.commit();
  }, [companyId, currentUser]);

  useEffect(() => {
    if (!companyId) return;
    (async () => {
      try {
        await seedHolidaysIfNeeded();
      } catch (e) {
        if (import.meta.env.DEV) console.error(e);
      }
    })();
  }, [companyId, seedHolidaysIfNeeded]);

  useEffect(() => {
    if (!companyId) return () => {};
    const unsub = onSnapshot(
      query(collection(db, 'companies', companyId, 'events'), limit(500)),
      (snap) => {
        setFsEvents(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
    );
    return unsub;
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    getDocs(
      query(
        collection(db, 'companies', companyId, 'employees'),
        where('status', 'in', ['Active', 'Notice Period', 'Offboarding', 'On Leave']),
        limit(300),
      ),
    )
      .then((snap) => {
        setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      })
      .catch(() => {});
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return () => {};
    const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];
    const unsub = onSnapshot(
      query(
        collection(db, 'companies', companyId, 'leave'),
        where('status', '==', 'Approved'),
        where('startDate', '>=', yearStart),
        limit(300),
      ),
      (snap) => {
        setLeaveList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
    );
    return unsub;
  }, [companyId]);

  const validLeaves = useMemo(
    () => leaveList.filter((leave) => employees.some((e) => e.id === leave.employeeId)),
    [leaveList, employees],
  );

  const combinedEvents = useMemo(() => {
    const list = [];
    const y = viewYear;

    fsEvents.forEach((ev) => {
      expandEventDays(ev).forEach((e) => list.push({ ...e, source: 'firestore' }));
    });

    employees.forEach((emp) => {
      if ((emp.status || '') === 'Inactive') return;
      if (!emp.dateOfBirth) return;
      const dob = toJSDate(emp.dateOfBirth);
      if (!dob) return;
      const thisYearBday = new Date(y, dob.getMonth(), dob.getDate());
      list.push({
        id: `bday_${emp.id}_${y}`,
        title: `🎂 ${emp.fullName || 'Employee'}`,
        type: 'birthday',
        date: thisYearBday,
        employeeId: emp.id,
        source: 'computed',
      });
    });

    employees.forEach((emp) => {
      if ((emp.status || '') === 'Inactive') return;
      if (!emp.joiningDate) return;
      const joined = toJSDate(emp.joiningDate);
      if (!joined) return;
      const years = y - joined.getFullYear();
      if (years <= 0) return;
      const thisYearAnniv = new Date(y, joined.getMonth(), joined.getDate());
      list.push({
        id: `anniv_${emp.id}_${y}`,
        title: `🎉 ${emp.fullName || 'Employee'} (${years}yr)`,
        type: 'anniversary',
        date: thisYearAnniv,
        employeeId: emp.id,
        source: 'computed',
      });
    });

    validLeaves.forEach((leave) => {
      const start = toJSDate(leave.startDate);
      const end = toJSDate(leave.endDate);
      if (!start || !end) return;
      const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      const endNorm = new Date(end.getFullYear(), end.getMonth(), end.getDate());
      while (cur <= endNorm) {
        if (cur.getFullYear() === y) {
          list.push({
            id: `leave_${leave.id}_${dateKey(cur)}`,
            title: `${leave.employeeName || 'Employee'} (leave)`,
            type: 'leave',
            date: new Date(cur),
            leaveType: leave.leaveType,
            leaveId: leave.id,
            employeeId: leave.employeeId,
            source: 'computed',
          });
        }
        cur.setDate(cur.getDate() + 1);
      }
    });

    return list;
  }, [fsEvents, employees, validLeaves, viewYear]);

  const eventsByDay = useMemo(() => {
    const map = {};
    combinedEvents.forEach((ev) => {
      const d = ev._day || toJSDate(ev.date);
      if (!d) return;
      const k = dateKey(d);
      if (!map[k]) map[k] = [];
      map[k].push(ev);
    });
    return map;
  }, [combinedEvents]);

  const calendarDays = useMemo(() => buildCalendarDays(viewYear, viewMonth), [viewYear, viewMonth]);

  const weekDays = useMemo(() => {
    const out = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      out.push(d);
    }
    return out;
  }, [weekStart]);

  const weekRangeLabel = useMemo(() => {
    if (weekDays.length < 7) return '';
    const start = weekDays[0];
    const end = weekDays[6];
    const sameMonth = start.getMonth() === end.getMonth();
    const sameYear = start.getFullYear() === end.getFullYear();
    const startStr = start.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
    const endStr = sameMonth
      ? end.getDate()
      : end.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
    return `${startStr} – ${endStr}${sameYear ? `, ${start.getFullYear()}` : `, ${end.getFullYear()}`}`;
  }, [weekDays]);

  const agendaGroups = useMemo(() => {
    const monthStart = new Date(viewYear, viewMonth, 1);
    monthStart.setHours(0, 0, 0, 0);
    const horizon = new Date(monthStart);
    horizon.setDate(horizon.getDate() + 90);

    const groups = {};
    combinedEvents.forEach((ev) => {
      if (hiddenTypes.has(ev.type)) return;
      const d = ev._day || toJSDate(ev.date);
      if (!d) return;
      const norm = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      if (norm < monthStart || norm > horizon) return;
      const k = dateKey(norm);
      if (!groups[k]) groups[k] = { date: norm, events: [] };
      groups[k].events.push(ev);
    });

    return Object.values(groups).sort((a, b) => a.date - b.date);
  }, [combinedEvents, hiddenTypes, viewYear, viewMonth]);

  const visibleEventsByDay = useMemo(() => {
    if (hiddenTypes.size === 0) return eventsByDay;
    const out = {};
    Object.keys(eventsByDay).forEach((k) => {
      const filtered = eventsByDay[k].filter((ev) => !hiddenTypes.has(ev.type));
      if (filtered.length) out[k] = filtered;
    });
    return out;
  }, [eventsByDay, hiddenTypes]);

  const eventTypeCounts = useMemo(() => {
    const counts = { holiday: 0, company: 0, birthday: 0, leave: 0, anniversary: 0 };
    const monthStart = new Date(viewYear, viewMonth, 1);
    const monthEnd = new Date(viewYear, viewMonth + 1, 0);
    combinedEvents.forEach((ev) => {
      const d = ev._day || toJSDate(ev.date);
      if (!d) return;
      if (d < monthStart || d > monthEnd) return;
      if (counts[ev.type] !== undefined) counts[ev.type] += 1;
    });
    return counts;
  }, [combinedEvents, viewYear, viewMonth]);

  const upcomingEvents = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const horizon = new Date(today);
    horizon.setDate(horizon.getDate() + 7);
    const list = combinedEvents
      .filter((ev) => {
        const d = ev._day || toJSDate(ev.date);
        if (!d) return false;
        const norm = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        return norm >= today && norm <= horizon && !hiddenTypes.has(ev.type);
      })
      .sort((a, b) => {
        const da = a._day || toJSDate(a.date);
        const db = b._day || toJSDate(b.date);
        return da - db;
      });
    return list;
  }, [combinedEvents, hiddenTypes]);

  const startOfWeek = (d) => {
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(d);
    monday.setDate(d.getDate() + diff);
    monday.setHours(0, 0, 0, 0);
    return monday;
  };

  const shiftWeek = (delta) => {
    setWeekStart((prev) => {
      const next = new Date(prev);
      next.setDate(prev.getDate() + delta * 7);
      next.setHours(0, 0, 0, 0);
      setViewYear(next.getFullYear());
      setViewMonth(next.getMonth());
      return next;
    });
  };

  const goToday = () => {
    const t = new Date();
    setViewYear(t.getFullYear());
    setViewMonth(t.getMonth());
    setWeekStart(startOfWeek(t));
  };

  const shiftMonth = (delta) => {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };

  const handleSaveEvent = async (e) => {
    e.preventDefault();
    if (!companyId || !currentUser?.email) return;
    if (!eventForm.title.trim()) {
      showError('Title is required');
      return;
    }
    try {
      const start = new Date(`${eventForm.date}T12:00:00`);
      const end = eventForm.endDate ? new Date(`${eventForm.endDate}T12:00:00`) : null;
      await addDoc(collection(db, 'companies', companyId, 'events'), {
        title: eventForm.title.trim(),
        type: eventForm.type,
        date: start,
        endDate: end,
        description: eventForm.description.trim(),
        color: eventForm.color || '#1B6B6B',
        isPublic: true,
        createdAt: serverTimestamp(),
        createdBy: currentUser.email,
      });
      success('Event added');
      setShowAddModal(false);
      setEventForm({
        title: '',
        type: 'company_event',
        date: new Date().toISOString().slice(0, 10),
        endDate: '',
        description: '',
        color: '#1B6B6B',
      });
    } catch (err) {
      if (import.meta.env.DEV) console.error(err);
      showError('Failed to save event');
    }
  };

  const handleDeleteEvent = async () => {
    if (!selectedEvent || !companyId || !canManage) return;
    if (selectedEvent.type !== 'company_event' || selectedEvent.source !== 'firestore') {
      showError('Only company events can be deleted here');
      return;
    }
    if (!selectedEvent.id || String(selectedEvent.id).startsWith('bday_')) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'companies', companyId, 'events', selectedEvent.id));
      success('Event removed');
      setSelectedEvent(null);
    } catch (err) {
      if (import.meta.env.DEV) console.error(err);
      showError('Failed to delete');
    }
    setDeleting(false);
  };

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  if (!companyId) return null;

  return (
    <div>
      <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Calendar</h1>
          <p className="text-sm text-gray-500 mt-1">Holidays, events, birthdays, leave & anniversaries</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex bg-white border border-gray-200 rounded-xl p-0.5">
            {[
              { id: 'month', label: 'Month' },
              { id: 'week', label: 'Week' },
              { id: 'agenda', label: 'Agenda' },
            ].map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setViewType(v.id)}
                className={`min-h-[40px] px-3 text-xs font-medium rounded-lg transition-colors ${
                  viewType === v.id ? 'bg-[#1B6B6B] text-white' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 border border-gray-200 rounded-xl px-2 py-1 bg-white">
            <button
              type="button"
              onClick={() => (viewType === 'week' ? shiftWeek(-1) : shiftMonth(-1))}
              className="min-h-[40px] min-w-[36px] text-gray-500 hover:text-gray-800"
              aria-label={viewType === 'week' ? 'Previous week' : 'Previous month'}
            >
              ‹
            </button>
            <span className="text-sm font-medium text-slate-800 min-w-[160px] text-center capitalize">
              {viewType === 'week' ? weekRangeLabel : monthLabel}
            </span>
            <button
              type="button"
              onClick={() => (viewType === 'week' ? shiftWeek(1) : shiftMonth(1))}
              className="min-h-[40px] min-w-[36px] text-gray-500 hover:text-gray-800"
              aria-label={viewType === 'week' ? 'Next week' : 'Next month'}
            >
              ›
            </button>
          </div>
          <button
            type="button"
            onClick={goToday}
            className="min-h-[40px] px-4 rounded-xl border border-gray-200 text-sm font-medium text-slate-700 hover:bg-gray-50"
          >
            Today
          </button>
          {canManage && (
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-1.5 min-h-[40px] px-4 rounded-xl bg-[#1B6B6B] text-white text-sm font-medium hover:bg-[#155858]"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
              </svg>
              Add event
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {TYPE_ORDER.map((t) => {
          const meta = EVENT_TYPE_META[t];
          const count = eventTypeCounts[t] || 0;
          const isHidden = hiddenTypes.has(t);
          return (
            <button
              key={t}
              type="button"
              onClick={() => toggleType(t)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium border rounded-full transition-all ${
                isHidden
                  ? 'bg-white border-gray-100 text-gray-300 line-through'
                  : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
              title={isHidden ? `Show ${meta.label.toLowerCase()}` : `Hide ${meta.label.toLowerCase()}`}
            >
              <span
                className="w-2 h-2 rounded-full inline-block"
                style={{ background: isHidden ? '#D1D5DB' : meta.dot }}
              />
              {meta.label}
              <span
                className="ml-0.5 text-[10px] px-1.5 py-0.5 rounded-full"
                style={{
                  background: isHidden ? '#F3F4F6' : '#F9FAFB',
                  color: isHidden ? '#D1D5DB' : '#6B7280',
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        <div className="flex-1 min-w-0">
          {viewType === 'month' && (
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50">
                {WEEKDAYS.map((d) => (
                  <div
                    key={d}
                    className="text-center text-[10px] font-medium text-gray-400 uppercase tracking-wider py-2"
                  >
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {calendarDays.map(({ date, currentMonth: isCurrentMonth }, idx) => {
                  const k = dateKey(date);
                  const dayEvents = visibleEventsByDay[k] || [];
                  const t = new Date();
                  const isToday =
                    date.getDate() === t.getDate() &&
                    date.getMonth() === t.getMonth() &&
                    date.getFullYear() === t.getFullYear();
                  const dow = date.getDay();
                  const isWeekend = dow === 0 || dow === 6;
                  const cellBg = isToday
                    ? 'bg-[#E1F5EE]'
                    : !isCurrentMonth
                      ? 'bg-gray-50'
                      : isWeekend
                        ? 'bg-[#FAFAFA]'
                        : 'bg-white';

                  return (
                    <div
                      key={`${k}-${idx}`}
                      className={`min-h-[88px] sm:min-h-[92px] p-1.5 border-b border-r border-gray-100 relative ${cellBg}`}
                    >
                      <span
                        className={`text-[11px] font-medium w-5 h-5 flex items-center justify-center rounded-full mb-1 ${
                          isToday
                            ? 'bg-[#1B6B6B] text-white'
                            : isCurrentMonth
                              ? 'text-gray-700'
                              : 'text-gray-300'
                        }`}
                      >
                        {date.getDate()}
                      </span>
                      {dayEvents.slice(0, 3).map((ev) => {
                        const meta = EVENT_TYPE_META[ev.type] || EVENT_TYPE_META.company;
                        return (
                          <div
                            key={ev.id}
                            role="button"
                            tabIndex={0}
                            title={ev.title}
                            onClick={() => setSelectedEvent(ev)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') setSelectedEvent(ev);
                            }}
                            className="text-[10px] sm:text-[11px] pl-1.5 pr-1 py-0.5 rounded mb-0.5 truncate cursor-pointer font-medium"
                            style={{
                              background: meta.bg,
                              color: meta.text,
                              borderLeft: `2px solid ${meta.bar}`,
                            }}
                          >
                            {ev.title}
                          </div>
                        );
                      })}
                      {dayEvents.length > 3 && (
                        <button
                          type="button"
                          onClick={() => setSelectedEvent(dayEvents[3])}
                          className="text-[10px] text-gray-500 hover:text-gray-700 font-medium"
                        >
                          +{dayEvents.length - 3} more
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {viewType === 'week' && (
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50">
                {weekDays.map((d) => {
                  const t = new Date();
                  const isToday =
                    d.getDate() === t.getDate() &&
                    d.getMonth() === t.getMonth() &&
                    d.getFullYear() === t.getFullYear();
                  return (
                    <div
                      key={d.toISOString()}
                      className={`text-center py-2 ${isToday ? 'bg-[#E1F5EE]' : ''}`}
                    >
                      <div className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
                        {d.toLocaleDateString('en-IN', { weekday: 'short' })}
                      </div>
                      <div className={`text-base font-medium mt-0.5 ${isToday ? 'text-[#0F6E56]' : 'text-gray-800'}`}>
                        {d.getDate()}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="grid grid-cols-7" style={{ minHeight: '480px' }}>
                {weekDays.map((d) => {
                  const k = dateKey(d);
                  const dayEvents = visibleEventsByDay[k] || [];
                  const t = new Date();
                  const isToday =
                    d.getDate() === t.getDate() &&
                    d.getMonth() === t.getMonth() &&
                    d.getFullYear() === t.getFullYear();
                  const dow = d.getDay();
                  const isWeekend = dow === 0 || dow === 6;
                  const cellBg = isToday ? 'bg-[#E1F5EE]/40' : isWeekend ? 'bg-[#FAFAFA]' : 'bg-white';

                  return (
                    <div
                      key={k}
                      className={`p-2 border-r border-gray-100 last:border-r-0 ${cellBg}`}
                    >
                      {dayEvents.length === 0 && (
                        <p className="text-[10px] text-gray-300 text-center mt-4">No events</p>
                      )}
                      {dayEvents.map((ev) => {
                        const meta = EVENT_TYPE_META[ev.type] || EVENT_TYPE_META.company;
                        return (
                          <button
                            key={ev.id}
                            type="button"
                            onClick={() => setSelectedEvent(ev)}
                            title={ev.title}
                            className="w-full text-left text-[11px] px-2 py-1.5 rounded-md mb-1.5 cursor-pointer font-medium block"
                            style={{
                              background: meta.bg,
                              color: meta.text,
                              borderLeft: `2px solid ${meta.bar}`,
                            }}
                          >
                            <div className="truncate">{ev.title}</div>
                            <div className="text-[9px] mt-0.5 opacity-70 truncate">{meta.label}</div>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {viewType === 'agenda' && (
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              {agendaGroups.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center text-gray-300 mx-auto mb-3">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <rect x="3" y="4" width="18" height="18" rx="2" />
                      <path d="M16 2v4M8 2v4M3 10h18" />
                    </svg>
                  </div>
                  <h3 className="text-sm font-medium text-gray-800 mb-1">No events</h3>
                  <p className="text-xs text-gray-400">Nothing scheduled in the next 90 days from {monthLabel}.</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {agendaGroups.map((group) => {
                    const t = new Date();
                    t.setHours(0, 0, 0, 0);
                    const isToday = group.date.getTime() === t.getTime();
                    const isPast = group.date.getTime() < t.getTime();
                    const dayLabel = group.date.toLocaleDateString('en-IN', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                    });

                    return (
                      <div key={dateKey(group.date)} className="px-4 py-3">
                        <div className="flex items-center gap-2 mb-2">
                          <span
                            className={`text-xs font-medium ${
                              isToday ? 'text-[#0F6E56]' : isPast ? 'text-gray-400' : 'text-gray-700'
                            }`}
                          >
                            {dayLabel}
                          </span>
                          {isToday && (
                            <span className="text-[10px] bg-[#E1F5EE] text-[#0F6E56] px-1.5 py-0.5 rounded-full font-medium">
                              Today
                            </span>
                          )}
                          <span className="text-[10px] text-gray-400 ml-auto">
                            {group.events.length} {group.events.length === 1 ? 'event' : 'events'}
                          </span>
                        </div>
                        <div className="space-y-1">
                          {group.events.map((ev) => {
                            const meta = EVENT_TYPE_META[ev.type] || EVENT_TYPE_META.company;
                            return (
                              <button
                                key={ev.id}
                                type="button"
                                onClick={() => setSelectedEvent(ev)}
                                className="w-full flex gap-3 p-2 rounded-lg hover:bg-gray-50 text-left"
                              >
                                <div
                                  className="w-1 self-stretch rounded-full flex-shrink-0"
                                  style={{ background: meta.bar }}
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium text-gray-800 truncate">
                                    {ev.title}
                                  </div>
                                  <div className="text-xs text-gray-400 mt-0.5">{meta.label}</div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="lg:w-72 shrink-0">
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-gray-800">Upcoming</h3>
              <span className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Next 7 days</span>
            </div>

            {upcomingEvents.length === 0 ? (
              <div className="py-8 text-center">
                <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-300 mx-auto mb-2">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <path d="M16 2v4M8 2v4M3 10h18" />
                  </svg>
                </div>
                <p className="text-xs font-medium text-gray-600">All clear</p>
                <p className="text-[11px] text-gray-400 mt-0.5">Nothing this week</p>
              </div>
            ) : (
              <div className="space-y-0.5">
                {upcomingEvents.slice(0, 8).map((ev) => {
                  const d = ev._day || toJSDate(ev.date);
                  const t = new Date();
                  t.setHours(0, 0, 0, 0);
                  const norm = new Date(d.getFullYear(), d.getMonth(), d.getDate());
                  const isTodayEv = norm.getTime() === t.getTime();
                  const meta = EVENT_TYPE_META[ev.type] || EVENT_TYPE_META.company;
                  return (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={() => setSelectedEvent(ev)}
                      className="w-full flex gap-2.5 py-2 px-1 rounded-lg hover:bg-gray-50 text-left"
                    >
                      <div className="text-center flex-shrink-0 w-9">
                        <div className="text-[9px] text-gray-400 uppercase tracking-wider font-medium">
                          {d.toLocaleDateString('en-IN', { weekday: 'short' })}
                        </div>
                        <div
                          className={`text-[15px] font-medium leading-tight ${
                            isTodayEv ? 'text-[#1B6B6B]' : 'text-gray-800'
                          }`}
                        >
                          {d.getDate()}
                        </div>
                      </div>
                      <div
                        className="flex-1 min-w-0 pl-2"
                        style={{ borderLeft: `2px solid ${meta.bar}` }}
                      >
                        <div className="text-[12px] font-medium text-gray-800 truncate">
                          {ev.title}
                        </div>
                        <div className="text-[10px] text-gray-400 mt-0.5">
                          {isTodayEv ? 'Today · ' : ''}
                          {meta.label}
                        </div>
                      </div>
                    </button>
                  );
                })}
                {upcomingEvents.length > 8 && (
                  <p className="text-[10px] text-gray-400 text-center pt-2">
                    + {upcomingEvents.length - 8} more
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add event modal */}
      {showAddModal && canManage && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-md p-6 max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex justify-center mb-4 sm:hidden">
              <div className="w-10 h-1 bg-gray-200 rounded-full" />
            </div>
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Add event</h2>
            <form onSubmit={handleSaveEvent} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Title</label>
                <input
                  value={eventForm.title}
                  onChange={(e) => setEventForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
                <select
                  value={eventForm.type}
                  onChange={(e) => setEventForm((f) => ({ ...f, type: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="company_event">Company Event</option>
                  <option value="holiday">Holiday</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Date</label>
                  <input
                    type="date"
                    value={eventForm.date}
                    onChange={(e) => setEventForm((f) => ({ ...f, date: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">End date (optional)</label>
                  <input
                    type="date"
                    value={eventForm.endDate}
                    onChange={(e) => setEventForm((f) => ({ ...f, endDate: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Description</label>
                <textarea
                  value={eventForm.description}
                  onChange={(e) => setEventForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Color</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {COLOR_PRESETS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setEventForm((f) => ({ ...f, color: c }))}
                      className={`w-8 h-8 rounded-lg border-2 ${eventForm.color === c ? 'border-slate-800' : 'border-transparent'}`}
                      style={{ backgroundColor: c }}
                      aria-label={`Color ${c}`}
                    />
                  ))}
                </div>
                <input
                  type="color"
                  value={eventForm.color}
                  onChange={(e) => setEventForm((f) => ({ ...f, color: e.target.value }))}
                  className="h-10 w-full cursor-pointer"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 min-h-[44px] rounded-xl border border-slate-200 text-sm font-medium"
                >
                  Cancel
                </button>
                <button type="submit" className="flex-1 min-h-[44px] rounded-xl bg-[#1B6B6B] text-white text-sm font-medium">
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Event detail */}
      {selectedEvent && (
        <div className="fixed inset-0 z-[55] flex items-end sm:items-center justify-center sm:p-4" onClick={() => setSelectedEvent(null)} role="presentation">
          <div
            className="bg-white rounded-t-3xl sm:rounded-2xl shadow-xl w-full sm:max-w-sm p-5 border border-slate-100 mb-0 sm:mb-0"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal
          >
            <h3 className="font-semibold text-slate-900 text-base">{selectedEvent.title}</h3>
            <p className="text-xs text-slate-500 mt-1">{toDisplayDate(selectedEvent._day || selectedEvent.date)}</p>
            <span className={`inline-flex mt-2 text-xs px-2 py-1 rounded-full font-medium ${getEventStyle(selectedEvent.type)}`}>
              {selectedEvent.type?.replace('_', ' ')}
            </span>
            {selectedEvent.description ? <p className="text-sm text-slate-600 mt-3">{selectedEvent.description}</p> : null}
            {selectedEvent.type === 'birthday' && selectedEvent.employeeId && (
              <Link
                to={`/company/${companyId}/employees/${selectedEvent.employeeId}`}
                className="inline-block mt-3 text-sm text-[#1B6B6B] font-medium hover:underline"
              >
                View profile →
              </Link>
            )}
            {selectedEvent.type === 'leave' && selectedEvent.employeeId && (
              <button
                type="button"
                onClick={() => navigate(`/company/${companyId}/employees/${selectedEvent.employeeId}`)}
                className="mt-3 text-sm text-[#1B6B6B] font-medium hover:underline block text-left"
              >
                Open employee profile →
              </button>
            )}
            {selectedEvent.leaveType && <p className="text-xs text-slate-500 mt-2">Leave type: {selectedEvent.leaveType}</p>}
            {canManage && selectedEvent.type === 'company_event' && selectedEvent.source === 'firestore' && (
              <button
                type="button"
                disabled={deleting}
                onClick={handleDeleteEvent}
                className="mt-4 w-full min-h-[44px] rounded-xl border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Delete event'}
              </button>
            )}
            <button
              type="button"
              onClick={() => setSelectedEvent(null)}
              className="mt-3 w-full min-h-[44px] rounded-xl bg-slate-100 text-slate-700 text-sm font-medium"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
