export default function PageHeader({
  title,
  subtitle,
  actions,
  tabs,
  activeTab,
  onTabChange,
  sticky = true,
}) {
  return (
    <div className={`bg-white border border-gray-100 rounded-2xl overflow-hidden ${sticky ? 'sticky top-0 z-10' : ''}`}>
      <div className="px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-gray-800 leading-tight">{title}</h1>
          {subtitle && <p className="text-sm text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
        {actions && (
          <div className="flex items-center gap-2 flex-wrap flex-shrink-0">{actions}</div>
        )}
      </div>

      {tabs && tabs.length > 0 && (
        <div className="flex gap-1 overflow-x-auto scrollbar-none px-4 sm:px-6 pb-0 -mb-px">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange?.(tab.id)}
              className={`flex items-center gap-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap flex-shrink-0 border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-[#1B6B6B] text-[#1B6B6B]'
                  : 'border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-200'
              }`}
            >
              {tab.icon && <span style={{ fontSize: '14px' }}>{tab.icon}</span>}
              {tab.label}
              {tab.count !== undefined && (
                <span
                  className={`text-xs px-1.5 py-0.5 rounded-full ${
                    activeTab === tab.id
                      ? 'bg-[#E1F5EE] text-[#0F6E56]'
                      : 'bg-gray-100 text-gray-400'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
