import { toDisplayDate } from '../../utils';
import {
  getStatusBadgeClass,
  getConditionBadgeClass,
  getAssetTypeColors,
  getAssetIcon,
} from '../../utils/assetHelpers';

export default function AssetDetailPanel({
  detailAsset,
  setDetailAsset,
  getAssignmentDuration,
  getWarrantyState,
  openEditAssetModal,
  openStatusModal,
  openAssignModal,
  openReturnModal,
}) {
  if (!detailAsset) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-end justify-end z-50" onClick={() => setDetailAsset(null)}>
      <div
        className="bg-white w-full sm:w-[420px] h-full overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0" style={{ background: getAssetTypeColors(detailAsset.type).bg }}>
              {getAssetIcon(detailAsset.type)}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-800 truncate">{detailAsset.name || '—'}</p>
              <p className="text-xs text-gray-400">{detailAsset.assetId} · {detailAsset.type}</p>
            </div>
          </div>
          <button type="button" onClick={() => setDetailAsset(null)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 flex-shrink-0" aria-label="Close">✕</button>
        </div>

        <div className="p-5 space-y-5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getStatusBadgeClass(detailAsset.status || 'Available')}`}>{detailAsset.status || 'Available'}</span>
            {detailAsset.condition && <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getConditionBadgeClass(detailAsset.condition)}`}>{detailAsset.condition}</span>}
            {(() => { const ws = getWarrantyState(detailAsset.warrantyExpiry); return ws ? <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${ws.color}`}>{ws.label}</span> : null; })()}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { label: 'Brand', value: detailAsset.brand },
              { label: 'Model', value: detailAsset.model },
              { label: 'Serial number', value: detailAsset.serialNumber },
              { label: 'Purchase date', value: detailAsset.purchaseDate ? toDisplayDate(detailAsset.purchaseDate) : null },
              { label: 'Purchase price', value: detailAsset.purchasePrice ? `₹${Number(detailAsset.purchasePrice).toLocaleString('en-IN')}` : null },
              { label: 'Warranty expiry', value: detailAsset.warrantyExpiry ? toDisplayDate(detailAsset.warrantyExpiry) : null },
              { label: 'Assigned to', value: detailAsset.assignedToName },
              { label: 'Issue date', value: detailAsset.issueDate ? toDisplayDate(detailAsset.issueDate) : null },
              { label: 'Expected return', value: detailAsset.expectedReturnDate ? toDisplayDate(detailAsset.expectedReturnDate) : null },
              { label: 'Duration held', value: detailAsset.issueDate && detailAsset.status === 'Assigned' ? getAssignmentDuration(detailAsset.issueDate) : null },
            ].filter((f) => f.value).map((f) => (
              <div key={f.label} className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-400 mb-0.5">{f.label}</p>
                <p className="text-sm font-medium text-gray-800">{f.value}</p>
              </div>
            ))}
          </div>

          {detailAsset.notes && (
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-400 mb-1">Notes</p>
              <p className="text-sm text-gray-700">{detailAsset.notes}</p>
            </div>
          )}

          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">History</p>
            <div className="space-y-2">
              {(detailAsset.history || []).length === 0 && <p className="text-sm text-gray-400">No history yet.</p>}
              {(detailAsset.history || []).slice().sort((a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0)).map((h, i) => (
                <div key={i} className="flex gap-3 p-2.5 bg-gray-50 rounded-xl">
                  <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${h.action === 'assigned' || h.action === 'issued' ? 'bg-green-500' : h.action === 'returned' ? 'bg-[#1B6B6B]' : h.action === 'created' ? 'bg-gray-400' : 'bg-amber-500'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-gray-700 capitalize">{h.action?.replace(/_/g, ' ')}</p>
                      <p className="text-[10px] text-gray-400 flex-shrink-0">{h.date ? toDisplayDate(h.date) : '—'}</p>
                    </div>
                    {h.employeeName && <p className="text-xs text-gray-500">{h.employeeName}</p>}
                    {h.notes && <p className="text-xs text-gray-400 italic mt-0.5">"{h.notes}"</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-2 border-t border-gray-100">
            <button type="button" onClick={() => { setDetailAsset(null); openEditAssetModal(detailAsset); }} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-xs font-medium text-gray-600 hover:bg-gray-50">Edit asset</button>
            <button type="button" onClick={() => { setDetailAsset(null); openStatusModal(detailAsset); }} className="flex-1 py-2.5 border border-amber-200 rounded-xl text-xs font-medium text-amber-700 hover:bg-amber-50">Change status</button>
            {(detailAsset.status === 'Available' || !detailAsset.status) && (
              <button type="button" onClick={() => { setDetailAsset(null); openAssignModal(detailAsset); }} className="flex-1 py-2.5 bg-[#1B6B6B] text-white rounded-xl text-xs font-medium hover:bg-[#155858]">Assign</button>
            )}
            {detailAsset.status === 'Assigned' && (
              <button type="button" onClick={() => { setDetailAsset(null); openReturnModal(detailAsset); }} className="flex-1 py-2.5 bg-amber-500 text-white rounded-xl text-xs font-medium hover:bg-amber-600">Return</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
