export default function EditStockModal({
  showEditStockModal,
  setShowEditStockModal,
  editStockAsset,
  editStockForm,
  setEditStockForm,
  handleSaveEditStock,
  saving,
}) {
  if (!showEditStockModal || !editStockAsset) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-xl w-full sm:max-w-md sm:my-8 p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-center mb-4 sm:hidden">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Edit Stock</h2>
        <form onSubmit={handleSaveEditStock} className="space-y-4">
          <div>
            <p className="text-sm text-slate-700">
              <span className="font-medium">{editStockAsset.name || editStockAsset.assetId}</span> · {editStockAsset.type}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Current: {Number(editStockAsset.availableStock) || 0} / {Number(editStockAsset.totalStock) || 0} available
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Adjustment</label>
            <select
              value={editStockForm.adjustmentType}
              onChange={(e) => setEditStockForm((p) => ({ ...p, adjustmentType: e.target.value }))}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]"
            >
              <option value="Add stock">Add stock</option>
              <option value="Remove stock">Remove stock</option>
              <option value="Set total">Set total</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Quantity</label>
            <input
              type="number"
              min={0}
              value={editStockForm.quantity}
              onChange={(e) => setEditStockForm((p) => ({ ...p, quantity: e.target.value }))}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]"
              placeholder="e.g. 10"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Reason</label>
            <input
              value={editStockForm.reason}
              onChange={(e) => setEditStockForm((p) => ({ ...p, reason: e.target.value }))}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]"
              placeholder="e.g. New purchase"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowEditStockModal(false)} className="text-sm text-slate-500 hover:text-slate-700">
              Cancel
            </button>
            <button type="submit" className="rounded-lg bg-[#1B6B6B] text-white text-sm font-medium px-4 py-2">
              {saving ? 'Saving…' : 'Save Stock'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
