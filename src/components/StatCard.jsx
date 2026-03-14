export default function StatCard({ title, value, icon: Icon, subtitle }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-slate-500 text-sm font-medium">{title}</p>
          <p className="text-2xl font-semibold text-slate-800 mt-1">{value}</p>
          {subtitle && <p className="text-slate-500 text-xs mt-1">{subtitle}</p>}
        </div>
        {Icon && (
          <div className="p-3 rounded-lg bg-primary-50 text-primary-600">
            <Icon className="w-6 h-6" />
          </div>
        )}
      </div>
    </div>
  );
}
