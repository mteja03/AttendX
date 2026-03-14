import { useParams } from 'react-router-dom';

export default function TeamMembers() {
  const { companyId } = useParams();

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-800">Team Members</h1>
        <p className="text-slate-500 mt-1">Users with access to this company</p>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500">
        Team members (companyId: {companyId}) will be implemented here.
      </div>
    </div>
  );
}
