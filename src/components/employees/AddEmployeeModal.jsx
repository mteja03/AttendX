import { useRef, useEffect } from 'react';
import { formatLakhs } from '../../utils';
import { ADD_STEPS, INDIAN_STATES } from '../../utils/employeeListHelpers.jsx';

export default function AddEmployeeModal({
  addStep,
  setAddStep,
  form,
  setForm,
  formErrors,
  formWarnings,
  saving,
  handleAddEmployee,
  handleCloseAddModal,
  handleFormChange,
  handleEmpIdBlur,
  nextEmpId,
  departments,
  branches,
  categories,
  qualifications,
  employmentTypes,
  structuredLocations,
  locationFilterOptions,
  reportingManagerOptions,
  roles,
  selectedRole,
  setSelectedRole,
  roleSearch,
  setRoleSearch,
  showRoleDropdown,
  setShowRoleDropdown,
  roleDropdownRef,
  locationSearch,
  setLocationSearch,
  showLocationDropdown,
  setShowLocationDropdown,
  locationDropdownRef,
  managerSearch,
  setManagerSearch,
  showManagerDropdown,
  setShowManagerDropdown,
  roleSalaryBand,
  benefitTemplates,
  newEmpPhotoSrc,
  setNewEmpPhoto,
  setNewEmpPhotoSrc,
  setNewEmpRawSrc,
  setNewEmpCrop,
  setNewEmpZoom,
  setNewEmpCroppedPixels,
  setNewEmpCropOpen,
  showError,
}) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') handleCloseAddModal();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleCloseAddModal]);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4 overflow-y-auto" aria-hidden="true">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-employee-modal-title"
        className="bg-white rounded-t-3xl sm:rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] min-h-0 flex flex-col overflow-hidden sm:my-8"
      >
        {(() => {
          try {
            return (
              <>
                <div className="flex justify-center pt-2 pb-1 sm:hidden flex-shrink-0">
                  <div className="w-10 h-1 bg-gray-200 rounded-full" />
                </div>
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
                  <div>
                    <h2 id="add-employee-modal-title" className="text-base font-semibold text-gray-800">Add Employee</h2>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Step {addStep + 1} of {ADD_STEPS.length} — {ADD_STEPS[addStep].sub}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleCloseAddModal}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors text-lg"
                    aria-label="Close"
                  >
                    ✕
                  </button>
                </div>
                <div className="flex items-center px-6 py-3 gap-1 border-b border-gray-100 flex-shrink-0 bg-gray-50/50">
                  {ADD_STEPS.map((step, i) => (
                    <button
                      key={step.id}
                      type="button"
                      onClick={() => {
                        if (i < addStep) setAddStep(i);
                      }}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex-1 justify-center ${
                        i === addStep
                          ? 'bg-[#1B6B6B] text-white'
                          : i < addStep
                            ? 'text-[#1B6B6B] bg-[#E1F5EE]'
                            : 'text-gray-400 bg-transparent'
                      }`}
                    >
                      <span
                        className={
                          i === addStep
                            ? 'text-white'
                            : i < addStep
                              ? 'text-[#0F6E56]'
                              : 'text-gray-300'
                        }
                      >
                        {i < addStep ? (
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path
                              d="M2 6l3 3 5-5"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        ) : (
                          step.icon
                        )}
                      </span>
                      <span className="hidden sm:inline">{step.label}</span>
                    </button>
                  ))}
                </div>
                <form onSubmit={handleAddEmployee} className="flex flex-col flex-1 min-h-0">
                  <div className="flex-1 overflow-y-auto p-6 min-h-0">
                    {addStep === 0 && (
                      <>
                        <div className="flex flex-col items-center py-4 mb-6 border-b border-gray-100">
                          <div className="relative group mb-3">
                            {newEmpPhotoSrc ? (
                              <img
                                src={newEmpPhotoSrc}
                                alt="Preview"
                                loading="lazy"
                                className="w-24 h-24 rounded-full object-cover ring-4 ring-[#E8F5F5] border-2 border-[#1B6B6B]"
                              />
                            ) : (
                              <div className="w-24 h-24 rounded-full bg-gray-100 border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400">
                                <span className="text-2xl">📷</span>
                                <span className="text-xs mt-1">No photo</span>
                              </div>
                            )}
                            {newEmpPhotoSrc && (
                              <button
                                type="button"
                                aria-label="Remove photo"
                                onClick={() => {
                                  setNewEmpPhoto(null);
                                  setNewEmpPhotoSrc(null);
                                  setNewEmpRawSrc(null);
                                }}
                                className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-red-500 text-white text-xs flex items-center justify-center border-2 border-white hover:bg-red-600"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                          <label className="cursor-pointer">
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp,image/jpg"
                              className="hidden"
                              onChange={(ev) => {
                                const file = ev.target.files?.[0];
                                if (!file) return;
                                ev.target.value = '';
                                if (!file.type.startsWith('image/')) {
                                  showError('Please select an image file');
                                  return;
                                }
                                if (file.size > 10 * 1024 * 1024) {
                                  showError('Image must be under 10MB');
                                  return;
                                }
                                const reader = new FileReader();
                                reader.onload = (re) => {
                                  setNewEmpRawSrc(re.target?.result || null);
                                  setNewEmpCrop({ x: 0, y: 0 });
                                  setNewEmpZoom(1);
                                  setNewEmpCroppedPixels(null);
                                  setNewEmpCropOpen(true);
                                };
                                reader.readAsDataURL(file);
                              }}
                            />
                            <span className="px-4 py-2 text-sm border border-[#1B6B6B] text-[#1B6B6B] rounded-xl hover:bg-[#E8F5F5] transition-colors font-medium inline-block">
                              {newEmpPhotoSrc ? '🔄 Change Photo' : '📷 Add Photo'}
                            </span>
                          </label>
                          <p className="text-xs text-gray-400 mt-2">Optional · JPG or PNG · Max 10MB</p>
                        </div>
                        <div className="mb-6">
                          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4 pb-2 border-b border-gray-100 flex items-center gap-2">
                            <span className="text-base">👤</span>
                            Personal Info
                          </h3>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="sm:col-span-2">
                              <label className="block text-xs font-medium text-slate-600 mb-1">Full Name</label>
                              <input name="fullName" value={form.fullName} onChange={handleFormChange} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20" />
                              {formErrors.fullName && <p className="text-red-500 text-xs mt-1">{formErrors.fullName}</p>}
                            </div>
                            <div className="sm:col-span-2">
                              <label className="block text-xs font-medium text-slate-600 mb-1">Father&apos;s Name</label>
                              <input
                                name="fatherName"
                                value={form.fatherName}
                                onChange={handleFormChange}
                                placeholder="Father's full name"
                                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
                              <input type="email" name="email" value={form.email} onChange={handleFormChange} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20" />
                              {formErrors.email && <p className="text-red-500 text-xs mt-1">{formErrors.email}</p>}
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">Phone</label>
                              <input name="phone" value={form.phone} onChange={handleFormChange} placeholder="10-digit mobile number" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20" />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">Alternative Mobile</label>
                              <input
                                type="tel"
                                name="alternativeMobile"
                                placeholder="Alternative 10-digit number"
                                value={form.alternativeMobile}
                                onChange={handleFormChange}
                                maxLength={10}
                                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">Date of Birth</label>
                              <input type="date" name="dateOfBirth" value={form.dateOfBirth} onChange={handleFormChange} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20" />
                              {formErrors.dateOfBirth && <p className="text-red-500 text-xs mt-1">{formErrors.dateOfBirth}</p>}
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">Gender</label>
                              <select name="gender" value={form.gender} onChange={handleFormChange} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20">
                                <option value="">—</option>
                                <option value="Male">Male</option>
                                <option value="Female">Female</option>
                                <option value="Other">Other</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">Blood Group</label>
                              <select
                                name="bloodGroup"
                                value={form.bloodGroup}
                                onChange={handleFormChange}
                                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20"
                              >
                                <option value="">Select blood group</option>
                                {['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map((bg) => (
                                  <option key={bg} value={bg}>
                                    {bg}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">Marital Status</label>
                              <select
                                name="maritalStatus"
                                value={form.maritalStatus}
                                onChange={handleFormChange}
                                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20"
                              >
                                <option value="">Select status</option>
                                <option value="Single">Single</option>
                                <option value="Married">Married</option>
                                <option value="Divorced">Divorced</option>
                                <option value="Widowed">Widowed</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 block mb-1">Disability</label>
                              <select
                                name="disability"
                                value={form.disability}
                                onChange={handleFormChange}
                                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm hover:border-[#1B6B6B] focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20"
                              >
                                <option value="">None</option>
                                <option value="Visual Impairment">Visual Impairment</option>
                                <option value="Hearing Impairment">Hearing Impairment</option>
                                <option value="Physical Disability">Physical Disability</option>
                                <option value="Intellectual Disability">Intellectual Disability</option>
                                <option value="Other">Other</option>
                              </select>
                            </div>
                            {form.maritalStatus === 'Married' && (
                              <div>
                                <label className="block text-xs text-gray-500 mb-1">Marriage Date / Wedding Date</label>
                                <input
                                  type="date"
                                  name="marriageDate"
                                  value={form.marriageDate}
                                  onChange={handleFormChange}
                                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm hover:border-[#1B6B6B] focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20"
                                />
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="mb-6">
                          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4 pb-2 border-b border-gray-100 flex items-center gap-2">
                            <span className="text-base">📍</span>
                            Address
                          </h3>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="sm:col-span-2">
                              <label className="block text-xs font-medium text-slate-600 mb-1">Street Address</label>
                              <input
                                name="streetAddress"
                                value={form.streetAddress}
                                onChange={handleFormChange}
                                placeholder="House/Flat no, Street name"
                                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">City</label>
                              <input
                                name="city"
                                value={form.city}
                                onChange={handleFormChange}
                                placeholder="City"
                                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">State</label>
                              <select
                                name="state"
                                value={form.state}
                                onChange={handleFormChange}
                                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20"
                              >
                                <option value="">Select state</option>
                                {INDIAN_STATES.map((s) => (
                                  <option key={s} value={s}>
                                    {s}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">Pincode</label>
                              <input
                                name="pincode"
                                value={form.pincode}
                                onChange={handleFormChange}
                                placeholder="6-digit pincode"
                                maxLength={6}
                                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20"
                              />
                              {formErrors.pincode && <p className="text-red-500 text-xs mt-1">{formErrors.pincode}</p>}
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">Country</label>
                              <input
                                name="country"
                                value={form.country}
                                onChange={handleFormChange}
                                placeholder="Country"
                                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20"
                              />
                            </div>
                          </div>
                        </div>
                      </>
                    )}

                    {addStep === 3 && (
                      <>
                        <div className="mb-6">
                          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4 pb-2 border-b border-gray-100 flex items-center gap-2">
                            <span className="text-base">🚨</span>
                            Emergency Contact
                          </h3>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">Contact Name</label>
                              <input
                                name="emergencyContactName"
                                value={form.emergencyContactName}
                                onChange={handleFormChange}
                                placeholder="Full name"
                                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20"
                              />
                              {formErrors.emergencyContactName && <p className="text-red-500 text-xs mt-1">{formErrors.emergencyContactName}</p>}
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">Relationship</label>
                              <select
                                name="emergencyRelationship"
                                value={form.emergencyRelationship}
                                onChange={handleFormChange}
                                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20"
                              >
                                <option value="">—</option>
                                <option value="Father">Father</option>
                                <option value="Mother">Mother</option>
                                <option value="Spouse">Spouse</option>
                                <option value="Sibling">Sibling</option>
                                <option value="Friend">Friend</option>
                                <option value="Other">Other</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">Contact Phone</label>
                              <input
                                name="emergencyPhone"
                                value={form.emergencyPhone}
                                onChange={handleFormChange}
                                placeholder="10-digit mobile number"
                                maxLength={10}
                                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20"
                              />
                              {formErrors.emergencyPhone && <p className="text-red-500 text-xs mt-1">{formErrors.emergencyPhone}</p>}
                            </div>
                          </div>
                        </div>

                        <div className="mt-6 p-4 bg-[#E1F5EE] rounded-xl border border-[#9FE1CB]">
                          <p className="text-xs font-medium text-[#0F6E56] mb-2">Ready to add employee</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {[
                              { l: 'Name', v: form.fullName },
                              { l: 'Emp ID', v: form.empId || '(auto)' },
                              { l: 'Department', v: form.department || '—' },
                              { l: 'Joining', v: form.joiningDate || '—' },
                            ].map(({ l, v }) => (
                              <div key={l}>
                                <p className="text-xs text-[#0F6E56]/60">{l}</p>
                                <p className="text-xs font-medium text-[#085041] truncate">{v || '—'}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    )}

                    {addStep === 1 && (
                      <>
                        <div className="mb-6">
                          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4 pb-2 border-b border-gray-100 flex items-center gap-2">
                            <span className="text-base">💼</span>
                            Previous Experience
                          </h3>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="sm:col-span-2">
                              <label className="block text-xs font-medium text-slate-600 mb-1">Previous Company Name</label>
                              <input
                                name="prevCompany"
                                placeholder="e.g. Infosys Pvt Ltd"
                                value={form.prevCompany}
                                onChange={handleFormChange}
                                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20"
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <label className="block text-xs font-medium text-slate-600 mb-1">Previous Designation</label>
                              <input
                                name="prevDesignation"
                                placeholder="e.g. Software Engineer"
                                value={form.prevDesignation}
                                onChange={handleFormChange}
                                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20"
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-xs text-gray-500 mb-1">From Date</label>
                                  <input
                                    type="date"
                                    name="prevFromDate"
                                    value={form.prevFromDate}
                                    onChange={handleFormChange}
                                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm hover:border-[#1B6B6B] focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs text-gray-500 mb-1">To Date</label>
                                  <input
                                    type="date"
                                    name="prevToDate"
                                    value={form.prevToDate}
                                    onChange={handleFormChange}
                                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm hover:border-[#1B6B6B] focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20"
                                  />
                                </div>
                              </div>
                              {form.prevFromDate && form.prevToDate && (
                                <div className="mt-1.5 px-3 py-1.5 bg-[#E8F5F5] rounded-lg">
                                  <p className="text-xs text-[#1B6B6B]">
                                    📅 Duration:{' '}
                                    {(() => {
                                      const from = new Date(form.prevFromDate);
                                      const to = new Date(form.prevToDate);
                                      const months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
                                      const years = Math.floor(months / 12);
                                      const remainingMonths = months % 12;
                                      if (years === 0) {
                                        return `${remainingMonths} month${remainingMonths !== 1 ? 's' : ''}`;
                                      }
                                      if (remainingMonths === 0) {
                                        return `${years} year${years !== 1 ? 's' : ''}`;
                                      }
                                      return `${years} year${years !== 1 ? 's' : ''} ${remainingMonths} month${remainingMonths !== 1 ? 's' : ''}`;
                                    })()}
                                  </p>
                                </div>
                              )}
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">Previous Manager Name</label>
                              <input
                                name="prevManagerName"
                                placeholder="Manager's full name"
                                value={form.prevManagerName}
                                onChange={handleFormChange}
                                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">Previous Manager Phone</label>
                              <input
                                type="tel"
                                name="prevManagerPhone"
                                placeholder="Manager's phone number"
                                value={form.prevManagerPhone}
                                onChange={handleFormChange}
                                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20"
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <label className="block text-xs font-medium text-slate-600 mb-1">Previous Manager Email</label>
                              <input
                                type="email"
                                name="prevManagerEmail"
                                placeholder="Manager's email address"
                                value={form.prevManagerEmail}
                                onChange={handleFormChange}
                                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="mb-6">
                          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4 pb-2 border-b border-gray-100 flex items-center gap-2">
                            <span className="text-base">💼</span>
                            Employment Details
                          </h3>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">Emp ID</label>
                              <input
                                name="empId"
                                value={form.empId}
                                onChange={handleFormChange}
                                onBlur={handleEmpIdBlur}
                                placeholder={nextEmpId}
                                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20 font-mono"
                              />
                              {formErrors.empId && <p className="text-xs text-red-500 mt-1">{formErrors.empId}</p>}
                              {!formErrors.empId && formWarnings.empId && <p className="text-xs text-amber-600 mt-1">{formWarnings.empId}</p>}
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">Department</label>
                              <select name="department" value={form.department} onChange={handleFormChange} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20">
                                <option value="">—</option>
                                {departments.map((d) => <option key={d} value={d}>{d}</option>)}
                                {!departments.includes('Other') && <option value="Other">Other</option>}
                              </select>
                            </div>
                            <div className="sm:col-span-2 relative" ref={roleDropdownRef}>
                              <label className="block text-xs font-medium text-slate-600 mb-1">Designation</label>
                              <div
                                role="button"
                                tabIndex={0}
                                onClick={() => setShowRoleDropdown(true)}
                                onKeyDown={(ev) => {
                                  if (ev.key === 'Enter' || ev.key === ' ') setShowRoleDropdown(true);
                                }}
                                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm cursor-pointer flex items-center justify-between hover:border-[#1B6B6B] min-h-[42px]"
                              >
                                {selectedRole ? (
                                  <div className="flex items-center gap-2 min-w-0">
                                    <div className="min-w-0 text-left">
                                      <p className="text-sm font-medium text-gray-900">{selectedRole.title}</p>
                                      <p className="text-xs text-gray-400 mt-0.5">
                                        {selectedRole.reportsTo
                                          ? `Reports to ${selectedRole.reportsTo}`
                                          : 'Top level designation'}
                                        {selectedRole.salaryBand?.min != null &&
                                          selectedRole.salaryBand?.min !== '' &&
                                          ` · ₹${formatLakhs(selectedRole.salaryBand.min)}–${formatLakhs(selectedRole.salaryBand.max)}/mo`}
                                      </p>
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-slate-400">Search or select designation…</span>
                                )}
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  {selectedRole && (
                                    <button
                                      type="button"
                                      aria-label="Clear designation"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedRole(null);
                                        setForm((prev) => ({ ...prev, designation: '', designationRoleId: '' }));
                                      }}
                                      className="text-slate-400 hover:text-slate-600 text-xs"
                                    >
                                      ✕
                                    </button>
                                  )}
                                  <span className="text-slate-400 text-xs">▾</span>
                                </div>
                              </div>
                              {showRoleDropdown && (
                                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-[60] max-h-64 overflow-hidden">
                                  <div className="p-2 border-b border-slate-100 sticky top-0 bg-white">
                                    <input
                                      autoFocus
                                      placeholder="Search by designation or reports-to…"
                                      value={roleSearch}
                                      onChange={(e) => setRoleSearch(e.target.value)}
                                      className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#1B6B6B]"
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                  </div>
                                  <div className="overflow-y-auto max-h-52">
                                    {roles.length === 0 && (
                                      <div className="px-3 py-4 text-center">
                                        <p className="text-sm text-slate-400 mb-2">No designations defined yet</p>
                                        <p className="text-xs text-slate-400">Go to Library → Designations to add</p>
                                      </div>
                                    )}
                                    {roles
                                      .filter((r) => r.isActive !== false)
                                      .filter((r) => {
                                        if (!roleSearch.trim()) return true;
                                        const q = roleSearch.toLowerCase();
                                        return (
                                          (r.title || '').toLowerCase().includes(q) ||
                                          (r.reportsTo || '').toLowerCase().includes(q)
                                        );
                                      })
                                      .map((role) => (
                                        <div
                                          key={role.id}
                                          role="button"
                                          tabIndex={0}
                                          onClick={() => {
                                            setSelectedRole(role);
                                            setForm((prev) => ({
                                              ...prev,
                                              designation: role.title || '',
                                              designationRoleId: role.id,
                                            }));
                                            setShowRoleDropdown(false);
                                            setRoleSearch('');
                                          }}
                                          onKeyDown={(ev) => {
                                            if (ev.key === 'Enter' || ev.key === ' ') {
                                              setSelectedRole(role);
                                              setForm((prev) => ({
                                                ...prev,
                                                designation: role.title || '',
                                                designationRoleId: role.id,
                                              }));
                                              setShowRoleDropdown(false);
                                              setRoleSearch('');
                                            }
                                          }}
                                          className={`px-3 py-3 hover:bg-[#E8F5F5] cursor-pointer border-b border-slate-50 last:border-0 transition-colors ${
                                            selectedRole?.id === role.id ? 'bg-[#E8F5F5]' : ''
                                          }`}
                                        >
                                          <div className="flex items-center justify-between gap-2">
                                            <div className="flex-1 min-w-0 text-left">
                                              <p className="text-sm font-medium text-gray-900">{role.title}</p>
                                              <p className="text-xs text-gray-400 mt-0.5">
                                                {role.reportsTo ? `Reports to ${role.reportsTo}` : 'Top level designation'}
                                                {role.salaryBand?.min != null &&
                                                  role.salaryBand?.min !== '' &&
                                                  ` · ₹${formatLakhs(role.salaryBand.min)}–${formatLakhs(role.salaryBand.max)}/mo (₹${formatLakhs(Number(role.salaryBand.min) * 12)}–${formatLakhs(Number(role.salaryBand.max) * 12)} pa)`}
                                              </p>
                                            </div>
                                            {selectedRole?.id === role.id && (
                                              <span className="text-[#1B6B6B] flex-shrink-0">✓</span>
                                            )}
                                          </div>
                                        </div>
                                      ))}
                                    {roles.filter((r) => r.isActive !== false).filter((r) => {
                                      if (!roleSearch.trim()) return true;
                                      const q = roleSearch.toLowerCase();
                                      return (
                                        (r.title || '').toLowerCase().includes(q) ||
                                        (r.reportsTo || '').toLowerCase().includes(q)
                                      );
                                    }).length === 0 &&
                                      roles.length > 0 && (
                                        <div className="px-3 py-4 text-center text-sm text-gray-400">No designations found.</div>
                                      )}
                                  </div>
                                </div>
                              )}
                            </div>
                            <div className="sm:col-span-2 relative" ref={locationDropdownRef}>
                              <label className="block text-xs font-medium text-slate-600 mb-1">Location</label>
                              <div
                                role="button"
                                tabIndex={0}
                                onClick={() => setShowLocationDropdown(true)}
                                onKeyDown={(ev) => {
                                  if (ev.key === 'Enter' || ev.key === ' ') setShowLocationDropdown(true);
                                }}
                                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm cursor-pointer flex items-center justify-between hover:border-[#1B6B6B] min-h-[42px]"
                              >
                                {form.location ? (
                                  <span>{form.location}</span>
                                ) : (
                                  <span className="text-gray-400">Select location...</span>
                                )}
                                <span className="text-gray-400 text-xs">▾</span>
                              </div>
                              {showLocationDropdown && (
                                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 max-h-52 overflow-hidden">
                                  <div className="p-2 border-b border-gray-100">
                                    <input
                                      autoFocus
                                      placeholder="Search location..."
                                      value={locationSearch}
                                      onChange={(e) => setLocationSearch(e.target.value)}
                                      className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#1B6B6B]"
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                  </div>
                                  <div className="overflow-y-auto max-h-40">
                                    {locationFilterOptions
                                      .filter((l) => !locationSearch || l.toLowerCase().includes(locationSearch.toLowerCase()))
                                      .map((locName) => (
                                        <div
                                          key={locName}
                                          role="button"
                                          tabIndex={0}
                                          onClick={() => {
                                            setForm((prev) => ({ ...prev, location: locName, branch: '' }));
                                            setShowLocationDropdown(false);
                                            setLocationSearch('');
                                          }}
                                          onKeyDown={(ev) => {
                                            if (ev.key === 'Enter' || ev.key === ' ') {
                                              setForm((prev) => ({ ...prev, location: locName, branch: '' }));
                                              setShowLocationDropdown(false);
                                              setLocationSearch('');
                                            }
                                          }}
                                          className="px-3 py-2.5 hover:bg-[#E8F5F5] cursor-pointer text-sm border-b border-gray-50 last:border-0"
                                        >
                                          {locName}
                                          <span className="text-[10px] text-gray-400 ml-2">{(structuredLocations.find((l) => l.name === locName)?.branches || []).length} branches</span>
                                        </div>
                                      ))}
                                    {locationFilterOptions.length === 0 && (
                                      <div className="px-3 py-4 text-center text-sm text-gray-400">
                                        No locations configured.
                                        <br />
                                        Add in Settings → Manage Lists
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">Branch</label>
                              <select name="branch" value={form.branch} onChange={handleFormChange} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20">
                                <option value="">—</option>
                                {(() => {
                                  const loc = structuredLocations.find((l) => l.name === form.location);
                                  const branchList = loc ? (loc.branches || []).map((b) => b.name) : branches;
                                  return branchList.map((b) => <option key={b} value={b}>{b}</option>);
                                })()}
                                <option value="Other">Other</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">Employment Type</label>
                              <select name="employmentType" value={form.employmentType} onChange={handleFormChange} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20">
                                {employmentTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                                {!employmentTypes.includes('Other') && <option value="Other">Other</option>}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">Category</label>
                              <select name="category" value={form.category} onChange={handleFormChange} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20">
                                <option value="">—</option>
                                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                                {!categories.includes('Other') && <option value="Other">Other</option>}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">Qualification</label>
                              <select name="qualification" value={form.qualification} onChange={handleFormChange} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20">
                                <option value="">—</option>
                                {qualifications.map((q) => <option key={q} value={q}>{q}</option>)}
                                {!qualifications.includes('Other') && <option value="Other">Other</option>}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">Joining Date</label>
                              <input type="date" name="joiningDate" value={form.joiningDate} onChange={handleFormChange} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20" />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">Reporting Manager</label>
                              <div className="relative" onMouseDown={(e) => e.stopPropagation()}>
                                <div
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => setShowManagerDropdown(true)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      setShowManagerDropdown(true);
                                    }
                                  }}
                                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm cursor-pointer flex items-center justify-between hover:border-[#1B6B6B]"
                                >
                                  {form.reportingManagerId ? (
                                    <div className="flex items-center gap-2 min-w-0">
                                      <div className="w-6 h-6 rounded-full bg-[#C5E8E8] flex items-center justify-center text-xs font-medium text-[#1B6B6B]">
                                        {form.reportingManagerName?.charAt(0)}
                                      </div>
                                      <span className="text-slate-800 truncate">{form.reportingManagerName}</span>
                                      <span className="text-xs text-slate-400 whitespace-nowrap">{form.reportingManagerEmpId}</span>
                                    </div>
                                  ) : (
                                    <span className="text-slate-400">Select reporting manager</span>
                                  )}
                                  <div className="flex items-center gap-1">
                                    {form.reportingManagerId && (
                                      <button
                                        type="button"
                                        aria-label="Clear reporting manager"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setForm((prev) => ({
                                            ...prev,
                                            reportingManagerId: '',
                                            reportingManagerName: '',
                                            reportingManagerEmpId: '',
                                          }));
                                        }}
                                        className="text-slate-400 hover:text-slate-600 text-xs"
                                      >
                                        ✕
                                      </button>
                                    )}
                                    <span className="text-slate-400 text-xs">▾</span>
                                  </div>
                                </div>

                                {showManagerDropdown && (
                                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 max-h-48 overflow-hidden">
                                    <div className="p-2 border-b border-slate-100">
                                      <input
                                        autoFocus
                                        type="text"
                                        placeholder="Search by name or ID..."
                                        value={managerSearch}
                                        onChange={(e) => setManagerSearch(e.target.value)}
                                        className="w-full text-sm px-2 py-1.5 border border-slate-200 rounded focus:outline-none focus:border-[#1B6B6B]"
                                        onClick={(e) => e.stopPropagation()}
                                      />
                                    </div>

                                    <div className="overflow-y-auto max-h-36">
                                      <div
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => {
                                          setForm((prev) => ({
                                            ...prev,
                                            reportingManagerId: '',
                                            reportingManagerName: '',
                                            reportingManagerEmpId: '',
                                          }));
                                          setShowManagerDropdown(false);
                                          setManagerSearch('');
                                        }}
                                        className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer"
                                      >
                                        <span className="text-sm text-slate-400">— None</span>
                                      </div>

                                      {reportingManagerOptions
                                        .filter((emp) => {
                                          if (!managerSearch) return true;
                                          const term = managerSearch.toLowerCase();
                                          return (
                                            emp.fullName?.toLowerCase().includes(term) ||
                                            emp.empId?.toLowerCase().includes(term) ||
                                            emp.designation?.toLowerCase().includes(term)
                                          );
                                        })
                                        .map((emp) => (
                                          <div
                                            key={emp.id}
                                            role="button"
                                            tabIndex={0}
                                            onClick={() => {
                                              setForm((prev) => ({
                                                ...prev,
                                                reportingManagerId: emp.id,
                                                reportingManagerName: emp.fullName || '',
                                                reportingManagerEmpId: emp.empId || '',
                                              }));
                                              setShowManagerDropdown(false);
                                              setManagerSearch('');
                                            }}
                                            className={`flex items-center gap-3 px-3 py-2 hover:bg-[#E8F5F5] cursor-pointer ${
                                              form.reportingManagerId === emp.id ? 'bg-[#E8F5F5]' : ''
                                            }`}
                                          >
                                            <div className="w-7 h-7 rounded-full bg-[#C5E8E8] flex items-center justify-center text-xs font-medium text-[#1B6B6B] flex-shrink-0">
                                              {emp.fullName?.charAt(0)}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                              <p className="text-sm font-medium text-slate-800 truncate">{emp.fullName}</p>
                                              <p className="text-xs text-slate-400">{emp.empId} · {emp.designation || '—'}</p>
                                            </div>
                                            {form.reportingManagerId === emp.id && (
                                              <span className="text-[#1B6B6B] text-xs">✓</span>
                                            )}
                                          </div>
                                        ))}

                                      {reportingManagerOptions.filter((emp) => {
                                        if (!managerSearch) return true;
                                        return emp.fullName?.toLowerCase().includes(managerSearch.toLowerCase());
                                      }).length === 0 && (
                                        <div className="px-3 py-4 text-center text-sm text-slate-400">No employees found</div>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="mb-6">
                          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4 pb-2 border-b border-gray-100 flex items-center gap-2">
                            <span className="text-base">💰</span>
                            Compensation
                          </h3>
                          {form.designation && roleSalaryBand && (
                            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl mb-4">
                              <p className="text-xs text-blue-700 font-medium">
                                💼 Salary band for <strong>{form.designation}</strong>: ₹{formatLakhs(roleSalaryBand.min)}/mo — ₹
                                {formatLakhs(roleSalaryBand.max)}/mo (₹{formatLakhs(roleSalaryBand.min * 12)}—₹
                                {formatLakhs(roleSalaryBand.max * 12)} p.a.)
                              </p>
                            </div>
                          )}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="text-xs text-gray-500 block mb-1.5">Basic Salary (per month) ₹</label>
                              <input
                                type="number"
                                placeholder="0"
                                value={form.basicSalary || ''}
                                onChange={(e) => {
                                  const basic = Number(e.target.value);
                                  const hra = Number(form.hra) || 0;
                                  const incentive = Number(form.incentive) || 0;
                                  const annual = (basic + hra + incentive) * 12;
                                  setForm((prev) => ({
                                    ...prev,
                                    basicSalary: e.target.value,
                                    ctcPerAnnum: annual > 0 ? String(annual) : prev.ctcPerAnnum,
                                  }));
                                }}
                                className="w-full border rounded-xl px-3 py-2.5 text-sm hover:border-[#1B6B6B] border-gray-200"
                              />
                              {form.basicSalary ? (
                                <p className="text-xs text-gray-400 mt-1">
                                  = ₹{formatLakhs(Number(form.basicSalary) * 12)} per annum
                                </p>
                              ) : null}
                            </div>
                            <div>
                              <label className="text-xs text-gray-500 block mb-1.5">HRA (per month) ₹</label>
                              <input
                                type="number"
                                placeholder="0"
                                value={form.hra || ''}
                                onChange={(e) => {
                                  const hra = Number(e.target.value);
                                  const basic = Number(form.basicSalary) || 0;
                                  const incentive = Number(form.incentive) || 0;
                                  const annual = (basic + hra + incentive) * 12;
                                  setForm((prev) => ({
                                    ...prev,
                                    hra: e.target.value,
                                    ctcPerAnnum: annual > 0 ? String(annual) : prev.ctcPerAnnum,
                                  }));
                                }}
                                className="w-full border rounded-xl px-3 py-2.5 text-sm hover:border-[#1B6B6B] border-gray-200"
                              />
                              {form.hra ? (
                                <p className="text-xs text-gray-400 mt-1">= ₹{formatLakhs(Number(form.hra) * 12)} per annum</p>
                              ) : null}
                            </div>
                            <div className="sm:col-span-2">
                              <label className="block text-xs font-medium text-slate-600 mb-1">Incentive (per month)</label>
                              <input
                                type="number"
                                min="0"
                                name="incentive"
                                placeholder="0"
                                value={form.incentive}
                                onChange={(e) => {
                                  const incentive = Number(e.target.value);
                                  const basic = Number(form.basicSalary) || 0;
                                  const hra = Number(form.hra) || 0;
                                  const annual = (basic + hra + incentive) * 12;
                                  setForm((prev) => ({
                                    ...prev,
                                    incentive: e.target.value,
                                    ctcPerAnnum: annual > 0 ? String(annual) : prev.ctcPerAnnum,
                                  }));
                                }}
                                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20"
                              />
                              {form.incentive !== '' && form.incentive != null && !Number.isNaN(Number(form.incentive)) && Number(form.incentive) !== 0 && (
                                <p className="text-xs text-gray-400 mt-1">
                                  = ₹{formatLakhs(Number(form.incentive))} per month · ₹{formatLakhs(Number(form.incentive) * 12)} per annum
                                </p>
                              )}
                            </div>
                            <div className="sm:col-span-2">
                              <label className="text-xs text-gray-500 block mb-1.5">
                                Annual Gross Salary ₹
                                <span className="text-gray-300 ml-1 font-normal">(auto-calculated · editable)</span>
                              </label>
                              <input
                                type="number"
                                placeholder="Auto-calculated from above"
                                value={form.ctcPerAnnum || ''}
                                onChange={(e) => setForm((prev) => ({ ...prev, ctcPerAnnum: e.target.value }))}
                                className="w-full border rounded-xl px-3 py-2.5 text-sm hover:border-[#1B6B6B] border-gray-200"
                              />
                              {form.ctcPerAnnum ? (
                                <p className="text-xs text-gray-400 mt-1">
                                  = ₹{formatLakhs(Number(form.ctcPerAnnum) / 12)} per month
                                </p>
                              ) : null}
                              {form.ctcPerAnnum && roleSalaryBand && (
                                <p
                                  className={`text-xs mt-1 font-medium ${
                                    Number(form.ctcPerAnnum) >= roleSalaryBand.min * 12 &&
                                    Number(form.ctcPerAnnum) <= roleSalaryBand.max * 12
                                      ? 'text-green-600'
                                      : 'text-amber-600'
                                  }`}
                                >
                                  {Number(form.ctcPerAnnum) >= roleSalaryBand.min * 12 &&
                                  Number(form.ctcPerAnnum) <= roleSalaryBand.max * 12
                                    ? '✓ Within salary band'
                                    : '⚠ Outside salary band for this designation'}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="mb-6">
                          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4 pb-2 border-b border-gray-100 flex items-center gap-2">
                            <span>🏥</span> Benefits
                          </h3>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                            <div className="p-3 bg-gray-50 rounded-xl">
                              <div className="flex items-center justify-between mb-2 gap-2">
                                <div>
                                  <p className="text-sm font-medium text-gray-700">Provident Fund (PF)</p>
                                  <p className="text-xs text-gray-400">Statutory benefit</p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setForm((prev) => ({
                                      ...prev,
                                      pfApplicable: !prev.pfApplicable,
                                      pfNumber: prev.pfApplicable ? '' : prev.pfNumber,
                                    }))
                                  }
                                  className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${form.pfApplicable ? 'bg-[#1B6B6B]' : 'bg-gray-200'}`}
                                >
                                  <div
                                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                                      form.pfApplicable ? 'translate-x-5' : 'translate-x-0.5'
                                    }`}
                                  />
                                </button>
                              </div>
                              {form.pfApplicable && (
                                <input
                                  name="pfNumber"
                                  placeholder="PF Account Number"
                                  value={form.pfNumber}
                                  onChange={handleFormChange}
                                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1 bg-white focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20"
                                />
                              )}
                            </div>
                            <div className="p-3 bg-gray-50 rounded-xl">
                              <div className="flex items-center justify-between mb-2 gap-2">
                                <div>
                                  <p className="text-sm font-medium text-gray-700">ESIC</p>
                                  <p className="text-xs text-gray-400">Statutory benefit</p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setForm((prev) => ({
                                      ...prev,
                                      esicApplicable: !prev.esicApplicable,
                                      esicNumber: prev.esicApplicable ? '' : prev.esicNumber,
                                    }))
                                  }
                                  className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${form.esicApplicable ? 'bg-[#1B6B6B]' : 'bg-gray-200'}`}
                                >
                                  <div
                                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                                      form.esicApplicable ? 'translate-x-5' : 'translate-x-0.5'
                                    }`}
                                  />
                                </button>
                              </div>
                              {form.esicApplicable && (
                                <input
                                  name="esicNumber"
                                  placeholder="ESIC Number"
                                  value={form.esicNumber}
                                  onChange={handleFormChange}
                                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1 bg-white focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20"
                                />
                              )}
                            </div>
                          </div>
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-sm font-medium text-gray-700">Additional Benefits</p>
                              <button
                                type="button"
                                onClick={() => {
                                  const newBenefit = { id: `benefit_${Date.now()}`, name: '', value: '', notes: '' };
                                  setForm((prev) => ({
                                    ...prev,
                                    customBenefits: [...(prev.customBenefits || []), newBenefit],
                                  }));
                                }}
                                className="text-xs text-[#1B6B6B] hover:underline flex items-center gap-1"
                              >
                                + Add Benefit
                              </button>
                            </div>
                            {(form.customBenefits || []).length === 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setForm((prev) => ({
                                    ...prev,
                                    customBenefits: [{ id: `benefit_${Date.now()}`, name: '', value: '', notes: '' }],
                                  }));
                                }}
                                className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-[#1B6B6B] hover:text-[#1B6B6B] transition-colors"
                              >
                                + Add benefit (Medical Insurance, Food Allowance, etc.)
                              </button>
                            )}
                            <div className="space-y-2">
                              {(form.customBenefits || []).map((benefit, index) => (
                                <div key={benefit.id} className="p-3 border border-gray-100 rounded-xl bg-gray-50">
                                  <div className="flex gap-2 mb-2">
                                    <select
                                      value={
                                        !benefit.name
                                          ? ''
                                          : benefitTemplates.some((t) => t.name === benefit.name)
                                            ? benefit.name
                                            : '__custom__'
                                      }
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        setForm((prev) => {
                                          const updated = [...(prev.customBenefits || [])];
                                          const cur = updated[index];
                                          updated[index] = {
                                            ...cur,
                                            name: v === '__custom__' ? '__custom__' : v,
                                            customName: v === '__custom__' ? cur.customName || '' : '',
                                          };
                                          return { ...prev, customBenefits: updated };
                                        });
                                      }}
                                      className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
                                    >
                                      <option value="">Select benefit...</option>
                                      {benefitTemplates.map((bt) => (
                                        <option key={bt.id} value={bt.name}>
                                          {bt.name}
                                        </option>
                                      ))}
                                      <option value="__custom__">Other (type below)</option>
                                    </select>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setForm((prev) => ({
                                          ...prev,
                                          customBenefits: (prev.customBenefits || []).filter((_, i) => i !== index),
                                        }));
                                      }}
                                      className="text-red-400 hover:text-red-600 px-2"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                  {(benefit.name === '__custom__' ||
                                    (benefit.name && !benefitTemplates.some((t) => t.name === benefit.name))) && (
                                    <input
                                      placeholder="Enter benefit name"
                                      value={
                                        benefit.name === '__custom__'
                                          ? benefit.customName || ''
                                          : benefit.name || ''
                                      }
                                      onChange={(e) => {
                                        setForm((prev) => {
                                          const updated = [...(prev.customBenefits || [])];
                                          updated[index] = {
                                            ...updated[index],
                                            name: '__custom__',
                                            customName: e.target.value,
                                          };
                                          return { ...prev, customBenefits: updated };
                                        });
                                      }}
                                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-2 bg-white"
                                    />
                                  )}
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    <input
                                      placeholder="Value (e.g. ₹5,00,000 or 2,500/month)"
                                      value={benefit.value}
                                      onChange={(e) => {
                                        setForm((prev) => {
                                          const updated = [...(prev.customBenefits || [])];
                                          updated[index] = { ...updated[index], value: e.target.value };
                                          return { ...prev, customBenefits: updated };
                                        });
                                      }}
                                      className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
                                    />
                                    <input
                                      placeholder="Notes (e.g. Family floater)"
                                      value={benefit.notes}
                                      onChange={(e) => {
                                        setForm((prev) => {
                                          const updated = [...(prev.customBenefits || [])];
                                          updated[index] = { ...updated[index], notes: e.target.value };
                                          return { ...prev, customBenefits: updated };
                                        });
                                      }}
                                      className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </>
                    )}

                    {addStep === 2 && (
                      <>
                        {/* ── Bank Details ── */}
                        <div className="pt-4 border-t border-gray-100 mb-6">
                          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                            💳 Bank Details
                          </p>
                          <div className="space-y-3">
                            <div>
                              <label className="text-xs text-gray-500 block mb-1.5">Bank Name</label>
                              <input
                                value={form.bankName}
                                onChange={(e) => setForm((p) => ({ ...p, bankName: e.target.value }))}
                                placeholder="e.g. State Bank of India"
                                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]"
                              />
                            </div>

                            <div>
                              <label className="text-xs text-gray-500 block mb-1.5">Account Holder Name</label>
                              <input
                                value={form.accountHolderName}
                                onChange={(e) => setForm((p) => ({ ...p, accountHolderName: e.target.value }))}
                                placeholder="As per bank records"
                                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]"
                              />
                            </div>

                            <div>
                              <label className="text-xs text-gray-500 block mb-1.5">IFSC Code</label>
                              <input
                                value={form.ifscCode}
                                onChange={(e) =>
                                  setForm((p) => ({
                                    ...p,
                                    ifscCode: e.target.value.toUpperCase().trim(),
                                  }))
                                }
                                placeholder="e.g. SBIN0001234"
                                maxLength={11}
                                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono uppercase focus:outline-none focus:border-[#1B6B6B]"
                              />
                            </div>

                            <div>
                              <label className="text-xs text-gray-500 block mb-1.5">Account Type</label>
                              <select
                                value={form.accountType}
                                onChange={(e) => setForm((p) => ({ ...p, accountType: e.target.value }))}
                                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]"
                              >
                                <option value="">Select account type...</option>
                                <option value="Savings">Savings</option>
                                <option value="Current">Current</option>
                                <option value="Salary">Salary</option>
                              </select>
                            </div>
                          </div>
                        </div>

                        <div className="mb-6">
                          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4 pb-2 border-b border-gray-100 flex items-center gap-2">
                            <span className="text-base">🪪</span>
                            Statutory &amp; Identity
                          </h3>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">PAN Number</label>
                              <input
                                name="panNumber"
                                value={form.panNumber}
                                onChange={handleFormChange}
                                placeholder="e.g. ABCDE1234F"
                                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20 uppercase"
                                maxLength={20}
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">Aadhaar Number</label>
                              <input
                                name="aadhaarNumber"
                                value={form.aadhaarNumber}
                                onChange={handleFormChange}
                                placeholder="12-digit number"
                                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20"
                                maxLength={20}
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <label className="block text-xs font-medium text-slate-600 mb-1">Driving Licence No.</label>
                              <input
                                name="drivingLicenceNumber"
                                value={form.drivingLicenceNumber}
                                onChange={handleFormChange}
                                placeholder="e.g. MH0120210012345"
                                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20"
                              />
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 flex-shrink-0 bg-white">
                    <button
                      type="button"
                      onClick={() => {
                        if (addStep === 0) {
                          handleCloseAddModal();
                        } else {
                          setAddStep((s) => s - 1);
                        }
                      }}
                      disabled={saving}
                      className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                    >
                      {addStep === 0 ? 'Cancel' : '← Back'}
                    </button>
                    {addStep < ADD_STEPS.length - 1 ? (
                      <button
                        type="button"
                        onClick={() => setAddStep((s) => s + 1)}
                        className="px-5 py-2.5 bg-[#1B6B6B] text-white rounded-xl text-sm font-medium hover:bg-[#155858] transition-colors flex items-center gap-2"
                      >
                        Next
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <path
                            d="M5 3l4 4-4 4"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    ) : (
                      <button
                        type="submit"
                        disabled={saving}
                        className="px-5 py-2.5 bg-[#1B6B6B] text-white rounded-xl text-sm font-medium hover:bg-[#155858] disabled:opacity-50 transition-colors"
                      >
                        {saving ? 'Saving...' : 'Add Employee'}
                      </button>
                    )}
                  </div>
                </form>
              </>
            );
          } catch {
            return (
              <div className="p-6 text-center">
                <p className="text-red-500 mb-4">Something went wrong loading the form.</p>
                <button type="button" onClick={handleCloseAddModal} className="px-4 py-2 bg-gray-100 rounded-lg text-sm">
                  Close
                </button>
              </div>
            );
          }
        })()}
      </div>
    </div>
  );
}
