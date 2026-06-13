import { toDisplayDate, toDateString, formatLakhs } from '../../../utils';
import { whatsappUrl } from '../../../utils/whatsappUrl';

export default function PersonalTab({ employee, canEditEmployees, canViewBankDetails, isInactive, showSalary, setShowSalary, openEdit, tenure, getAge, navigate, companyId, company }) {
  return (
    <div className="space-y-6">
  {/* Identity */}
  <div className="bg-white border border-gray-100 rounded-2xl p-5">
    <div className="flex items-center gap-2 mb-4">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1B6B6B" strokeWidth="2">
        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
      <h3 className="text-sm font-semibold text-gray-700">Identity</h3>
      <div className="flex-1 h-px bg-gray-100" />
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {employee.fullName && (
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Full name</p>
          <p className="text-sm text-gray-800">{employee.fullName}</p>
        </div>
      )}
      {employee.empId && (
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Emp ID</p>
          <p className="text-sm text-gray-800 font-mono">{employee.empId}</p>
        </div>
      )}
      {employee.fatherName && (
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Father&apos;s name</p>
          <p className="text-sm text-gray-800">{employee.fatherName}</p>
        </div>
      )}
      {employee.gender && (
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Gender</p>
          <p className="text-sm text-gray-800">{employee.gender}</p>
        </div>
      )}
      {employee.dateOfBirth && (
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Date of birth</p>
          <p className="text-sm text-gray-800">
            {toDisplayDate(employee.dateOfBirth)}
            {getAge(employee.dateOfBirth) != null && (
              <span className="text-gray-400 text-xs"> · {getAge(employee.dateOfBirth)} years old</span>
            )}
          </p>
        </div>
      )}
      {employee.bloodGroup && (
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Blood group</p>
          <p className="text-sm text-gray-800">{employee.bloodGroup}</p>
        </div>
      )}
      {employee.maritalStatus && (
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Marital status</p>
          <p className="text-sm text-gray-800">{employee.maritalStatus}</p>
        </div>
      )}
      {employee.maritalStatus === 'Married' && employee.marriageDate && (
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Wedding date</p>
          <p className="text-sm text-gray-800">{toDisplayDate(employee.marriageDate)}</p>
        </div>
      )}
      {employee.disability && employee.disability !== 'None' && (
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Disability</p>
          <p className="text-sm text-gray-800">{employee.disability}</p>
        </div>
      )}
      {employee.qualification && (
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Highest qualification</p>
          <p className="text-sm text-gray-800">{employee.qualification}</p>
        </div>
      )}
    </div>
  </div>

  {/* Contact */}
  {(employee.email || employee.phone || employee.alternativeMobile) && (
    <div className="bg-white border border-gray-100 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1B6B6B" strokeWidth="2">
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
          <polyline points="22,6 12,13 2,6" />
        </svg>
        <h3 className="text-sm font-semibold text-gray-700">Contact</h3>
        <div className="flex-1 h-px bg-gray-100" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {employee.email && (
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Email</p>
            <a href={`mailto:${employee.email}`} className="text-sm text-[#1B6B6B] hover:underline break-all">{employee.email}</a>
          </div>
        )}
        {employee.phone && (
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Phone</p>
            <p className="text-sm text-gray-800 flex items-center gap-2">
              <a href={`tel:${employee.phone}`} className="hover:text-[#1B6B6B]">{employee.phone}</a>
              {whatsappUrl(employee.phone, `Dear ${employee.fullName} Garu,\n\n`) && (
                <a
                  href={whatsappUrl(employee.phone, `Dear ${employee.fullName} Garu,\n\n`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open WhatsApp"
                  className="w-5 h-5 flex items-center justify-center rounded-full bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20 transition-colors flex-shrink-0"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                </a>
              )}
            </p>
          </div>
        )}
        {employee.alternativeMobile && (
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Alternative mobile</p>
            <p className="text-sm text-gray-800">{employee.alternativeMobile}</p>
          </div>
        )}
      </div>
    </div>
  )}

  {/* Address */}
  {(employee.streetAddress || employee.city || employee.state || employee.pincode || employee.country || employee.address) && (
    <div className="bg-white border border-gray-100 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1B6B6B" strokeWidth="2">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
        <h3 className="text-sm font-semibold text-gray-700">Address</h3>
        <div className="flex-1 h-px bg-gray-100" />
      </div>
      <div className="text-sm text-gray-800 space-y-1">
        {employee.streetAddress && <p>{employee.streetAddress}</p>}
        {(employee.city || employee.state || employee.pincode) && (
          <p>{[employee.city, employee.state, employee.pincode].filter(Boolean).join(', ')}</p>
        )}
        {employee.country && <p>{employee.country}</p>}
        {!employee.streetAddress && !employee.city && !employee.state && !employee.pincode && !employee.country && employee.address && (
          <p>{employee.address}</p>
        )}
      </div>
    </div>
  )}

  {/* Employment */}
  <div className="bg-white border border-gray-100 rounded-2xl p-5">
    <div className="flex items-center gap-2 mb-4">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1B6B6B" strokeWidth="2">
        <rect x="2" y="7" width="20" height="14" rx="2" />
        <path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" />
      </svg>
      <h3 className="text-sm font-semibold text-gray-700">Employment</h3>
      <div className="flex-1 h-px bg-gray-100" />
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {employee.department && (
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Department</p>
          <p className="text-sm text-gray-800">{employee.department}</p>
        </div>
      )}
      {employee.designation && (
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Designation</p>
          <p className="text-sm text-gray-800">{employee.designation}</p>
        </div>
      )}
      {employee.branch && (
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Branch</p>
          <p className="text-sm text-gray-800">{employee.branch}</p>
        </div>
      )}
      {employee.location && (
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Location</p>
          <p className="text-sm text-gray-800">{employee.location}</p>
        </div>
      )}
      {employee.employmentType && (
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Employment type</p>
          <p className="text-sm text-gray-800">{employee.employmentType}</p>
        </div>
      )}
      {employee.category && (
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Category</p>
          <p className="text-sm text-gray-800">{employee.category}</p>
        </div>
      )}
      {employee.joiningDate && (
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Joining date</p>
          <p className="text-sm text-gray-800">
            {toDisplayDate(employee.joiningDate)}
            {tenure && <span className="text-gray-400 text-xs"> · {tenure} tenure</span>}
          </p>
        </div>
      )}
      {employee.reportingManagerId && (
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Reports to</p>
          <div
            role="button"
            tabIndex={0}
            onClick={() => navigate(`/company/${companyId}/employees/${employee.reportingManagerId}`)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') navigate(`/company/${companyId}/employees/${employee.reportingManagerId}`);
            }}
            className="flex items-center gap-2 cursor-pointer hover:opacity-80 group"
          >
            <div className="w-6 h-6 rounded-full bg-[#C5E8E8] flex items-center justify-center text-xs font-medium text-[#1B6B6B] flex-shrink-0">
              {employee.reportingManagerName?.charAt(0)}
            </div>
            <span className="text-sm text-[#1B6B6B] font-medium group-hover:underline">
              {employee.reportingManagerName}
            </span>
            <span className="text-xs text-gray-400">({employee.reportingManagerEmpId})</span>
          </div>
        </div>
      )}
    </div>
  </div>

  {/* Previous Experience */}
  {(employee.prevCompany || employee.prevDesignation || employee.prevFromDate || employee.prevToDate || employee.prevManagerName) && (
    <div className="bg-white border border-gray-100 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1B6B6B" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12,6 12,12 16,14" />
        </svg>
        <h3 className="text-sm font-semibold text-gray-700">Previous experience</h3>
        <div className="flex-1 h-px bg-gray-100" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {employee.prevCompany && (
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Company</p>
            <p className="text-sm text-gray-800">{employee.prevCompany}</p>
          </div>
        )}
        {employee.prevDesignation && (
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Designation</p>
            <p className="text-sm text-gray-800">{employee.prevDesignation}</p>
          </div>
        )}
        {(employee.prevFromDate || employee.prevToDate) && (
          <div className="sm:col-span-2">
            <p className="text-xs text-gray-400 mb-0.5">Duration</p>
            <p className="text-sm text-gray-800">
              {employee.prevFromDate && toDisplayDate(employee.prevFromDate)}
              {employee.prevFromDate && employee.prevToDate && ' — '}
              {employee.prevToDate && toDisplayDate(employee.prevToDate)}
              {employee.prevFromDate && employee.prevToDate && (() => {
                const from = new Date(toDateString(employee.prevFromDate));
                const to = new Date(toDateString(employee.prevToDate));
                if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return '';
                const months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
                const years = Math.floor(months / 12);
                const rem = months % 12;
                let dur = '';
                if (years > 0) dur += `${years}y `;
                if (rem > 0) dur += `${rem}m`;
                return dur ? ` · ${dur.trim()}` : '';
              })()}
            </p>
          </div>
        )}
        {employee.prevManagerName && (
          <div className="sm:col-span-2">
            <p className="text-xs text-gray-400 mb-0.5">Previous manager</p>
            <p className="text-sm text-gray-800">{employee.prevManagerName}</p>
            {employee.prevManagerPhone && <p className="text-xs text-gray-400 mt-0.5">{employee.prevManagerPhone}</p>}
            {employee.prevManagerEmail && <p className="text-xs text-gray-400">{employee.prevManagerEmail}</p>}
          </div>
        )}
      </div>
    </div>
  )}
  <div className="bg-white rounded-xl border border-slate-200 p-4">
    <h3 className="font-medium text-slate-800 mb-3">Compensation</h3>
    {!showSalary ? (
      <div className="flex items-center gap-3">
        <span className="text-slate-400 select-none">₹ ••••••••</span>
        <button type="button" onClick={() => setShowSalary(true)} className="text-sm text-[#1B6B6B] hover:underline">Show</button>
      </div>
    ) : (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {employee.basicSalary != null && employee.basicSalary !== '' && (
          <div>
            <p className="text-xs text-gray-400">Basic Salary (Monthly)</p>
            <p className="text-sm font-medium">₹{formatLakhs(Number(employee.basicSalary))}</p>
          </div>
        )}
        {employee.hra != null && employee.hra !== '' && (
          <div>
            <p className="text-xs text-gray-400">HRA (Monthly)</p>
            <p className="text-sm font-medium">₹{formatLakhs(Number(employee.hra))}</p>
          </div>
        )}
        {employee.incentive != null && employee.incentive !== '' && (
          <div>
            <p className="text-xs text-gray-400">Incentive (Monthly)</p>
            <p className="text-sm font-medium">
              ₹{formatLakhs(Number(employee.incentive))}
              <span className="text-gray-500 text-xs font-normal">
                {' '}
                · ₹{formatLakhs(Number(employee.incentive) * 12)} p.a.
              </span>
            </p>
          </div>
        )}
        <div>
          <p className="text-xs text-gray-400">Annual Gross Salary</p>
          <p className="text-sm font-medium">
            ₹{(employee.ctcPerAnnum ?? employee.ctc ?? 0).toLocaleString('en-IN')}
          </p>
        </div>
      </div>
    )}
  </div>
  {(employee.pfApplicable ||
    employee.esicApplicable ||
    employee.pfNumber ||
    employee.esicNumber ||
    (employee.customBenefits || []).length > 0) && (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <h3 className="font-medium text-slate-800 mb-3">Benefits</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-gray-400">PF</p>
          <p className="text-sm font-medium">
            {(employee.pfApplicable ?? !!String(employee.pfNumber || '').trim())
              ? employee.pfNumber || 'Applicable'
              : 'Not applicable'}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-400">ESIC</p>
          <p className="text-sm font-medium">
            {(employee.esicApplicable ?? !!String(employee.esicNumber || '').trim())
              ? employee.esicNumber || 'Applicable'
              : 'Not applicable'}
          </p>
        </div>
      </div>
      {(employee.customBenefits || []).length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Additional Benefits</p>
          <div className="space-y-2">
            {employee.customBenefits.map((b) => (
              <div key={b.id} className="flex items-start justify-between p-2.5 bg-gray-50 rounded-lg gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800">{b.name}</p>
                  {b.notes && <p className="text-xs text-gray-400">{b.notes}</p>}
                </div>
                {b.value && (
                  <span className="text-sm font-medium text-[#1B6B6B] ml-3 flex-shrink-0">{b.value}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )}
  {canViewBankDetails &&
    (employee.bankName ||
      employee.accountHolderName ||
      employee.ifscCode ||
      employee.accountType) && (
      <div className="bg-white border border-gray-100 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            💳 Bank Details
          </h3>
          {canEditEmployees && !isInactive && (
            <button
              type="button"
              onClick={openEdit}
              className="text-xs text-[#1B6B6B] hover:underline"
            >
              Edit
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4">
          {employee.bankName && (
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Bank Name</p>
              <p className="text-sm font-medium text-gray-800">{employee.bankName}</p>
            </div>
          )}
          {employee.accountHolderName && (
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Account Holder</p>
              <p className="text-sm font-medium text-gray-800">{employee.accountHolderName}</p>
            </div>
          )}
          {employee.ifscCode && (
            <div>
              <p className="text-xs text-gray-400 mb-0.5">IFSC Code</p>
              <p className="text-sm font-medium text-gray-800 font-mono">{employee.ifscCode}</p>
            </div>
          )}
          {employee.accountType && (
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Account Type</p>
              <p className="text-sm font-medium text-gray-800">{employee.accountType}</p>
            </div>
          )}
        </div>
      </div>
    )}
  {(employee.panNumber || employee.aadhaarNumber || employee.drivingLicenceNumber) && (
    <div className="bg-white border border-gray-100 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1B6B6B" strokeWidth="2">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="9" cy="10" r="2" />
          <path d="M15 8h3M15 12h3M7 16h10" />
        </svg>
        <h3 className="text-sm font-semibold text-gray-700">Statutory &amp; identity</h3>
        <div className="flex-1 h-px bg-gray-100" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {employee.panNumber && (
          <div>
            <p className="text-xs text-gray-400 mb-0.5">PAN</p>
            <p className="text-sm text-gray-800 font-mono uppercase">{employee.panNumber}</p>
          </div>
        )}
        {employee.aadhaarNumber && (
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Aadhaar</p>
            <p className="text-sm text-gray-800 font-mono">XXXX XXXX {employee.aadhaarNumber.slice(-4)}</p>
          </div>
        )}
        {employee.drivingLicenceNumber && (
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Driving licence</p>
            <p className="text-sm text-gray-800 font-mono">{employee.drivingLicenceNumber}</p>
          </div>
        )}
      </div>
    </div>
  )}

  {(employee.employmentHistory || []).length > 0 && (
    <div className="mt-6 pt-6 border-t border-gray-100">
      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
        Previous Employment at {company?.name || 'Company'}
      </h4>
      <div className="space-y-3">
        {employee.employmentHistory.map((tenure, i) => (
          <div
            key={`${tenure.tenure ?? i}_${tenure.empId ?? ''}_${i}`}
            className="p-3 bg-gray-50 rounded-xl border border-gray-100"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-gray-700">Tenure {tenure.tenure ?? i + 1}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {tenure.designation || '—'}
                  {tenure.department ? ` · ${tenure.department}` : ''}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-xs text-gray-500">
                  {toDisplayDate(tenure.joiningDate)}
                  {' → '}
                  {toDisplayDate(tenure.exitDate)}
                </p>
                {tenure.exitReason && (
                  <p className="text-xs text-gray-400 mt-0.5">{tenure.exitReason}</p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )}

  <div className="bg-white border rounded-xl p-4 mt-4">
    <h3 className="text-sm font-semibold text-gray-700 mb-3">Emergency Contact</h3>
    {employee.emergencyContact?.name ? (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-gray-400">Name</p>
          <p className="text-sm text-gray-800 font-medium">
            {employee.emergencyContact.name}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Relationship</p>
          <p className="text-sm text-gray-800">
            {employee.emergencyContact.relationship}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Phone</p>
          <p className="text-sm text-gray-800">
            {employee.emergencyContact.phone}
          </p>
        </div>
      </div>
    ) : (
      <p className="text-sm text-gray-400">No emergency contact added</p>
    )}
  </div>
</div>
  );
}
