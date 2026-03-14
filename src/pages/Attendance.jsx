import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  collection,
  doc,
  getDocs,
  setDoc,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { useToast } from '../contexts/ToastContext';

const STATUS_OPTIONS = ['Present', 'Absent', 'Half Day', 'On Leave'];

function formatDateInput(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDisplay(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

export default function Attendance() {
  const { companyId } = useParams();
  const { success, error: showError } = useToast();
  const today = useMemo(() => formatDateInput(new Date()), []);
  const [selectedDate, setSelectedDate] = useState(today);
  const [employees, setEmployees] = useState([]);
  const [attendanceDocs, setAttendanceDocs] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [monthView, setMonthView] = useState(false);
  const [monthYear, setMonthYear] = useState(() => {
    const d = new Date();
    return { month: d.getMonth(), year: d.getFullYear() };
  });

  const dateStr = selectedDate;

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [empSnap, attSnap] = await Promise.all([
          getDocs(collection(db, 'companies', companyId, 'employees')),
          getDocs(query(collection(db, 'companies', companyId, 'attendance'), where('date', '==', dateStr))),
        ]);
        if (cancelled) return;
        const emps = empSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((e) => (e.status || 'Active') !== 'Inactive');
        const docs = attSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setEmployees(emps);
        setAttendanceDocs(docs);
        const byEmp = Object.fromEntries(docs.map((d) => [d.employeeId, d.status]));
        setRows(emps.map((emp) => ({
          employeeId: emp.id,
          employeeName: emp.fullName,
          department: emp.department,
          status: byEmp[emp.id] ?? 'Present',
        })));
      } catch (err) {
        showError('Failed to load attendance');
      }
      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [companyId, dateStr, showError]);

  const summary = useMemo(() => {
    const s = { Present: 0, Absent: 0, 'Half Day': 0, 'On Leave': 0 };
    rows.forEach((r) => { s[r.status] = (s[r.status] || 0) + 1; });
    return s;
  }, [rows]);

  const setRowStatus = (employeeId, status) => {
    setRows((prev) => prev.map((r) => (r.employeeId === employeeId ? { ...r, status } : r)));
  };

  const markAllPresent = () => {
    setRows((prev) => prev.map((r) => ({ ...r, status: 'Present' })));
  };

  const saveAttendance = async () => {
    setSaving(true);
    try {
      const batch = rows.map((r) => {
        const docId = `${dateStr}_${r.employeeId}`;
        return setDoc(doc(db, 'companies', companyId, 'attendance', docId), {
          date: dateStr,
          employeeId: r.employeeId,
          status: r.status,
          updatedAt: new Date(),
        });
      });
      await Promise.all(batch);
      setAttendanceDocs(rows.map((r) => ({ date: dateStr, employeeId: r.employeeId, status: r.status })));
      success('Saved!');
    } catch (err) {
      showError('Failed to save attendance');
    }
    setSaving(false);
  };

  const daysInMonth = useMemo(() => {
    const d = new Date(monthYear.year, monthYear.month + 1, 0);
    return d.getDate();
  }, [monthYear]);

  const firstDay = useMemo(() => {
    return new Date(monthYear.year, monthYear.month, 1).getDay();
  }, [monthYear]);

  if (!companyId) return null;

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-800">Attendance</h1>
        <p className="text-slate-500 mt-1">Daily attendance</p>
      </div>

      <div className="flex flex-wrap items-center gap-4 mb-6">
        <label className="flex items-center gap-2">
          <span className="text-sm text-slate-600">Date (DD/MM/YYYY)</span>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD]"
          />
        </label>
        <span className="text-slate-500 text-sm">{formatDisplay(selectedDate)}</span>
        <button
          type="button"
          onClick={() => setMonthView(!monthView)}
          className="text-sm font-medium text-[#378ADD] hover:underline"
        >
          {monthView ? 'Daily view' : 'Monthly view'}
        </button>
      </div>

      {monthView && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-slate-800">
              {new Date(monthYear.year, monthYear.month).toLocaleString('default', { month: 'long', year: 'numeric' })}
            </h3>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMonthYear((m) => (m.month === 0 ? { month: 11, year: m.year - 1 } : { month: m.month - 1, year: m.year }))}
                className="rounded border border-slate-300 px-2 py-1 text-sm"
              >
                Prev
              </button>
              <button
                type="button"
                onClick={() => setMonthYear((m) => (m.month === 11 ? { month: 0, year: m.year + 1 } : { month: m.month + 1, year: m.year }))}
                className="rounded border border-slate-300 px-2 py-1 text-sm"
              >
                Next
              </button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-sm">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="font-medium text-slate-500 py-1">{d}</div>
            ))}
            {Array.from({ length: firstDay }, (_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1;
              const dateStrCell = `${monthYear.year}-${String(monthYear.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const isSelected = dateStrCell === selectedDate;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => { setSelectedDate(dateStrCell); setMonthView(false); }}
                  className={`py-2 rounded ${isSelected ? 'bg-[#378ADD] text-white' : 'hover:bg-slate-100'} text-slate-700`}
                >
                  {day}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-slate-500 mt-2">Click a date to mark attendance for that day.</p>
        </div>
      )}

      {!monthView && (
        <>
          <div className="flex flex-wrap gap-4 mb-4 p-3 bg-slate-50 rounded-lg">
            <span className="text-sm font-medium text-slate-700">Present: {summary.Present || 0}</span>
            <span className="text-sm font-medium text-slate-700">Absent: {summary.Absent || 0}</span>
            <span className="text-sm font-medium text-slate-700">Half Day: {summary['Half Day'] || 0}</span>
            <span className="text-sm font-medium text-slate-700">On Leave: {summary['On Leave'] || 0}</span>
          </div>

          <div className="flex gap-3 mb-4">
            <button
              type="button"
              onClick={markAllPresent}
              className="rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium px-4 py-2"
            >
              Mark All Present
            </button>
            <button
              type="button"
              onClick={saveAttendance}
              disabled={saving || rows.length === 0}
              className="rounded-lg bg-[#378ADD] hover:bg-[#2a7bc7] text-white text-sm font-medium px-4 py-2 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save Attendance'}
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#378ADD] border-t-transparent" />
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Employee</th>
                    <th className="px-4 py-3 text-left font-medium">Department</th>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.employeeId} className="border-t border-slate-100">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-medium text-slate-600">
                            {(r.employeeName || '?').slice(0, 2).toUpperCase()}
                          </div>
                          <span className="font-medium text-slate-800">{r.employeeName || '—'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{r.department || '—'}</td>
                      <td className="px-4 py-3">
                        <select
                          value={r.status}
                          onChange={(e) => setRowStatus(r.employeeId, e.target.value)}
                          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:ring-1 focus:ring-[#378ADD]"
                        >
                          {STATUS_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td className="px-4 py-8 text-center text-slate-500" colSpan={3}>
                        No employees. Add employees first.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
