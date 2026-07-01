import { EMPTY_EMPLOYEE_FILTERS } from '../../utils/employeeListHelpers.jsx';

export default function FilterPanel({
  filters,
  setFilters,
  departments,
  branches,
  locationFilterOptions,
  employmentTypes,
  categories,
  designationFilterOptions,
  reportingManagerFilterOptions,
  joinYearSelectOptions,
  activeFilterCount,
}) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5 mb-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-700">Filter Employees</h3>
        <button
          type="button"
          onClick={() => setFilters({ ...EMPTY_EMPLOYEE_FILTERS })}
          className="text-xs text-[#1B6B6B] hover:underline"
        >
          Clear all filters
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className="text-xs text-gray-400 block mb-1">Department</label>
          <select
            value={filters.department}
            onChange={(e) => setFilters((prev) => ({ ...prev, department: e.target.value }))}
            className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]"
          >
            <option value="">All</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">Branch</label>
          <select
            value={filters.branch}
            onChange={(e) => setFilters((prev) => ({ ...prev, branch: e.target.value }))}
            className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]"
          >
            <option value="">All</option>
            {branches.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">Location</label>
          <select
            value={filters.location}
            onChange={(e) => setFilters((prev) => ({ ...prev, location: e.target.value }))}
            className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]"
          >
            <option value="">All</option>
            {locationFilterOptions.map((loc) => (
              <option key={loc} value={loc}>
                {loc}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">Employment Type</label>
          <select
            value={filters.employmentType}
            onChange={(e) => setFilters((prev) => ({ ...prev, employmentType: e.target.value }))}
            className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]"
          >
            <option value="">All</option>
            {employmentTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">Category</label>
          <select
            value={filters.category}
            onChange={(e) => setFilters((prev) => ({ ...prev, category: e.target.value }))}
            className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]"
          >
            <option value="">All</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">Designation</label>
          <select
            value={filters.designation}
            onChange={(e) => setFilters((prev) => ({ ...prev, designation: e.target.value }))}
            className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]"
          >
            <option value="">All</option>
            {designationFilterOptions.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">Gender</label>
          <select
            value={filters.gender}
            onChange={(e) => setFilters((prev) => ({ ...prev, gender: e.target.value }))}
            className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]"
          >
            <option value="">All</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Other">Other</option>
            <option value="Prefer not to say">Prefer not to say</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">Blood Group</label>
          <select
            value={filters.bloodGroup}
            onChange={(e) => setFilters((prev) => ({ ...prev, bloodGroup: e.target.value }))}
            className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]"
          >
            <option value="">All</option>
            {['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map((bg) => (
              <option key={bg} value={bg}>
                {bg}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">Marital Status</label>
          <select
            value={filters.maritalStatus}
            onChange={(e) => setFilters((prev) => ({ ...prev, maritalStatus: e.target.value }))}
            className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]"
          >
            <option value="">All</option>
            <option value="Single">Single</option>
            <option value="Married">Married</option>
            <option value="Divorced">Divorced</option>
            <option value="Widowed">Widowed</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">Disability</label>
          <select
            value={filters.disability}
            onChange={(e) => setFilters((prev) => ({ ...prev, disability: e.target.value }))}
            className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]"
          >
            <option value="">All</option>
            <option value="none">None</option>
            <option value="Visual Impairment">Visual Impairment</option>
            <option value="Hearing Impairment">Hearing Impairment</option>
            <option value="Physical Disability">Physical Disability</option>
            <option value="Intellectual Disability">Intellectual Disability</option>
            <option value="Other">Other</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">Reporting Manager</label>
          <select
            value={filters.reportingManager}
            onChange={(e) => setFilters((prev) => ({ ...prev, reportingManager: e.target.value }))}
            className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]"
          >
            <option value="">All</option>
            {reportingManagerFilterOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">PF Applicable</label>
          <select
            value={filters.pfApplicable}
            onChange={(e) => setFilters((prev) => ({ ...prev, pfApplicable: e.target.value }))}
            className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]"
          >
            <option value="">All</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">ESIC Applicable</label>
          <select
            value={filters.esicApplicable}
            onChange={(e) => setFilters((prev) => ({ ...prev, esicApplicable: e.target.value }))}
            className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]"
          >
            <option value="">All</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">Joined From Year</label>
          <select
            value={filters.joinYearFrom}
            onChange={(e) => setFilters((prev) => ({ ...prev, joinYearFrom: e.target.value }))}
            className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]"
          >
            <option value="">Any</option>
            {joinYearSelectOptions.map((y) => (
              <option key={y} value={String(y)}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">Joined To Year</label>
          <select
            value={filters.joinYearTo}
            onChange={(e) => setFilters((prev) => ({ ...prev, joinYearTo: e.target.value }))}
            className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]"
          >
            <option value="">Any</option>
            {joinYearSelectOptions.map((y) => (
              <option key={`to-${y}`} value={String(y)}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      {activeFilterCount > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <p className="text-xs text-[#1B6B6B]">
            {activeFilterCount} filter{activeFilterCount !== 1 ? 's' : ''} active
          </p>
        </div>
      )}
    </div>
  );
}
