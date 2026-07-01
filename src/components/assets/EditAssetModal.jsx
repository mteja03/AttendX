import { CONDITION_OPTIONS } from '../../utils/assetHelpers';

export default function EditAssetModal({
  showEditAssetModal,
  setShowEditAssetModal,
  editingAsset,
  editAssetForm,
  setEditAssetForm,
  handleSaveEditAsset,
  saving,
}) {
  if (!showEditAssetModal || !editingAsset) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-xl w-full sm:max-w-xl sm:my-8 p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-gray-800 mb-1">Edit Asset</h2>
        <p className="text-xs text-gray-400 mb-4">{editingAsset.assetId} · {editingAsset.type}</p>
        <form onSubmit={handleSaveEditAsset} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Asset name</label>
              <input value={editAssetForm.name} onChange={(e) => setEditAssetForm((p) => ({ ...p, name: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]" required />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Brand</label>
              <input value={editAssetForm.brand} onChange={(e) => setEditAssetForm((p) => ({ ...p, brand: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Model</label>
              <input value={editAssetForm.model} onChange={(e) => setEditAssetForm((p) => ({ ...p, model: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Serial number</label>
              <input value={editAssetForm.serialNumber} onChange={(e) => setEditAssetForm((p) => ({ ...p, serialNumber: e.target.value }))} className="w-full border rounded-xl px-3 py-2.5 text-sm font-mono" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Condition</label>
              <select value={editAssetForm.condition} onChange={(e) => setEditAssetForm((p) => ({ ...p, condition: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]">
                {CONDITION_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Purchase date</label>
              <input type="date" value={editAssetForm.purchaseDate} onChange={(e) => setEditAssetForm((p) => ({ ...p, purchaseDate: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Purchase price (₹)</label>
              <input type="number" value={editAssetForm.purchasePrice} onChange={(e) => setEditAssetForm((p) => ({ ...p, purchasePrice: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Warranty expiry</label>
              <input type="date" value={editAssetForm.warrantyExpiry} onChange={(e) => setEditAssetForm((p) => ({ ...p, warrantyExpiry: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Notes</label>
              <textarea value={editAssetForm.notes} onChange={(e) => setEditAssetForm((p) => ({ ...p, notes: e.target.value }))} rows={2} className="w-full border rounded-xl px-3 py-2.5 text-sm resize-none" />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowEditAssetModal(false)} className="text-sm text-gray-500" disabled={saving}>Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 bg-[#1B6B6B] text-white rounded-xl text-sm font-medium hover:bg-[#155858] disabled:opacity-50">{saving ? 'Saving…' : 'Save changes'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
