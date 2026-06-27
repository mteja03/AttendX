import { useState, useRef, useCallback, useEffect } from 'react';
import { ref as storageRef, uploadBytes } from 'firebase/storage';
import { storage } from '../../firebase/config';

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371e3;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function LocationVerification({ audit, companyId, currentUser, onComplete, onSkip }) {
  const needsLocation = audit.requireLocation && audit.branchLat != null && audit.branchLng != null;
  const needsSelfie = audit.requireSelfie;
  const nothingRequired = !needsLocation && !needsSelfie;

  const [locationStatus, setLocationStatus] = useState(needsLocation ? 'pending' : 'skipped');
  const [locationData, setLocationData] = useState(null);

  const [selfieStatus, setSelfieStatus] = useState(needsSelfie ? 'pending' : 'skipped');
  const [selfieBlob, setSelfieBlob] = useState(null);
  const [selfiePreview, setSelfiePreview] = useState(null);
  const [selfiePath, setSelfiePath] = useState(null);

  const [starting, setStarting] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    if (nothingRequired) onSkip?.();
  }, [nothingRequired, onSkip]);

  useEffect(() => () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }
    if (selfiePreview) URL.revokeObjectURL(selfiePreview);
  }, [selfiePreview]);

  const checkLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationStatus('error');
      setLocationData({ error: 'Geolocation not supported' });
      return;
    }
    setLocationStatus('checking');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const accuracy = Math.round(pos.coords.accuracy);
        const distance = Math.round(haversineMeters(lat, lng, audit.branchLat, audit.branchLng));
        const verified = distance <= 500;
        const data = {
          lat,
          lng,
          accuracy,
          distanceFromBranch: distance,
          verified,
          branchName: audit.branch || audit.location || 'Branch',
        };
        setLocationData(data);
        setLocationStatus(verified ? 'verified' : 'mismatch');
      },
      (err) => {
        setLocationStatus('error');
        setLocationData({ error: err.message || 'Location access denied' });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }, [audit.branchLat, audit.branchLng, audit.branch, audit.location]);

  const openCamera = useCallback(async () => {
    setSelfieStatus('capturing');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch {
      setSelfieStatus('pending');
    }
  }, []);

  const captureSelfie = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      setSelfieBlob(blob);
      setSelfiePreview(URL.createObjectURL(blob));
      setSelfieStatus('captured');
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    }, 'image/jpeg', 0.85);
  }, []);

  const retakeSelfie = useCallback(() => {
    if (selfiePreview) URL.revokeObjectURL(selfiePreview);
    setSelfieBlob(null);
    setSelfiePreview(null);
    setSelfieStatus('pending');
  }, [selfiePreview]);

  const handleStart = useCallback(async () => {
    setStarting(true);
    let selfieResult = null;
    if (selfieBlob && needsSelfie) {
      setSelfieStatus('uploading');
      try {
        const path = `companies/${companyId}/audits/${audit.id}/checkin_selfie_${Date.now()}.jpg`;
        const fileRef = storageRef(storage, path);
        await uploadBytes(fileRef, selfieBlob, {
          contentType: 'image/jpeg',
          customMetadata: {
            uploadedBy: currentUser?.email || '',
            auditId: String(audit.id || ''),
          },
        });
        selfieResult = {
          storagePath: path,
          lat: locationData?.lat || null,
          lng: locationData?.lng || null,
        };
        setSelfiePath(path);
        setSelfieStatus('done');
      } catch {
        setSelfieStatus('captured');
        setStarting(false);
        return;
      }
    }
    onComplete({
      locationCheck: locationData
        ? {
            lat: locationData.lat,
            lng: locationData.lng,
            accuracy: locationData.accuracy,
            distanceFromBranch: locationData.distanceFromBranch,
            verified: locationData.verified,
            branchName: locationData.branchName,
          }
        : null,
      checkInSelfie: selfieResult,
    });
  }, [selfieBlob, needsSelfie, companyId, audit.id, locationData, onComplete, currentUser?.email]);

  if (nothingRequired) return null;

  const locationDone = locationStatus === 'verified' || locationStatus === 'mismatch' || locationStatus === 'error' || locationStatus === 'skipped';
  const selfieDone = selfieStatus === 'captured' || selfieStatus === 'done' || selfieStatus === 'skipped';
  const canStart = locationDone && selfieDone && !starting;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-[60] sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-800">Verify before starting</h2>
          <p className="text-xs text-gray-400 mt-0.5">{audit.auditTypeName} · {audit.branch || audit.location || '—'}</p>
        </div>

        <div className="p-5 space-y-3">
          {needsLocation && (
            <div className={`border rounded-2xl overflow-hidden ${locationStatus === 'verified' ? 'border-green-200' : locationStatus === 'mismatch' ? 'border-amber-200' : 'border-gray-100'}`}>
              <div className="flex items-center gap-3 p-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 ${locationStatus === 'verified' ? 'bg-green-100 text-green-700' : locationStatus === 'mismatch' ? 'bg-amber-100 text-amber-700' : locationStatus === 'checking' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                  {locationStatus === 'verified' ? '✓' : locationStatus === 'mismatch' ? '!' : locationStatus === 'checking' ? '…' : '1'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-800">Verify location</p>
                  {locationStatus === 'pending' && <p className="text-[10px] text-gray-400 mt-0.5">Confirm you are at the audit site</p>}
                  {locationStatus === 'checking' && <p className="text-[10px] text-blue-600 mt-0.5">Checking your location…</p>}
                  {locationStatus === 'verified' && <p className="text-[10px] text-green-600 mt-0.5">{locationData.distanceFromBranch}m from {locationData.branchName} — verified</p>}
                  {locationStatus === 'mismatch' && <p className="text-[10px] text-amber-600 mt-0.5">{(locationData.distanceFromBranch / 1000).toFixed(1)} km from {locationData.branchName} — audit manager will be notified</p>}
                  {locationStatus === 'error' && <p className="text-[10px] text-red-500 mt-0.5">{locationData?.error || 'Location access failed'}</p>}
                </div>
              </div>
              {locationStatus === 'pending' && (
                <div className="px-3 pb-3">
                  <button type="button" onClick={checkLocation} className="w-full py-2.5 bg-[#E6F1FB] text-[#185FA5] rounded-xl text-xs font-medium hover:bg-[#B5D4F4] transition-colors">Check my location</button>
                </div>
              )}
              {locationStatus === 'checking' && (
                <div className="px-3 pb-3 flex justify-center">
                  <span className="w-5 h-5 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin inline-block" />
                </div>
              )}
              {locationStatus === 'error' && (
                <div className="px-3 pb-3">
                  <button type="button" onClick={checkLocation} className="w-full py-2.5 border border-gray-200 rounded-xl text-xs text-gray-600 hover:bg-gray-50">Retry</button>
                </div>
              )}
            </div>
          )}

          {needsSelfie && (
            <div className={`border rounded-2xl overflow-hidden ${selfieStatus === 'captured' || selfieStatus === 'done' ? 'border-green-200' : 'border-gray-100'}`}>
              <div className="flex items-center gap-3 p-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 ${selfieStatus === 'captured' || selfieStatus === 'done' ? 'bg-green-100 text-green-700' : selfieStatus === 'capturing' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                  {selfieStatus === 'captured' || selfieStatus === 'done' ? '✓' : needsLocation ? '2' : '1'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-800">Check-in selfie</p>
                  {selfieStatus === 'pending' && <p className="text-[10px] text-gray-400 mt-0.5">Take a photo at the audit site</p>}
                  {selfieStatus === 'capturing' && <p className="text-[10px] text-blue-600 mt-0.5">Position your face and capture</p>}
                  {selfieStatus === 'captured' && <p className="text-[10px] text-green-600 mt-0.5">Selfie captured</p>}
                  {selfieStatus === 'uploading' && <p className="text-[10px] text-blue-600 mt-0.5">Uploading…</p>}
                  {selfieStatus === 'done' && selfiePath && <p className="text-[10px] text-green-600 mt-0.5">Selfie uploaded</p>}
                </div>
              </div>

              {selfieStatus === 'pending' && locationDone && (
                <div className="px-3 pb-3">
                  <button type="button" onClick={openCamera} className="w-full py-2.5 bg-[#E6F1FB] text-[#185FA5] rounded-xl text-xs font-medium hover:bg-[#B5D4F4] transition-colors">Open camera</button>
                </div>
              )}
              {selfieStatus === 'pending' && !locationDone && (
                <div className="px-3 pb-3">
                  <p className="text-[10px] text-gray-300 text-center">Complete location check first</p>
                </div>
              )}

              {selfieStatus === 'capturing' && (
                <div className="px-3 pb-3">
                  <div className="relative rounded-xl overflow-hidden bg-black mb-2" style={{ aspectRatio: '4/3' }}>
                    <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} />
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-28 h-28 rounded-full border-2 border-dashed border-white/40" />
                    </div>
                    <div className="absolute bottom-2 left-2 bg-black/50 px-2 py-1 rounded text-[9px] text-white/70">
                      {new Date().toLocaleString('en-IN')}
                    </div>
                  </div>
                  <button type="button" onClick={captureSelfie} className="w-full py-2.5 bg-[#1B6B6B] text-white rounded-xl text-xs font-medium">Capture</button>
                  <canvas ref={canvasRef} className="hidden" />
                </div>
              )}

              {selfieStatus === 'captured' && selfiePreview && (
                <div className="px-3 pb-3">
                  <div className="relative rounded-xl overflow-hidden mb-2" style={{ aspectRatio: '4/3' }}>
                    <img src={selfiePreview} alt="Check-in selfie preview" className="w-full h-full object-cover" />
                  </div>
                  <button type="button" onClick={retakeSelfie} className="w-full py-2.5 border border-gray-200 rounded-xl text-xs text-gray-600 hover:bg-gray-50">Retake</button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-100">
          <button
            type="button"
            onClick={handleStart}
            disabled={!canStart}
            className="w-full py-3 bg-[#1B6B6B] text-white rounded-xl text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {starting ? (selfieStatus === 'uploading' ? 'Uploading selfie…' : 'Starting…') : 'Start audit'}
          </button>
        </div>
      </div>
    </div>
  );
}
