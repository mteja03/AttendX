import EmptyState from '../../components/EmptyState';

export default function EmptyAuditState({ total, onAssign, auditTypesEmpty, canManage, search, onClearSearch }) {
  const hasSearch = Boolean(search);
  const noAuditsAtAll = total === 0;
  return (
    <div className="overflow-hidden rounded-2xl border-2 border-dashed border-gray-100 bg-white">
      <EmptyState
        illustration={
          <div className="w-16 h-16 rounded-2xl bg-[#EEEDFE] flex items-center justify-center">
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
              <rect x="4" y="8" width="20" height="24" rx="3" fill="#CECBF6" />
              <path d="M8 14h12M8 19h12M8 24h8" stroke="#534AB7" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="27" cy="26" r="7" fill="#7F77DD" />
              <path d="M24.5 26l2 2 4-4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        }
        title={
          hasSearch
            ? `No audits matching "${search}"`
            : noAuditsAtAll
              ? 'No audits assigned yet'
              : 'No audits match filters'
        }
        description={
          hasSearch
            ? 'Try searching by branch, auditor, or audit reference ID.'
            : noAuditsAtAll
              ? 'Create an audit template in settings, then assign audits to your team.'
              : 'Try adjusting filters or status tabs to see more results.'
        }
        action={
          hasSearch
            ? onClearSearch
            : canManage && noAuditsAtAll && !auditTypesEmpty
              ? onAssign
              : null
        }
        actionLabel={hasSearch ? 'Clear search' : 'Assign first audit'}
        actionColor={hasSearch ? '#5F5E5A' : '#534AB7'}
        hint={
          !hasSearch && canManage && noAuditsAtAll
            ? auditTypesEmpty
              ? 'set up templates in audit settings first'
              : 'set up templates in audit settings'
            : undefined
        }
      />
    </div>
  );
}
