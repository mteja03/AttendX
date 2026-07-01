import { useNavigate, useParams } from 'react-router-dom';
import { CONDITION_OPTIONS, buildAssetIdPrefix } from '../../utils/assetHelpers';

export default function AddAssetModal({
  showAddModal,
  setShowAddModal,
  form,
  setForm,
  formErrors,
  saving,
  handleSaveAsset,
  handleFormChange,
  selectedAddAssetMode,
  setAddAssetMode,
  assetTypes,
  structuredLocations,
  company,
}) {
  const { companyId } = useParams();
  const navigate = useNavigate();

  if (!showAddModal) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-xl w-full sm:max-w-xl sm:my-8 max-h-[92vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-800">Add asset</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {selectedAddAssetMode === 'trackable'
                ? 'Trackable — individual item with unique ID'
                : selectedAddAssetMode === 'consumable'
                ? 'Consumable — quantity pool, issued to employees'
                : 'Choose a type to get started'}
            </p>
          </div>
          <button type="button" onClick={() => setShowAddModal(false)} className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:bg-gray-50 flex-shrink-0 text-sm">✕</button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-6 py-5">

          {/* Step 1 — Mode picker */}
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Step 1 — Asset mode</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
            {[
              {
                mode: 'trackable',
                label: 'Trackable',
                desc: 'One item, one person at a time.',
                examples: 'Laptop · Phone · Vehicle · ID card',
                icon: (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#185FA5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                ),
                bg: '#E6F1FB',
                activeBorder: '#378ADD',
                activeBg: '#EBF4FD',
                textColor: '#185FA5',
              },
              {
                mode: 'consumable',
                label: 'Consumable',
                desc: 'Stock pool issued to many employees.',
                examples: 'Uniform · SIM card · Stationery',
                icon: (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3B6D11" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>
                ),
                bg: '#EAF3DE',
                activeBorder: '#639922',
                activeBg: '#F0F8E8',
                textColor: '#27500A',
              },
            ].map(({ mode, label, desc, examples, icon, bg, activeBorder, activeBg, textColor }) => {
              const isActive = selectedAddAssetMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => { setAddAssetMode(mode); handleFormChange({ target: { name: 'type', value: '' } }); }}
                  className="text-left rounded-xl border-2 p-3.5 transition-all"
                  style={{
                    borderColor: isActive ? activeBorder : '#E5E7EB',
                    background: isActive ? activeBg : '#FAFAFA',
                  }}
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-2.5" style={{ background: bg }}>
                    {icon}
                  </div>
                  <p className="text-sm font-semibold" style={{ color: isActive ? textColor : '#374151' }}>{label}</p>
                  <p className="text-xs text-gray-500 mt-0.5 leading-snug">{desc}</p>
                  <p className="text-[10px] mt-1.5 font-medium" style={{ color: isActive ? textColor : '#9CA3AF' }}>{examples}</p>
                </button>
              );
            })}
          </div>

          {/* Step 2 — Asset type chips */}
          {assetTypes.length > 0 && (
            <>
              <div className="h-px bg-gray-100 mb-5" />
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Step 2 — Asset type</p>
              {(() => {
                const relevantTypes = selectedAddAssetMode
                  ? assetTypes.filter((t) => (t.mode || 'trackable') === selectedAddAssetMode)
                  : assetTypes;
                const shown = relevantTypes.slice(0, 8);
                const typeIcons = { Laptop: '💻', Desktop: '🖥️', 'Mobile Phone': '📱', 'SIM Card': '📶', Tablet: '📟', 'ID Card': '🪪', 'Access Card': '💳', Uniform: '👔', Headset: '🎧', Charger: '🔌', Vehicle: '🚗', Tools: '🔧', Furniture: '🪑' };
                return (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                    {shown.map((t) => (
                      <button
                        key={t.name}
                        type="button"
                        onClick={() => handleFormChange({ target: { name: 'type', value: t.name } })}
                        className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl border-2 transition-all"
                        style={{
                          borderColor: form.type === t.name ? (selectedAddAssetMode === 'consumable' ? '#639922' : '#378ADD') : '#E5E7EB',
                          background: form.type === t.name ? (selectedAddAssetMode === 'consumable' ? '#F0F8E8' : '#EBF4FD') : '#FAFAFA',
                        }}
                      >
                        <span className="text-xl leading-none">{typeIcons[t.name] || '📦'}</span>
                        <span className="text-[10px] text-center leading-tight" style={{ color: form.type === t.name ? (selectedAddAssetMode === 'consumable' ? '#27500A' : '#185FA5') : '#6B7280', fontWeight: form.type === t.name ? '500' : '400' }}>{t.name}</span>
                      </button>
                    ))}
                    {relevantTypes.length > 8 && (
                      <div className="flex flex-col items-center justify-center p-2.5 rounded-xl border border-dashed border-gray-200 bg-gray-50">
                        <span className="text-xs text-gray-400">+{relevantTypes.length - 8} more</span>
                      </div>
                    )}
                  </div>
                );
              })()}
              <select
                name="type"
                value={form.type}
                onChange={handleFormChange}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-600 bg-gray-50 mb-1"
              >
                <option value="">Or select from full list…</option>
                {selectedAddAssetMode
                  ? assetTypes.filter((t) => (t.mode || 'trackable') === selectedAddAssetMode).map((t) => <option key={t.name} value={t.name}>{t.name}</option>)
                  : assetTypes.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)
                }
              </select>
              {formErrors.type && <p className="text-red-500 text-xs mt-1">{formErrors.type}</p>}
            </>
          )}

          {/* Step 3 — Assign to (trackable only) */}
          {selectedAddAssetMode === 'trackable' && form.type && (
            <>
              <div className="h-px bg-gray-100 mb-5" />
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Step 3 — Assign to</p>
              <div className="flex rounded-xl border border-gray-200 overflow-hidden mb-4">
                <button type="button" onClick={() => setForm((p) => ({ ...p, assignmentType: 'employee', assignedLocation: '', assignedBranch: '', assignedArea: '' }))}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-medium transition-colors ${form.assignmentType === 'employee' ? 'bg-[#1B6B6B] text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                  👤 Employee
                </button>
                <button type="button" onClick={() => setForm((p) => ({ ...p, assignmentType: 'branch' }))}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-medium transition-colors border-l border-gray-200 ${form.assignmentType === 'branch' ? 'bg-[#1B6B6B] text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                  🏢 Branch
                </button>
              </div>
              {form.assignmentType === 'branch' && (
                <div className="space-y-3 mb-4 p-3 bg-gray-50 rounded-xl">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Location</label>
                    <select name="assignedLocation" value={form.assignedLocation} onChange={(e) => setForm((p) => ({ ...p, assignedLocation: e.target.value, assignedBranch: '' }))} className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 bg-white focus:outline-none focus:border-[#1B6B6B]">
                      <option value="">Select location…</option>
                      {structuredLocations.map((l) => <option key={l.name} value={l.name}>{l.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Branch</label>
                    <select name="assignedBranch" value={form.assignedBranch} onChange={(e) => setForm((p) => ({ ...p, assignedBranch: e.target.value }))} className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 bg-white focus:outline-none focus:border-[#1B6B6B]">
                      <option value="">Select branch…</option>
                      {(() => {
                        const loc = structuredLocations.find((l) => l.name === form.assignedLocation);
                        const list = loc?.branches?.length ? loc.branches.map((b) => b.name) : (company?.branches || []).map((b) => typeof b === 'object' ? b.name : b);
                        return list.map((b) => <option key={b} value={b}>{b}</option>);
                      })()}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Area / floor</label>
                    <input type="text" name="assignedArea" value={form.assignedArea} onChange={handleFormChange} placeholder="e.g. Reception, 2nd Floor Admin" className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 bg-white focus:outline-none focus:border-[#1B6B6B]" />
                  </div>
                </div>
              )}
            </>
          )}

          {assetTypes.length === 0 && (
            <div className="text-center py-6 bg-gray-50 rounded-xl border border-dashed border-gray-200 mb-4">
              <p className="text-sm text-gray-500 mb-2">No asset types configured yet.</p>
              <button type="button" onClick={() => navigate(`/company/${companyId}/settings`)} className="text-sm text-[#1B6B6B] hover:underline">Go to Settings → Manage Lists to add asset types</button>
            </div>
          )}

          {form.type && selectedAddAssetMode && (
            <form onSubmit={handleSaveAsset} id="add-asset-form">

              <div className="h-px bg-gray-100 my-5" />
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-4">Step 3 — Details</p>

              {selectedAddAssetMode === 'trackable' ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">Asset name</label>
                      <input name="name" value={form.name} onChange={handleFormChange} placeholder={`e.g. ${form.type} — Dell`} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]" />
                      {formErrors.name && <p className="text-red-500 text-xs mt-1">{formErrors.name}</p>}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">
                        Asset ID
                        <span className="ml-1.5 text-[10px] font-mono bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">{buildAssetIdPrefix(form.type)}- prefix</span>
                      </label>
                      <input name="assetId" value={form.assetId} onChange={handleFormChange} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#1B6B6B]" />
                      {formErrors.assetId && <p className="text-red-500 text-xs mt-1">{formErrors.assetId}</p>}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">Brand</label>
                      <input name="brand" value={form.brand} onChange={handleFormChange} placeholder="e.g. Dell, Apple" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">Model</label>
                      <input name="model" value={form.model} onChange={handleFormChange} placeholder="e.g. XPS 15" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Serial number</label>
                    <input name="serialNumber" value={form.serialNumber} onChange={handleFormChange} placeholder="From the device label" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#1B6B6B]" />
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Item name</label>
                    <input name="name" value={form.name} onChange={handleFormChange} placeholder={`e.g. ${form.type}`} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">Total quantity in stock</label>
                      <input type="number" name="totalStock" value={form.totalStock} onChange={handleFormChange} placeholder="0" min={0} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]" />
                      {formErrors.totalStock && <p className="text-red-500 text-xs mt-1">{formErrors.totalStock}</p>}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">Unit</label>
                      <select name="unit" value={form.unit} onChange={handleFormChange} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]">
                        <option value="pieces">pieces</option>
                        <option value="sets">sets</option>
                        <option value="units">units</option>
                        <option value="pairs">pairs</option>
                      </select>
                    </div>
                  </div>
                  {Number(form.totalStock) > 0 && (
                    <div className="flex items-center gap-3 px-3 py-2.5 bg-[#EAF3DE] rounded-xl">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3B6D11" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>
                      <p className="text-xs text-[#27500A] font-medium">{form.totalStock} {form.unit} will be available to issue</p>
                    </div>
                  )}
                </div>
              )}

              <div className="h-px bg-gray-100 my-5" />
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-4">
                Step 4 — Purchase &amp; condition
                <span className="ml-2 text-gray-300 font-normal normal-case tracking-normal">optional</span>
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                {selectedAddAssetMode === 'trackable' ? (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">Purchase date</label>
                      <input type="date" name="purchaseDate" value={form.purchaseDate} onChange={handleFormChange} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">Price (₹)</label>
                      <input type="number" name="purchasePrice" value={form.purchasePrice} onChange={handleFormChange} placeholder="0" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">Warranty expiry</label>
                      <input type="date" name="warrantyExpiry" value={form.warrantyExpiry} onChange={handleFormChange} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]" />
                    </div>
                  </>
                ) : (
                  <div className="col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">Price per unit (₹)</label>
                      <input type="number" name="purchasePrice" value={form.purchasePrice} onChange={handleFormChange} placeholder="0" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]" />
                    </div>
                  </div>
                )}
              </div>

              {selectedAddAssetMode === 'trackable' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Condition</label>
                    <select name="condition" value={form.condition} onChange={handleFormChange} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]">
                      {CONDITION_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between px-3 py-3 bg-gray-50 rounded-xl border border-gray-100">
                <div>
                  <p className="text-sm font-medium text-gray-700">Employee must return this asset</p>
                  <p className="text-xs text-gray-400 mt-0.5">Uncheck for one-way issued items (e.g. welcome kit)</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleFormChange({ target: { name: 'isReturnable', type: 'checkbox', checked: !form.isReturnable } })}
                  className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${form.isReturnable ? 'bg-[#1B6B6B]' : 'bg-gray-200'}`}
                >
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${form.isReturnable ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>

              <div className="mt-3">
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Notes <span className="text-gray-300 font-normal">optional</span></label>
                <textarea name="notes" value={form.notes} onChange={handleFormChange} rows={2} placeholder="Any additional information" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:border-[#1B6B6B]" />
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 flex-shrink-0 bg-white">
          <div className="flex items-center gap-1.5">
            {[1,2,3,4].map((n) => {
              const active = n === 1 ? true : n === 2 ? !!selectedAddAssetMode : n === 3 ? !!form.type : !!(form.type && form.name);
              return (
                <div key={n} className={`h-1.5 rounded-full transition-all ${active ? 'bg-[#1B6B6B]' : 'bg-gray-200'}`} style={{ width: active ? '16px' : '6px' }} />
              );
            })}
            <span className="text-xs text-gray-400 ml-1">
              {!selectedAddAssetMode ? 'Choose mode' : !form.type ? 'Choose type' : !form.name ? 'Add details' : 'Ready to save'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
            <button
              type="submit"
              form="add-asset-form"
              disabled={saving || !form.type}
              className="px-5 py-2 bg-[#1B6B6B] text-white rounded-xl text-sm font-medium hover:bg-[#155858] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'Saving…' : 'Save asset'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
