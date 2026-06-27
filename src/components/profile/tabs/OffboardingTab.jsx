import { toJSDate } from '../../../utils';

export default function OffboardingTab({
  employee,
  companyId,
  canEditEmployees,
  offboarding,
  offPhase,
  offByCategory,
  offPct,
  allOffboardingTasksDone,
  showOffboardingMainFlow,
  showOffboardingReadOnlyUi,
  showNoticePeriodSection,
  showExitTasksSection,
  showStarterSection,
  noticePeriodMetrics,
  offExitRefForUi,
  assignedAssetsForWarning,
  onboardingCompleteForOff,
  onboardingStartedForOff,
  onboardingPctForOff,
  setTab,
  setShowWithdrawModal,
  setShowBuyoutModal,
  setShowExitTasksModal,
  setShowCompleteOffboardingModal,
  handleRecordResignationClick,
  setCompletingOffTask,
  setOffTaskNotes,
  unmarkOffboardingTask,
  toDisplayDate,
  isOverdue,
  getOffCategoryIcon,
  getAssignedLabel,
  navigate,
}) {
  const canRecordResignation =
    employee?.status === 'Active' && (!offboarding?.phase || offboarding?.phase === 'withdrawn');

  return (
<div className="space-y-6">
  {showOffboardingReadOnlyUi ? (
    <div className="text-center py-12">
      <div className="text-5xl mb-4">{employee.status === 'Inactive' ? '🔴' : '✅'}</div>
      <h3 className="text-base font-semibold text-gray-700 mb-2">
        {employee.status === 'Inactive' ? 'Employee is Inactive' : 'Offboarding completed'}
      </h3>
      <p className="text-sm text-gray-400 max-w-xs mx-auto mb-6">
        {employee.status === 'Inactive'
          ? 'This employee has completed offboarding. Profile is read-only.'
          : 'This employee has finished exit processing. Profile is read-only.'}
      </p>

      {employee.offboarding?.completedAt && (
        <div className="inline-flex flex-col items-center gap-1 px-6 py-4 bg-gray-50 rounded-2xl border border-gray-100">
          <p className="text-xs text-gray-400">Offboarding completed on</p>
          <p className="text-sm font-semibold text-gray-700">
            {toDisplayDate(employee.offboarding.completedAt)}
          </p>
          {(employee.offboarding.reason || employee.offboarding.exitReason) && (
            <p className="text-xs text-gray-400 mt-1">
              Reason: {employee.offboarding.reason || employee.offboarding.exitReason}
            </p>
          )}
        </div>
      )}
    </div>
  ) : !showOffboardingMainFlow ? (
    <div className="text-center py-12 text-gray-400">
      <p className="text-sm">
        Offboarding not available for {employee.status || 'this'} employees.
      </p>
    </div>
  ) : (
    <>
      {showNoticePeriodSection && noticePeriodMetrics && offboarding && (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">⏰</span>
                  <h3 className="text-base font-semibold text-amber-800">Notice Period Running</h3>
                </div>
                <p className="text-sm text-amber-600">
                  {noticePeriodMetrics.daysRemaining > 0
                    ? `${noticePeriodMetrics.daysRemaining} days remaining`
                    : 'Notice Period completed'}
                </p>
              </div>
              <span className="text-2xl font-bold text-amber-600">{noticePeriodMetrics.progressPct}%</span>
            </div>
            <div className="w-full bg-amber-200 rounded-full h-2 mb-4">
              <div
                className="bg-amber-500 h-2 rounded-full transition-all"
                style={{ width: `${noticePeriodMetrics.progressPct}%` }}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
              <div className="bg-white rounded-xl p-3 border border-amber-100">
                <p className="text-xs text-amber-500 mb-1">Resigned On</p>
                <p className="text-sm font-semibold text-gray-800">
                  {toDisplayDate(offboarding.resignationDate)}
                </p>
              </div>
              <div className="bg-white rounded-xl p-3 border border-amber-100">
                <p className="text-xs text-amber-500 mb-1">Notice Period</p>
                <p className="text-sm font-semibold text-gray-800">{offboarding.noticePeriodDays} days</p>
              </div>
              <div className="bg-white rounded-xl p-3 border border-amber-100">
                <p className="text-xs text-amber-500 mb-1">Expected Last Day</p>
                <p className="text-sm font-semibold text-gray-800">
                  {toDisplayDate(offboarding.expectedLastDay)}
                </p>
              </div>
            </div>
            {offboarding.reason && (
              <div className="mt-3 pt-3 border-t border-amber-200">
                <p className="text-xs text-amber-500">Reason</p>
                <p className="text-sm text-gray-700 mt-0.5">{offboarding.reason}</p>
              </div>
            )}
          </div>
          {canEditEmployees && (offPhase === 'notice_period' || offPhase === 'exit_tasks') && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {offPhase === 'notice_period' && (
              <button
                type="button"
                onClick={() => setShowWithdrawModal(true)}
                className="flex flex-col items-center gap-2 p-4 bg-green-50 border border-green-200 rounded-2xl hover:bg-green-100 transition-colors text-center"
              >
                <span className="text-2xl">🔄</span>
                <div>
                  <p className="text-xs font-semibold text-green-700">Withdraw</p>
                  <p className="text-xs font-semibold text-green-700">Resignation</p>
                  <p className="text-xs text-green-500 mt-0.5">Employee stays</p>
                </div>
              </button>
              )}
              <button
                type="button"
                onClick={() => setShowBuyoutModal(true)}
                className="flex flex-col items-center gap-2 p-4 bg-blue-50 border border-blue-200 rounded-2xl hover:bg-blue-100 transition-colors text-center"
              >
                <span className="text-2xl">💰</span>
                <div>
                  <p className="text-xs font-semibold text-blue-700">Notice</p>
                  <p className="text-xs font-semibold text-blue-700">Buyout</p>
                  <p className="text-xs text-blue-500 mt-0.5">Early exit</p>
                </div>
              </button>
              {offPhase === 'notice_period' && <button
                type="button"
                onClick={() => setShowExitTasksModal(true)}
                className="flex flex-col items-center gap-2 p-4 bg-orange-50 border border-orange-200 rounded-2xl hover:bg-orange-100 transition-colors text-center"
              >
                <span className="text-2xl">✅</span>
                <div>
                  <p className="text-xs font-semibold text-orange-700">Start Exit</p>
                  <p className="text-xs font-semibold text-orange-700">Tasks</p>
                  <p className="text-xs text-orange-500 mt-0.5">Begin F&amp;F</p>
                </div>
              </button>}
            </div>
          )}
        </div>
      )}

      {showExitTasksSection && offboarding && (
        <div>
          <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 mb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-orange-800">Exit Processing</p>
                <p className="text-xs text-orange-600">
                  Last day:{' '}
                  {toDisplayDate(offboarding.actualLastDay || offboarding.expectedLastDay || offboarding.exitDate)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-orange-600">{offboarding.completionPct ?? offPct}%</p>
                <p className="text-xs text-orange-500">complete</p>
              </div>
            </div>
          </div>

          <div className="w-full bg-gray-100 rounded-full h-2 mb-6">
            <div
              className={`h-2 rounded-full transition-all ${
                offPct === 100 ? 'bg-green-500' : offPct > 50 ? 'bg-[#1B6B6B]' : 'bg-amber-500'
              }`}
              style={{ width: `${Math.min(offPct, 100)}%` }}
            />
          </div>

          {(() => {
            const exit = toJSDate(offExitRefForUi);
            const daysUntilExit = exit ? Math.ceil((exit - new Date()) / (1000 * 60 * 60 * 24)) : null;
            if (daysUntilExit == null) return null;
            if (daysUntilExit > 0) {
              return (
                <div className="text-center mb-4 p-3 bg-amber-50 rounded-xl border border-amber-100">
                  <p className="text-2xl font-bold text-amber-700">{daysUntilExit}</p>
                  <p className="text-xs text-amber-600">days until exit</p>
                </div>
              );
            }
            if (daysUntilExit === 0) {
              return (
                <div className="text-center mb-4 p-3 bg-red-50 rounded-xl border border-red-100">
                  <p className="text-sm font-bold text-red-700">🚨 Today is the last working day!</p>
                </div>
              );
            }
            return (
              <div className="text-center mb-4 p-3 bg-gray-50 rounded-xl border border-gray-100">
                <p className="text-sm text-gray-500">
                  Employee has exited {Math.abs(daysUntilExit)} days ago
                </p>
              </div>
            );
          })()}

          <div className="space-y-6">
            {offByCategory.map((g) => {
              const totalInCategory = g.tasks.length;
              const completedInCategory = g.tasks.filter((t) => t.completed).length;
              return (
                <div key={g.category}>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                      {getOffCategoryIcon(g.category)} {g.category}
                    </h3>
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                      {completedInCategory}/{totalInCategory}
                    </span>
                  </div>

                  {g.tasks.map((task) => (
                    <div
                      key={task.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        if (task.completed) return;
                        setCompletingOffTask(task);
                        setOffTaskNotes('');
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !task.completed) {
                          setCompletingOffTask(task);
                          setOffTaskNotes('');
                        }
                      }}
                      className={`flex items-start gap-3 p-3 rounded-xl border mb-2 transition-all cursor-pointer ${
                        task.completed
                          ? 'bg-green-50 border-green-100'
                          : isOverdue(task.dueDate)
                            ? 'bg-red-50 border-red-100'
                            : 'bg-white border-gray-200 hover:border-amber-200 hover:bg-amber-50'
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
                          task.completed ? 'bg-green-500 border-green-500' : 'border-gray-300'
                        }`}
                      >
                        {task.completed && (
                          <svg width="10" height="10" viewBox="0 0 10 10">
                            <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none" />
                          </svg>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className={`text-sm font-medium ${task.completed ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                            {task.title}
                          </p>
                          {task.isRequired !== false && !task.completed && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-600">Required</span>
                          )}
                          {isOverdue(task.dueDate) && !task.completed && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-600">Overdue</span>
                          )}
                        </div>
                        {task.description && <p className="text-xs text-gray-400 mt-0.5">{task.description}</p>}
                        {task.isAssetTask && (
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">📦 Asset Return</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/company/${companyId}/assets`);
                              }}
                              className="text-xs text-[#1B6B6B] hover:underline"
                            >
                              View in Assets →
                            </button>
                          </div>
                        )}
                        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                          <span className="text-xs text-gray-400">Due: {task.dueDate ? toDisplayDate(task.dueDate) : '—'}</span>
                          <span className="text-xs text-gray-400">· {getAssignedLabel(task.assignedTo)}</span>
                          {task.completed && (
                            <span className="text-xs text-green-600">
                              ✓ Done by {task.completedBy} on {toDisplayDate(task.completedAt)}
                            </span>
                          )}
                        </div>
                        {task.completed && task.notes && (
                          <p className="text-xs text-gray-500 mt-1 italic">&quot;{task.notes}&quot;</p>
                        )}
                      </div>

                      {task.completed && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            unmarkOffboardingTask(task.id);
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

          {canEditEmployees && allOffboardingTasksDone && (
            <div className="mt-6 p-5 bg-green-50 border-2 border-green-300 rounded-2xl text-center">
              <div className="text-4xl mb-3">🎉</div>
              <h3 className="text-base font-semibold text-green-800 mb-1">All Tasks Completed!</h3>
              <p className="text-sm text-green-600 mb-4">
                Review everything and click below to officially close this employee&apos;s offboarding.
              </p>
              <div className="text-left bg-white rounded-xl p-4 mb-4 border border-green-200">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Final Checklist</p>
                {[
                  'All assets returned to inventory',
                  'F&F settlement processed',
                  'Experience & relieving letter issued',
                  'PF & ESIC details settled',
                  'Knowledge transfer completed',
                  'Access revoked from all systems',
                ].map((item) => (
                  <div
                    key={item}
                    className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-0"
                  >
                    <span className="text-green-500 text-sm">✓</span>
                    <span className="text-sm text-gray-600">{item}</span>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setShowCompleteOffboardingModal(true)}
                className="w-full py-3 bg-green-600 text-white rounded-xl font-semibold text-sm hover:bg-green-700 transition-colors"
              >
                ✅ Complete Offboarding &amp; Mark as Inactive
              </button>
            </div>
          )}

          {canEditEmployees && !allOffboardingTasksDone && offPhase === 'exit_tasks' && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setShowCompleteOffboardingModal(true)}
                className="w-full py-2.5 border-2 border-dashed border-gray-300 text-gray-400 rounded-xl text-sm hover:border-amber-400 hover:text-amber-600 transition-colors"
              >
                Complete Offboarding Early
              </button>
              <p className="text-xs text-center text-gray-400 mt-1.5">
                {employee.offboarding?.tasks?.filter((t) => t.isRequired !== false && !t.completed).length || 0}{' '}
                required tasks still pending
              </p>
            </div>
          )}
        </div>
      )}

      {showStarterSection && (
        <div className="text-center py-12">
          <div className="text-5xl mb-4">📋</div>
          <h3 className="text-base font-semibold text-gray-700 mb-2">No resignation recorded</h3>
          <p className="text-sm text-gray-400 mb-6 max-w-xs mx-auto">
            When an employee resigns, record it here to start tracking their Notice Period.
          </p>
          {offPhase === 'withdrawn' && employee.offboarding?.withdrawnOn && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-xl max-w-lg mx-auto">
              <p className="text-xs text-green-700">
                ✓ Previous resignation was withdrawn on {toDisplayDate(employee.offboarding.withdrawnOn)}. Employee is
                Active again.
              </p>
            </div>
          )}
          {!onboardingCompleteForOff && (
            <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl max-w-lg mx-auto text-left">
              <div className="flex items-start gap-3">
                <span className="text-xl flex-shrink-0">⚠️</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-amber-800">Onboarding incomplete</p>
                  <p className="text-xs text-amber-600 mt-0.5">
                    {!onboardingStartedForOff
                      ? 'Onboarding has not been started yet.'
                      : `Onboarding is ${onboardingPctForOff}% complete.`}{' '}
                    HR can still proceed with offboarding if required.
                  </p>
                  <button
                    type="button"
                    onClick={() => setTab('onboarding')}
                    className="text-xs text-amber-700 font-medium underline mt-1.5"
                  >
                    Go to Onboarding tab →
                  </button>
                </div>
              </div>
            </div>
          )}
          {canEditEmployees && canRecordResignation && (
            <button
              type="button"
              onClick={handleRecordResignationClick}
              className="px-6 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-medium hover:bg-amber-600"
            >
              {offPhase === 'withdrawn' ? '📝 Record New Resignation' : '📝 Record Resignation'}
            </button>
          )}
          {(assignedAssetsForWarning.trackables.length > 0 || assignedAssetsForWarning.consumables.length > 0) && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mt-8 max-w-lg mx-auto text-left">
              <p className="text-sm font-medium text-amber-800 mb-2">⚠️ Assets to be returned</p>
              {assignedAssetsForWarning.trackables.map((a) => (
                <p key={a.id} className="text-xs text-amber-700">
                  • {a.name} ({a.assetId})
                </p>
              ))}
              {assignedAssetsForWarning.consumables.map((a) => (
                <p key={`${a.id}_${a.assetId}`} className="text-xs text-amber-700">
                  • {a.name} ({a.assetId}) · Qty: {a._qty}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {showOffboardingMainFlow &&
        !showOffboardingReadOnlyUi &&
        !showNoticePeriodSection &&
        !showExitTasksSection &&
        !showStarterSection && (
          <div className="text-center py-12 text-gray-400">
            <p className="text-sm">
              Offboarding state could not be displayed. Status: {employee.status || '—'} · Phase:{' '}
              {offboarding?.phase || '—'}
            </p>
          </div>
        )}
    </>
  )}
</div>
  );
}
