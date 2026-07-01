export default function DeleteAssetModal({
  showDeleteAssetModal,
  setShowDeleteAssetModal,
  deletingAsset,
  deleteConfirmText,
  setDeleteConfirmText,
  handleDeleteAsset,
  saving,
}) {
  if (!showDeleteAssetModal || !deletingAsset) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-xl w-full sm:max-w-sm p-6 max-h-[90vh] overflow-y-auto">
        <div className="text-center mb-5">
          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#E24B4A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
          </div>
          <h3 className="text-base font-semibold text-gray-800 mb-1">Delete asset?</h3>
          <p className="text-sm text-gray-500">This permanently deletes <strong>{deletingAsset.name || deletingAsset.assetId}</strong> and all its history. Cannot be undone.</p>
        </div>
        {deletingAsset.status === 'Assigned' && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl mb-4">
            <p className="text-xs text-red-700 font-medium">⚠️ This asset is currently assigned to {deletingAsset.assignedToName}. Return it first before deleting.</p>
          </div>
        )}
        {deletingAsset.status !== 'Assigned' && (
          <>
            <div className="mb-4">
              <label className="text-xs text-gray-500 block mb-1.5">Type <strong>{deletingAsset.assetId}</strong> to confirm</label>
              <input placeholder={deletingAsset.assetId} value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} className="w-full border border-red-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-red-400" />
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setShowDeleteAssetModal(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600">Cancel</button>
              <button type="button" disabled={deleteConfirmText !== deletingAsset.assetId || saving} onClick={handleDeleteAsset} className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed">{saving ? 'Deleting…' : 'Delete permanently'}</button>
            </div>
          </>
        )}
        {deletingAsset.status === 'Assigned' && (
          <button type="button" onClick={() => setShowDeleteAssetModal(false)} className="w-full py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600">Close</button>
        )}
      </div>
    </div>
  );
}
