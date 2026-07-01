export default function ReturnConsumableModal({
  showReturnConsumableModal,
  setShowReturnConsumableModal,
  returnConsumableAsset,
  returnConsumableAssignment,
  returnConsumableForm,
  setReturnConsumableForm,
  handleSaveReturnConsumable,
  saving,
}) {
  if (!showReturnConsumableModal || !returnConsumableAsset || !returnConsumableAssignment) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-xl w-full sm:max-w-md sm:my-8 p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-center mb-4 sm:hidden">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Return Consumable</h2>
        <form onSubmit={handleSaveReturnConsumable} className="space-y-4">
          <div>
            <p className="text-sm text-slate-700">
              <span className="font-medium">{returnConsumableAsset.name || returnConsumableAsset.assetId}</span> ·{' '}
              {returnConsumableAsset.type}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Assigned to {returnConsumableAssignment.employeeName} · Available for return: {Number(returnConsumableAssignment.quantity) || 0}
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Quantity to return</label>
            <input
              type="number"
              min={1}
              max={Number(returnConsumableAssignment.quantity) || 0}
              value={returnConsumableForm.quantity}
              onChange={(e) => setReturnConsumableForm((p) => ({ ...p, quantity: e.target.value }))}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Return Date</label>
            <input
              type="date"
              value={returnConsumableForm.date}
              onChange={(e) => setReturnConsumableForm((p) => ({ ...p, date: e.target.value }))}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Condition on return</label>
            <select
              value={returnConsumableForm.condition}
              onChange={(e) => setReturnConsumableForm((p) => ({ ...p, condition: e.target.value }))}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]"
            >
              <option value="New">New</option>
              <option value="Good">Good</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
            <textarea
              value={returnConsumableForm.notes}
              onChange={(e) => setReturnConsumableForm((p) => ({ ...p, notes: e.target.value }))}
              rows={3}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]"
              placeholder="Any damage or notes on return"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowReturnConsumableModal(false)}
              className="text-sm text-slate-500 hover:text-slate-700"
            >
              Cancel
            </button>
            <button type="submit" className="rounded-lg bg-[#1B6B6B] text-white text-sm font-medium px-4 py-2">
              {saving ? 'Saving…' : 'Return'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
