import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../contexts/AuthContext';
import { PLATFORM_CONFIG } from '../config/constants';
import PageLoader from '../components/PageLoader';
import PageHeader from '../components/PageHeader';
import { DOCUMENT_CHECKLIST, getDocById, getMandatoryDocCount } from '../utils/documentTypes';
import { trackPageView } from '../utils/analytics';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

const defaultTotalMandatory = getMandatoryDocCount();

function getDocByType(emp) {
  const map = {};
  (emp.documents || []).forEach((d) => {
    if (d.id && getDocById(d.id)) map[d.id] = d;
  });
  return map;
}

function getCategoryStatus(emp, categoryName, checklist) {
  if (!checklist || !Array.isArray(checklist)) {
    return { status: 'gray', uploaded: 0, total: 0 };
  }

  const cat = checklist.find((c) => c.category === categoryName);
  if (!cat) {
    return { status: 'gray', uploaded: 0, total: 0 };
  }

  const empDocs = emp?.documents || [];
  const total = cat.documents.filter((d) => d.mandatory).length;
  const uploaded = cat.documents.filter(
    (d) => d.mandatory && empDocs.some((ud) => ud.id === d.id),
  ).length;

  let status = 'gray';
  if (uploaded === 0) status = 'gray';
  else if (uploaded < total) status = 'amber';
  else status = 'green';

  return { status, uploaded, total };
}

function getOverallPct(emp) {
  const docByType = getDocByType(emp);
  let mandatoryUploaded = 0;
  const checklist = emp._checklist || DOCUMENT_CHECKLIST;
  checklist.forEach((cat) => {
    cat.documents.filter((d) => d.mandatory).forEach((d) => {
      if (docByType[d.id]) mandatoryUploaded++;
    });
  });
  const totalMandatory = emp._totalMandatory ?? defaultTotalMandatory;
  return totalMandatory ? Math.round((mandatoryUploaded / totalMandatory) * 100) : 100;
}

function getMissingMandatory(emp) {
  const docByType = getDocByType(emp);
  const missing = [];
  DOCUMENT_CHECKLIST.forEach((cat) => {
    cat.documents.filter((d) => d.mandatory).forEach((d) => {
      if (!docByType[d.id]) missing.push({ ...d, category: cat.category });
    });
  });
  return missing;
}

export default function Documents() {
  const { role: userRole } = useAuth();
  const canUpload = PLATFORM_CONFIG.DRIVE_UPLOAD_ROLES.includes(userRole);
  const { companyId } = useParams();
  const [company, setCompany] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [docFilters, setDocFilters] = useState({
    department: '',
    branch: '',
    location: '',
    employmentType: '',
    completionStatus: '',
    missingDoc: '',
  });
  const [showDocFilters, setShowDocFilters] = useState(false);
  const [missingAlertOpen, setMissingAlertOpen] = useState(false);
  const [showDownload, setShowDownload] = useState(false);

  useEffect(() => {
    trackPageView('Documents');
  }, []);

  useEffect(() => {
    if (!companyId) return;
    const load = async () => {
      setLoading(true);
      try {
        const [companySnap, empSnap] = await Promise.all([
          getDoc(doc(db, 'companies', companyId)),
          getDocs(collection(db, 'companies', companyId, 'employees')),
        ]);
        if (companySnap.exists()) setCompany({ id: companySnap.id, ...companySnap.data() });
        setEmployees(empSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        if (import.meta.env.DEV) console.error(err);
      }
      setLoading(false);
    };
    load();
  }, [companyId]);

  const activeChecklist = useMemo(() => {
    if (company?.documentTypes && company.documentTypes.length > 0) {
      return company.documentTypes;
    }
    return DOCUMENT_CHECKLIST;
  }, [company]);

  const totalMandatory = useMemo(
    () =>
      activeChecklist
        .flatMap((cat) => cat.documents)
        .filter((d) => d.mandatory).length,
    [activeChecklist],
  );

  const enrichedEmployees = useMemo(
    () =>
      employees.map((e) => ({
        ...e,
        _checklist: activeChecklist,
        _totalMandatory: totalMandatory || defaultTotalMandatory,
      })),
    [employees, activeChecklist, totalMandatory],
  );

  const getEmployeeDocCompletion = (emp) => getOverallPct(emp);
  const getMissingMandatoryDocs = (emp) => getMissingMandatory(emp).map((d) => d.name);

  const filteredDocEmployees = useMemo(() => {
    return enrichedEmployees.filter((emp) => {
      if (emp.status === 'Inactive') return false;
      if (docFilters.department && emp.department !== docFilters.department) return false;
      if (docFilters.branch && emp.branch !== docFilters.branch) return false;
      if (docFilters.location && emp.location !== docFilters.location) return false;
      if (docFilters.employmentType && emp.employmentType !== docFilters.employmentType) return false;

      // Completion status filter
      const completion = getEmployeeDocCompletion(emp);
      if (docFilters.completionStatus === 'complete' && completion < 100) return false;
      if (docFilters.completionStatus === 'incomplete' && completion >= 100) return false;
      if (docFilters.completionStatus === 'missing_mandatory') {
        const hasMissing = getMissingMandatoryDocs(emp).length > 0;
        if (!hasMissing) return false;
      }
      if (docFilters.completionStatus === '0' && completion > 0) return false;

      // Missing specific doc filter
      if (docFilters.missingDoc) {
        const missing = getMissingMandatoryDocs(emp);
        const hasMissingDoc = missing.some((d) => d.includes(docFilters.missingDoc));
        if (!hasMissingDoc) return false;
      }

      return true;
    });
  }, [enrichedEmployees, docFilters]);

  const stats = useMemo(() => {
    const total = enrichedEmployees.length;
    const fullyComplete = enrichedEmployees.filter((e) => getOverallPct(e) === 100).length;
    const notStarted = enrichedEmployees.filter((e) => getOverallPct(e) === 0).length;
    const partiallyComplete = total - fullyComplete - notStarted;
    return { total, fullyComplete, partiallyComplete, notStarted };
  }, [enrichedEmployees]);

  const missingMandatoryList = useMemo(() => {
    return filteredDocEmployees
      .map((e) => ({ emp: e, missing: getMissingMandatory(e) }))
      .filter((x) => x.missing.length > 0)
      .sort((a, b) => b.missing.length - a.missing.length);
  }, [filteredDocEmployees]);

  if (!companyId) return null;

  const companyName = (company?.name || 'Company').replace(/\s+/g, '');

  const downloadDocumentReport = (format) => {
    const rows = filteredDocEmployees.map((emp) => {
      const docs = emp.documents || [];
      const kycDocs = docs.filter((d) => d.category === 'KYC Documents');
      const empDocs = docs.filter((d) => d.category === 'Employment Documents');
      const eduDocs = docs.filter((d) => d.category === 'Education Certificates');
      const prevDocs = docs.filter((d) => d.category === 'Previous Employment');

      const mandatoryDocs = activeChecklist
        .flatMap((cat) => cat.documents)
        .filter((d) => d.mandatory);
      const mandatoryUploaded = mandatoryDocs.filter((md) =>
        docs.some((ud) => ud.id === md.id),
      ).length;
      const mandatoryTotal = mandatoryDocs.length || 1;

      return {
        'Emp ID': emp.empId || '',
        'Employee Name': emp.fullName || '',
        Department: emp.department || '',
        'KYC Complete': kycDocs.length >= 2 ? 'Yes' : 'No',
        'Employment Docs Complete': empDocs.length >= 2 ? 'Yes' : 'No',
        'Education Docs Complete': eduDocs.length > 0 ? 'Yes' : 'No',
        'Previous Employment Complete': prevDocs.length > 0 ? 'Yes' : 'No',
        'Overall % Complete': `${Math.round((mandatoryUploaded / mandatoryTotal) * 100)}%`,
        'Total Docs Uploaded': docs.length,
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const today = new Date().toLocaleDateString('en-GB').split('/').join('-');

    if (format === 'csv') {
      const csv = XLSX.utils.sheet_to_csv(ws);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      saveAs(blob, `${companyName}_Documents_${today}.csv`);
    } else {
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Documents');
      XLSX.writeFile(wb, `${companyName}_Documents_${today}.xlsx`);
    }
  };

  const statusBadge = (status) => {
    const c = status === 'green' ? 'bg-green-100 text-green-800' : status === 'amber' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600';
    return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${c}`}>{status === 'green' ? '✓' : status === 'amber' ? '◐' : '—'}</span>;
  };

  return (
    <div className="p-4 sm:p-8">
      <div className="mb-6">
        <PageHeader
          title="Documents"
          subtitle="Company document completion overview (Google Drive)"
          actions={
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowDownload((o) => !o)}
                className="flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 border border-slate-300 rounded-lg text-sm hover:bg-slate-50 active:bg-slate-100 bg-white"
              >
                Download Report ▾
              </button>
              {showDownload && (
                <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 min-w-[10rem]">
                  <button
                    type="button"
                    onClick={() => {
                      downloadDocumentReport('csv');
                      setShowDownload(false);
                    }}
                    className="block w-full text-left min-h-[44px] px-4 py-2 text-sm hover:bg-slate-50 active:bg-slate-100"
                  >
                    Download CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      downloadDocumentReport('excel');
                      setShowDownload(false);
                    }}
                    className="block w-full text-left min-h-[44px] px-4 py-2 text-sm hover:bg-slate-50 active:bg-slate-100 rounded-b-lg"
                  >
                    Download Excel
                  </button>
                </div>
              )}
            </div>
          }
        />
        {Object.values(docFilters).some((v) => v) && (
          <p className="text-xs text-amber-600 mt-2">
            ⚠️ Download will include only filtered results ({filteredDocEmployees.length} records)
          </p>
        )}
      </div>

      {loading ? (
        <PageLoader />
      ) : (
        <>
          {!canUpload && (
            <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl border border-gray-100 mb-4">
              <span className="text-2xl shrink-0">📂</span>
              <div>
                <p className="text-sm font-medium text-gray-700">Document viewing only</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Only HR Managers can upload or change employee documents
                </p>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-slate-500 text-sm">Total Employees</p>
              <p className="text-xl font-semibold text-slate-800">{stats.total}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-slate-500 text-sm">Fully Complete</p>
              <p className="text-xl font-semibold text-green-700">{stats.fullyComplete}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-slate-500 text-sm">Partially Complete</p>
              <p className="text-xl font-semibold text-amber-700">{stats.partiallyComplete}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-slate-500 text-sm">Not Started</p>
              <p className="text-xl font-semibold text-slate-600">{stats.notStarted}</p>
            </div>
          </div>

          <div className="mb-4">
            <button
              onClick={() => setShowDocFilters((v) => !v)}
              className={`flex items-center gap-2 px-3 py-2 border rounded-xl text-sm
              ${
                showDocFilters || Object.values(docFilters).some((v) => v)
                  ? 'border-[#1B6B6B] text-[#1B6B6B] bg-[#E8F5F5]'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              ⚙️ Filters
              {Object.values(docFilters).some((v) => v) && (
                <span className="bg-[#1B6B6B] text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">
                  {Object.values(docFilters).filter((v) => v).length}
                </span>
              )}
            </button>

            {showDocFilters && (
              <div className="bg-white border border-gray-100 rounded-2xl p-5 mb-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-gray-700">Filter Documents</h3>
                  <button
                    onClick={() =>
                      setDocFilters({
                        department: '',
                        branch: '',
                        location: '',
                        employmentType: '',
                        completionStatus: '',
                        missingDoc: '',
                      })
                    }
                    className="text-xs text-[#1B6B6B] hover:underline"
                  >
                    Clear all
                  </button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {/* Department */}
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Department</label>
                    <select
                      value={docFilters.department}
                      onChange={(e) => setDocFilters((prev) => ({ ...prev, department: e.target.value }))}
                      className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]"
                    >
                      <option value="">All Departments</option>
                      {(company?.departments || []).map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Branch */}
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Branch</label>
                    <select
                      value={docFilters.branch}
                      onChange={(e) => setDocFilters((prev) => ({ ...prev, branch: e.target.value }))}
                      className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]"
                    >
                      <option value="">All Branches</option>
                      {(company?.branches || []).map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Location */}
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Location</label>
                    <select
                      value={docFilters.location}
                      onChange={(e) => setDocFilters((prev) => ({ ...prev, location: e.target.value }))}
                      className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]"
                    >
                      <option value="">All Locations</option>
                      {(company?.locations || []).map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Employment Type */}
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Employment Type</label>
                    <select
                      value={docFilters.employmentType}
                      onChange={(e) => setDocFilters((prev) => ({ ...prev, employmentType: e.target.value }))}
                      className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]"
                    >
                      <option value="">All Types</option>
                      {(company?.employmentTypes || []).map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Completion Status */}
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Completion Status</label>
                    <select
                      value={docFilters.completionStatus}
                      onChange={(e) =>
                        setDocFilters((prev) => ({ ...prev, completionStatus: e.target.value }))
                      }
                      className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]"
                    >
                      <option value="">All</option>
                      <option value="complete">100% Complete</option>
                      <option value="incomplete">Incomplete</option>
                      <option value="missing_mandatory">Missing Mandatory Docs</option>
                      <option value="0">0% — Not Started</option>
                    </select>
                  </div>

                  {/* Missing Document Type */}
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Missing Document</label>
                    <select
                      value={docFilters.missingDoc}
                      onChange={(e) => setDocFilters((prev) => ({ ...prev, missingDoc: e.target.value }))}
                      className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]"
                    >
                      <option value="">Any</option>
                      <option value="PAN Card">PAN Card</option>
                      <option value="Aadhaar Card">Aadhaar Card</option>
                      <option value="Passport">Passport</option>
                      <option value="Offer Letter">Offer Letter</option>
                      <option value="Experience Letter">Experience Letter</option>
                    </select>
                  </div>
                </div>

                {Object.values(docFilters).some((v) => v) && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <p className="text-xs text-[#1B6B6B]">
                      {Object.values(docFilters).filter((v) => v).length} filter
                      {Object.values(docFilters).filter((v) => v).length !== 1 ? 's' : ''} active
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="hidden lg:block overflow-x-auto border border-slate-200 rounded-xl bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Employee Name</th>
                  <th className="px-4 py-3 text-left font-medium">Dept</th>
                  <th className="px-4 py-3 text-left font-medium">KYC</th>
                  <th className="px-4 py-3 text-left font-medium">Employment</th>
                  <th className="px-4 py-3 text-left font-medium">Education</th>
                  <th className="px-4 py-3 text-left font-medium">Previous Emp</th>
                  <th className="px-4 py-3 text-left font-medium">Overall %</th>
                  <th className="px-4 py-3 text-left font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredDocEmployees.map((emp) => {
                  const kyc = getCategoryStatus(emp, 'KYC Documents', activeChecklist);
                  const employment = getCategoryStatus(emp, 'Employment Documents', activeChecklist);
                  const education = getCategoryStatus(emp, 'Education Certificates', activeChecklist);
                  const prevEmp = getCategoryStatus(emp, 'Previous Employment', activeChecklist);
                  const pct = getOverallPct(emp);
                  return (
                    <tr key={emp.id} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-medium text-slate-800">{emp.fullName || '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{emp.department || '—'}</td>
                      <td className="px-4 py-3">{statusBadge(kyc.status)}</td>
                      <td className="px-4 py-3">{statusBadge(employment.status)}</td>
                      <td className="px-4 py-3">{statusBadge(education.status)}</td>
                      <td className="px-4 py-3">{statusBadge(prevEmp.status)}</td>
                      <td className="px-4 py-3">
                        <span className={pct === 100 ? 'text-green-700 font-medium' : pct > 0 ? 'text-amber-700' : 'text-slate-500'}>{pct}%</span>
                      </td>
                      <td className="px-4 py-3">
                        <Link to={`/company/${companyId}/employees/${emp.id}?tab=documents`} className="text-[#1B6B6B] text-xs font-medium hover:underline">View Documents</Link>
                      </td>
                    </tr>
                  );
                })}
                {filteredDocEmployees.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-500">No employees match filters.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="lg:hidden space-y-3">
            {filteredDocEmployees.map((emp) => {
              const kyc = getCategoryStatus(emp, 'KYC Documents', activeChecklist);
              const employment = getCategoryStatus(emp, 'Employment Documents', activeChecklist);
              const education = getCategoryStatus(emp, 'Education Certificates', activeChecklist);
              const prevEmp = getCategoryStatus(emp, 'Previous Employment', activeChecklist);
              const pct = getOverallPct(emp);
              return (
                <div key={emp.id} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800 truncate">{emp.fullName || '—'}</p>
                      <p className="text-xs text-slate-500">{emp.department || '—'}</p>
                    </div>
                    <span className={`text-sm font-semibold flex-shrink-0 ${pct === 100 ? 'text-green-700' : pct > 0 ? 'text-amber-700' : 'text-slate-500'}`}>
                      {pct}%
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs mb-3">
                    <span>KYC {statusBadge(kyc.status)}</span>
                    <span>Emp {statusBadge(employment.status)}</span>
                    <span>Edu {statusBadge(education.status)}</span>
                    <span>Prev {statusBadge(prevEmp.status)}</span>
                  </div>
                  <Link
                    to={`/company/${companyId}/employees/${emp.id}?tab=documents`}
                    className="inline-flex items-center justify-center w-full min-h-[44px] rounded-xl bg-[#1B6B6B] text-white text-sm font-medium hover:bg-[#155858] active:bg-[#0f4444]"
                  >
                    View Documents
                  </Link>
                </div>
              );
            })}
            {filteredDocEmployees.length === 0 && <p className="text-center text-slate-500 py-8 text-sm">No employees match filters.</p>}
          </div>

          <div className="mt-6 border border-amber-200 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setMissingAlertOpen((o) => !o)}
              className="w-full flex items-center justify-between px-4 py-3 bg-amber-50 hover:bg-amber-100 text-left"
            >
              <span className="font-medium text-amber-900">Missing Mandatory Documents</span>
              <span className="text-amber-700 text-sm">{missingMandatoryList.length} employee(s) with missing docs</span>
              <span className="text-amber-600">{missingAlertOpen ? '▼' : '▶'}</span>
            </button>
            {missingAlertOpen && (
              <div className="p-4 border-t border-amber-200 bg-white">
                {missingMandatoryList.length === 0 ? (
                  <p className="text-slate-500 text-sm">All employees have mandatory documents uploaded.</p>
                ) : (
                  <ul className="space-y-3">
                    {missingMandatoryList.map(({ emp, missing }) => (
                      <li
                        key={emp.id}
                        className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between py-3 border-b border-slate-100 last:border-0"
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-slate-800">{emp.fullName || '—'}</p>
                          <p className="text-slate-500 text-xs mt-0.5">
                            Missing: {missing.map((d) => d.name).join(', ')}
                          </p>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                          <Link
                            to={`/company/${companyId}/employees/${emp.id}?tab=documents`}
                            className="inline-flex items-center justify-center min-h-[44px] px-3 rounded-xl text-[#1B6B6B] text-sm font-medium border border-[#C5E8E8] hover:bg-[#E8F5F5] active:bg-[#C5E8E8]"
                          >
                            View Documents
                          </Link>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
