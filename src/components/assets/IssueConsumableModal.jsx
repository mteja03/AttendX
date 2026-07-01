export default function IssueConsumableModal({
  showIssueModal,
  setShowIssueModal,
  issueAsset,
  employees,
  issueForm,
  setIssueForm,
  handleSaveIssueConsumable,
  saving,
}) {
  if (!showIssueModal || !issueAsset) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-xl w-full sm:max-w-md sm:my-8 p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-center mb-4 sm:hidden">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Issue Consumable</h2>
        <form onSubmit={handleSaveIssueConsumable} className="space-y-4">
          <div>
            <p className="text-sm text-slate-700">
              <span className="font-medium">{issueAsset.name || issueAsset.assetId}</span> · {issueAsset.type}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Available: {Number(issueAsset.availableStock) || 0}
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Employee</label>
            <select
              value={issueForm.employeeId}
              onChange={(e) => setIssueForm((p) => ({ ...p, employeeId: e.target.value }))}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]"
            >
              <option value="">Select employee</option>
              {employees
                .filter((e) => (e.status || 'Active') === 'Active')
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.fullName} ({e.empId})
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Quantity</label>
            <input
              type="number"
              min={1}
              max={Number(issueAsset.availableStock) || 0}
              value={issueForm.quantity}
              onChange={(e) => setIssueForm((p) => ({ ...p, quantity: e.target.value }))}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Issue Date</label>
            <input
              type="date"
              value={issueForm.issueDate}
              onChange={(e) => setIssueForm((p) => ({ ...p, issueDate: e.target.value }))}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Condition</label>
            <select
              value={issueForm.condition}
              onChange={(e) => setIssueForm((p) => ({ ...p, condition: e.target.value }))}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]"
            >
              <option value="New">New</option>
              <option value="Good">Good</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
            <textarea
              value={issueForm.notes}
              onChange={(e) => setIssueForm((p) => ({ ...p, notes: e.target.value }))}
              rows={3}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]"
              placeholder="Optional notes"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowIssueModal(false)}
              className="text-sm text-slate-500 hover:text-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-[#1B6B6B] hover:bg-[#155858] text-white text-sm font-medium px-4 py-2"
            >
              {saving ? 'Saving…' : 'Issue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
