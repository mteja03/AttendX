import Cropper from 'react-easy-crop';
import { getCroppedBlob } from '../../utils/employeeListHelpers.jsx';

export default function PhotoCropModal({
  newEmpRawSrc,
  newEmpCrop,
  setNewEmpCrop,
  newEmpZoom,
  setNewEmpZoom,
  newEmpCroppedPixels,
  setNewEmpCroppedPixels,
  setNewEmpPhoto,
  setNewEmpPhotoSrc,
  setNewEmpCropOpen,
  setNewEmpRawSrc,
  showError,
}) {
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[70] p-4">
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-base font-semibold text-gray-800">Adjust Photo</h3>
            <p className="text-xs text-gray-400 mt-0.5">Drag to reposition · Scroll to zoom</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setNewEmpCropOpen(false);
              setNewEmpRawSrc(null);
            }}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400"
          >
            ✕
          </button>
        </div>

        <div className="relative bg-gray-900" style={{ height: '300px' }}>
          <Cropper
            image={newEmpRawSrc}
            crop={newEmpCrop}
            zoom={newEmpZoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setNewEmpCrop}
            onZoomChange={setNewEmpZoom}
            onCropComplete={(_, pixels) => setNewEmpCroppedPixels(pixels)}
            style={{
              cropAreaStyle: {
                border: '3px solid #1B6B6B',
                boxShadow: '0 0 0 9999px rgba(0,0,0,0.6)',
              },
            }}
          />
        </div>

        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100">
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">🔍</span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.05}
              value={newEmpZoom}
              onChange={(ev) => setNewEmpZoom(Number(ev.target.value))}
              className="flex-1 accent-[#1B6B6B]"
            />
            <span className="text-xs text-gray-400">🔎</span>
          </div>
        </div>

        <div className="flex gap-3 p-4 border-t border-gray-100">
          <button
            type="button"
            onClick={() => {
              setNewEmpCropOpen(false);
              setNewEmpRawSrc(null);
            }}
            className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={async () => {
              if (!newEmpCroppedPixels) return;
              try {
                const blob = await getCroppedBlob(newEmpRawSrc, newEmpCroppedPixels);
                const reader = new FileReader();
                reader.onloadend = () => {
                  const base64 = reader.result;
                  setNewEmpPhoto(base64);
                  setNewEmpPhotoSrc(base64);
                };
                reader.readAsDataURL(blob);
                setNewEmpCropOpen(false);
                setNewEmpRawSrc(null);
              } catch (err) {
                if (import.meta.env.DEV) console.error('Crop failed:', err);
                showError('Failed to crop image');
              }
            }}
            className="flex-1 py-2.5 bg-[#1B6B6B] text-white rounded-xl text-sm font-medium hover:bg-[#155858]"
          >
            ✓ Use This Photo
          </button>
        </div>
      </div>
    </div>
  );
}
