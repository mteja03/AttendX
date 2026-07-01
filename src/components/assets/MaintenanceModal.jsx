export default function MaintenanceModal({
  showMaintenanceModal,
  setShowMaintenanceModal,
  maintenanceAsset,
  maintenanceForm,
  setMaintenanceForm,
  handleSaveMaintenance,
  saving,
}) {
  if (!showMaintenanceModal || !maintenanceAsset) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-xl w-full sm:max-w-lg sm:my-8 p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-gray-800 mb-1">Log Maintenance</h2>
        <p className="text-xs text-gray-400 mb-4">{maintenanceAsset.assetId} · {maintenanceAsset.name}</p>
        <form onSubmit={handleSaveMaintenance} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Type</label>
              <select value={maintenanceForm.type} onChange={(e) => setMaintenanceForm((p) => ({ ...p, type: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]">
                <option value="Repair">Repair</option>
                <option value="Service">Service</option>
                <option value="Inspection">Inspection</option>
                <option value="Insurance Renewal">Insurance Renewal</option>
                <option value="Upgrade">Upgrade</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Date</label>
              <input type="date" value={maintenanceForm.date} onChange={(e) => setMaintenanceForm((p) => ({ ...p, date: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Description</label>
              <textarea value={maintenanceForm.description} onChange={(e) => setMaintenanceForm((p) => ({ ...p, description: e.target.value }))} rows={2} placeholder="e.g. Replaced RAM, cleaned thermal paste" className="w-full border rounded-xl px-3 py-2.5 text-sm resize-none" required />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Cost (₹)</label>
              <input type="number" value={maintenanceForm.cost} onChange={(e) => setMaintenanceForm((p) => ({ ...p, cost: e.target.value }))} placeholder="0" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Vendor / Service centre</label>
              <input value={maintenanceForm.vendor} onChange={(e) => setMaintenanceForm((p) => ({ ...p, vendor: e.target.value }))} placeholder="e.g. Dell Care" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Next service due <span className="text-gray-400 font-normal">(optional)</span></label>
              <input type="date" value={maintenanceForm.nextDueDate} onChange={(e) => setMaintenanceForm((p) => ({ ...p, nextDueDate: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]" />
            </div>
          </div>
          {maintenanceForm.type === 'Repair' && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
              <p className="text-xs text-amber-700">Asset status will be set to <strong>In Repair</strong> automatically.</p>
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowMaintenanceModal(false)} className="text-sm text-gray-500" disabled={saving}>Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 bg-[#1B6B6B] text-white rounded-xl text-sm font-medium hover:bg-[#155858] disabled:opacity-50">{saving ? 'Saving…' : 'Log maintenance'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
