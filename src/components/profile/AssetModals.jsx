export default function AssetModals({
  employee,
  saving,
  // Assign asset modal (legacy simple modal)
  showAssignAssetModal,
  setShowAssignAssetModal,
  assignAssetForm,
  handleAssignAssetChange,
  handleSaveAssignFromProfile,
  assetList,
  // Profile assign modal (advanced trackable + consumable)
  showProfileAssignModal,
  setShowProfileAssignModal,
  profileAssignMode,
  setProfileAssignMode,
  showProfileAssetDropdown,
  setShowProfileAssetDropdown,
  profileAssetSearch,
  setProfileAssetSearch,
  setAssignAssetForm,
  issueConsumableAsset,
  setIssueConsumableAsset,
  issueConsumableForm,
  setIssueConsumableForm,
  handleIssueConsumableFromProfile,
  // Return asset modal
  returnAsset,
  setReturnAsset,
  returnAssetForm,
  handleReturnAssetChange,
  handleSaveReturnFromProfile,
  // Return consumable modal
  returnConsumableModal,
  setReturnConsumableModal,
  returnQty,
  setReturnQty,
  returnCondition,
  setReturnCondition,
  returnNotes,
  setReturnNotes,
  handleReturnConsumableFromProfile,
}) {
  return (
    <>
      {showAssignAssetModal && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-xl w-full sm:max-w-md sm:my-8 p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Assign Asset</h2>
            <form onSubmit={handleSaveAssignFromProfile} className="space-y-4">
              <div>
                <p className="text-xs text-slate-500 mb-1">Employee</p>
                <p className="text-sm font-medium text-slate-800">
                  {employee.fullName} ({employee.empId})
                </p>
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">Asset</label>
                <select
                  name="assetId"
                  value={assignAssetForm.assetId}
                  onChange={handleAssignAssetChange}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                >
                  <option value="">Select asset</option>
                  {assetList
                    .filter((a) => (a.status || 'Available') === 'Available')
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.assetId} · {a.name}
                      </option>
                    ))}
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Issue Date</label>
                  <input
                    type="date"
                    name="issueDate"
                    value={assignAssetForm.issueDate}
                    onChange={handleAssignAssetChange}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Condition at Issue</label>
                  <select
                    name="condition"
                    value={assignAssetForm.condition}
                    onChange={handleAssignAssetChange}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                  >
                    <option value="New">New</option>
                    <option value="Good">Good</option>
                    <option value="Fair">Fair</option>
                    <option value="Poor">Poor</option>
                    <option value="Damaged">Damaged</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">Notes</label>
                <textarea
                  name="notes"
                  value={assignAssetForm.notes}
                  onChange={handleAssignAssetChange}
                  rows={3}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                  placeholder="Any special instructions or comments"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAssignAssetModal(false)}
                  className="text-sm text-slate-500 hover:text-slate-700"
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-[#1B6B6B] hover:bg-[#155858] text-white text-sm font-medium px-4 py-2 disabled:opacity-50"
                  disabled={saving}
                >
                  {saving ? 'Assigning…' : 'Assign Asset'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showProfileAssignModal && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-xl w-full sm:max-w-md sm:my-8 max-h-[92vh] flex flex-col overflow-hidden">

            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100 flex-shrink-0">
              <div>
                <h2 className="text-base font-semibold text-gray-800">Assign asset</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {profileAssignMode === 'trackable' ? 'Assign a unique tracked item' : 'Issue from consumable stock'}
                </p>
              </div>
              <button type="button" onClick={() => { setShowProfileAssignModal(null); setShowProfileAssetDropdown(false); setProfileAssetSearch(''); setIssueConsumableAsset(null); setProfileAssignMode('trackable'); }} className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:bg-gray-50 text-sm">✕</button>
            </div>

            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

              {/* Employee context */}
              <div className="flex items-center gap-3 px-3 py-2.5 bg-gray-50 rounded-xl border border-gray-100">
                <div className="w-8 h-8 rounded-full bg-[#E1F5EE] flex items-center justify-center text-[#0F6E56] text-xs font-semibold flex-shrink-0">
                  {employee.fullName?.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{employee.fullName}</p>
                  <p className="text-xs text-gray-400">{employee.empId} · {employee.designation || employee.department || ''}</p>
                </div>
              </div>

              {/* Mode picker */}
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">Asset mode</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { mode: 'trackable', label: 'Trackable', desc: 'One item, one person', icon: '💻', activeBg: '#E1F5EE', activeBorder: '#1B6B6B', activeText: '#0F6E56' },
                    { mode: 'consumable', label: 'Consumable', desc: 'Issue from stock', icon: '📦', activeBg: '#EAF3DE', activeBorder: '#639922', activeText: '#27500A' },
                  ].map(({ mode, label, desc, icon, activeBg, activeBorder, activeText }) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => { setProfileAssignMode(mode); setAssignAssetForm((p) => ({ ...p, assetId: '' })); setIssueConsumableAsset(null); setShowProfileAssetDropdown(false); setProfileAssetSearch(''); }}
                      className="text-left p-3 rounded-xl border-2 transition-all"
                      style={{ borderColor: profileAssignMode === mode ? activeBorder : '#E5E7EB', background: profileAssignMode === mode ? activeBg : '#FAFAFA' }}
                    >
                      <span className="text-lg block mb-1">{icon}</span>
                      <p className="text-xs font-semibold" style={{ color: profileAssignMode === mode ? activeText : '#374151' }}>{label}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">{desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* TRACKABLE FLOW */}
              {profileAssignMode === 'trackable' && (
                <form onSubmit={handleSaveAssignFromProfile} id="profile-assign-form" className="space-y-3">
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-2">Select asset</p>
                    <div className="relative" onMouseDown={(e) => e.stopPropagation()}>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setShowProfileAssetDropdown(true)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setShowProfileAssetDropdown(true); }}
                        className="w-full border-2 rounded-xl px-3 py-2.5 text-sm cursor-pointer flex items-center justify-between min-h-[42px] transition-colors"
                        style={{ borderColor: assignAssetForm.assetId ? '#1B6B6B' : '#E5E7EB', background: assignAssetForm.assetId ? '#E1F5EE' : 'white' }}
                      >
                        {assignAssetForm.assetId ? (
                          (() => {
                            const sel = assetList.find((x) => x.id === assignAssetForm.assetId);
                            return sel ? (
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span className="font-mono text-xs bg-white px-1.5 py-0.5 rounded border border-[#9FE1CB] text-[#1B6B6B] shrink-0">{sel.assetId}</span>
                                <span className="truncate text-[#0F6E56] font-medium">{sel.name}</span>
                                {sel.condition && <span className="text-[10px] text-[#1B6B6B] bg-white px-1.5 py-0.5 rounded-full border border-[#9FE1CB] shrink-0">{sel.condition}</span>}
                              </div>
                            ) : <span className="text-gray-400">Select asset…</span>;
                          })()
                        ) : (
                          <span className="text-gray-400 text-sm">Search or select an asset…</span>
                        )}
                        <span className="text-gray-400 text-xs shrink-0 ml-2">▾</span>
                      </div>
                      {showProfileAssetDropdown && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-[60] overflow-hidden">
                          <div className="p-2 border-b border-gray-100">
                            <input
                              autoFocus
                              placeholder="Search by name or asset ID…"
                              value={profileAssetSearch}
                              onChange={(e) => setProfileAssetSearch(e.target.value)}
                              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#1B6B6B]"
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                          <div className="overflow-y-auto max-h-44">
                            {assetList
                              .filter((a) => (a.mode || 'trackable') === 'trackable' && ((a.status || 'Available') === 'Available' || !a.status))
                              .filter((a) => !profileAssetSearch || (a.name || '').toLowerCase().includes(profileAssetSearch.toLowerCase()) || (a.assetId || '').toLowerCase().includes(profileAssetSearch.toLowerCase()))
                              .map((asset) => (
                                <div
                                  key={asset.id}
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => { setAssignAssetForm((prev) => ({ ...prev, assetId: asset.id })); setShowProfileAssetDropdown(false); setProfileAssetSearch(''); }}
                                  onKeyDown={(e) => { if (e.key === 'Enter') { setAssignAssetForm((prev) => ({ ...prev, assetId: asset.id })); setShowProfileAssetDropdown(false); setProfileAssetSearch(''); }}}
                                  className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer border-b border-gray-50 last:border-0 hover:bg-[#E8F5F5] transition-colors ${assignAssetForm.assetId === asset.id ? 'bg-[#E1F5EE]' : ''}`}
                                >
                                  <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-600 shrink-0">{asset.assetId}</span>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium truncate text-gray-800">{asset.name}</p>
                                    <p className="text-xs text-gray-400 truncate">{asset.type}{asset.brand ? ` · ${asset.brand}` : ''}{asset.condition ? ` · ${asset.condition}` : ''}</p>
                                  </div>
                                  {assignAssetForm.assetId === asset.id && <span className="text-[#1B6B6B] text-sm shrink-0">✓</span>}
                                </div>
                              ))}
                            {assetList.filter((a) => (a.mode || 'trackable') === 'trackable' && ((a.status || 'Available') === 'Available' || !a.status)).length === 0 && (
                              <p className="text-center py-4 text-sm text-gray-400">No available trackable assets</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">Issue date</label>
                      <input type="date" name="issueDate" value={assignAssetForm.issueDate} onChange={handleAssignAssetChange} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">Expected return <span className="text-gray-300 font-normal">optional</span></label>
                      <input type="date" name="expectedReturnDate" value={assignAssetForm.expectedReturnDate || ''} onChange={handleAssignAssetChange} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Condition at issue</label>
                    <div className="flex gap-2 flex-wrap">
                      {['New', 'Good', 'Fair', 'Poor', 'Damaged'].map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setAssignAssetForm((p) => ({ ...p, condition: c }))}
                          className="text-xs px-3 py-1.5 rounded-full border transition-colors"
                          style={{
                            borderColor: assignAssetForm.condition === c ? '#1B6B6B' : '#E5E7EB',
                            background: assignAssetForm.condition === c ? '#1B6B6B' : 'transparent',
                            color: assignAssetForm.condition === c ? 'white' : '#6B7280',
                          }}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Notes <span className="text-gray-300 font-normal">optional</span></label>
                    <textarea name="notes" value={assignAssetForm.notes} onChange={handleAssignAssetChange} rows={2} placeholder="Any special instructions…" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:border-[#1B6B6B]" />
                  </div>
                </form>
              )}

              {/* CONSUMABLE FLOW */}
              {profileAssignMode === 'consumable' && (
                <div className="space-y-3">
                  <p className="text-xs font-medium text-gray-500">Available consumables</p>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {assetList.filter((a) => (a.mode || 'trackable') === 'consumable' && Number(a.availableStock) > 0).length === 0 && (
                      <div className="text-center py-6 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                        <p className="text-sm text-gray-400">No consumables available in stock</p>
                      </div>
                    )}
                    {assetList
                      .filter((a) => (a.mode || 'trackable') === 'consumable' && Number(a.availableStock) > 0)
                      .map((a) => (
                        <div
                          key={a.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => { setIssueConsumableAsset(a); setIssueConsumableForm((p) => ({ ...p, quantity: 1, issueDate: p.issueDate || new Date().toISOString().slice(0, 10), condition: 'Good', notes: '' })); }}
                          onKeyDown={(e) => { if (e.key === 'Enter') { setIssueConsumableAsset(a); } }}
                          className="flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all"
                          style={{ borderColor: issueConsumableAsset?.id === a.id ? '#639922' : '#E5E7EB', background: issueConsumableAsset?.id === a.id ? '#EAF3DE' : 'white' }}
                        >
                          <div className="w-9 h-9 rounded-lg bg-green-50 flex items-center justify-center text-lg flex-shrink-0">📦</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">{a.name}</p>
                            <p className="text-xs text-gray-400">{a.type} · {a.availableStock} available</p>
                          </div>
                          {issueConsumableAsset?.id === a.id && <span className="text-green-700 text-sm shrink-0">✓</span>}
                        </div>
                      ))}
                  </div>

                  {issueConsumableAsset && (
                    <form onSubmit={handleIssueConsumableFromProfile} id="profile-assign-form" className="space-y-3 pt-2 border-t border-gray-100">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1.5">Quantity</label>
                          <input type="number" min={1} max={Number(issueConsumableAsset.availableStock) || 0} value={issueConsumableForm.quantity} onChange={(e) => setIssueConsumableForm((p) => ({ ...p, quantity: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]" />
                          <p className="text-[10px] text-gray-400 mt-1">Max: {issueConsumableAsset.availableStock}</p>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1.5">Issue date</label>
                          <input type="date" value={issueConsumableForm.issueDate} onChange={(e) => setIssueConsumableForm((p) => ({ ...p, issueDate: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1.5">Notes <span className="text-gray-300 font-normal">optional</span></label>
                        <textarea value={issueConsumableForm.notes} onChange={(e) => setIssueConsumableForm((p) => ({ ...p, notes: e.target.value }))} rows={2} placeholder="Any instructions…" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:border-[#1B6B6B]" />
                      </div>
                    </form>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex gap-3 px-5 py-4 border-t border-gray-100 flex-shrink-0 bg-white">
              <button type="button" onClick={() => { setShowProfileAssignModal(null); setShowProfileAssetDropdown(false); setProfileAssetSearch(''); setIssueConsumableAsset(null); setProfileAssignMode('trackable'); }} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button
                type="submit"
                form="profile-assign-form"
                disabled={saving || (profileAssignMode === 'trackable' ? !assignAssetForm.assetId : !issueConsumableAsset)}
                className="flex-2 flex-1 py-2.5 bg-[#1B6B6B] text-white rounded-xl text-sm font-medium hover:bg-[#155858] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? 'Saving…' : profileAssignMode === 'trackable' ? 'Assign asset' : 'Issue consumable'}
              </button>
            </div>

          </div>
        </div>
      )}

      {returnAsset && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-xl w-full sm:max-w-md sm:my-8 p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Return Asset</h2>
            <form onSubmit={handleSaveReturnFromProfile} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-slate-500">Asset</p>
                  <p className="text-sm font-medium text-slate-800">
                    {returnAsset.assetId} · {returnAsset.name}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Employee</p>
                  <p className="text-sm text-slate-800">
                    {employee.fullName} ({employee.empId})
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Return Date</label>
                  <input
                    type="date"
                    name="date"
                    value={returnAssetForm.date}
                    onChange={handleReturnAssetChange}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Condition on Return</label>
                  <select
                    name="condition"
                    value={returnAssetForm.condition}
                    onChange={handleReturnAssetChange}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                  >
                    <option value="New">New</option>
                    <option value="Good">Good</option>
                    <option value="Fair">Fair</option>
                    <option value="Poor">Poor</option>
                    <option value="Damaged">Damaged</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">Notes</label>
                <textarea
                  name="notes"
                  value={returnAssetForm.notes}
                  onChange={handleReturnAssetChange}
                  rows={3}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                  placeholder="Any damage or notes on return"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setReturnAsset(null)}
                  className="text-sm text-slate-500 hover:text-slate-700"
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-[#1B6B6B] hover:bg-[#155858] text-white text-sm font-medium px-4 py-2 disabled:opacity-50"
                  disabled={saving}
                >
                  {saving ? 'Saving…' : 'Save Return'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {returnConsumableModal && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl p-6 w-full sm:max-w-sm max-h-[90vh] overflow-y-auto">
            <h3 className="font-semibold text-gray-900 mb-1">
              Return {returnConsumableModal.asset?.name}
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              Issued to {employee.fullName} · Qty: {returnConsumableModal.assignment?.quantity}
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Quantity to Return</label>
                <input
                  type="number"
                  min="1"
                  max={returnConsumableModal.assignment?.quantity}
                  value={returnQty}
                  onChange={(e) => setReturnQty(Number(e.target.value))}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Max: {returnConsumableModal.assignment?.quantity}
                </p>
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1">Condition on Return</label>
                <select
                  value={returnCondition}
                  onChange={(e) => setReturnCondition(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                >
                  <option>Good</option>
                  <option>Fair</option>
                  <option>Poor</option>
                  <option>Damaged</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1">Notes (optional)</label>
                <textarea
                  value={returnNotes}
                  onChange={(e) => setReturnNotes(e.target.value)}
                  placeholder="Any damage or notes..."
                  rows={2}
                  className="w-full border rounded-lg px-3 py-2 text-sm resize-none"
                />
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <button
                onClick={() => {
                  setReturnConsumableModal(null);
                  setReturnQty(1);
                  setReturnCondition('Good');
                  setReturnNotes('');
                }}
                className="flex-1 py-2 border rounded-xl text-sm text-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={handleReturnConsumableFromProfile}
                className="flex-1 py-2 bg-[#1B6B6B] text-white rounded-xl text-sm font-medium hover:bg-[#155858]"
              >
                Confirm Return
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
