import { useEffect } from 'react';
import Cropper from 'react-easy-crop';
import { getCroppedBlob } from '../../utils/employeeProfileHelpers';
import { doc, updateDoc, deleteField } from 'firebase/firestore';
import { ref as storageRef, uploadBytes } from 'firebase/storage';
import { db, storage } from '../../firebase/config';
import { deleteEmployeePhoto } from '../../utils/photoUpload';
import { trackPhotoUploaded } from '../../utils/analytics';
import { toDisplayDate } from '../../utils';

export default function OffboardingModals({
  employee,
  companyId,
  empId,
  saving,
  // Task completion modals
  completingTask,
  setCompletingTask,
  taskNotes,
  setTaskNotes,
  markTaskComplete,
  isInactive,
  canEditEmployees,
  showError,
  completingOffTask,
  setCompletingOffTask,
  offTaskNotes,
  setOffTaskNotes,
  markOffboardingTaskComplete,
  // Onboarding warning modal
  showOnboardingWarningModal,
  setShowOnboardingWarningModal,
  setShowResignationModal,
  setTab,
  onboardingStartedForOff,
  onboardingPctForOff,
  // Resignation modal
  showResignationModal,
  resignForm,
  setResignForm,
  expectedResignationLastDay,
  handleRecordResignation,
  // Withdraw modal
  showWithdrawModal,
  setShowWithdrawModal,
  withdrawNotes,
  setWithdrawNotes,
  handleWithdrawResignation,
  // Buyout modal
  showBuyoutModal,
  setShowBuyoutModal,
  buyoutForm,
  setBuyoutForm,
  buyoutDaysPreview,
  handleNoticeBuyout,
  // Exit tasks modal
  showExitTasksModal,
  setShowExitTasksModal,
  offboardingExitDate,
  setOffboardingExitDate,
  offboardingExitReason,
  setOffboardingExitReason,
  handleStartExitTasks,
  // Complete offboarding modal
  showCompleteOffboardingModal,
  setShowCompleteOffboardingModal,
  completionNotes,
  setCompletionNotes,
  handleCompleteOffboarding,
  // Rehire modal
  showRehireModal,
  setShowRehireModal,
  rehireForm,
  setRehireForm,
  handleRehireEmployee,
  // Delete modal
  showDeleteModal,
  setShowDeleteModal,
  deleteConfirmName,
  setDeleteConfirmName,
  deleting,
  handleDeleteEmployee,
  // Crop modal
  cropModalOpen,
  setCropModalOpen,
  rawImageSrc,
  setRawImageSrc,
  crop,
  setCrop,
  zoom,
  setZoom,
  croppedAreaPixels,
  setCroppedAreaPixels,
  uploadingPhoto,
  setUploadingPhoto,
  fetchEmployee,
  success,
  // Remove photo confirm
  showRemovePhotoConfirm,
  setShowRemovePhotoConfirm,
}) {
  const anyModalOpen = !!(
    showDeleteModal || showCompleteOffboardingModal || showRehireModal ||
    completingTask || completingOffTask || showOnboardingWarningModal ||
    showResignationModal || showWithdrawModal || showBuyoutModal ||
    cropModalOpen || showExitTasksModal || showRemovePhotoConfirm
  );

  useEffect(() => {
    if (!anyModalOpen) return;
    const handleKeyDown = (e) => {
      if (e.key !== 'Escape') return;
      if (showDeleteModal) { setShowDeleteModal(false); setDeleteConfirmName(''); }
      else if (showCompleteOffboardingModal) { setShowCompleteOffboardingModal(false); setCompletionNotes(''); }
      else if (showRehireModal) setShowRehireModal(false);
      else if (completingTask) setCompletingTask(null);
      else if (completingOffTask) setCompletingOffTask(null);
      else if (showOnboardingWarningModal) setShowOnboardingWarningModal(false);
      else if (showResignationModal) setShowResignationModal(false);
      else if (showWithdrawModal) { setShowWithdrawModal(false); setWithdrawNotes(''); }
      else if (showBuyoutModal) setShowBuyoutModal(false);
      else if (cropModalOpen) { setCropModalOpen(false); setRawImageSrc(null); }
      else if (showExitTasksModal) setShowExitTasksModal(false);
      else if (showRemovePhotoConfirm) setShowRemovePhotoConfirm(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [
    anyModalOpen, showDeleteModal, showCompleteOffboardingModal, showRehireModal,
    completingTask, completingOffTask, showOnboardingWarningModal, showResignationModal,
    showWithdrawModal, showBuyoutModal, cropModalOpen, showExitTasksModal, showRemovePhotoConfirm,
    setShowDeleteModal, setDeleteConfirmName, setShowCompleteOffboardingModal, setCompletionNotes,
    setShowRehireModal, setCompletingTask, setCompletingOffTask, setShowOnboardingWarningModal,
    setShowResignationModal, setShowWithdrawModal, setWithdrawNotes, setShowBuyoutModal,
    setCropModalOpen, setRawImageSrc, setShowExitTasksModal, setShowRemovePhotoConfirm,
  ]);

  return (
    <>
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 sm:p-4" aria-hidden="true">
          <div role="dialog" aria-modal="true" aria-labelledby="delete-employee-modal-title" className="bg-white rounded-t-3xl sm:rounded-2xl p-6 w-full sm:max-w-sm max-h-[90vh] overflow-y-auto">
            <div className="text-center mb-5">
              <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-3">
                <span className="text-2xl">🗑️</span>
              </div>
              <h3 id="delete-employee-modal-title" className="text-base font-semibold text-gray-800 mb-1">Delete Employee Permanently?</h3>
              <p className="text-sm text-gray-500">
                This will permanently delete <strong>{employee.fullName}</strong> and ALL their data including documents,
                leave history, assets, and onboarding records.
              </p>
            </div>

            <div className="p-3 bg-red-50 border border-red-200 rounded-xl mb-4">
              <p className="text-xs text-red-600 font-medium">
                ⚠️ This action cannot be undone. Only delete incorrect or duplicate records. This action is permanent.
              </p>
            </div>

            <div className="mb-4">
              <label className="text-xs text-gray-500 block mb-1.5">
                Type <strong>{employee.fullName}</strong> to confirm
              </label>
              <input
                placeholder={employee.fullName}
                value={deleteConfirmName}
                onChange={(e) => setDeleteConfirmName(e.target.value)}
                className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-red-400 border-red-200"
              />
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteConfirmName('');
                }}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteConfirmName !== employee.fullName || deleting}
                onClick={handleDeleteEmployee}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {deleting ? 'Deleting...' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCompleteOffboardingModal && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4" aria-hidden="true">
          <div role="dialog" aria-modal="true" aria-labelledby="complete-offboarding-modal-title" className="bg-white rounded-t-3xl sm:rounded-2xl p-6 w-full sm:max-w-sm shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="text-center mb-5">
              <div className="text-4xl mb-3">🏁</div>
              <h3 id="complete-offboarding-modal-title" className="text-base font-semibold text-gray-800 mb-1">Complete Offboarding?</h3>
              <p className="text-sm text-gray-500">
                {employee.fullName} will be marked as Inactive. This cannot be undone.
              </p>
            </div>
            <div className="mb-4">
              <label className="text-xs text-gray-500 block mb-1.5">Final Notes (optional)</label>
              <textarea
                placeholder="e.g. All clearances done, F&F paid on 30/03/2026..."
                value={completionNotes}
                onChange={(e) => setCompletionNotes(e.target.value)}
                rows={3}
                className="w-full border rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:border-[#1B6B6B]"
              />
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowCompleteOffboardingModal(false);
                  setCompletionNotes('');
                }}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCompleteOffboarding}
                disabled={saving}
                className="flex-1 py-2.5 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Confirm & Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showRehireModal && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4" aria-hidden="true">
          <div role="dialog" aria-modal="true" aria-labelledby="rehire-modal-title" className="bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] flex flex-col overflow-hidden shadow-xl">
            <div className="flex items-center justify-between p-6 border-b flex-shrink-0">
              <div>
                <h2 id="rehire-modal-title" className="text-lg font-semibold text-gray-800">Rehire Employee</h2>
                <p className="text-sm text-gray-400 mt-0.5">{employee.fullName} will be reactivated</p>
              </div>
              <button
                type="button"
                onClick={() => setShowRehireModal(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
                <p className="text-sm font-semibold text-green-800 mb-1">Previous employment preserved</p>
                <p className="text-xs text-green-600">
                  All documents, leave history, and records from previous employment will be kept. A new tenure will begin.
                </p>
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1.5">New Joining Date *</label>
                <input
                  type="date"
                  value={rehireForm.newJoiningDate}
                  onChange={(e) => setRehireForm((prev) => ({ ...prev, newJoiningDate: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]"
                />
              </div>

              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl">
                <p className="text-xs text-blue-700">
                  💡 All other details (designation, department, salary etc.) can be updated by editing the employee
                  profile after rehiring.
                </p>
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1.5">Notes (optional)</label>
                <textarea
                  placeholder="e.g. Rehired as Senior Developer after 6 months gap"
                  value={rehireForm.notes}
                  onChange={(e) => setRehireForm((prev) => ({ ...prev, notes: e.target.value }))}
                  rows={2}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:border-[#1B6B6B]"
                />
              </div>
            </div>

            <div className="p-6 border-t flex-shrink-0 flex gap-3">
              <button
                type="button"
                onClick={() => setShowRehireModal(false)}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRehireEmployee}
                disabled={!rehireForm.newJoiningDate || saving}
                className="flex-1 py-2.5 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 disabled:opacity-50"
              >
                {saving ? 'Rehiring…' : '✓ Confirm Rehire'}
              </button>
            </div>
          </div>
        </div>
      )}

      {completingTask && !isInactive && canEditEmployees && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4 overflow-y-auto" aria-hidden="true">
          <div role="dialog" aria-modal="true" aria-labelledby="complete-task-modal-title" className="bg-white rounded-t-3xl sm:rounded-2xl p-5 w-full sm:max-w-sm max-h-[90vh] overflow-y-auto">
            <h3 id="complete-task-modal-title" className="font-medium mb-3">
              Complete: {completingTask.title}
            </h3>
            <textarea
              placeholder="Add notes (optional)..."
              value={taskNotes}
              onChange={(e) => setTaskNotes(e.target.value)}
              rows={3}
              className="w-full border rounded-xl px-3 py-2 text-sm resize-none mb-3"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCompletingTask(null)}
                className="flex-1 py-2 border rounded-xl text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await markTaskComplete(completingTask.id, taskNotes);
                    setCompletingTask(null);
                    setTaskNotes('');
                  } catch {
                    showError('Failed to update task');
                  }
                }}
                className="flex-1 py-2 bg-green-600 text-white rounded-xl text-sm font-medium"
              >
                Mark Complete ✓
              </button>
            </div>
          </div>
        </div>
      )}

      {completingOffTask && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4 overflow-y-auto" aria-hidden="true">
          <div role="dialog" aria-modal="true" aria-labelledby="complete-off-task-modal-title" className="bg-white rounded-t-3xl sm:rounded-2xl p-5 w-full sm:max-w-sm max-h-[90vh] overflow-y-auto">
            <h3 id="complete-off-task-modal-title" className="font-medium mb-3">
              Complete: {completingOffTask.title}
            </h3>
            <textarea
              placeholder="Add notes (optional)..."
              value={offTaskNotes}
              onChange={(e) => setOffTaskNotes(e.target.value)}
              rows={3}
              className="w-full border rounded-xl px-3 py-2 text-sm resize-none mb-3"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCompletingOffTask(null)}
                className="flex-1 py-2 border rounded-xl text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await markOffboardingTaskComplete(completingOffTask.id, offTaskNotes);
                    setCompletingOffTask(null);
                    setOffTaskNotes('');
                  } catch {
                    showError('Failed to update task');
                  }
                }}
                className="flex-1 py-2 bg-green-600 text-white rounded-xl text-sm font-medium"
              >
                Mark Complete ✓
              </button>
            </div>
          </div>
        </div>
      )}

      {showOnboardingWarningModal && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-[60] sm:p-4" aria-hidden="true">
          <div role="dialog" aria-modal="true" aria-labelledby="onboarding-warning-modal-title" className="bg-white rounded-t-3xl sm:rounded-2xl p-6 w-full sm:max-w-sm text-center shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="text-5xl mb-4">⚠️</div>
            <h3 id="onboarding-warning-modal-title" className="text-base font-semibold text-gray-800 mb-2">Onboarding Not Complete</h3>
            <p className="text-sm text-gray-500 mb-2">
              {!onboardingStartedForOff
                ? 'Onboarding has not been started for this employee.'
                : `Onboarding is only ${onboardingPctForOff}% complete.`}
            </p>
            <p className="text-sm text-gray-500 mb-6">Are you sure you want to start the offboarding process?</p>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  setShowOnboardingWarningModal(false);
                  setShowResignationModal(true);
                }}
                className="w-full py-2.5 bg-amber-500 text-white rounded-xl text-sm font-medium hover:bg-amber-600"
              >
                Yes, Continue with Offboarding
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowOnboardingWarningModal(false);
                  setTab('onboarding');
                }}
                className="w-full py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm hover:bg-gray-50"
              >
                Go to Onboarding First
              </button>
            </div>
          </div>
        </div>
      )}

      {showResignationModal && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4 overflow-y-auto" aria-hidden="true">
          <div role="dialog" aria-modal="true" aria-labelledby="resignation-modal-title" className="bg-white rounded-t-3xl sm:rounded-2xl shadow-xl w-full sm:max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h2 id="resignation-modal-title" className="text-lg font-semibold text-gray-900 mb-4">Record Resignation</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Resignation Date</label>
                <input
                  type="date"
                  value={resignForm.resignationDate}
                  onChange={(e) => setResignForm((f) => ({ ...f, resignationDate: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Notice Period</label>
                <select
                  value={resignForm.noticePeriodDays}
                  onChange={(e) => setResignForm((f) => ({ ...f, noticePeriodDays: Number(e.target.value) }))}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm"
                >
                  <option value={15}>15 days</option>
                  <option value={30}>30 days</option>
                  <option value={45}>45 days</option>
                  <option value={60}>60 days</option>
                  <option value={90}>90 days</option>
                </select>
              </div>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <p className="text-xs text-amber-500">Expected Last Day (auto-calculated)</p>
                <p className="text-base font-bold text-amber-800 mt-1">
                  {expectedResignationLastDay ? toDisplayDate(expectedResignationLastDay) : '— select dates above'}
                </p>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Reason</label>
                <select
                  value={resignForm.reason}
                  onChange={(e) => setResignForm((f) => ({ ...f, reason: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm"
                >
                  <option value="">Select reason</option>
                  <option value="Better Opportunity">Better Opportunity</option>
                  <option value="Higher Studies">Higher Studies</option>
                  <option value="Personal Reasons">Personal Reasons</option>
                  <option value="Relocation">Relocation</option>
                  <option value="Health Reasons">Health Reasons</option>
                  <option value="Entrepreneurship">Entrepreneurship</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Notes (optional)</label>
                <textarea
                  value={resignForm.notes}
                  onChange={(e) => setResignForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm resize-none"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button
                type="button"
                onClick={() => setShowResignationModal(false)}
                className="flex-1 py-2.5 border rounded-xl text-sm text-gray-600"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRecordResignation}
                disabled={saving}
                className="flex-1 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-medium hover:bg-amber-600 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Record Resignation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showWithdrawModal && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4 overflow-y-auto" aria-hidden="true">
          <div role="dialog" aria-modal="true" aria-labelledby="withdraw-resignation-modal-title" className="bg-white rounded-t-3xl sm:rounded-2xl shadow-xl w-full sm:max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h2 id="withdraw-resignation-modal-title" className="text-lg font-semibold text-gray-900 mb-2">Withdraw Resignation</h2>
            <div className="text-center py-4">
              <div className="text-5xl mb-4">🔄</div>
              <h3 className="text-base font-semibold text-gray-800 mb-2">
                Withdraw {employee.fullName}&apos;s Resignation?
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                Employee will return to Active status. All offboarding data will be preserved in history for audit
                trail.
              </p>
              <textarea
                placeholder="Notes (e.g. Employee retained with salary revision)"
                value={withdrawNotes}
                onChange={(e) => setWithdrawNotes(e.target.value)}
                rows={3}
                className="w-full border rounded-xl px-3 py-2.5 text-sm resize-none text-left"
              />
            </div>
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={() => {
                  setShowWithdrawModal(false);
                  setWithdrawNotes('');
                }}
                className="flex-1 py-2.5 border rounded-xl text-sm text-gray-600"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleWithdrawResignation}
                disabled={saving}
                className="flex-1 py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Yes, Withdraw Resignation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showBuyoutModal && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4 overflow-y-auto" aria-hidden="true">
          <div role="dialog" aria-modal="true" aria-labelledby="buyout-modal-title" className="bg-white rounded-t-3xl sm:rounded-2xl shadow-xl w-full sm:max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h2 id="buyout-modal-title" className="text-lg font-semibold text-gray-900 mb-2">Notice Period Buyout</h2>
            <p className="text-sm text-gray-500 mb-4">
              Company is buying out the remaining Notice Period. Employee will exit earlier than planned.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Actual Last Day</label>
                <input
                  type="date"
                  value={buyoutForm.actualLastDay}
                  onChange={(e) => setBuyoutForm((f) => ({ ...f, actualLastDay: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm"
                />
              </div>
              {buyoutDaysPreview != null && (
                <div className="p-3 bg-blue-50 rounded-xl border border-blue-200">
                  <p className="text-xs text-blue-500">Days being bought out</p>
                  <p className="text-lg font-bold text-blue-700 mt-1">{buyoutDaysPreview} days</p>
                </div>
              )}
              <div>
                <label className="block text-xs text-gray-500 mb-1">Notes (optional)</label>
                <textarea
                  value={buyoutForm.notes}
                  onChange={(e) => setBuyoutForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm resize-none"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button
                type="button"
                onClick={() => setShowBuyoutModal(false)}
                className="flex-1 py-2.5 border rounded-xl text-sm text-gray-600"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleNoticeBuyout}
                disabled={saving}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Confirm Buyout'}
              </button>
            </div>
          </div>
        </div>
      )}

      {cropModalOpen && rawImageSrc && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4" aria-hidden="true">
          <div role="dialog" aria-modal="true" aria-labelledby="crop-photo-modal-title" className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h3 id="crop-photo-modal-title" className="text-base font-semibold text-gray-800">Adjust Photo</h3>
                <p className="text-xs text-gray-400 mt-0.5">Pinch or scroll to zoom · Drag to reposition</p>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => {
                  setCropModalOpen(false);
                  setRawImageSrc(null);
                }}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400"
              >
                ✕
              </button>
            </div>

            <div className="relative bg-gray-900" style={{ height: '320px' }}>
              <Cropper
                image={rawImageSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_, pixels) => setCroppedAreaPixels(pixels)}
                style={{
                  containerStyle: { borderRadius: '0' },
                  cropAreaStyle: {
                    border: '3px solid #1B6B6B',
                    boxShadow: '0 0 0 9999px rgba(0,0,0,0.6)',
                  },
                }}
              />
            </div>

            <div className="px-5 py-3 bg-gray-50 border-t border-gray-100">
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400 w-4">🔍</span>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.05}
                  value={zoom}
                  onChange={(ev) => setZoom(Number(ev.target.value))}
                  aria-label="Zoom"
                  className="flex-1 accent-[#1B6B6B]"
                />
                <span className="text-xs text-gray-400 w-4">🔎</span>
              </div>
            </div>

            <div className="flex gap-3 p-4 border-t border-gray-100">
              <button
                type="button"
                onClick={() => {
                  setCropModalOpen(false);
                  setRawImageSrc(null);
                }}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={uploadingPhoto}
                onClick={async () => {
                  if (!croppedAreaPixels) {
                    showError('Please adjust the crop area');
                    return;
                  }
                  try {
                    setUploadingPhoto(true);
                    setCropModalOpen(false);

                    const blob = await getCroppedBlob(rawImageSrc, croppedAreaPixels);

                    const photoRef = storageRef(storage, `companies/${companyId}/employees/${empId}/profile.jpg`);

                    const snapshot = await uploadBytes(photoRef, blob, {
                      contentType: 'image/jpeg',
                      customMetadata: {
                        empId: String(empId),
                        companyId: String(companyId),
                        uploadedAt: new Date().toISOString(),
                      },
                    });

                    const { getDownloadURL } = await import('firebase/storage');
                    const url = await getDownloadURL(snapshot.ref);

                    await updateDoc(doc(db, 'companies', companyId, 'employees', empId), { photoURL: url });

                    setRawImageSrc(null);
                    trackPhotoUploaded();
                    success('✓ Photo updated!');
                    await fetchEmployee();
                  } catch (err) {
                    showError(`Upload failed: ${err?.message || 'Unknown error'}`);
                  } finally {
                    setUploadingPhoto(false);
                  }
                }}
                className="flex-1 py-2.5 bg-[#1B6B6B] text-white rounded-xl text-sm font-medium hover:bg-[#155858] disabled:opacity-50"
              >
                {uploadingPhoto ? 'Uploading...' : '✓ Save Photo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showExitTasksModal && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4 overflow-y-auto" aria-hidden="true">
          <div role="dialog" aria-modal="true" aria-labelledby="exit-tasks-modal-title" className="bg-white rounded-t-3xl sm:rounded-2xl shadow-xl w-full sm:max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h2 id="exit-tasks-modal-title" className="text-lg font-semibold text-gray-900 mb-4">Start Exit Tasks</h2>
            <p className="text-sm text-gray-500 mb-4">
              Confirm last working day and exit reason. Exit Tasks will be generated, including asset returns.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Last Working Day</label>
                <input
                  type="date"
                  value={offboardingExitDate}
                  onChange={(e) => setOffboardingExitDate(e.target.value)}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Exit Reason</label>
                <select
                  value={offboardingExitReason}
                  onChange={(e) => setOffboardingExitReason(e.target.value)}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm"
                >
                  <option value="">Select reason</option>
                  <option value="Resignation">Resignation</option>
                  <option value="Termination">Termination</option>
                  <option value="Retirement">Retirement</option>
                  <option value="Contract End">Contract End</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button
                type="button"
                onClick={() => setShowExitTasksModal(false)}
                className="flex-1 py-2.5 border rounded-xl text-sm text-gray-600"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleStartExitTasks}
                disabled={saving}
                className="flex-1 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-medium hover:bg-orange-600 disabled:opacity-50"
              >
                {saving ? 'Starting…' : 'Start Exit Tasks'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showRemovePhotoConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-[70] sm:p-4" aria-hidden="true">
          <div role="dialog" aria-modal="true" aria-labelledby="remove-photo-modal-title" className="bg-white rounded-t-3xl sm:rounded-2xl p-5 w-full sm:max-w-xs text-center shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="text-3xl mb-3">🗑️</div>
            <h3 id="remove-photo-modal-title" className="text-sm font-semibold text-gray-800 mb-1">Remove Photo?</h3>
            <p className="text-xs text-gray-400 mb-4">
              The employee&apos;s photo will be removed and replaced with initials.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowRemovePhotoConfirm(false)}
                className="flex-1 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  setShowRemovePhotoConfirm(false);
                  try {
                    setUploadingPhoto(true);
                    await deleteEmployeePhoto(companyId, empId);
                    await updateDoc(doc(db, 'companies', companyId, 'employees', empId), {
                      photoURL: deleteField(),
                    });
                    success('Photo removed');
                    await fetchEmployee();
                  } catch {
                    showError('Failed to remove photo');
                  } finally {
                    setUploadingPhoto(false);
                  }
                }}
                className="flex-1 py-2 bg-red-500 text-white rounded-xl text-sm font-medium hover:bg-red-600"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
