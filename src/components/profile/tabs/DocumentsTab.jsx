export default function DocumentsTab({
  activeChecklist,
  docByType,
  categoryOpen,
  setCategoryOpen,
  mandatoryUploaded,
  totalMandatory,
  documentCompletion,
  progressColor,
  showDocManageUi,
  hasDriveUploadRole,
  isInactive,
  uploadingDocId,
  replacingDocId,
  deletingDocId,
  viewingDocId,
  uploadProgress,
  deleteConfirm,
  setDeleteConfirm,
  handleUploadChecklistDoc,
  handleReplaceDoc,
  handleDeleteChecklistDoc,
  handleViewDoc,
  handleDownloadDoc,
  formatDocDate,
  formatFileSizeDetailed,
  getFileExt,
  getFileIconColor,
}) {
  return (
<div className="space-y-6">
  {!hasDriveUploadRole && (
    <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl border border-gray-100 mb-4">
      <span className="text-2xl shrink-0">📂</span>
      <div>
        <p className="text-sm font-medium text-gray-700">Document viewing only</p>
        <p className="text-xs text-gray-400 mt-0.5">
          Only HR Managers can upload or manage documents
        </p>
      </div>
    </div>
  )}
  {isInactive && (
    <div className="flex items-center gap-3 p-4 bg-gray-50 border border-gray-100 rounded-xl mb-4">
      <span className="text-xl shrink-0">🔒</span>
      <div>
        <p className="text-sm font-semibold text-gray-600">Read-only</p>
        <p className="text-xs text-gray-400 mt-0.5">
          This employee is inactive. Documents can be viewed but not modified.
        </p>
      </div>
    </div>
  )}

  {uploadingDocId && uploadProgress && (
    <div className="rounded-xl border border-[#4ECDC4] bg-[#4ECDC4]/10 p-3 text-sm text-[#1B6B6B] font-medium">
      <div className="flex items-center gap-2">
        <span className="animate-spin rounded-full h-4 w-4 border-2 border-[#4ECDC4] border-t-transparent" />
        <div className="min-w-0 flex-1">
          <p className="truncate">
            {uploadProgress.mode === 'replace' ? 'Replacing document...' : 'Uploading document...'}
          </p>
          <p className="text-xs text-[#1B6B6B]/70 truncate">{uploadProgress.fileName}</p>
        </div>
        <span className="text-xs font-semibold tabular-nums">{uploadProgress.percent}%</span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-white/70 overflow-hidden">
        <div className="h-full rounded-full bg-[#1B6B6B] transition-all" style={{ width: `${uploadProgress.percent}%` }} />
      </div>
    </div>
  )}

  <div>
    <h3 className="text-sm font-semibold text-slate-800 mb-2">Document Completion</h3>
    <div className="flex items-center gap-3">
      <div className="flex-1 h-3 bg-slate-200 rounded-full overflow-hidden">
        <div className={`h-full ${progressColor} transition-all`} style={{ width: `${documentCompletion}%` }} />
      </div>
      <span className="text-sm font-medium text-slate-700 whitespace-nowrap">
        {mandatoryUploaded} of {totalMandatory} mandatory documents uploaded
      </span>
    </div>
    <p className="text-slate-500 text-xs mt-1">
      {totalMandatory - mandatoryUploaded === 0
        ? 'All mandatory documents uploaded'
        : `${totalMandatory - mandatoryUploaded} mandatory document${totalMandatory - mandatoryUploaded !== 1 ? 's' : ''} missing`}
    </p>
  </div>

  {activeChecklist.map((cat) => {
    const open = categoryOpen[cat.category] !== false;
    const uploadedInCat = cat.documents.filter((d) => docByType[d.id]).length;
    return (
      <div key={cat.category} className="border border-slate-200 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setCategoryOpen((p) => ({ ...p, [cat.category]: !open }))}
          className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 text-left"
        >
          <span className="font-medium text-slate-800">{cat.category}</span>
          <span className="text-slate-500 text-sm">{uploadedInCat} of {cat.documents.length} uploaded</span>
          <span className="text-slate-400">{open ? '▼' : '▶'}</span>
        </button>
        {open && (
          <ul className="divide-y divide-slate-100">
            {cat.documents.map((doc) => {
              const uploaded = docByType[doc.id];
              const uploading = uploadingDocId === doc.id;
              const isReplacing = replacingDocId === doc.id;
              const isDeleting = deletingDocId === doc.id;
              const isViewing = viewingDocId === (uploaded?.id || uploaded?.storagePath);
              const currentProgress = uploadProgress?.docId === doc.id ? uploadProgress.percent : null;
              const currentMode = uploadProgress?.docId === doc.id ? uploadProgress.mode : null;
              const rowBusy = uploading || isReplacing || isDeleting || isViewing;
              const acceptList = Array.isArray(doc.accepts) ? doc.accepts : ['.pdf', '.jpg', '.jpeg', '.png'];
              const acceptAttr = acceptList.join(',');
              const hint = `${acceptList.map((e) => e.replace('.', '').toUpperCase()).join(', ')} · Max ${doc.maxSizeMB || 5}MB`;
              const canView = uploaded?.storagePath;
              return (
                <li key={doc.id} className="px-4" title={hint}>
                  {uploaded ? (
                    <>
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex items-center gap-3 w-full">
                      <div
                        className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 text-white text-xs font-bold ${getFileIconColor(uploaded.fileName || doc.name)}`}
                      >
                        {getFileExt(uploaded.fileName || doc.name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">
                          {uploaded.fileName || doc.name}
                        </p>
                        <p className="text-xs text-gray-400">
                          {formatFileSizeDetailed(uploaded.fileSize)} · Uploaded {formatDocDate(uploaded.uploadedAt)}
                        </p>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        {canView && (
                          <button
                            type="button"
                            onClick={() => handleViewDoc(uploaded)}
                            disabled={rowBusy}
                            className="px-2.5 py-1 text-xs font-medium text-[#1B6B6B] bg-[#E8F5F5] rounded-lg hover:bg-[#C5E8E8] transition-colors disabled:opacity-50"
                          >
                            {isViewing ? 'Loading…' : 'View'}
                          </button>
                        )}
                        {canView && (
                          <button
                            type="button"
                            onClick={() => handleDownloadDoc(uploaded)}
                            disabled={rowBusy}
                            className="px-2.5 py-1 text-xs font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-50"
                          >
                            {isViewing ? 'Loading…' : 'Download'}
                          </button>
                        )}
                        {showDocManageUi && (
                          <label
                            title="Replace document"
                            className={rowBusy ? 'pointer-events-none opacity-50' : ''}
                          >
                            <span className="px-2.5 py-1 text-xs font-medium text-amber-600 bg-amber-50 rounded-lg hover:bg-amber-100 transition-colors inline-block cursor-pointer">
                              Replace
                            </span>
                            <input
                              type="file"
                              className="hidden"
                              accept={acceptAttr}
                              disabled={rowBusy}
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handleReplaceDoc(f, doc.id);
                                e.target.value = '';
                              }}
                            />
                          </label>
                        )}
                        {showDocManageUi && (
                          <button
                            type="button"
                            onClick={() => setDeleteConfirm({ type: 'checklist', doc: uploaded })}
                            disabled={rowBusy}
                            title="Delete document"
                            className="px-2.5 py-1 text-xs font-medium rounded-lg transition-colors disabled:opacity-50 text-red-500 bg-red-50 hover:bg-red-100"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                    {currentProgress != null && (
                      <div className="mt-2 rounded-lg bg-white/80 p-2">
                        <div className="flex items-center justify-between text-[11px] text-gray-500 mb-1">
                          <span>{currentMode === 'replace' ? 'Replacing...' : 'Uploading...'}</span>
                          <span className="font-semibold tabular-nums">{currentProgress}%</span>
                        </div>
                        <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
                          <div className="h-full rounded-full bg-[#1B6B6B] transition-all" style={{ width: `${currentProgress}%` }} />
                        </div>
                      </div>
                    )}
                    </>
                  ) : (
                    <>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-3 px-1 sm:px-0 border-b last:border-0 gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 border-gray-300" />
                        <div>
                          <p className="text-sm font-medium text-gray-800">
                            {doc.name}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {doc.mandatory ? (
                              <span className="text-red-500">Mandatory</span>
                            ) : (
                              'Optional'
                            )}
                            {' · '}
                            {acceptList.map((e) => e.replace('.', '').toUpperCase()).join(', ')}
                            {' · '}Max {doc.maxSizeMB || 5}MB
                          </p>
                        </div>
                      </div>
                      <div className="flex items-stretch sm:items-center gap-2 w-full sm:w-auto">
                        {showDocManageUi ? (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                const input = document.getElementById(`doc-upload-${doc.id}`);
                                if (input) input.click();
                              }}
                              disabled={uploadingDocId === doc.id}
                              title="Upload document"
                              className="w-full sm:w-auto min-h-[44px] px-4 inline-flex items-center justify-center text-sm font-medium rounded-lg transition-colors whitespace-nowrap bg-[#1B6B6B] text-white hover:bg-[#155858] active:bg-[#0f4444] disabled:opacity-50"
                            >
                              {uploadingDocId === doc.id
                                ? `${currentProgress ?? 0}%`
                                : 'Upload'}
                            </button>
                            <input
                              id={`doc-upload-${doc.id}`}
                              type="file"
                              className="hidden"
                              accept={acceptAttr}
                              disabled={!!uploadingDocId}
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handleUploadChecklistDoc(f, doc.id, doc.name);
                                e.target.value = '';
                              }}
                            />
                          </>
                        ) : (
                          <span className="text-xs text-gray-400 italic">View only</span>
                        )}
                      </div>
                    </div>
                    {currentProgress != null && (
                      <div className="px-1 pb-3">
                        <div className="rounded-lg bg-[#E8F5F5] p-2">
                          <div className="flex items-center justify-between text-[11px] text-[#1B6B6B] mb-1">
                            <span>{currentMode === 'replace' ? 'Replacing...' : 'Uploading...'}</span>
                            <span className="font-semibold tabular-nums">{currentProgress}%</span>
                          </div>
                          <div className="h-2 rounded-full bg-white/70 overflow-hidden">
                            <div className="h-full rounded-full bg-[#1B6B6B] transition-all" style={{ width: `${currentProgress}%` }} />
                          </div>
                        </div>
                      </div>
                    )}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  })}

  {deleteConfirm && (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-xl w-full sm:max-w-md p-6">
        <h3 className="text-lg font-semibold text-slate-800 mb-2">Delete {deleteConfirm.doc.name}?</h3>
        <p className="text-sm text-slate-600 mb-4">This file will be permanently removed.</p>
        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => setDeleteConfirm(null)} className="text-slate-500 text-sm">Cancel</button>
            <button
              type="button"
              onClick={() => handleDeleteChecklistDoc(deleteConfirm.doc)}
              className="rounded-lg bg-red-600 text-white text-sm font-medium px-4 py-2 disabled:opacity-50"
              disabled={!!deletingDocId}
            >
              {deletingDocId ? 'Deleting…' : 'Delete'}
            </button>
        </div>
      </div>
    </div>
  )}
</div>
  );
}
