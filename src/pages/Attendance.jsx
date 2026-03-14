import { useParams } from 'react-router-dom';

export default function Attendance() {
  const { companyId } = useParams();

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-800">Attendance</h1>
        <p className="text-slate-500 mt-1">Daily attendance for company</p>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500">
        Attendance (companyId: {companyId}) will be implemented here.
      </div>
    </div>
  );
}
