import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  collection,
  getDocs,
  doc,
  query,
  orderBy,
  limit,
  onSnapshot,
  where,
  getDoc,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../contexts/AuthContext';
import { useCompany } from '../contexts/CompanyContext';
import { useToast } from '../contexts/ToastContext';
import { trackPageView } from '../utils/analytics';
import { SkeletonTable } from '../components/SkeletonRow';
import PageHeader from '../components/PageHeader';
import { AuditDashboard, AuditorDashboard } from './audit/AuditDashboards';
import AuditHistory from './audit/AuditHistory';
import FindingsView from './audit/FindingsView';
import AuditCalendar from './audit/AuditCalendar';
import AuditDocumentsView from './audit/AuditDocumentsView';
import AuditReports from './audit/AuditReports';
import AuditSettings from './audit/AuditSettings';
import AuditList from './audit/AuditList';
import AuditDetail from './audit/AuditDetail';
import RecordAuditDetail from './audit/RecordAuditDetail';
import UnifiedAuditDetail from './audit/UnifiedAuditDetail';
import { isRecordType, isUnifiedTemplate } from './audit/auditHelpers';

export default function Audit() {
  const { companyId: routeCompanyId } = useParams();
  const { companyId: authCompanyId, currentUser, userRole, auditScope, isCompanyAdmin } = useAuth();
  const companyId = routeCompanyId || authCompanyId;
  const { company } = useCompany();
  const [companyData, setCompanyData] = useState(null);

  useEffect(() => {
    if (!companyId) return;
    getDoc(doc(db, 'companies', companyId)).then((snap) => {
      if (snap.exists()) {
        setCompanyData({ id: snap.id, ...snap.data() });
      }
    });
  }, [companyId]);

  const effectiveCompany = companyData || company;

  const isAdmin = userRole === 'admin';
  const isAuditManager = userRole === 'auditmanager';
  const isAuditor = userRole === 'auditor';
  const isHRManager = userRole === 'hrmanager';
  const canManage = isAdmin || isAuditManager || isHRManager || isCompanyAdmin;

  const [activeTab, setActiveTab] = useState(isAuditor ? 'dashboard' : 'audits');
  const [auditTypes, setAuditTypes] = useState([]);
  const [audits, setAudits] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [auditors, setAuditors] = useState([]);
  const [empLoaded, setEmpLoaded] = useState(false);
  const employeesLoadedForRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedAudit, setSelectedAudit] = useState(null);
  const { success: showSuccess, error: showError } = useToast();

  useEffect(() => {
    trackPageView('Audit');
  }, []);

  const visibleAudits = useMemo(() => {
    if (isAdmin || isHRManager) return audits;
    if (isAuditManager) {
      if (!auditScope || auditScope === 'both') return audits;
      const managerEmail = (currentUser?.email || '').toLowerCase();
      return audits.filter((a) => {
        if (managerEmail && (a.createdBy || '').toLowerCase() === managerEmail) return true;
        const category = (a.auditCategory || 'internal').toLowerCase().trim();
        if (auditScope === 'internal') return category === 'internal';
        if (auditScope === 'external') return category === 'external';
        return true;
      });
    }
    if (isAuditor) {
      const email = currentUser?.email?.toLowerCase();
      return audits.filter(
        (a) =>
          (a.auditorEmail || '').toLowerCase() === email ||
          (a.teamMembers || []).some((m) => (m.email || '').toLowerCase() === email),
      );
    }
    if (isCompanyAdmin) return audits;
    return audits;
  }, [audits, isAdmin, isHRManager, isAuditManager, isAuditor, isCompanyAdmin, auditScope, currentUser]);

  const mainTabs = useMemo(() => {
    const base = [
      { id: 'dashboard', label: 'Dashboard', icon: '📊' },
      { id: 'audits', label: 'Audits', icon: '🔍' },
    ];
    const extra =
      canManage
        ? [
            { id: 'history', label: 'History', icon: '📅' },
            { id: 'findings', label: 'All Findings', icon: '🔍' },
            { id: 'documents', label: 'Audit Documents', icon: '📎' },
            { id: 'reports', label: 'Reports', icon: '📈' },
          ]
        : [];
    return [...base, ...extra];
  }, [canManage]);

  useEffect(() => {
    if (!companyId) return undefined;
    const unsub = onSnapshot(
      query(collection(db, 'companies', companyId, 'auditTypes'), orderBy('createdAt', 'asc'), limit(100)),
      (snap) => {
        setAuditTypes(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return undefined;
    const unsub = onSnapshot(
      query(collection(db, 'companies', companyId, 'audits'), orderBy('createdAt', 'desc'), limit(200)),
      (snap) => {
        setAudits(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
    );
    return unsub;
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    if (empLoaded && employeesLoadedForRef.current === companyId && employees.length > 0) return;
    Promise.all([
      getDocs(query(collection(db, 'companies', companyId, 'employees'), where('status', '==', 'Active'), limit(500))),
      getDocs(query(collection(db, 'companies', companyId, 'teamMembers'), where('role', '==', 'auditor'), limit(100))),
    ])
      .then(([empSnap, auditorSnap]) => {
        setEmployees(empSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setAuditors(auditorSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setEmpLoaded(true);
        employeesLoadedForRef.current = companyId;
      })
      .catch(() => {
        setEmployees([]);
        setAuditors([]);
        setEmpLoaded(false);
        employeesLoadedForRef.current = null;
      });
  }, [companyId, empLoaded, employees.length]);

  if (!companyId) {
    return <p className="p-6 text-sm text-gray-500">Missing company.</p>;
  }

  if (loading) {
    return (
      <div>
        <SkeletonTable rows={10} />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <PageHeader
          title="Audit"
          subtitle="Schedule, track and close audits"
          tabs={mainTabs}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          actions={
            <>
              <button
                type="button"
                onClick={() => setShowCalendar(true)}
                className="w-10 h-10 flex items-center justify-center border border-gray-200 rounded-xl text-gray-500 hover:bg-gray-50 transition-colors"
                title="Audit Calendar"
              >
                📅
              </button>
              {canManage && (
                <button
                  type="button"
                  onClick={() => setShowSettings(true)}
                  className="min-h-[40px] flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  ⚙️ Settings
                </button>
              )}
            </>
          }
        />
      </div>

      <div>
        {activeTab === 'dashboard' &&
          (isAuditor ? (
            <AuditorDashboard audits={visibleAudits} currentUser={currentUser} />
          ) : (
            <AuditDashboard audits={visibleAudits} auditTypes={auditTypes} />
          ))}
        {activeTab === 'audits' && (
          <AuditList
            audits={visibleAudits}
            auditTypes={auditTypes}
            company={effectiveCompany}
            companyId={companyId}
            currentUser={currentUser}
            userRole={userRole}
            employees={employees}
            auditors={auditors}
            showSuccess={showSuccess}
            showError={showError}
            setSelectedAudit={setSelectedAudit}
            isAuditor={isAuditor}
            canManage={canManage}
          />
        )}
        {activeTab === 'history' && (
          <AuditHistory audits={visibleAudits} company={effectiveCompany} />
        )}
        {activeTab === 'findings' && <FindingsView audits={visibleAudits} onSelect={(a) => setSelectedAudit(a)} />}
        {activeTab === 'documents' && <AuditDocumentsView audits={visibleAudits} companyId={companyId} userRole={userRole} showSuccess={showSuccess} showError={showError} />}
        {activeTab === 'reports' && <AuditReports audits={visibleAudits} />}
      </div>

      {selectedAudit && (() => {
        const liveAudit = visibleAudits.find((a) => a.id === selectedAudit.id) || audits.find((a) => a.id === selectedAudit.id) || selectedAudit;
        if (isUnifiedTemplate(liveAudit)) {
          return (
            <UnifiedAuditDetail
              key={liveAudit.id}
              audit={liveAudit}
              companyId={companyId}
              currentUser={currentUser}
              employees={employees}
              onClose={() => setSelectedAudit(null)}
              showSuccess={showSuccess}
              showError={showError}
              isAuditor={isAuditor}
              canManage={canManage}
            />
          );
        }
        if (isRecordType(liveAudit)) {
          return (
            <RecordAuditDetail
              key={liveAudit.id}
              audit={liveAudit}
              companyId={companyId}
              currentUser={currentUser}
              employees={employees}
              onClose={() => setSelectedAudit(null)}
              showSuccess={showSuccess}
              showError={showError}
              isAuditor={isAuditor}
              canManage={canManage}
            />
          );
        }
        return (
          <AuditDetail
            key={liveAudit.id}
            audit={liveAudit}
            company={effectiveCompany}
            companyId={companyId}
            currentUser={currentUser}
            employees={employees}
            onClose={() => setSelectedAudit(null)}
            showSuccess={showSuccess}
            showError={showError}
            isAuditor={isAuditor}
            canManage={canManage}
          />
        );
      })()}

      {showSettings && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            role="presentation"
            className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
            onClick={() => setShowSettings(false)}
          />
          <div className="relative z-10 flex h-full w-full flex-col overflow-hidden border-l border-gray-100 bg-white shadow-xl sm:w-[480px]">
            <AuditSettings
              companyId={companyId}
              auditTypes={auditTypes}
              userRole={userRole}
              showSuccess={showSuccess}
              showError={showError}
              onClose={() => setShowSettings(false)}
            />
          </div>
        </div>
      )}

      {showCalendar && (
        <AuditCalendar
          audits={visibleAudits}
          onClose={() => setShowCalendar(false)}
          onSelectAudit={(a) => {
            setShowCalendar(false);
            setActiveTab('audits');
            const fresh = visibleAudits.find((x) => x.id === a.id) || audits.find((x) => x.id === a.id);
            setSelectedAudit(fresh || a);
          }}
        />
      )}
    </div>
  );
}

