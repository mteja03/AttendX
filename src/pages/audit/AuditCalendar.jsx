import { useState } from 'react';
import { effStatus, STATUS_COLORS } from './auditHelpers';

export default function AuditCalendar({ audits, onClose, onSelectAudit }) {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const auditsByDate = {};
  audits.forEach((audit) => {
    if (audit.startDate) {
      const key = audit.startDate;
      if (!auditsByDate[key]) auditsByDate[key] = [];
      auditsByDate[key].push({ ...audit, dateType: 'start' });
    }
    const endKey = audit.endDate || audit.dueDate;
    if (endKey) {
      if (!auditsByDate[endKey]) auditsByDate[endKey] = [];
      if (!auditsByDate[endKey].find((a) => a.id === audit.id)) {
        auditsByDate[endKey].push({ ...audit, dateType: 'end' });
      }
    }
  });

  const getDayKey = (day) => {
    const m = String(month + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return `${year}-${m}-${d}`;
  };

  const selectedDayAudits = selectedDay ? auditsByDate[getDayKey(selectedDay)] || [] : [];

  const prevMonth = () => { setCurrentDate(new Date(year, month - 1)); setSelectedDay(null); };
  const nextMonth = () => { setCurrentDate(new Date(year, month + 1)); setSelectedDay(null); };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} role="presentation" />
      <div className="relative bg-white w-full max-w-lg h-full flex flex-col shadow-sm">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-[#E8F5F5] rounded-xl flex items-center justify-center text-lg">📅</div>
            <div>
              <h2 className="text-base font-semibold text-gray-800">Audit Calendar</h2>
              <p className="text-xs text-gray-400">{audits.length} audits scheduled</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 text-lg">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="flex items-center justify-between mb-5">
            <button type="button" onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-600">←</button>
            <h3 className="text-sm font-semibold text-gray-800">{monthNames[month]} {year}</h3>
            <button type="button" onClick={nextMonth} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-600">→</button>
          </div>

          <div className="grid grid-cols-7 mb-2">
            {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d) => (
              <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: firstDay }).map((_, i) => <div key={`empty-${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const key = getDayKey(day);
              const dayAudits = auditsByDate[key] || [];
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const isToday = today.getTime() === new Date(year, month, day).setHours(0, 0, 0, 0);
              const isSelected = selectedDay === day;
              const hasOverdue = dayAudits.some((a) => {
                const t = new Date(); t.setHours(0, 0, 0, 0);
                return a.dateType === 'end' && effStatus(a.status) !== 'Closed' && new Date(key) < t;
              });
              return (
                <div
                  key={day}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedDay(selectedDay === day ? null : day)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedDay(selectedDay === day ? null : day); }}
                  className={`relative min-h-[44px] aspect-square flex flex-col items-center justify-start pt-1.5 rounded-xl cursor-pointer transition-all ${isSelected ? 'bg-[#1B6B6B] text-white' : isToday ? 'bg-[#E8F5F5] text-[#1B6B6B]' : 'hover:bg-gray-50'}`}
                >
                  <span className={`text-xs font-medium ${isSelected ? 'text-white' : isToday ? 'text-[#1B6B6B]' : 'text-gray-700'}`}>{day}</span>
                  {dayAudits.length > 0 && (
                    <div className="flex gap-0.5 mt-1 flex-wrap justify-center max-w-full px-1">
                      {dayAudits.slice(0, 3).map((a, idx) => (
                        <div key={idx} className="w-2 h-2 sm:w-1.5 sm:h-1.5 rounded-full flex-shrink-0"
                          style={{ background: isSelected ? 'white' : hasOverdue && a.dateType === 'end' ? '#EF4444' : a.auditTypeColor || '#8B5CF6' }} />
                      ))}
                      {dayAudits.length > 3 && <span className={`text-xs leading-none ${isSelected ? 'text-white/70' : 'text-gray-400'}`}>+{dayAudits.length - 3}</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-4 mt-4 pt-4 border-t border-gray-100 flex-wrap">
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-[#1B6B6B]" /><span className="text-xs text-gray-400">Start date</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-[#8B5CF6]" /><span className="text-xs text-gray-400">End date</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-red-500" /><span className="text-xs text-gray-400">Overdue</span></div>
          </div>

          {selectedDay && (
            <div className="mt-5 pt-5 border-t border-gray-100">
              <h4 className="text-sm font-semibold text-gray-700 mb-3">
                {monthNames[month]} {selectedDay}
                {selectedDayAudits.length === 0 ? ' — No audits' : ` — ${selectedDayAudits.length} audit${selectedDayAudits.length !== 1 ? 's' : ''}`}
              </h4>
              {selectedDayAudits.length === 0 ? (
                <div className="text-center py-6 border-2 border-dashed border-gray-100 rounded-xl">
                  <p className="text-xs text-gray-400">No audits on this date</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedDayAudits.map((audit, idx) => {
                    const today = new Date(); today.setHours(0, 0, 0, 0);
                    const overdueAudit = audit.dateType === 'end' && effStatus(audit.status) !== 'Closed' && new Date(getDayKey(selectedDay)) < today;
                    return (
                      <div
                        key={`${audit.id}-${audit.dateType}-${idx}`}
                        role="button"
                        tabIndex={0}
                        className={`p-3 rounded-xl border cursor-pointer hover:shadow-sm transition-all ${overdueAudit ? 'bg-red-50 border-red-100' : 'bg-white border-gray-100 hover:border-gray-200'}`}
                        onClick={() => onSelectAudit(audit)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelectAudit(audit); }}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-xl text-xs font-bold text-white" style={{ background: audit.auditTypeColor || '#8B5CF6' }}>
                            {audit.auditTypeName?.charAt(0)}
                          </div>
                          <p className="text-sm font-medium text-gray-800 flex-1 truncate">{audit.auditTypeName}</p>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${overdueAudit ? 'bg-red-100 text-red-700' : STATUS_COLORS[effStatus(audit.status)] || STATUS_COLORS.Assigned}`}>
                            {effStatus(audit.status)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap ml-8">
                          {audit.auditRefId && <span className="text-xs font-mono text-gray-400">{audit.auditRefId}</span>}
                          {audit.branch && <span className="text-xs text-gray-400">🏢 {audit.branch}</span>}
                          {audit.auditorName && <span className="text-xs text-gray-400">· 👤 {audit.auditorName}</span>}
                          <span className={`text-xs font-medium ${audit.dateType === 'start' ? 'text-[#1B6B6B]' : overdueAudit ? 'text-red-600' : 'text-gray-500'}`}>
                            · {audit.dateType === 'start' ? '▶ Starts' : overdueAudit ? '⚠️ Was due' : '⏹ Ends'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="mt-5 pt-5 border-t border-gray-100">
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">This Month</h4>
            {(() => {
              const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
              const monthAudits = audits.filter((a) =>
                (a.startDate || '').startsWith(monthKey) ||
                (a.endDate || '').startsWith(monthKey) ||
                (a.dueDate || '').startsWith(monthKey),
              );
              if (monthAudits.length === 0) return <p className="text-xs text-gray-400 text-center py-3">No audits this month</p>;
              return (
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'In month', value: monthAudits.length, color: 'text-gray-700' },
                    { label: 'Active', value: monthAudits.filter((a) => effStatus(a.status) !== 'Closed').length, color: 'text-blue-600' },
                    { label: 'Closed', value: monthAudits.filter((a) => effStatus(a.status) === 'Closed').length, color: 'text-green-600' },
                  ].map((stat) => (
                    <div key={stat.label} className="bg-gray-50 rounded-xl p-3 text-center">
                      <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{stat.label}</p>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}
