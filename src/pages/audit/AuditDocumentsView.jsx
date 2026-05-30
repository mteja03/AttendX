import { useState, useMemo } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';
import { db, storage } from '../../firebase/config';
import { formatAuditDocSize, auditDocViewLabel } from './auditHelpers';

export default function AuditDocumentsView({ audits, companyId, userRole, showSuccess, showError }) {
  const [monthFilter, setMonthFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [retentionMonths, setRetentionMonths] = useState(6);
  const [deleting, setDeleting] = useState(null);
  const [showCleanupConfirm, setShowCleanupConfirm] = useState(false);
  const [cleaningUp, setCleaningUp] = useState(false);

  const canDelete = userRole === 'admin' || userRole === 'companyadmin';

  const allDocs = useMemo(() => {
    const docs = [];
    (audits || []).forEach((a) => {
      (a.auditDocuments || []).forEach((d) => {
        if (d.id) docs.push({ ...d, auditId: a.id, auditRefId: a.auditRefId, auditTypeName: a.auditTypeName, branch: a.branch, location: a.location, auditorName: a.auditorName });
      });
    });
    return docs.sort((a, b) => {
      const aD = a.uploadedAt ? new Date(a.uploadedAt) : new Date(0);
      const bD = b.uploadedAt ? new Date(b.uploadedAt) : new Date(0);
      return bD - aD;
    });
  }, [audits]);

  const availableMonths = useMemo(() => {
    const months = new Set();
    allDocs.forEach((d) => { if (d.uploadedAt) months.add(d.uploadedAt.slice(0, 7)); });
    return [...months].sort().reverse();
  }, [allDocs]);

  const docBranches = useMemo(() => [...new Set(allDocs.map((d) => d.branch).filter(Boolean))].sort(), [allDocs]);
  const docLocations = useMemo(() => [...new Set(allDocs.map((d) => d.location).filter(Boolean))].sort(), [allDocs]);

  const filteredDocs = useMemo(() => allDocs.filter((d) => {
    if (monthFilter && (!d.uploadedAt || !d.uploadedAt.startsWith(monthFilter))) return false;
    if (branchFilter && d.branch !== branchFilter) return false;
    if (locationFilter && d.location !== locationFilter) return false;
    return true;
  }), [allDocs, monthFilter, branchFilter, locationFilter]);

  const expiredDocs = useMemo(() => {
    if (!retentionMonths) return [];
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - retentionMonths);
    return allDocs.filter((d) => d.uploadedAt && new Date(d.uploadedAt) < cutoff);
  }, [allDocs, retentionMonths]);

  const handleDeleteDoc = async (docItem) => {
    if (!canDelete) return;
    if (!window.confirm(`Delete "${docItem.name}"?`)) return;
    try {
      setDeleting(docItem.id);
      if (docItem.storagePath) await deleteObject(ref(storage, docItem.storagePath)).catch(() => {});
      const auditRef = doc(db, 'companies', companyId, 'audits', docItem.auditId);
      const auditSnap = await getDoc(auditRef);
      if (auditSnap.exists()) {
        const updatedDocs = (auditSnap.data().auditDocuments || []).filter((d) => d.id !== docItem.id);
        await updateDoc(auditRef, { auditDocuments: updatedDocs, updatedAt: new Date() });
      }
      showSuccess(`"${docItem.name}" deleted`);
    } catch (e) {
      showError('Delete failed: ' + (e?.message || String(e)));
    } finally {
      setDeleting(null);
    }
  };

  const handleCleanup = async () => {
    try {
      setCleaningUp(true);
      const byAudit = {};
      expiredDocs.forEach((d) => { if (!byAudit[d.auditId]) byAudit[d.auditId] = []; byAudit[d.auditId].push(d); });
      await Promise.allSettled(expiredDocs.filter((d) => d.storagePath).map((d) => deleteObject(ref(storage, d.storagePath))));
      for (const [auditId, docs] of Object.entries(byAudit)) {
        const auditRef = doc(db, 'companies', companyId, 'audits', auditId);
        const auditSnap = await getDoc(auditRef);
        if (auditSnap.exists()) {
          const expiredIds = new Set(docs.map((d) => d.id));
          const remaining = (auditSnap.data().auditDocuments || []).filter((d) => !expiredIds.has(d.id));
          await updateDoc(auditRef, { auditDocuments: remaining, updatedAt: new Date() });
        }
      }
      showSuccess(`${expiredDocs.length} expired document${expiredDocs.length !== 1 ? 's' : ''} deleted`);
      setShowCleanupConfirm(false);
    } catch (e) {
      showError('Cleanup failed: ' + (e?.message || String(e)));
    } finally {
      setCleaningUp(false);
    }
  };

  if (allDocs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center px-6">
        <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center mb-4 text-2xl">📎</div>
        <p className="text-sm font-medium text-gray-700 mb-1">No audit documents yet</p>
        <p className="text-xs text-gray-400">Documents uploaded during audits will appear here.</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)}
          className="text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:border-[#1B6B6B]">
          <option value="">All months</option>
          {availableMonths.map((m) => (
            <option key={m} value={m}>{new Date(m + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</option>
          ))}
        </select>
        {docBranches.length > 0 && (
          <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}
            className="text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:border-[#1B6B6B]">
            <option value="">All branches</option>
            {docBranches.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        )}
        {docLocations.length > 0 && (
          <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)}
            className="text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:border-[#1B6B6B]">
            <option value="">All locations</option>
            {docLocations.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        )}
        <span className="text-xs text-gray-400">{filteredDocs.length} of {allDocs.length} documents</span>
        {canDelete && (
          <div className="ml-auto flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl">
              <span className="text-xs text-gray-500">Retention:</span>
              <select value={retentionMonths} onChange={(e) => setRetentionMonths(Number(e.target.value))}
                className="text-xs border-0 bg-transparent text-gray-700 focus:outline-none font-medium">
                <option value={1}>1 month</option>
                <option value={3}>3 months</option>
                <option value={6}>6 months</option>
                <option value={12}>1 year</option>
                <option value={0}>Keep forever</option>
              </select>
            </div>
            {retentionMonths > 0 && expiredDocs.length > 0 && (
              <button type="button" onClick={() => setShowCleanupConfirm(true)}
                className="flex items-center gap-1.5 text-xs text-red-600 border border-red-200 bg-red-50 px-3 py-2 rounded-xl hover:bg-red-100 transition-colors font-medium">
                🗑️ Clean up {expiredDocs.length} expired
              </button>
            )}
            {retentionMonths > 0 && expiredDocs.length === 0 && (
              <span className="text-xs text-green-600 font-medium">✓ No expired documents</span>
            )}
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
        {filteredDocs.length === 0 ? (
          <div className="text-center py-10 text-sm text-gray-400">No documents for selected month</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filteredDocs.map((d) => {
              const isExpired = retentionMonths > 0 && d.uploadedAt && (() => {
                const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - retentionMonths);
                return new Date(d.uploadedAt) < cutoff;
              })();
              const icon = d.type?.includes('pdf') ? '📄' : d.type?.includes('image') ? '🖼️' : '📝';
              return (
                <div key={`${d.auditId}-${d.id}`} className={`flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50/80 transition-colors ${isExpired ? 'bg-red-50/20' : ''}`}>
                  <div className="w-9 h-9 bg-gray-50 border border-gray-100 rounded-xl flex items-center justify-center text-base flex-shrink-0">{icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-medium text-gray-800 truncate">{d.name}</p>
                      {isExpired && <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full flex-shrink-0 font-medium">Expired</span>}
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap text-xs text-gray-400">
                      <span className="font-mono text-gray-500">{d.auditRefId}</span>
                      <span>·</span><span className="truncate max-w-[100px]">{d.auditTypeName}</span>
                      {d.branch && <><span>·</span><span>🏢 {d.branch}</span></>}
                      {d.location && <><span>·</span><span>📍 {d.location}</span></>}
                      <span>·</span><span>{d.uploadedByName || d.uploadedBy}</span>
                      <span>·</span><span>{d.uploadedAt ? new Date(d.uploadedAt).toLocaleDateString('en-GB') : '—'}</span>
                      <span>·</span><span>{formatAuditDocSize(d.size)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <a href={d.url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 rounded-xl bg-[#E8F5F5] px-2.5 py-1.5 text-xs font-medium text-[#1B6B6B] hover:bg-[#1B6B6B] hover:text-white transition-colors">
                      {auditDocViewLabel(d.type)}
                    </a>
                    {canDelete && (
                      <button type="button" disabled={deleting === d.id} onClick={() => handleDeleteDoc(d)}
                        className="flex h-8 w-8 items-center justify-center rounded-xl text-gray-300 hover:bg-red-50 hover:text-red-500 transition-colors disabled:opacity-40"
                        title="Delete document">
                        {deleting === d.id
                          ? <span className="w-3 h-3 border border-gray-300 border-t-red-500 rounded-full animate-spin inline-block" />
                          : '🗑️'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showCleanupConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowCleanupConfirm(false)} role="presentation" />
          <div className="relative bg-white rounded-2xl p-6 w-full max-w-sm shadow-sm">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center text-xl mx-auto mb-4">🗑️</div>
            <h3 className="text-base font-semibold text-gray-800 mb-2 text-center">Delete expired documents?</h3>
            <p className="text-sm text-gray-500 mb-5 text-center">
              Permanently deletes <strong>{expiredDocs.length} document{expiredDocs.length !== 1 ? 's' : ''}</strong> older than {retentionMonths} month{retentionMonths !== 1 ? 's' : ''}. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button type="button" onClick={() => setShowCleanupConfirm(false)}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button type="button" onClick={handleCleanup} disabled={cleaningUp}
                className="flex-1 py-2.5 bg-red-500 text-white rounded-xl text-sm font-semibold hover:bg-red-600 disabled:opacity-50">
                {cleaningUp ? 'Deleting...' : `Delete ${expiredDocs.length} files`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
