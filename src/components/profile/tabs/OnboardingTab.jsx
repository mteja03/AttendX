export default function OnboardingTab({
  employee,
  companyId,
  isInactive,
  canEditEmployees,
  canStartOnboarding,
  onboarding,
  onboardingByCategory,
  onboardingCompleted,
  onboardingTotal,
  onboardingPct,
  onboardingEverStarted,
  showOnboardingTaskList,
  saving,
  handleStartOnboarding,
  setCompletingTask,
  setTaskNotes,
  unmarkTask,
  navigate,
  toDisplayDate,
  isOverdue,
  getCategoryIcon,
  getAssignedLabel,
}) {
  return (
<div className="space-y-6">
  {isInactive && (
    <div className="flex items-center gap-3 p-4 bg-gray-50 border border-gray-100 rounded-xl mb-4">
      <span className="text-xl shrink-0">🔒</span>
      <div>
        <p className="text-sm font-semibold text-gray-600">Read-only — Employee is Inactive</p>
        <p className="text-xs text-gray-400 mt-0.5">Onboarding history is preserved for records.</p>
      </div>
    </div>
  )}
  <div className="bg-white border border-slate-200 rounded-2xl p-5">
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              onboarding?.status === 'completed'
                ? 'bg-green-100 text-green-700'
                : onboarding?.status === 'in_progress'
                ? 'bg-[#C5E8E8] text-[#1B6B6B]'
                : 'bg-gray-100 text-gray-600'
            }`}
          >
            {onboarding?.status === 'completed'
              ? 'Completed'
              : onboarding?.status === 'in_progress'
              ? 'In Progress'
              : 'Not Started'}
          </span>
          <span className="text-xs text-gray-500">
            Joining: {employee.joiningDate ? toDisplayDate(employee.joiningDate) : '—'}
          </span>
        </div>

        <p className="text-sm text-gray-700 font-medium">
          {onboardingCompleted} of {onboardingTotal} tasks completed
        </p>
        <p className="text-xs text-gray-400 mt-1">{onboardingPct}% Complete</p>
        <div className="mt-3 w-full max-w-md bg-gray-100 rounded-full h-2">
          <div
            className="bg-[#1B6B6B] h-2 rounded-full"
            style={{ width: `${Math.min(onboardingPct, 100)}%` }}
          />
        </div>
      </div>

      {canStartOnboarding && !isInactive && (!onboarding || onboarding.status === 'not_started') && (
        <button
          type="button"
          onClick={handleStartOnboarding}
          disabled={saving}
          className="px-6 py-2.5 bg-[#1B6B6B] text-white rounded-xl text-sm font-medium hover:bg-[#155858] disabled:opacity-50"
        >
          {saving ? 'Starting…' : 'Start Onboarding'}
        </button>
      )}
    </div>
  </div>

  {!canStartOnboarding && !onboardingEverStarted && (
    <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
      <span className="text-2xl">⚠️</span>
      <div>
        <p className="text-sm font-semibold text-amber-800">Onboarding not available</p>
        <p className="text-xs text-amber-600 mt-0.5">
          Onboarding can only be started for Active employees. Current status: {employee.status || '—'}
        </p>
      </div>
    </div>
  )}

  {showOnboardingTaskList ? (
    <div className="space-y-6">
      {onboardingByCategory.map((g) => {
        const totalInCategory = g.tasks.length;
        const completedInCategory = g.tasks.filter((t) => t.completed).length;
        return (
          <div key={g.category}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                {getCategoryIcon(g.category)} {g.category}
              </h3>
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                {completedInCategory}/{totalInCategory}
              </span>
            </div>

            {g.tasks.map((task) => (
              <div
                key={task.id}
                role={!task.completed && canEditEmployees && !isInactive ? 'button' : undefined}
                tabIndex={!task.completed && canEditEmployees && !isInactive ? 0 : undefined}
                onClick={() => {
                  if (task.completed || isInactive || !canEditEmployees) return;
                  setCompletingTask(task);
                  setTaskNotes('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !task.completed && !isInactive && canEditEmployees) {
                    setCompletingTask(task);
                    setTaskNotes('');
                  }
                }}
                className={`flex items-start gap-3 p-3 rounded-xl border mb-2 transition-all ${
                  !task.completed && canEditEmployees && !isInactive ? 'cursor-pointer' : 'cursor-default'
                } ${
                  task.completed
                    ? 'bg-green-50 border-green-100'
                    : isOverdue(task.dueDate)
                    ? 'bg-red-50 border-red-100'
                    : 'bg-white border-gray-200'
                } ${
                  !task.completed && canEditEmployees && !isInactive
                    ? 'hover:border-[#C5E8E8] hover:bg-[#E8F5F5]'
                    : ''
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
                    task.completed ? 'bg-green-500 border-green-500' : 'border-gray-300'
                  }`}
                >
                  {task.completed && (
                    <svg width="10" height="10" viewBox="0 0 10 10">
                      <path
                        d="M2 5l2.5 2.5L8 3"
                        stroke="white"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        fill="none"
                      />
                    </svg>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p
                      className={`text-sm font-medium ${
                        task.completed ? 'line-through text-gray-400' : 'text-gray-800'
                      }`}
                    >
                      {task.title}
                    </p>
                    {task.isRequired && !task.completed && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-600">
                        Required
                      </span>
                    )}
                    {isOverdue(task.dueDate) && !task.completed && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-600">
                        Overdue
                      </span>
                    )}
                  </div>

                  {task.description && (
                    <p className="text-xs text-gray-400 mt-0.5">{task.description}</p>
                  )}

                  {task.linkedPolicyId && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/company/${companyId}/policies?policy=${task.linkedPolicyId}`);
                      }}
                      className="text-xs text-[#1B6B6B] hover:underline flex items-center gap-1 mt-1 text-left"
                    >
                      📋 View linked policy →
                    </button>
                  )}

                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      Due: {task.dueDate ? toDisplayDate(task.dueDate) : '—'}
                    </span>
                    <span className="text-xs text-gray-400">· {getAssignedLabel(task.assignedTo)}</span>
                    {task.completed && (
                      <span className="text-xs text-green-600">
                        ✓ Done by {task.completedBy} on {toDisplayDate(task.completedAt)}
                      </span>
                    )}
                  </div>

                  {task.completed && task.notes && (
                    <p className="text-xs text-gray-500 mt-1 italic">"{task.notes}"</p>
                  )}
                </div>

                {task.completed && !isInactive && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      unmarkTask(task.id);
                    }}
                    className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded hover:bg-gray-100 flex-shrink-0"
                  >
                    Undo
                  </button>
                )}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  ) : !canStartOnboarding && !onboardingEverStarted ? null : (
    <div className="text-center py-12 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
      <p className="text-4xl mb-3">🎯</p>
      <p className="text-base font-medium text-gray-700 mb-1">Onboarding not started</p>
      <p className="text-sm text-gray-400 mb-4">
        Start the onboarding process to track tasks for {employee.fullName}
      </p>
      {canStartOnboarding && !isInactive && (
        <button
          type="button"
          onClick={handleStartOnboarding}
          disabled={saving}
          className="px-6 py-2.5 bg-[#1B6B6B] text-white rounded-xl text-sm font-medium hover:bg-[#155858] disabled:opacity-50"
        >
          {saving ? 'Starting…' : 'Start Onboarding'}
        </button>
      )}
    </div>
  )}
</div>
  );
}
