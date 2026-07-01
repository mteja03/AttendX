import EmployeeAvatar from '../EmployeeAvatar';
import { toDisplayDate } from '../../utils';

export default function ViewIssuedModal({
  showViewIssuedModal,
  setShowViewIssuedModal,
  issuedAsset,
  employees,
  openReturnConsumableModal,
}) {
  if (!showViewIssuedModal || !issuedAsset) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-xl w-full sm:max-w-lg sm:my-8 p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-center mb-4 sm:hidden">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Issued Consumables</h2>
        <p className="text-xs text-slate-500 mb-4">
          {issuedAsset.name || issuedAsset.assetId} · {issuedAsset.type}
        </p>

        <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
          {(issuedAsset.assignments || []).filter((a) => !a.returned).length === 0 ? (
            <p className="text-sm text-slate-500 p-4">No active issued items.</p>
          ) : (
            (issuedAsset.assignments || [])
              .map((assignment, idx) => ({ assignment, idx }))
              .filter(({ assignment }) => !assignment.returned)
              .map(({ assignment, idx }) => (
                <div key={idx} className="flex items-center gap-3 py-3 px-4">
                  <EmployeeAvatar
                    employee={{
                      fullName: assignment.employeeName,
                      photoURL: employees.find((e) => e.id === assignment.employeeId)?.photoURL,
                    }}
                    size="xs"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">
                      {assignment.employeeName}
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      {assignment.empId} · Qty: {assignment.quantity} ·{' '}
                      {assignment.issueDate ? toDisplayDate(assignment.issueDate) : '—'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openReturnConsumableModal(issuedAsset, assignment, idx)}
                    className="text-xs px-2.5 py-1 rounded-lg border text-gray-600 hover:bg-gray-50"
                  >
                    Return
                  </button>
                </div>
              ))
          )}
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <button
            type="button"
            onClick={() => setShowViewIssuedModal(false)}
            className="text-sm text-slate-500 hover:text-slate-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
