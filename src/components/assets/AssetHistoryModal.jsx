import { toDisplayDate } from '../../utils';

export default function AssetHistoryModal({
  showHistoryModal,
  setShowHistoryModal,
  selectedAsset,
}) {
  if (!showHistoryModal || !selectedAsset) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-xl w-full sm:max-w-xl sm:my-8 p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-center mb-4 sm:hidden">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>
        <h2 className="text-lg font-semibold text-slate-800 mb-2">Asset History</h2>
        <p className="text-xs text-slate-500 mb-4">
          {selectedAsset.assetId} · {selectedAsset.name}
        </p>
        <div className="space-y-3">
          {(selectedAsset.history || [])
            .slice()
            .sort((a, b) => (a.date?.seconds || 0) - (b.date?.seconds || 0))
            .map((h, idx) => {
              const dateStr = h.date ? toDisplayDate(h.date) : '—';
              let badgeClass = 'bg-slate-100 text-slate-700';
              let label = h.action;
              if (h.action === 'issued') {
                badgeClass = 'bg-green-100 text-green-700';
                label = 'Issued';
              } else
              if (h.action === 'assigned') {
                badgeClass = 'bg-green-100 text-green-700';
                label = 'Assigned';
              } else if (h.action === 'returned') {
                badgeClass = 'bg-[#C5E8E8] text-[#1B6B6B]';
                label = 'Returned';
              } else if (h.action === 'damaged') {
                badgeClass = 'bg-red-100 text-red-700';
                label = 'Damaged';
              } else if (h.action === 'repaired') {
                badgeClass = 'bg-amber-100 text-amber-800';
                label = 'Repaired';
              } else if (h.action === 'stock_adjusted') {
                badgeClass = 'bg-amber-100 text-amber-800';
                label = 'Stock Adjusted';
              } else if (h.action === 'created') {
                badgeClass = 'bg-slate-100 text-slate-700';
                label = 'Created';
              }
              return (
                <div key={idx} className="border border-slate-200 rounded-lg p-3 text-sm flex gap-3">
                  <div className="pt-0.5">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${badgeClass}`}>
                      {label}
                    </span>
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-center mb-1">
                      <p className="text-slate-800">
                        {h.employeeName ? h.employeeName : 'System'}
                      </p>
                      <p className="text-xs text-slate-400">{dateStr}</p>
                    </div>
                    <p className="text-xs text-slate-500">
                      Condition: {h.condition || '—'}
                      {typeof h.quantity === 'number' ? ` · Qty: ${h.quantity}` : ''}
                    </p>
                    {h.notes && <p className="text-xs text-slate-500 mt-1">Notes: {h.notes}</p>}
                    {h.performedBy && (
                      <p className="text-[11px] text-slate-400 mt-1">
                        Performed by: {h.performedBy}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          {(selectedAsset.history || []).length === 0 && (
            <p className="text-sm text-slate-500">No history yet.</p>
          )}
        </div>
        <div className="flex justify-end mt-4">
          <button
            type="button"
            onClick={() => setShowHistoryModal(false)}
            className="text-sm text-slate-500 hover:text-slate-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
