import { useEffect } from 'react';
import { formatLakhs } from '../../utils';
import { INDIAN_STATES } from '../../utils/employeeProfileHelpers';

export default function EditEmployeeModal({
  employee,
  form,
  setForm,
  saving,
  activeEditTab,
  setActiveEditTab,
  showEditModal,
  setShowEditModal,
  handleSaveEdit,
  // Location dropdown
  locationDropdownRef,
  showLocationDropdown,
  setShowLocationDropdown,
  locationSearch,
  setLocationSearch,
  structuredLocations,
  branches,
  // Role dropdown
  editRoleDropdownRef,
  showEditRoleDropdown,
  setShowEditRoleDropdown,
  editRoleSearch,
  setEditRoleSearch,
  roles,
  editModalActiveRoles,
  editModalFilteredRoles,
  selectedEditRole,
  editRoleSalaryBand,
  // Manager dropdown
  showManagerDropdown,
  setShowManagerDropdown,
  managerSearch,
  setManagerSearch,
  managerOptions,
  // Lists
  departments,
  employmentTypes,
  categories,
  qualifications,
  benefitTemplates,
}) {
  useEffect(() => {
    if (!showEditModal) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setShowEditModal(false);
        setActiveEditTab('personal');
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showEditModal, setShowEditModal, setActiveEditTab]);

  if (!showEditModal || !form) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4 overflow-y-auto" aria-hidden="true">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-employee-modal-title"
        className="bg-white rounded-t-3xl sm:rounded-2xl shadow-xl w-full sm:max-w-2xl sm:my-8 flex flex-col max-h-[90vh] overflow-hidden"
      >

        {/* ── Modal header ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-full bg-[#E1F5EE] flex items-center justify-center text-xs font-semibold text-[#0F6E56] flex-shrink-0">
              {(employee?.fullName || '?').charAt(0)}
            </div>
            <div className="min-w-0">
              <p id="edit-employee-modal-title" className="text-sm font-semibold text-gray-800 leading-tight truncate">
                {employee?.fullName || 'Edit Employee'}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {[employee?.empId, employee?.designation, employee?.branch].filter(Boolean).join(' · ')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => { setShowEditModal(false); setActiveEditTab('personal'); }}
            className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors flex-shrink-0"
            aria-label="Close"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* ── Tab bar ── */}
        <div className="flex border-b border-gray-100 flex-shrink-0 overflow-x-auto scrollbar-none">
          {[
            { key: 'personal',      label: 'Personal',      icon: '👤' },
            { key: 'employment',    label: 'Employment',    icon: '💼' },
            { key: 'compensation',  label: 'Compensation',  icon: '₹' },
            { key: 'documents',     label: 'Documents',     icon: '🪪' },
            { key: 'emergency',     label: 'Emergency',     icon: '🆘' },
          ].map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveEditTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-3 text-xs font-medium whitespace-nowrap flex-shrink-0 border-b-2 transition-colors ${
                activeEditTab === t.key
                  ? 'border-[#1B6B6B] text-[#1B6B6B]'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              <span style={{ fontSize: '12px' }}>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Scrollable body ── */}
        <form onSubmit={handleSaveEdit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-5 py-5">

            {/* ══════════════ PERSONAL TAB ══════════════ */}
            {activeEditTab === 'personal' && (
              <div className="space-y-5">
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3 pb-2 border-b border-gray-100">Identity</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="block text-xs text-slate-600 mb-1">Full Name</label><input value={form.fullName} onChange={(e) => setForm((p) => ({ ...p, fullName: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20" required /></div>
                    <div><label className="block text-xs text-slate-600 mb-1">Father&apos;s Name</label><input value={form.fatherName} onChange={(e) => setForm((p) => ({ ...p, fatherName: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20" placeholder="Father's full name" /></div>
                    <div><label className="block text-xs text-slate-600 mb-1">Date of Birth</label><input type="date" value={form.dateOfBirth} onChange={(e) => setForm((p) => ({ ...p, dateOfBirth: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20" /></div>
                    <div><label className="block text-xs text-slate-600 mb-1">Gender</label><select value={form.gender} onChange={(e) => setForm((p) => ({ ...p, gender: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]"><option value="">—</option><option value="Male">Male</option><option value="Female">Female</option><option value="Other">Other</option></select></div>
                    <div><label className="block text-xs text-slate-600 mb-1">Blood Group</label><select value={form.bloodGroup} onChange={(e) => setForm((p) => ({ ...p, bloodGroup: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]"><option value="">Select</option>{['A+','A-','B+','B-','O+','O-','AB+','AB-'].map((bg) => <option key={bg} value={bg}>{bg}</option>)}</select></div>
                    <div><label className="block text-xs text-slate-600 mb-1">Marital Status</label><select value={form.maritalStatus} onChange={(e) => setForm((p) => ({ ...p, maritalStatus: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]"><option value="">—</option><option value="Single">Single</option><option value="Married">Married</option><option value="Divorced">Divorced</option><option value="Widowed">Widowed</option></select></div>
                    {form.maritalStatus === 'Married' && (
                      <div><label className="block text-xs text-gray-500 mb-1">Marriage / Wedding Date</label><input type="date" value={form.marriageDate} onChange={(e) => setForm((p) => ({ ...p, marriageDate: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]" /></div>
                    )}
                    <div><label className="block text-xs text-gray-500 mb-1">Disability</label><select value={form.disability} onChange={(e) => setForm((p) => ({ ...p, disability: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]"><option value="">None</option><option value="Visual Impairment">Visual Impairment</option><option value="Hearing Impairment">Hearing Impairment</option><option value="Physical Disability">Physical Disability</option><option value="Intellectual Disability">Intellectual Disability</option><option value="Other">Other</option></select></div>
                    <div><label className="block text-xs text-slate-600 mb-1">Highest Qualification</label><select value={form.qualification} onChange={(e) => setForm((p) => ({ ...p, qualification: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]"><option value="">—</option>{qualifications.map((q) => <option key={q} value={q}>{q}</option>)}{!qualifications.includes('Other') && <option value="Other">Other</option>}</select></div>
                  </div>
                </div>

                <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3 pb-2 border-b border-gray-100">Contact</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="block text-xs text-slate-600 mb-1">Email</label><input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20" required /></div>
                    <div><label className="block text-xs text-slate-600 mb-1">Phone</label><input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20" /></div>
                    <div><label className="block text-xs text-slate-600 mb-1">Alternative Mobile</label><input type="tel" maxLength={10} placeholder="Alternative 10-digit number" value={form.alternativeMobile} onChange={(e) => setForm((p) => ({ ...p, alternativeMobile: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20" /></div>
                  </div>
                </div>

                <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3 pb-2 border-b border-gray-100">Address</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2"><label className="block text-xs text-slate-600 mb-1">Street Address</label><input value={form.streetAddress} onChange={(e) => setForm((p) => ({ ...p, streetAddress: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20" placeholder="House/Flat no, Street name" /></div>
                    <div><label className="block text-xs text-slate-600 mb-1">City</label><input value={form.city} onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20" placeholder="City" /></div>
                    <div><label className="block text-xs text-slate-600 mb-1">State</label><select value={form.state} onChange={(e) => setForm((p) => ({ ...p, state: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]"><option value="">Select state</option>{INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
                    <div><label className="block text-xs text-slate-600 mb-1">Pincode</label><input value={form.pincode} onChange={(e) => setForm((p) => ({ ...p, pincode: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20" maxLength={6} placeholder="6-digit pincode" /></div>
                    <div><label className="block text-xs text-slate-600 mb-1">Country</label><input value={form.country} onChange={(e) => setForm((p) => ({ ...p, country: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20" placeholder="Country" /></div>
                  </div>
                </div>
              </div>
            )}

            {/* ══════════════ EMPLOYMENT TAB ══════════════ */}
            {activeEditTab === 'employment' && (
              <div className="space-y-5">
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3 pb-2 border-b border-gray-100">Role & placement</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="block text-xs text-slate-600 mb-1">Emp ID</label><input value={form.empId} onChange={(e) => setForm((p) => ({ ...p, empId: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20" /></div>
                    <div><label className="block text-xs text-slate-600 mb-1">Joining Date</label><input type="date" value={form.joiningDate} onChange={(e) => setForm((p) => ({ ...p, joiningDate: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]" /></div>
                    <div><label className="block text-xs text-slate-600 mb-1">Department</label><select value={form.department} onChange={(e) => setForm((p) => ({ ...p, department: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]"><option value="">—</option>{departments.map((d) => <option key={d} value={d}>{d}</option>)}{!departments.includes('Other') && <option value="Other">Other</option>}</select></div>
                    <div><label className="block text-xs text-slate-600 mb-1">Employment Type</label><select value={form.employmentType} onChange={(e) => setForm((p) => ({ ...p, employmentType: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]"><option value="">—</option>{employmentTypes.map((t) => <option key={t} value={t}>{t}</option>)}{!employmentTypes.includes('Other') && <option value="Other">Other</option>}</select></div>
                    <div><label className="block text-xs text-slate-600 mb-1">Category</label><select value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]"><option value="">—</option>{categories.map((c) => <option key={c} value={c}>{c}</option>)}{!categories.includes('Other') && <option value="Other">Other</option>}</select></div>
                  </div>
                </div>

                <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3 pb-2 border-b border-gray-100">Location & branch</p>
                  <div className="relative" ref={locationDropdownRef}>
                    <label className="block text-xs text-slate-600 mb-1">Location</label>
                    <div role="button" tabIndex={0} onClick={() => setShowLocationDropdown(true)} onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') setShowLocationDropdown(true); }} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm cursor-pointer flex items-center justify-between hover:border-[#1B6B6B] min-h-[42px] focus:outline-none focus:border-[#1B6B6B]">
                      {form.location ? <span>{form.location}</span> : <span className="text-gray-400">Select location...</span>}
                      <span className="text-gray-400 text-xs">▾</span>
                    </div>
                    {showLocationDropdown && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-[60] max-h-52 overflow-hidden">
                        <div className="p-2 border-b border-gray-100">
                          <input autoFocus placeholder="Search location..." value={locationSearch} onChange={(e) => setLocationSearch(e.target.value)} className="w-full text-sm border rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#1B6B6B]" onClick={(e) => e.stopPropagation()} />
                        </div>
                        <div className="overflow-y-auto max-h-40">
                          {structuredLocations.map((l) => l.name).filter((l) => !locationSearch || l.toLowerCase().includes(locationSearch.toLowerCase())).map((loc) => (
                            <div key={loc} role="button" tabIndex={0} onClick={() => { setForm((prev) => ({ ...prev, location: loc, branch: '' })); setShowLocationDropdown(false); setLocationSearch(''); }} onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { setForm((prev) => ({ ...prev, location: loc, branch: '' })); setShowLocationDropdown(false); setLocationSearch(''); } }} className="px-3 py-2.5 hover:bg-[#E8F5F5] cursor-pointer text-sm border-b last:border-0">{loc}</div>
                          ))}
                          {structuredLocations.length === 0 && <div className="px-3 py-4 text-center text-sm text-gray-400">No locations configured.<br />Add in Settings → Manage Lists</div>}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="mt-3">
                    <label className="block text-xs text-slate-600 mb-1">Branch</label>
                    <select value={form.branch} onChange={(e) => setForm((p) => ({ ...p, branch: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]">
                      <option value="">—</option>
                      {(() => { const loc = structuredLocations.find((l) => l.name === form.location); const list = loc ? (loc.branches || []).map((b) => b.name) : branches; return list.map((b) => <option key={b} value={b}>{b}</option>); })()}
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3 pb-2 border-b border-gray-100">Designation & reporting</p>
                  <div className="space-y-3">
                    <div className="relative" ref={editRoleDropdownRef}>
                      <label className="block text-xs text-slate-600 mb-1">Designation</label>
                      <div role="button" tabIndex={0} onClick={() => setShowEditRoleDropdown(true)} onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') setShowEditRoleDropdown(true); }} className={`w-full border rounded-xl px-3 py-2.5 text-sm cursor-pointer flex items-center justify-between hover:border-[#1B6B6B] min-h-[42px] ${showEditRoleDropdown ? 'border-[#1B6B6B]' : 'border-gray-200'}`}>
                        {selectedEditRole ? (<div className="flex items-center gap-2 min-w-0 flex-1"><div className="min-w-0 text-left"><p className="text-sm font-medium text-gray-900">{selectedEditRole.title}</p><p className="text-xs text-gray-400 mt-0.5">{selectedEditRole.reportsTo ? `Reports to ${selectedEditRole.reportsTo}` : 'Top level'}{selectedEditRole.salaryBand?.min != null && selectedEditRole.salaryBand?.min !== '' && ` · ₹${formatLakhs(selectedEditRole.salaryBand.min)}–${formatLakhs(selectedEditRole.salaryBand.max)}/mo`}</p></div></div>) : form.designation ? (<span className="text-gray-800">{form.designation}</span>) : (<span className="text-gray-400">Search or select designation…</span>)}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {(selectedEditRole || form.designation) && (<button type="button" aria-label="Clear designation" onClick={(e) => { e.stopPropagation(); setForm((prev) => ({ ...prev, designation: '', designationRoleId: '' })); }} className="text-slate-400 hover:text-slate-600 text-xs">✕</button>)}
                          <span className="text-gray-400 text-xs">▾</span>
                        </div>
                      </div>
                      {showEditRoleDropdown && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-[60] max-h-64 overflow-hidden">
                          <div className="p-2 border-b border-gray-100 sticky top-0 bg-white">
                            <input autoFocus type="text" placeholder="Search by designation or reports-to…" value={editRoleSearch} onChange={(e) => setEditRoleSearch(e.target.value)} onClick={(e) => e.stopPropagation()} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#1B6B6B]" />
                          </div>
                          <div className="overflow-y-auto max-h-52">
                            {roles.length === 0 && <div className="px-3 py-4 text-center"><p className="text-sm text-slate-400 mb-2">No designations defined yet</p><p className="text-xs text-slate-400">Go to Library → Designations to add</p></div>}
                            {roles.length > 0 && editModalActiveRoles.length === 0 && <div className="px-3 py-4 text-center text-sm text-gray-400">No active designations.</div>}
                            {roles.length > 0 && editModalActiveRoles.length > 0 && (<>
                              <div onMouseDown={(e) => { e.preventDefault(); setForm((prev) => ({ ...prev, designation: '', designationRoleId: '' })); setShowEditRoleDropdown(false); setEditRoleSearch(''); }} className="px-3 py-2 text-xs text-gray-400 hover:bg-gray-50 cursor-pointer border-b border-gray-50">— Clear selection</div>
                              {editModalFilteredRoles.map((role) => (
                                <div key={role.id} role="button" tabIndex={0} onMouseDown={(e) => { e.preventDefault(); setForm((prev) => ({ ...prev, designation: role.title || '', designationRoleId: role.id })); setShowEditRoleDropdown(false); setEditRoleSearch(''); }} onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { setForm((prev) => ({ ...prev, designation: role.title || '', designationRoleId: role.id })); setShowEditRoleDropdown(false); setEditRoleSearch(''); } }} className={`px-3 py-3 hover:bg-[#E8F5F5] cursor-pointer border-b border-slate-50 last:border-0 transition-colors ${selectedEditRole?.id === role.id ? 'bg-[#E8F5F5]' : ''}`}>
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex-1 min-w-0 text-left"><p className="text-sm font-medium text-gray-900">{role.title}</p><p className="text-xs text-gray-400 mt-0.5">{role.reportsTo ? `Reports to ${role.reportsTo}` : 'Top level'}{role.salaryBand?.min != null && role.salaryBand?.min !== '' && ` · ₹${formatLakhs(role.salaryBand.min)}–${formatLakhs(role.salaryBand.max)}/mo`}</p></div>
                                    {selectedEditRole?.id === role.id && <span className="text-[#1B6B6B] flex-shrink-0">✓</span>}
                                  </div>
                                </div>
                              ))}
                              {editModalFilteredRoles.length === 0 && <div className="px-3 py-4 text-center text-sm text-gray-400">No designations found.{editRoleSearch.trim() && (<button type="button" onMouseDown={(e) => { e.preventDefault(); setForm((prev) => ({ ...prev, designation: editRoleSearch.trim(), designationRoleId: '' })); setShowEditRoleDropdown(false); setEditRoleSearch(''); }} className="block mx-auto mt-2 text-xs text-[#1B6B6B] underline">Use &quot;{editRoleSearch.trim()}&quot; as designation</button>)}</div>}
                            </>)}
                          </div>
                        </div>
                      )}
                      {selectedEditRole?.salaryBand?.min != null && selectedEditRole.salaryBand.min !== '' && (<p className="text-xs text-gray-400 mt-1">Band: ₹{formatLakhs(Number(selectedEditRole.salaryBand.min))}/mo — ₹{formatLakhs(Number(selectedEditRole.salaryBand.max))}/mo</p>)}
                    </div>

                    <div>
                      <label className="block text-xs text-slate-600 mb-1">Reporting Manager</label>
                      <div className="relative" onMouseDown={(e) => e.stopPropagation()}>
                        <div role="button" tabIndex={0} onClick={() => setShowManagerDropdown(true)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowManagerDropdown(true); } }} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm cursor-pointer flex items-center justify-between hover:border-[#1B6B6B] min-h-[42px]">
                          {form.reportingManagerId ? (<div className="flex items-center gap-2 min-w-0"><div className="w-6 h-6 rounded-full bg-[#C5E8E8] flex items-center justify-center text-xs font-medium text-[#1B6B6B]">{form.reportingManagerName?.charAt(0)}</div><span className="text-slate-800 truncate">{form.reportingManagerName}</span><span className="text-xs text-slate-400 whitespace-nowrap">{form.reportingManagerEmpId}</span></div>) : (<span className="text-slate-400">Select reporting manager</span>)}
                          <div className="flex items-center gap-1">
                            {form.reportingManagerId && (<button type="button" aria-label="Clear reporting manager" onClick={(e) => { e.stopPropagation(); setForm((prev) => ({ ...prev, reportingManagerId: '', reportingManagerName: '', reportingManagerEmpId: '' })); }} className="text-slate-400 hover:text-slate-600 text-xs">✕</button>)}
                            <span className="text-slate-400 text-xs">▾</span>
                          </div>
                        </div>
                        {showManagerDropdown && (
                          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 max-h-48 overflow-hidden">
                            <div className="p-2 border-b border-slate-100"><input autoFocus type="text" placeholder="Search by name or ID..." value={managerSearch} onChange={(e) => setManagerSearch(e.target.value)} className="w-full text-sm px-2 py-1.5 border rounded-lg focus:outline-none focus:border-[#1B6B6B]" onClick={(e) => e.stopPropagation()} /></div>
                            <div className="overflow-y-auto max-h-36">
                              <div onClick={() => { setForm((prev) => ({ ...prev, reportingManagerId: '', reportingManagerName: '', reportingManagerEmpId: '' })); setShowManagerDropdown(false); setManagerSearch(''); }} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer"><span className="text-sm text-slate-400">— None</span></div>
                              {managerOptions.filter((emp) => { if (!managerSearch) return true; const term = managerSearch.toLowerCase(); return emp.fullName?.toLowerCase().includes(term) || emp.empId?.toLowerCase().includes(term) || emp.designation?.toLowerCase().includes(term); }).map((emp) => (
                                <div key={emp.id} onClick={() => { setForm((prev) => ({ ...prev, reportingManagerId: emp.id, reportingManagerName: emp.fullName || '', reportingManagerEmpId: emp.empId || '' })); setShowManagerDropdown(false); setManagerSearch(''); }} className={`flex items-center gap-3 px-3 py-2 hover:bg-[#E8F5F5] cursor-pointer ${form.reportingManagerId === emp.id ? 'bg-[#E8F5F5]' : ''}`}>
                                  <div className="w-7 h-7 rounded-full bg-[#C5E8E8] flex items-center justify-center text-xs font-medium text-[#1B6B6B] flex-shrink-0">{emp.fullName?.charAt(0)}</div>
                                  <div className="flex-1 min-w-0"><p className="text-sm font-medium text-slate-800 truncate">{emp.fullName}</p><p className="text-xs text-slate-400">{emp.empId} · {emp.designation || '—'}</p></div>
                                  {form.reportingManagerId === emp.id && <span className="text-[#1B6B6B] text-xs">✓</span>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3 pb-2 border-b border-gray-100">Previous experience</p>
                  <div className="space-y-3">
                    <div><label className="block text-xs text-slate-600 mb-1">Previous Company Name</label><input placeholder="e.g. Infosys Pvt Ltd" value={form.prevCompany} onChange={(e) => setForm((p) => ({ ...p, prevCompany: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]" /></div>
                    <div><label className="block text-xs text-slate-600 mb-1">Previous Designation</label><input placeholder="e.g. Software Engineer" value={form.prevDesignation} onChange={(e) => setForm((p) => ({ ...p, prevDesignation: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]" /></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className="block text-xs text-gray-500 mb-1">From Date</label><input type="date" value={form.prevFromDate || ''} onChange={(e) => setForm((p) => ({ ...p, prevFromDate: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]" /></div>
                      <div><label className="block text-xs text-gray-500 mb-1">To Date</label><input type="date" value={form.prevToDate || ''} onChange={(e) => setForm((p) => ({ ...p, prevToDate: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]" /></div>
                    </div>
                    {form.prevFromDate && form.prevToDate && (
                      <div className="px-3 py-1.5 bg-[#E8F5F5] rounded-lg">
                        <p className="text-xs text-[#1B6B6B]">📅 Duration: {(() => { const from = new Date(form.prevFromDate); const to = new Date(form.prevToDate); const months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()); const years = Math.floor(months / 12); const remainingMonths = months % 12; if (years === 0) return `${remainingMonths} month${remainingMonths !== 1 ? 's' : ''}`; if (remainingMonths === 0) return `${years} year${years !== 1 ? 's' : ''}`; return `${years} year${years !== 1 ? 's' : ''} ${remainingMonths} month${remainingMonths !== 1 ? 's' : ''}`; })()}</p>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className="block text-xs text-slate-600 mb-1">Previous Manager Name</label><input placeholder="Manager's full name" value={form.prevManagerName} onChange={(e) => setForm((p) => ({ ...p, prevManagerName: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]" /></div>
                      <div><label className="block text-xs text-slate-600 mb-1">Previous Manager Phone</label><input type="tel" placeholder="Manager's phone number" value={form.prevManagerPhone} onChange={(e) => setForm((p) => ({ ...p, prevManagerPhone: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]" /></div>
                    </div>
                    <div><label className="block text-xs text-slate-600 mb-1">Previous Manager Email</label><input type="email" placeholder="Manager's email address" value={form.prevManagerEmail} onChange={(e) => setForm((p) => ({ ...p, prevManagerEmail: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]" /></div>
                  </div>
                </div>
              </div>
            )}

            {/* ══════════════ COMPENSATION TAB ══════════════ */}
            {activeEditTab === 'compensation' && (
              <div className="space-y-5">
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3 pb-2 border-b border-gray-100">Salary</p>
                  {form.designation && editRoleSalaryBand && (
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl mb-4">
                      <p className="text-xs text-blue-700 font-medium">💼 Salary band for <strong>{form.designation}</strong>: ₹{formatLakhs(editRoleSalaryBand.min)}/mo — ₹{formatLakhs(editRoleSalaryBand.max)}/mo (₹{formatLakhs(editRoleSalaryBand.min * 12)}—₹{formatLakhs(editRoleSalaryBand.max * 12)} p.a.)</p>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500 block mb-1.5">Basic Salary (per month) ₹</label>
                      <input type="number" placeholder="0" value={form.basicSalary || ''} onChange={(e) => { const basic = Number(e.target.value); const hra = Number(form.hra) || 0; const incentive = Number(form.incentive) || 0; const annual = (basic + hra + incentive) * 12; setForm((prev) => ({ ...prev, basicSalary: e.target.value, ctcPerAnnum: annual > 0 ? String(annual) : prev.ctcPerAnnum })); }} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]" />
                      {form.basicSalary ? <p className="text-xs text-gray-400 mt-1">= ₹{formatLakhs(Number(form.basicSalary) * 12)} per annum</p> : null}
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1.5">HRA (per month) ₹</label>
                      <input type="number" placeholder="0" value={form.hra || ''} onChange={(e) => { const hra = Number(e.target.value); const basic = Number(form.basicSalary) || 0; const incentive = Number(form.incentive) || 0; const annual = (basic + hra + incentive) * 12; setForm((prev) => ({ ...prev, hra: e.target.value, ctcPerAnnum: annual > 0 ? String(annual) : prev.ctcPerAnnum })); }} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]" />
                      {form.hra ? <p className="text-xs text-gray-400 mt-1">= ₹{formatLakhs(Number(form.hra) * 12)} per annum</p> : null}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Incentive (per month)</label>
                      <input type="number" min="0" placeholder="0" value={form.incentive} onChange={(e) => { const incentive = Number(e.target.value); const basic = Number(form.basicSalary) || 0; const hra = Number(form.hra) || 0; const annual = (basic + hra + incentive) * 12; setForm((prev) => ({ ...prev, incentive: e.target.value, ctcPerAnnum: annual > 0 ? String(annual) : prev.ctcPerAnnum })); }} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]" />
                      {form.incentive !== '' && form.incentive != null && !Number.isNaN(Number(form.incentive)) && Number(form.incentive) !== 0 && <p className="text-xs text-gray-400 mt-1">= ₹{formatLakhs(Number(form.incentive) * 12)} per annum</p>}
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1.5">Annual Gross ₹ <span className="text-gray-300 font-normal">(auto-calc · editable)</span></label>
                      <input type="number" placeholder="Auto-calculated" value={form.ctcPerAnnum || ''} onChange={(e) => setForm((prev) => ({ ...prev, ctcPerAnnum: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]" />
                      {form.ctcPerAnnum ? <p className="text-xs text-gray-400 mt-1">= ₹{formatLakhs(Number(form.ctcPerAnnum) / 12)} per month</p> : null}
                      {form.ctcPerAnnum && editRoleSalaryBand && (<p className={`text-xs mt-1 font-medium ${Number(form.ctcPerAnnum) >= editRoleSalaryBand.min * 12 && Number(form.ctcPerAnnum) <= editRoleSalaryBand.max * 12 ? 'text-green-600' : 'text-amber-600'}`}>{Number(form.ctcPerAnnum) >= editRoleSalaryBand.min * 12 && Number(form.ctcPerAnnum) <= editRoleSalaryBand.max * 12 ? '✓ Within salary band' : '⚠ Outside salary band'}</p>)}
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3 pb-2 border-b border-gray-100">Statutory benefits</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                      <div className="flex items-center justify-between mb-2 gap-2">
                        <div><p className="text-sm font-medium text-gray-700">Provident Fund (PF)</p><p className="text-xs text-gray-400">Statutory benefit</p></div>
                        <button type="button" onClick={() => setForm((prev) => ({ ...prev, pfApplicable: !prev.pfApplicable, pfNumber: prev.pfApplicable ? '' : prev.pfNumber }))} className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${form.pfApplicable ? 'bg-[#1B6B6B]' : 'bg-gray-200'}`}><div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${form.pfApplicable ? 'translate-x-5' : 'translate-x-0.5'}`} /></button>
                      </div>
                      {form.pfApplicable && <input placeholder="PF Account Number" value={form.pfNumber} onChange={(e) => setForm((p) => ({ ...p, pfNumber: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1 bg-white" />}
                    </div>
                    <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                      <div className="flex items-center justify-between mb-2 gap-2">
                        <div><p className="text-sm font-medium text-gray-700">ESIC</p><p className="text-xs text-gray-400">Statutory benefit</p></div>
                        <button type="button" onClick={() => setForm((prev) => ({ ...prev, esicApplicable: !prev.esicApplicable, esicNumber: prev.esicApplicable ? '' : prev.esicNumber }))} className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${form.esicApplicable ? 'bg-[#1B6B6B]' : 'bg-gray-200'}`}><div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${form.esicApplicable ? 'translate-x-5' : 'translate-x-0.5'}`} /></button>
                      </div>
                      {form.esicApplicable && <input placeholder="ESIC Number" value={form.esicNumber} onChange={(e) => setForm((p) => ({ ...p, esicNumber: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1 bg-white" />}
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-100">
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Additional benefits</p>
                    <button type="button" onClick={() => { const newBenefit = { id: `benefit_${Date.now()}`, name: '', value: '', notes: '' }; setForm((prev) => ({ ...prev, customBenefits: [...(prev.customBenefits || []), newBenefit] })); }} className="text-xs text-[#1B6B6B] hover:underline">+ Add benefit</button>
                  </div>
                  {(form.customBenefits || []).length === 0 && (
                    <button type="button" onClick={() => { setForm((prev) => ({ ...prev, customBenefits: [{ id: `benefit_${Date.now()}`, name: '', value: '', notes: '' }] })); }} className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-[#1B6B6B] hover:text-[#1B6B6B] transition-colors">+ Add benefit (Medical Insurance, Food Allowance, etc.)</button>
                  )}
                  <div className="space-y-2">
                    {(form.customBenefits || []).map((benefit, index) => (
                      <div key={benefit.id} className="p-3 border border-gray-100 rounded-xl bg-gray-50">
                        <div className="flex gap-2 mb-2">
                          <select value={!benefit.name ? '' : benefitTemplates.some((t) => t.name === benefit.name) ? benefit.name : '__custom__'} onChange={(e) => { const v = e.target.value; setForm((prev) => { const updated = [...(prev.customBenefits || [])]; const cur = updated[index]; updated[index] = { ...cur, name: v === '__custom__' ? '__custom__' : v, customName: v === '__custom__' ? cur.customName || '' : '' }; return { ...prev, customBenefits: updated }; }); }} className="flex-1 border rounded-lg px-3 py-2 text-sm bg-white"><option value="">Select benefit...</option>{benefitTemplates.map((bt) => <option key={bt.id} value={bt.name}>{bt.name}</option>)}<option value="__custom__">Other (type below)</option></select>
                          <button type="button" onClick={() => { setForm((prev) => ({ ...prev, customBenefits: (prev.customBenefits || []).filter((_, i) => i !== index) })); }} className="text-red-400 hover:text-red-600 px-2">✕</button>
                        </div>
                        {(benefit.name === '__custom__' || (benefit.name && !benefitTemplates.some((t) => t.name === benefit.name))) && (<input placeholder="Enter benefit name" value={benefit.name === '__custom__' ? benefit.customName || '' : benefit.name || ''} onChange={(e) => { setForm((prev) => { const updated = [...(prev.customBenefits || [])]; updated[index] = { ...updated[index], name: '__custom__', customName: e.target.value }; return { ...prev, customBenefits: updated }; }); }} className="w-full border rounded-lg px-3 py-2 text-sm mt-2 bg-white" />)}
                        <div className="grid grid-cols-2 gap-2 mt-2">
                          <input placeholder="Value (e.g. ₹5,00,000)" value={benefit.value} onChange={(e) => { setForm((prev) => { const updated = [...(prev.customBenefits || [])]; updated[index] = { ...updated[index], value: e.target.value }; return { ...prev, customBenefits: updated }; }); }} className="border rounded-lg px-3 py-2 text-sm bg-white" />
                          <input placeholder="Notes (e.g. Family floater)" value={benefit.notes} onChange={(e) => { setForm((prev) => { const updated = [...(prev.customBenefits || [])]; updated[index] = { ...updated[index], notes: e.target.value }; return { ...prev, customBenefits: updated }; }); }} className="border rounded-lg px-3 py-2 text-sm bg-white" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ══════════════ DOCUMENTS TAB ══════════════ */}
            {activeEditTab === 'documents' && (
              <div className="space-y-5">
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3 pb-2 border-b border-gray-100">Government IDs</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="block text-xs text-slate-600 mb-1">PAN</label><input value={form.panNumber} onChange={(e) => setForm((p) => ({ ...p, panNumber: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]" /></div>
                    <div><label className="block text-xs text-slate-600 mb-1">Aadhaar</label><input value={form.aadhaarNumber} onChange={(e) => setForm((p) => ({ ...p, aadhaarNumber: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]" placeholder="12-digit number" /></div>
                    <div className="col-span-2"><label className="block text-xs text-slate-600 mb-1">Driving Licence No.</label><input value={form.drivingLicenceNumber} onChange={(e) => setForm((p) => ({ ...p, drivingLicenceNumber: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]" placeholder="e.g. MH0120210012345" /></div>
                  </div>
                </div>

                <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3 pb-2 border-b border-gray-100">Bank details</p>
                  <div className="space-y-3">
                    <div><label className="text-xs text-gray-500 block mb-1.5">Bank Name</label><input value={form.bankName} onChange={(e) => setForm((p) => ({ ...p, bankName: e.target.value }))} placeholder="e.g. State Bank of India" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]" /></div>
                    <div><label className="text-xs text-gray-500 block mb-1.5">Account Holder Name</label><input value={form.accountHolderName} onChange={(e) => setForm((p) => ({ ...p, accountHolderName: e.target.value }))} placeholder="As per bank records" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]" /></div>
                    <div><label className="text-xs text-gray-500 block mb-1.5">IFSC Code</label><input value={form.ifscCode} onChange={(e) => setForm((p) => ({ ...p, ifscCode: e.target.value.toUpperCase().trim() }))} placeholder="e.g. SBIN0001234" maxLength={11} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono uppercase focus:outline-none focus:border-[#1B6B6B]" /></div>
                    <div><label className="text-xs text-gray-500 block mb-1.5">Account Type</label><select value={form.accountType} onChange={(e) => setForm((p) => ({ ...p, accountType: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]"><option value="">Select account type...</option><option value="Savings">Savings</option><option value="Current">Current</option><option value="Salary">Salary</option></select></div>
                  </div>
                </div>
              </div>
            )}

            {/* ══════════════ EMERGENCY TAB ══════════════ */}
            {activeEditTab === 'emergency' && (
              <div className="space-y-5">
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3 pb-2 border-b border-gray-100">Emergency contact</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="block text-xs text-slate-600 mb-1">Contact Name</label><input value={form.emergencyContactName} onChange={(e) => setForm((p) => ({ ...p, emergencyContactName: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]" placeholder="Full name" /></div>
                    <div><label className="block text-xs text-slate-600 mb-1">Relationship</label><select value={form.emergencyRelationship} onChange={(e) => setForm((p) => ({ ...p, emergencyRelationship: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]"><option value="">—</option><option value="Father">Father</option><option value="Mother">Mother</option><option value="Spouse">Spouse</option><option value="Sibling">Sibling</option><option value="Friend">Friend</option><option value="Other">Other</option></select></div>
                    <div className="col-span-2"><label className="block text-xs text-slate-600 mb-1">Contact Phone</label><input value={form.emergencyPhone} onChange={(e) => setForm((p) => ({ ...p, emergencyPhone: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]" maxLength={10} placeholder="10-digit mobile number" /></div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Modal footer ── */}
          <div className="flex gap-3 px-5 py-4 border-t border-gray-100 flex-shrink-0 bg-white">
            <button
              type="button"
              onClick={() => {
                setShowEditModal(false);
                setActiveEditTab('personal');
                setShowLocationDropdown(false);
                setLocationSearch('');
                setEditRoleSearch('');
                setShowEditRoleDropdown(false);
              }}
              className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 bg-[#1B6B6B] text-white rounded-xl text-sm font-medium hover:bg-[#155858] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
