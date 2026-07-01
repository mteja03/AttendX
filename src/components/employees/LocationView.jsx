import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import EmployeeAvatar from '../EmployeeAvatar';
import StatusBadge from './StatusBadge';

export default function LocationView({ filtered, companyId }) {
  const navigate = useNavigate();
  const [locationDrill, setLocationDrill] = useState(null);
  const [expandedBranches, setExpandedBranches] = useState(new Set());

  return (
    <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
      {!locationDrill ? (
        <>
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">All locations</p>
            <p className="text-xs text-gray-400">{(() => { const locs = new Set(filtered.map((e) => e.location).filter(Boolean)); return `${locs.size} location${locs.size !== 1 ? 's' : ''}`; })()}</p>
          </div>
          <div className="divide-y divide-gray-50">
            {(() => {
              const locMap = {};
              filtered.forEach((e) => {
                const loc = e.location || '—';
                if (!locMap[loc]) locMap[loc] = [];
                locMap[loc].push(e);
              });
              return Object.entries(locMap).sort((a, b) => a[0].localeCompare(b[0])).map(([loc, emps]) => {
                const branchSet = new Set(emps.map((e) => e.branch).filter(Boolean));
                return (
                  <div key={loc} className="flex items-center gap-3 px-5 py-3 hover:bg-[#E8F5F5]/30 cursor-pointer transition-colors" onClick={() => { setLocationDrill(loc); setExpandedBranches(new Set()); }}>
                    <div className="w-9 h-9 rounded-xl bg-[#E1F5EE] flex items-center justify-center flex-shrink-0">
                      <span className="text-sm">📍</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800">{loc}</p>
                      <p className="text-[10px] text-gray-400">{branchSet.size} branch{branchSet.size !== 1 ? 'es' : ''}</p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="text-right">
                        <p className="text-sm font-semibold text-gray-800">{emps.length}</p>
                        <p className="text-[10px] text-gray-400">employees</p>
                      </div>
                      <span className="text-gray-300 text-xs">›</span>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 text-xs">
            <button type="button" onClick={() => { setLocationDrill(null); setExpandedBranches(new Set()); }} className="text-[#1B6B6B] font-medium hover:underline">All locations</button>
            <span className="text-gray-300">›</span>
            <span className="text-gray-700 font-medium">{locationDrill}</span>
            <span className="ml-auto text-gray-400">{filtered.filter((e) => (e.location || '—') === locationDrill).length} employees</span>
          </div>
          <div>
            {(() => {
              const locEmps = filtered.filter((e) => (e.location || '—') === locationDrill);
              const branchMap = {};
              locEmps.forEach((e) => {
                const br = e.branch || '—';
                if (!branchMap[br]) branchMap[br] = [];
                branchMap[br].push(e);
              });
              return Object.entries(branchMap).sort((a, b) => a[0].localeCompare(b[0])).map(([br, emps]) => (
                <div key={br}>
                  <button
                    type="button"
                    onClick={() => setExpandedBranches((prev) => {
                      const next = new Set(prev);
                      if (next.has(br)) next.delete(br);
                      else next.add(br);
                      return next;
                    })}
                    className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-100 w-full text-left hover:bg-gray-100 transition-colors min-h-[44px]"
                  >
                    <svg
                      className={`w-3.5 h-3.5 text-gray-400 transition-transform ${expandedBranches.has(br) ? 'rotate-90' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                    <span className="text-xs">🏢</span>
                    <p className="text-xs font-semibold text-gray-600">{br}</p>
                    <span className="text-[10px] text-gray-400 ml-auto">{emps.length} employee{emps.length !== 1 ? 's' : ''}</span>
                  </button>
                  {expandedBranches.has(br) && <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-xs">Emp ID</th>
                        <th className="px-3 py-2 text-left font-medium text-xs">Name + Email</th>
                        <th className="px-3 py-2 text-left font-medium text-xs">Phone</th>
                        <th className="px-3 py-2 text-left font-medium text-xs">Designation</th>
                        <th className="px-3 py-2 text-left font-medium text-xs">Department</th>
                        <th className="px-3 py-2 text-left font-medium text-xs">Status</th>
                        <th className="px-3 py-2 text-right font-medium text-xs">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {emps.map((emp) => (
                        <tr key={emp.id} className="border-t border-slate-100 cursor-pointer hover:bg-slate-50 transition-all" onClick={() => navigate(`/company/${companyId}/employees/${emp.id}`)}>
                          <td className="px-3 py-2.5 font-mono text-slate-700 text-xs">{emp.empId || '—'}</td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2.5">
                              <EmployeeAvatar employee={emp} size="sm" />
                              <div className="min-w-0">
                                <p className="text-xs font-medium text-slate-800 truncate">{emp.fullName || '—'}</p>
                                <p className="text-[10px] text-slate-500 truncate">{emp.email || '—'}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-slate-700 text-xs">{emp.phone || '—'}</td>
                          <td className="px-3 py-2.5 text-slate-700 text-xs">{emp.designation || '—'}</td>
                          <td className="px-3 py-2.5 text-slate-700 text-xs">{emp.department || '—'}</td>
                          <td className="px-3 py-2.5"><StatusBadge status={emp.status || 'Active'} /></td>
                          <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                            <button type="button" onClick={() => navigate(`/company/${companyId}/employees/${emp.id}`)} className="text-[#1B6B6B] text-xs font-medium hover:underline">View</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>}
                </div>
              ));
            })()}
          </div>
        </>
      )}
    </div>
  );
}
