import { CONDITION_OPTIONS } from '../../utils/assetHelpers';

export default function ReturnAssetModal({
  showReturnModal,
  setShowReturnModal,
  selectedAsset,
  returnForm,
  handleReturnChange,
  handleSaveReturn,
  saving,
}) {
  if (!showReturnModal || !selectedAsset) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-xl w-full sm:max-w-lg sm:my-8 p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-center mb-4 sm:hidden">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Return Asset</h2>
        <form onSubmit={handleSaveReturn} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-slate-500">Asset</p>
              <p className="text-sm font-medium text-slate-800">
                {selectedAsset.assetId} · {selectedAsset.name}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Employee</p>
              <p className="text-sm text-slate-800">
                {selectedAsset.assignedToName || '—'}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Return Date</label>
              <input
                type="date"
                name="date"
                value={returnForm.date}
                onChange={handleReturnChange}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Condition on Return</label>
              <select
                name="condition"
                value={returnForm.condition}
                onChange={handleReturnChange}
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
              value={returnForm.notes}
              onChange={handleReturnChange}
              rows={3}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]"
              placeholder="Any damage or notes on return"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowReturnModal(false)}
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
              {saving ? 'Saving…' : 'Save Return'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
