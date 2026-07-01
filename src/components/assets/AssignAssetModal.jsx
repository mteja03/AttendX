import { CONDITION_OPTIONS } from '../../utils/assetHelpers';

export default function AssignAssetModal({
  showAssignModal,
  setShowAssignModal,
  selectedAsset,
  assets,
  employees,
  assignForm,
  handleAssignChange,
  handleSaveAssignment,
  saving,
}) {
  if (!showAssignModal) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-xl w-full sm:max-w-lg sm:my-8 p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-center mb-4 sm:hidden">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Assign Asset</h2>
        <form onSubmit={handleSaveAssignment} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Asset</label>
            <select
              name="assetId"
              value={assignForm.assetId}
              onChange={handleAssignChange}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]"
              disabled={!!selectedAsset}
            >
              {!selectedAsset && <option value="">Select asset</option>}
              {assets
                .filter((a) => !selectedAsset && (a.status === 'Available' || !a.status))
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.assetId} · {a.name}
                  </option>
                ))}
              {selectedAsset && (
                <option value={selectedAsset.id}>
                  {selectedAsset.assetId} · {selectedAsset.name}
                </option>
              )}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Employee</label>
            <select
              name="employeeId"
              value={assignForm.employeeId}
              onChange={handleAssignChange}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]"
            >
              <option value="">Select employee</option>
              {employees
                .filter((e) => (e.status || 'Active') === 'Active')
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.empId || ''} · {e.fullName || e.email}
                  </option>
                ))}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Issue Date</label>
              <input
                type="date"
                name="issueDate"
                value={assignForm.issueDate}
                onChange={handleAssignChange}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Expected Return Date <span className="text-gray-400 font-normal">(optional)</span></label>
              <input
                type="date"
                name="expectedReturnDate"
                value={assignForm.expectedReturnDate}
                onChange={handleAssignChange}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Condition at Issue</label>
              <select
                name="condition"
                value={assignForm.condition}
                onChange={handleAssignChange}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]"
              >
                {CONDITION_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
            <textarea
              name="notes"
              value={assignForm.notes}
              onChange={handleAssignChange}
              rows={3}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]"
              placeholder="Any special instructions or comments"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowAssignModal(false)}
              className="text-sm text-slate-500 hover:text-slate-700"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-[#1B6B6B] hover:bg-[#155858] text-white text-sm font-medium px-4 py-2 disabled:opacity-50"
              disabled={saving}
            >
              {saving ? 'Assigning…' : 'Assign Asset'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
