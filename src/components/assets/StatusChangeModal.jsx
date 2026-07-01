import { STATUS_OPTIONS } from '../../utils/assetHelpers';

export default function StatusChangeModal({
  showStatusModal,
  setShowStatusModal,
  statusAsset,
  statusForm,
  setStatusForm,
  handleSaveStatusChange,
  saving,
}) {
  if (!showStatusModal || !statusAsset) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-xl w-full sm:max-w-md sm:my-8 p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-gray-800 mb-1">Change status</h2>
        <p className="text-xs text-gray-400 mb-4">{statusAsset.assetId} · {statusAsset.name} · Currently: <span className="font-medium text-gray-600">{statusAsset.status || 'Available'}</span></p>
        <form onSubmit={handleSaveStatusChange} className="space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">New status</label>
            <select value={statusForm.newStatus} onChange={(e) => setStatusForm((p) => ({ ...p, newStatus: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]" required>
              <option value="">Select status</option>
              {STATUS_OPTIONS.filter((s) => s !== 'All' && s !== (statusAsset.status || 'Available')).map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Reason (optional)</label>
            <textarea value={statusForm.reason} onChange={(e) => setStatusForm((p) => ({ ...p, reason: e.target.value }))} rows={2} placeholder="e.g. Sent for motherboard repair" className="w-full border rounded-xl px-3 py-2.5 text-sm resize-none" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowStatusModal(false)} className="text-sm text-gray-500" disabled={saving}>Cancel</button>
            <button type="submit" disabled={saving || !statusForm.newStatus} className="px-4 py-2 bg-[#1B6B6B] text-white rounded-xl text-sm font-medium hover:bg-[#155858] disabled:opacity-50">{saving ? 'Saving…' : 'Update status'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
