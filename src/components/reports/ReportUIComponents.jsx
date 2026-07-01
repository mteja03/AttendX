export function StatCard({ value, label }) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
    </div>
  );
}

export function ChartCard({ title, children }) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5 mb-4 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">{title}</h3>
      {children}
    </div>
  );
}

export function DownloadExcelButton({ onClick, label = 'Download Excel' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1B6B6B] hover:bg-[#155858] text-white text-sm font-medium"
    >
      {label}
    </button>
  );
}
