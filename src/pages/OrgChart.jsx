import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { trackPageView } from '../utils/analytics';
import { useCompany } from '../contexts/CompanyContext';
import { getDeptColor, buildOrgTree, treeDepth } from '../utils/orgChartHelpers';
import EmployeeAvatar from '../components/EmployeeAvatar';
import PageHeader from '../components/PageHeader';

function OrgNode({ node, search, companyId, navigate }) {
  const [collapsed, setCollapsed] = useState(false);
  const q = (search || '').trim().toLowerCase();
  const isHighlighted = q && (node.fullName || '').toLowerCase().includes(q);

  return (
    <div className="flex flex-col items-center">
      <div
        role="button"
        tabIndex={0}
        onClick={() => navigate(`/company/${companyId}/employees/${node.id}`)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') navigate(`/company/${companyId}/employees/${node.id}`);
        }}
        className={`
          relative bg-white border-2 rounded-2xl p-3 w-44 cursor-pointer text-center transition-all hover:shadow-md
          ${isHighlighted ? 'border-[#4ECDC4] shadow-[0_0_0_3px_rgba(78,205,196,0.15)]' : 'border-gray-100 hover:border-[#1B6B6B]'}
        `}
      >
        <EmployeeAvatar
          employee={node}
          size="xl"
          className="mx-auto mb-2 ring-2 ring-white shadow"
        />
        <p className="text-xs font-semibold text-gray-900 leading-tight truncate">{node.fullName || '—'}</p>
        <p className="text-xs text-gray-400 truncate mt-0.5">{node.designation || '—'}</p>
        <span
          className="text-xs px-2 py-0.5 rounded-full mt-1.5 inline-block max-w-full truncate"
          style={{
            background: `${getDeptColor(node.department)}20`,
            color: getDeptColor(node.department),
          }}
        >
          {node.department || 'No dept'}
        </span>

        {node.children?.length > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setCollapsed(!collapsed);
            }}
            className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-7 h-7 min-w-[28px] min-h-[28px] rounded-full bg-[#1B6B6B] text-white text-xs flex items-center justify-center shadow-sm hover:bg-[#155858] z-[1]"
            aria-label={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? '+' : '−'}
          </button>
        )}
      </div>

      {!collapsed && node.children?.length > 0 && (
        <div className="mt-6 flex w-full flex-col items-center">
          <div className="w-px h-6 bg-gray-200" />
          <div className="flex flex-wrap items-start justify-center">
            {node.children.map((child, idx, arr) => {
              const isFirst = idx === 0;
              const isLast = idx === arr.length - 1;
              const isOnly = arr.length === 1;
              return (
                <div
                  key={child.id}
                  className="flex flex-col items-center px-4 pt-6 relative"
                >
                  {!isOnly && (
                    <div
                      className="absolute top-0 h-px bg-gray-200"
                      style={{
                        left: isFirst ? '50%' : 0,
                        right: isLast ? '50%' : 0,
                      }}
                    />
                  )}
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-6 bg-gray-200" />
                  <OrgNode node={child} search={search} companyId={companyId} navigate={navigate} />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function OrgChart() {
  const { companyId } = useParams();
  const navigate = useNavigate();
  const { company } = useCompany();
  const [employees, setEmployees] = useState([]);
  const [search, setSearch] = useState('');
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    trackPageView('OrgChart');
  }, []);

  useEffect(() => {
    if (!companyId) return;
    getDocs(
      query(
        collection(db, 'companies', companyId, 'employees'),
        where('status', '!=', 'Inactive'),
        limit(500),
      ),
    )
      .then((snap) => {
        setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      })
      .catch(() => {});
  }, [companyId]);

  const activeEmployees = useMemo(
    () => employees.filter((emp) => emp.status !== 'Inactive'),
    [employees],
  );

  const roots = useMemo(() => buildOrgTree(activeEmployees), [activeEmployees]);

  const hasReportingLinks = useMemo(() => activeEmployees.some((e) => !!e.reportingManagerId), [activeEmployees]);

  const stats = useMemo(() => {
    const deptSet = new Set(activeEmployees.map((e) => e.department).filter(Boolean));
    return {
      total: activeEmployees.length,
      departments: deptSet.size,
      levels: treeDepth(roots),
    };
  }, [activeEmployees, roots]);

  if (!companyId) return null;

  return (
    <div>
      <div className="mb-6">
        <PageHeader
          title="Org Chart"
          subtitle={`${company?.name || 'Company'} organizational structure`}
        />
      </div>

      <div className="flex flex-col sm:flex-row flex-wrap gap-2 sm:items-center mb-4">
        <input
          type="search"
          placeholder="Search employee…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] min-h-[44px] rounded-xl border border-slate-200 px-3 py-2 text-sm"
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(1.75, Math.round((z + 0.15) * 100) / 100))}
            className="min-h-[44px] min-w-[44px] rounded-xl border border-slate-200 text-lg font-medium"
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.15) * 100) / 100))}
            className="min-h-[44px] min-w-[44px] rounded-xl border border-slate-200 text-lg font-medium"
            aria-label="Zoom out"
          >
            −
          </button>
        </div>
      </div>

      {employees.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-100 text-slate-500 text-sm">No employees to display.</div>
      ) : activeEmployees.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-100 text-slate-500 text-sm px-4">
          No active employees to display. All {employees.length} employee{employees.length === 1 ? '' : 's'} in this company
          {employees.length === 1 ? ' is' : ' are'} marked Inactive.
        </div>
      ) : !hasReportingLinks ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-100">
          <p className="text-4xl mb-4">🏢</p>
          <p className="text-base font-medium text-gray-700 mb-2">No org structure yet</p>
          <p className="text-sm text-gray-400 mb-4 px-4">Set reporting managers on employee profiles to build the org chart</p>
          <button
            type="button"
            onClick={() => navigate(`/company/${companyId}/employees`)}
            className="px-4 py-2 min-h-[44px] bg-[#1B6B6B] text-white rounded-xl text-sm font-medium"
          >
            Go to Employees →
          </button>
        </div>
      ) : (
        <div className="overflow-auto rounded-2xl border border-slate-100 min-h-96 bg-slate-50">
          <div
            id="org-chart-container"
            className="overflow-auto bg-[#F8FAFC] min-h-96"
            style={{
              padding: '60px 40px',
              transform: `scale(${zoom})`,
              transformOrigin: 'top center',
              transition: 'transform 0.2s',
              minWidth: '100%',
            }}
          >
            <div className="flex flex-wrap gap-12 justify-center items-start">
              {roots.map((root) => (
                <OrgNode key={root.id} node={root} search={search} companyId={companyId} navigate={navigate} />
              ))}
            </div>
            {roots.length === 0 && (
              <p className="text-center text-slate-500 text-sm py-8">No employees to display.</p>
            )}
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-600 bg-white border border-slate-100 rounded-xl p-4">
        <span>
          <strong className="text-slate-800">{stats.total}</strong> employees
        </span>
        <span>
          <strong className="text-slate-800">{stats.departments}</strong> departments
        </span>
        <span>
          <strong className="text-slate-800">{stats.levels}</strong> management levels
        </span>
      </div>
      <p className="text-xs text-gray-400 text-center mt-2">
        Showing active employees only · {employees.length - activeEmployees.length} inactive employees hidden
      </p>
    </div>
  );
}
