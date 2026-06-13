export default function AssetsTab({
  isInactive,
  employeeAssets,
  employeeConsumableCards,
  employeeAssetHistory,
  assetList,
  showAssetHistory,
  setShowAssetHistory,
  openProfileAssignModal,
  handleReturnAssetFromProfile,
  setReturnConsumableModal,
  setReturnQty,
  setReturnCondition,
  setReturnNotes,
  getAssetIcon,
  toDisplayDate,
  showError,
}) {
  return (
<div className="space-y-6">
  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
    <div className="bg-[#E8F5F5] rounded-xl p-3 text-center">
      <p className="text-xl font-semibold text-[#1B6B6B]">
        {employeeAssets.length + employeeConsumableCards.length}
      </p>
      <p className="text-xs text-[#1B6B6B]">Currently Assigned</p>
    </div>
    <div className="bg-gray-50 rounded-xl p-3 text-center">
      <p className="text-xl font-semibold text-gray-700">
        {employeeAssetHistory.length}
      </p>
      <p className="text-xs text-gray-500">Total Assets Received</p>
    </div>
    <div className="bg-green-50 rounded-xl p-3 text-center">
      <p className="text-xl font-semibold text-green-700">
        {Math.max(employeeAssetHistory.length - (employeeAssets.length + employeeConsumableCards.length), 0)}
      </p>
      <p className="text-xs text-green-600">Returned</p>
    </div>
  </div>

  <div className="mb-6">
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-sm font-medium text-gray-700">Currently Assigned</h3>
      {!isInactive && (
        <button
          type="button"
          onClick={openProfileAssignModal}
          className="text-xs text-[#1B6B6B] hover:underline"
        >
          + Assign Asset
        </button>
      )}
    </div>

    {isInactive && (
      <div className="flex items-center gap-2 p-3 bg-gray-50 border border-gray-100 rounded-xl mb-4">
        <span className="text-gray-400">🔒</span>
        <p className="text-sm text-gray-400">Cannot assign assets to inactive employees</p>
      </div>
    )}

    {employeeAssets.length === 0 && employeeConsumableCards.length === 0 ? (
      <div className="text-center py-8 bg-gray-50 rounded-xl border border-dashed border-gray-200">
        <p className="text-2xl mb-2">📦</p>
        <p className="text-sm text-gray-500">No assets currently assigned</p>
        {!isInactive && (
          <button
            type="button"
            onClick={openProfileAssignModal}
            className="mt-3 text-sm text-[#1B6B6B] hover:underline"
          >
            Assign an asset
          </button>
        )}
      </div>
    ) : (
      <div className="space-y-2">
        {[...employeeAssets.map((a) => ({ ...a, kind: 'trackable' })), ...employeeConsumableCards].map((asset) => (
          <div
            key={asset.id}
            className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-xl hover:border-gray-300 transition-colors"
          >
            <div className="w-10 h-10 rounded-lg bg-[#E8F5F5] flex items-center justify-center text-xl flex-shrink-0">
              {getAssetIcon(asset.type)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800">
                {asset.name}
              </p>
              <p className="text-xs text-gray-400">
                {asset.assetId}
                {asset.type && ` · ${asset.type}`}
                {asset.serialNumber && ` · SN: ${asset.serialNumber}`}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                Issued: {asset.issueDate ? toDisplayDate(asset.issueDate) : '—'}
                {' · '}
                Condition: {asset.condition || '—'}
                {asset.brand && ` · ${asset.brand}`}
                {asset.model && ` ${asset.model}`}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {asset.kind === 'trackable' ? (
                <>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-[#C5E8E8] text-[#1B6B6B] font-medium">
                    Trackable
                  </span>
                  <button
                    type="button"
                    onClick={() => handleReturnAssetFromProfile(asset)}
                    className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    Return
                  </button>
                </>
              ) : (
                <>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                    Consumable · Qty {asset.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const assetDoc = assetList.find((x) => x.id === asset.assetDocId);
                        if (!assetDoc) {
                          showError('Asset not found');
                          return;
                        }
                      setReturnConsumableModal({
                        asset: assetDoc || asset,
                        assignment: asset.assignment,
                      });
                      setReturnQty(1);
                      setReturnCondition('Good');
                      setReturnNotes('');
                    }}
                    className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    Return
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    )}
  </div>

  <div>
    <button
      type="button"
      onClick={() => setShowAssetHistory((s) => !s)}
      className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3 w-full"
    >
      <span>Asset History</span>
      <span className="text-xs text-gray-400 font-normal">
        ({employeeAssetHistory.length} assets)
      </span>
      <span className="ml-auto text-gray-400">
        {showAssetHistory ? '▲' : '▼'}
      </span>
    </button>

    {showAssetHistory && (
      <div className="space-y-2">
        {employeeAssetHistory.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">
            No asset history found
          </p>
        )}
        {employeeAssetHistory.map((asset) =>
          asset.relevantHistory
            .slice()
            .sort((a, b) => {
              const da = a.date?.toDate?.() || new Date(a.date);
              const db2 = b.date?.toDate?.() || new Date(b.date);
              return db2 - da;
            })
            .map((h, i) => (
              <div
                key={`${asset.id}-${i}`}
                className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100"
              >
                <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center text-base flex-shrink-0 border">
                  {getAssetIcon(asset.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">
                    {asset.name}
                  </p>
                  <p className="text-xs text-gray-400">
                    {asset.assetId}
                    {' · '}
                    {h.date ? toDisplayDate(h.date) : '—'}
                  </p>
                </div>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    h.action === 'assigned'
                      ? 'bg-green-100 text-green-700'
                      : h.action === 'issued'
                      ? 'bg-green-100 text-green-700'
                      : h.action === 'returned'
                      ? 'bg-[#C5E8E8] text-[#1B6B6B]'
                      : h.action === 'stock_adjusted'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {h.action.charAt(0).toUpperCase() + h.action.slice(1)}
                </span>
              </div>
            )),
        )}
      </div>
    )}
  </div>
</div>
  );
}
