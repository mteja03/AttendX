const STATUS_STYLE = { Pending: 'bg-amber-100 text-amber-800', Approved: 'bg-green-100 text-green-800', Rejected: 'bg-red-100 text-red-800' };

export default function LeaveTab({ leaveList, leaveError, profilePaidLeaveTypes, leaveUsedByTypeProfile, leavePolicy, leaveTypePillClassResolved, getMaxLeaveForProfileType, toDisplayDate }) {
  return (
<div className="space-y-6">
  {leaveError && (
    <p className="text-red-500 text-sm text-center py-4">Error loading leave: {leaveError}</p>
  )}
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
    {profilePaidLeaveTypes.map((lt) => (
      <div key={lt.shortCode} className="bg-white rounded-xl border border-slate-200 p-4 text-center">
        <p className="text-slate-500 text-sm truncate" title={lt.name}>
          {lt.name}
          <span className="block text-xs font-mono text-[#1B6B6B] mt-0.5">{lt.shortCode}</span>
        </p>
        <p className="font-semibold text-slate-800">
          {leaveUsedByTypeProfile[lt.name] ?? 0} / {getMaxLeaveForProfileType(lt, leavePolicy)}
        </p>
      </div>
    ))}
  </div>
  {Array.isArray(leaveList) && leaveList.length > 0 ? (
    <div className="overflow-x-auto border border-slate-200 rounded-xl">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-4 py-2 text-left font-medium text-slate-600">Type</th>
            <th className="px-4 py-2 text-left font-medium text-slate-600">Start</th>
            <th className="px-4 py-2 text-left font-medium text-slate-600">End</th>
            <th className="px-4 py-2 text-left font-medium text-slate-600">Days</th>
            <th className="px-4 py-2 text-left font-medium text-slate-600">Reason</th>
            <th className="px-4 py-2 text-left font-medium text-slate-600">Status</th>
          </tr>
        </thead>
        <tbody>
          {leaveList.map((l) => (
            <tr key={l.id} className="border-t border-slate-100">
              <td className="px-4 py-2">
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${leaveTypePillClassResolved(l.leaveType)}`}
                >
                  {l.leaveType || '—'}
                </span>
              </td>
              <td className="px-4 py-2">{l.startDate ? toDisplayDate(l.startDate) : '—'}</td>
              <td className="px-4 py-2">{l.endDate ? toDisplayDate(l.endDate) : '—'}</td>
              <td className="px-4 py-2">{l.days ?? '—'}</td>
              <td className="px-4 py-2">{l.reason || '—'}</td>
              <td className="px-4 py-2">
                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[l.status] || 'bg-slate-100'}`}>
                  {l.status || '—'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <p className="text-center py-8 text-gray-400 text-sm">No leave records found</p>
  )}
</div>
  );
}
