export default function QRModal({
  showQRModal,
  setShowQRModal,
  qrAsset,
}) {
  if (!showQRModal || !qrAsset) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-xl w-full sm:max-w-sm p-6 max-h-[90vh] overflow-y-auto">
        <div className="text-center">
          <h2 className="text-base font-semibold text-gray-800 mb-1">{qrAsset.name || qrAsset.assetId}</h2>
          <p className="text-xs text-gray-400 mb-4">{qrAsset.assetId} · {qrAsset.type}</p>
          <div className="flex justify-center mb-4">
            <div id="qr-canvas-container" className="p-4 bg-gray-50 rounded-2xl border border-gray-200 inline-block">
              <div id="qr-canvas" style={{ width: 180, height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center' }} />
            </div>
          </div>
          <div className="text-xs text-gray-400 mb-4 space-y-0.5">
            {qrAsset.serialNumber && <p>SN: {qrAsset.serialNumber}</p>}
            {qrAsset.assignedToName && <p>Assigned: {qrAsset.assignedToName}</p>}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowQRModal(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600">Close</button>
            <button type="button"
              onClick={() => {
                const container = document.getElementById('qr-canvas');
                if (!container) return;
                const innerCanvas = container.querySelector('canvas');
                const innerImg = container.querySelector('img');
                const href = innerCanvas ? innerCanvas.toDataURL('image/png') : innerImg?.src;
                if (!href) return;
                const link = document.createElement('a');
                link.download = `${qrAsset.assetId}-qr.png`;
                link.href = href;
                link.click();
              }}
              className="flex-1 py-2.5 bg-[#1B6B6B] text-white rounded-xl text-sm font-medium hover:bg-[#155858]">
              Download PNG
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
