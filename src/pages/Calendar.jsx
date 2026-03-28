import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  serverTimestamp,
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

export default function Calendar() {
  const { companyId } = useParams();
  const navigate = useNavigate();
  const { currentUser, role } = useAuth();
  const { success, error: showError } = useToast();
  const canManage = role === 'admin' || role === 'hrmanager';

  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [fsEvents, setFsEvents] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [leaveList, setLeaveList] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [deleting, setDeleting] = useState(false);

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
        console.error(e);
      }
    })();
  }, [companyId, seedHolidaysIfNeeded]);

  useEffect(() => {
    if (!companyId) return () => {};
    const unsub = onSnapshot(collection(db, 'companies', companyId, 'events'), (snap) => {
      setFsEvents(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return () => {};
    const unsub = onSnapshot(collection(db, 'companies', companyId, 'employees'), (snap) => {
      setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return () => {};
    const unsub = onSnapshot(collection(db, 'companies', companyId, 'leave'), (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setLeaveList(rows.filter((l) => l.status === 'Approved'));
    });
    return unsub;
  }, [companyId]);

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

    leaveList.forEach((leave) => {
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
  }, [fsEvents, employees, leaveList, viewYear]);

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

  const goToday = () => {
    const t = new Date();
    setViewYear(t.getFullYear());
    setViewMonth(t.getMonth());
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
      console.error(err);
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
      console.error(err);
      showError('Failed to delete');
    }
    setDeleting(false);
  };

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  const miniMonths = useMemo(() => {
    const out = [];
    for (let i = -1; i <= 1; i++) {
      const d = new Date(viewYear, viewMonth + i, 1);
      out.push({ y: d.getFullYear(), m: d.getMonth(), label: d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) });
    }
    return out;
  }, [viewYear, viewMonth]);

  if (!companyId) return null;

  return (
    <div className="p-4 sm:p-8">
      <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Calendar</h1>
          <p className="text-sm text-gray-500 mt-1">Holidays, events, birthdays, leave & anniversaries</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 border border-slate-200 rounded-xl px-2 py-1 bg-white">
            <button type="button" onClick={() => shiftMonth(-1)} className="min-h-[44px] min-w-[40px] text-slate-600" aria-label="Previous month">
              ‹
            </button>
            <span className="text-sm font-medium text-slate-800 min-w-[140px] text-center capitalize">{monthLabel}</span>
            <button type="button" onClick={() => shiftMonth(1)} className="min-h-[44px] min-w-[40px] text-slate-600" aria-label="Next month">
              ›
            </button>
          </div>
          <button
            type="button"
            onClick={goToday}
            className="min-h-[44px] px-4 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Today
          </button>
          {canManage && (
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="min-h-[44px] px-4 rounded-xl bg-[#1B6B6B] text-white text-sm font-medium hover:bg-[#155858]"
            >
              + Add Event
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-slate-600 mb-4">
        <span>
          <span className="inline-block w-2 h-2 rounded-full bg-red-400 mr-1" />
          Holidays
        </span>
        <span>
          <span className="inline-block w-2 h-2 rounded-full bg-blue-400 mr-1" />
          Company Events
        </span>
        <span>
          <span className="inline-block w-2 h-2 rounded-full bg-green-400 mr-1" />
          Birthdays
        </span>
        <span>
          <span className="inline-block w-2 h-2 rounded-full bg-amber-400 mr-1" />
          On Leave
        </span>
        <span>
          <span className="inline-block w-2 h-2 rounded-full bg-purple-400 mr-1" />
          Anniversaries
        </span>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1 min-w-0 bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50">
            {WEEKDAYS.map((d) => (
              <div key={d} className="text-center text-xs font-semibold text-slate-500 py-2">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {calendarDays.map(({ date, currentMonth: isCurrentMonth }, idx) => {
              const k = dateKey(date);
              const dayEvents = eventsByDay[k] || [];
              const t = new Date();
              const isToday =
                date.getDate() === t.getDate() && date.getMonth() === t.getMonth() && date.getFullYear() === t.getFullYear();

              return (
                <div
                  key={`${k}-${idx}`}
                  className={`min-h-[96px] sm:min-h-24 p-1.5 border-b border-r border-gray-100 relative ${
                    isToday ? 'bg-[#E8F5F5]' : isCurrentMonth ? 'bg-white' : 'bg-gray-50'
                  }`}
                >
                  <span
                    className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full mb-1 ${
                      isToday ? 'bg-[#1B6B6B] text-white' : isCurrentMonth ? 'text-gray-700' : 'text-gray-300'
                    }`}
                  >
                    {date.getDate()}
                  </span>
                  {dayEvents.slice(0, 3).map((ev) => (
                    <div
                      key={ev.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedEvent(ev)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') setSelectedEvent(ev);
                      }}
                      className={`text-[10px] sm:text-xs px-1.5 py-0.5 rounded-md mb-0.5 truncate cursor-pointer font-medium ${getEventStyle(ev.type)}`}
                    >
                      {ev.title}
                    </div>
                  ))}
                  {dayEvents.length > 3 && (
                    <span className="text-[10px] text-gray-400">+{dayEvents.length - 3} more</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="hidden lg:block w-56 shrink-0 space-y-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Quick nav</p>
          {miniMonths.map((mm) => (
            <button
              key={`${mm.y}-${mm.m}`}
              type="button"
              onClick={() => {
                setViewYear(mm.y);
                setViewMonth(mm.m);
              }}
              className={`w-full text-left text-sm px-3 py-2 rounded-xl border ${
                mm.y === viewYear && mm.m === viewMonth ? 'border-[#1B6B6B] bg-[#E8F5F5] text-[#1B6B6B]' : 'border-slate-100 hover:bg-slate-50'
              }`}
            >
              {mm.label}
            </button>
          ))}
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
