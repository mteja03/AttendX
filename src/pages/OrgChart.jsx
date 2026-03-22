import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { collection, onSnapshot } from 'firebase/firestore';
import html2canvas from 'html2canvas';
import { db } from '../firebase/config';
import { useCompany } from '../contexts/CompanyContext';
import { useToast } from '../contexts/ToastContext';
import { getDeptColor, buildOrgTree, treeDepth } from '../utils/orgChartHelpers';

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
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold text-white mx-auto mb-2"
          style={{ background: getDeptColor(node.department) }}
        >
          {node.fullName?.charAt(0) || '?'}
        </div>
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
        <div className="mt-6 relative w-full flex flex-col items-center">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0.5 h-6 bg-gray-200" />
          {node.children.length > 1 && (
            <div
              className="absolute top-6 h-0.5 bg-gray-200"
              style={{
                left: `calc(50% - ${(node.children.length - 1) * 96}px)`,
                width: `${(node.children.length - 1) * 192}px`,
              }}
            />
          )}
          <div className="flex gap-8 items-start mt-6 flex-wrap justify-center">
            {node.children.map((child) => (
              <div key={child.id} className="relative flex flex-col items-center">
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-0.5 h-6 bg-gray-200" />
                <OrgNode node={child} search={search} companyId={companyId} navigate={navigate} />
              </div>
            ))}
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
  const { error: showErrorToast } = useToast();
  const [employees, setEmployees] = useState([]);
  const [search, setSearch] = useState('');
  const [zoom, setZoom] = useState(1);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!companyId) return () => {};
    const unsub = onSnapshot(collection(db, 'companies', companyId, 'employees'), (snap) => {
      setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [companyId]);

  const roots = useMemo(() => buildOrgTree(employees), [employees]);

  const hasReportingLinks = useMemo(() => employees.some((e) => !!e.reportingManagerId), [employees]);

  const stats = useMemo(() => {
    const deptSet = new Set(employees.map((e) => e.department).filter(Boolean));
    return {
      total: employees.length,
      departments: deptSet.size,
      levels: treeDepth(roots),
    };
  }, [employees, roots]);

  const companyName = (company?.name || 'org-chart').replace(/\s+/g, '-');

  const handleDownloadPNG = useCallback(async () => {
    const chartElement = document.getElementById('org-chart-container');
    if (!chartElement) return;

    try {
      setDownloading(true);

      const originalTransform = chartElement.style.transform;
      chartElement.style.transform = 'scale(1)';

      const canvas = await html2canvas(chartElement, {
        backgroundColor: '#F8FAFC',
        scale: 2,
        useCORS: true,
        allowTaint: true,
        scrollX: 0,
        scrollY: 0,
        width: chartElement.scrollWidth,
        height: chartElement.scrollHeight,
        windowWidth: chartElement.scrollWidth,
        windowHeight: chartElement.scrollHeight,
        logging: false,
      });

      chartElement.style.transform = originalTransform;

      const link = document.createElement('a');
      link.download = `${companyName}-org-chart.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (error) {
      console.error('PNG download error:', error);
      showErrorToast(`Download failed: ${error?.message || 'Unknown error'}`);
    } finally {
      setDownloading(false);
    }
  }, [companyName, showErrorToast]);

  if (!companyId) return null;

  return (
    <div className="p-4 sm:p-8">
      <div className="flex flex-col gap-3 mb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Org Chart</h1>
          <p className="text-sm text-gray-500 mt-1">{company?.name || 'Company'} organizational structure</p>
        </div>
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
            onClick={handleDownloadPNG}
            disabled={downloading}
            className="flex items-center gap-2 min-h-[44px] px-4 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50 font-medium"
          >
            {downloading ? 'Downloading…' : 'Download PNG'}
          </button>
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
        <div className="overflow-auto rounded-2xl border border-slate-100 min-h-[320px] bg-slate-50">
          <div
            id="org-chart-container"
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: 'top center',
              transition: 'transform 0.2s',
              padding: '40px',
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
    </div>
  );
}
