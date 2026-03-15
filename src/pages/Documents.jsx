import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import { DOCUMENT_CHECKLIST, getDocById, getMandatoryDocCount } from '../utils/documentTypes';

const totalMandatory = getMandatoryDocCount();

function getDocByType(emp) {
  const map = {};
  (emp.documents || []).forEach((d) => {
    if (d.id && getDocById(d.id)) map[d.id] = d;
  });
  return map;
}

function getCategoryStatus(emp, category) {
  const cat = DOCUMENT_CHECKLIST.find((c) => c.category === category);
  if (!cat) return { status: 'gray', uploaded: 0, total: 0 };
  const docByType = getDocByType(emp);
  const mandatory = cat.documents.filter((d) => d.mandatory);
  const mandatoryUploaded = mandatory.filter((d) => docByType[d.id]).length;
  const uploaded = cat.documents.filter((d) => docByType[d.id]).length;
  const total = cat.documents.length;
  if (mandatory.length > 0 && mandatoryUploaded === mandatory.length) return { status: 'green', uploaded, total };
  if (uploaded > 0) return { status: 'amber', uploaded, total };
  return { status: 'gray', uploaded, total };
}

function getOverallPct(emp) {
  const docByType = getDocByType(emp);
  let mandatoryUploaded = 0;
  DOCUMENT_CHECKLIST.forEach((cat) => {
    cat.documents.filter((d) => d.mandatory).forEach((d) => {
      if (docByType[d.id]) mandatoryUploaded++;
    });
  });
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
  const { companyId } = useParams();
  const [company, setCompany] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterDept, setFilterDept] = useState('All Departments');
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterCategory, setFilterCategory] = useState('All');
  const [missingAlertOpen, setMissingAlertOpen] = useState(false);

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
        console.error(err);
      }
      setLoading(false);
    };
    load();
  }, [companyId]);

  const departments = useMemo(() => {
    const set = new Set(employees.map((e) => e.department).filter(Boolean));
    return ['All Departments', ...Array.from(set).sort()];
  }, [employees]);

  const filtered = useMemo(() => {
    let list = employees;
    if (filterDept !== 'All Departments') list = list.filter((e) => (e.department || '') === filterDept);
    if (filterStatus === 'Complete') list = list.filter((e) => getOverallPct(e) === 100);
    if (filterStatus === 'Incomplete') list = list.filter((e) => { const p = getOverallPct(e); return p > 0 && p < 100; });
    if (filterStatus === 'Not Started') list = list.filter((e) => getOverallPct(e) === 0);
    if (filterCategory !== 'All') {
      const cat = DOCUMENT_CHECKLIST.find((c) => c.category === filterCategory);
      if (cat) {
        const mandatoryIds = cat.documents.filter((d) => d.mandatory).map((d) => d.id);
        list = list.filter((e) => {
          const docByType = getDocByType(e);
          return mandatoryIds.some((id) => !docByType[id]);
        });
      }
    }
    return list;
  }, [employees, filterDept, filterStatus, filterCategory]);

  const stats = useMemo(() => {
    const total = employees.length;
    const fullyComplete = employees.filter((e) => getOverallPct(e) === 100).length;
    const notStarted = employees.filter((e) => getOverallPct(e) === 0).length;
    const partiallyComplete = total - fullyComplete - notStarted;
    return { total, fullyComplete, partiallyComplete, notStarted };
  }, [employees]);

  const missingMandatoryList = useMemo(() => {
    return employees
      .map((e) => ({ emp: e, missing: getMissingMandatory(e) }))
      .filter((x) => x.missing.length > 0)
      .sort((a, b) => b.missing.length - a.missing.length);
  }, [employees]);

  if (!companyId) return null;

  const statusBadge = (status) => {
    const c = status === 'green' ? 'bg-green-100 text-green-800' : status === 'amber' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600';
    return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${c}`}>{status === 'green' ? '✓' : status === 'amber' ? '◐' : '—'}</span>;
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-800">Documents</h1>
        <p className="text-slate-500 mt-1">Company document completion overview (Google Drive)</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#378ADD] border-t-transparent" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
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

          <div className="flex flex-wrap gap-3 mb-4">
            <select value={filterDept} onChange={(e) => setFilterDept(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              {departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="All">All</option>
              <option value="Complete">Complete</option>
              <option value="Incomplete">Incomplete</option>
              <option value="Not Started">Not Started</option>
            </select>
            <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="All">All</option>
              {DOCUMENT_CHECKLIST.map((c) => (
                <option key={c.category} value={c.category}>Missing: {c.category}</option>
              ))}
            </select>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white">
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
                {filtered.map((emp) => {
                  const kyc = getCategoryStatus(emp, 'KYC Documents');
                  const employment = getCategoryStatus(emp, 'Employment Documents');
                  const education = getCategoryStatus(emp, 'Education Certificates');
                  const prevEmp = getCategoryStatus(emp, 'Previous Employment');
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
                        <Link to={`/company/${companyId}/employees/${emp.id}?tab=documents`} className="text-[#378ADD] text-xs font-medium hover:underline">View Documents</Link>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-500">No employees match filters.</td>
                  </tr>
                )}
              </tbody>
            </table>
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
                      <li key={emp.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                        <div>
                          <p className="font-medium text-slate-800">{emp.fullName || '—'}</p>
                          <p className="text-slate-500 text-xs mt-0.5">
                            Missing: {missing.map((d) => d.name).join(', ')}
                          </p>
                        </div>
                        <Link to={`/company/${companyId}/employees/${emp.id}?tab=documents`} className="text-[#378ADD] text-sm font-medium hover:underline">View Documents</Link>
                        <button type="button" className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50" disabled title="Coming soon">Send Reminder</button>
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
