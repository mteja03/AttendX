const functions = require('firebase-functions/v1');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineString } = require('firebase-functions/params');
const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');
const { google } = require('googleapis');

admin.initializeApp();

const db = admin.firestore();
const messaging = admin.messaging();

/** Callable `data` must be a non-null plain object. */
function assertCallableObjectData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new HttpsError('invalid-argument', 'Invalid input');
  }
}

/** Per-UID rate limit for sensitive Drive HTTPS callables (Firestore-backed). */
async function enforceDriveCallableRateLimit(uid) {
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Must be logged in');
  }
  const windowMs = 60 * 1000;
  const maxCalls = 30;
  const userRef = db.collection('rateLimits').doc(uid);
  const now = Date.now();
  const snap = await userRef.get();

  if (snap.exists) {
    const d = snap.data() || {};
    const calls = typeof d.calls === 'number' ? d.calls : 0;
    const windowStart = typeof d.windowStart === 'number' ? d.windowStart : 0;
    if (now - windowStart < windowMs) {
      if (calls >= maxCalls) {
        throw new HttpsError('resource-exhausted', 'Too many requests');
      }
      await userRef.update({ calls: FieldValue.increment(1) });
    } else {
      await userRef.set({ calls: 1, windowStart: now });
    }
  } else {
    await userRef.set({ calls: 1, windowStart: now });
  }
}

const clientEmail = defineString('DRIVE_CLIENT_EMAIL');
const privateKey = defineString('DRIVE_PRIVATE_KEY');
const rootFolderId = defineString('DRIVE_ROOT_FOLDER_ID');

const FCM_MAX_TOKENS_PER_MULTICAST = 500;

function stringifyData(data) {
  const out = {};
  Object.entries(data || {}).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    out[k] = typeof v === 'string' ? v : String(v);
  });
  return out;
}

/** FCM to a single user (`fcmTokens` doc id = lowercased email). */
async function sendToUser(userEmail, notification, data = {}) {
  try {
    if (!userEmail) return;
    const email = String(userEmail).toLowerCase().trim();
    const tokenDoc = await db.collection('fcmTokens').doc(email).get();
    if (!tokenDoc.exists || !tokenDoc.data()?.token) return;
    const token = tokenDoc.data().token;
    const dataPayload = stringifyData({
      ...data,
      timestamp: new Date().toISOString(),
    });
    await messaging.send({
      notification: {
        title: notification.title,
        body: notification.body,
      },
      data: dataPayload,
      token,
    });
  } catch (error) {
    console.error('sendToUser error:', error);
  }
}

function toJsDate(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  if (value instanceof Date) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDayForMessage(value) {
  if (!value) return 'TBD';
  const d = toJsDate(value);
  if (!d) return 'TBD';
  return d.toISOString().slice(0, 10);
}

/**
 * Send FCM to all HR managers and admins relevant to a company.
 * Users: `users` doc id should match `fcmTokens` doc id (lowercased email).
 */
async function sendToCompanyHR(companyId, notification, data = {}) {
  try {
    const [usersSnap, adminSnap] = await Promise.all([
      db.collection('users').where('companyId', '==', companyId).get(),
      db.collection('users').where('role', '==', 'admin').get(),
    ]);

    const emails = new Set();

    usersSnap.docs.forEach((docSnap) => {
      const user = docSnap.data();
      if (user.isActive === false) return;
      if (user.role === 'hrmanager' || user.role === 'admin') {
        emails.add(String(docSnap.id).toLowerCase());
      }
    });

    adminSnap.docs.forEach((docSnap) => {
      const user = docSnap.data();
      if (user.isActive === false) return;
      emails.add(String(docSnap.id).toLowerCase());
    });

    if (emails.size === 0) return;

    const tokens = [];
    for (const email of emails) {
      const tokenDoc = await db.collection('fcmTokens').doc(email).get();
      if (tokenDoc.exists && tokenDoc.data()?.token) {
        tokens.push(tokenDoc.data().token);
      }
    }

    if (tokens.length === 0) return;

    const dataPayload = stringifyData({
      ...data,
      companyId,
      timestamp: new Date().toISOString(),
    });

    for (let i = 0; i < tokens.length; i += FCM_MAX_TOKENS_PER_MULTICAST) {
      const batch = tokens.slice(i, i + FCM_MAX_TOKENS_PER_MULTICAST);
      const message = {
        notification: {
          title: notification.title,
          body: notification.body,
        },
        data: dataPayload,
        tokens: batch,
      };

      const response = await messaging.sendEachForMulticast(message);

      await Promise.all(
        response.responses.map(async (resp, idx) => {
          if (resp.success) return;
          const code = resp.error?.code;
          if (
            code !== 'messaging/invalid-registration-token' &&
            code !== 'messaging/registration-token-not-registered'
          ) {
            return;
          }
          const invalidToken = batch[idx];
          const snap = await db.collection('fcmTokens').where('token', '==', invalidToken).get();
          await Promise.all(snap.docs.map((d) => d.ref.delete()));
        }),
      );

      console.log(
        `Sent ${response.successCount}/${batch.length} notifications (batch) for company ${companyId}`,
      );
    }
  } catch (error) {
    console.error('sendToCompanyHR error:', error);
  }
}

function getDriveConfig() {
  let email;
  let key;
  let root;
  try {
    email = clientEmail.value() || process.env.DRIVE_CLIENT_EMAIL;
    key = privateKey.value() || process.env.DRIVE_PRIVATE_KEY;
    root = rootFolderId.value() || process.env.DRIVE_ROOT_FOLDER_ID;
  } catch (e) {
    email = process.env.DRIVE_CLIENT_EMAIL;
    key = process.env.DRIVE_PRIVATE_KEY;
    root = process.env.DRIVE_ROOT_FOLDER_ID;
  }
  if (!email || !key || !root) {
    throw new HttpsError(
      'failed-precondition',
      'Drive is not configured. Set DRIVE_CLIENT_EMAIL, DRIVE_PRIVATE_KEY, and DRIVE_ROOT_FOLDER_ID (e.g. in functions/.env for emulator or Cloud Function env vars when deployed).',
    );
  }
  return { email, key, root };
}

function getDriveClient() {
  const { email, key } = getDriveConfig();
  const auth = new google.auth.JWT({
    email,
    key: key.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  return google.drive({ version: 'v3', auth });
}

function getRootFolderId() {
  return getDriveConfig().root;
}

async function getOrCreateFolder(drive, name, parentId) {
  const escapedName = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const q = `name='${escapedName}' and trashed=false and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents`;

  const list = await drive.files.list({
    q,
    fields: 'files(id, name)',
    spaces: 'drive',
  });

  if (list.data.files && list.data.files.length > 0) {
    return list.data.files[0].id;
  }

  const folder = await drive.files.create({
    resource: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
  });
  return folder.data.id;
}

exports.uploadFileToDrive = onCall(
  {
    timeoutSeconds: 120,
    memory: '256MiB',
    invoker: 'public',
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be logged in');
    }
    assertCallableObjectData(request.data);
    await enforceDriveCallableRateLimit(request.auth.uid);

    const {
      fileBase64,
      fileName,
      mimeType,
      companyName,
      empId,
      empName,
      category,
    } = request.data;

    if (typeof fileBase64 !== 'string' || !fileBase64) {
      throw new HttpsError('invalid-argument', 'fileBase64 and fileName required');
    }
    if (typeof fileName !== 'string' || !fileName.trim()) {
      throw new HttpsError('invalid-argument', 'fileBase64 and fileName required');
    }

    try {
      const drive = getDriveClient();
      const root = getRootFolderId();

      const companyFolderId = await getOrCreateFolder(drive, companyName || 'Company', root);
      const empFolderName = `${empId || 'Emp'} - ${empName || 'Employee'}`.replace(/[/\\?%*:|"<>]/g, '-');
      const empFolderId = await getOrCreateFolder(drive, empFolderName, companyFolderId);
      const categoryFolderId = await getOrCreateFolder(drive, category || 'Other', empFolderId);

      const buffer = Buffer.from(fileBase64, 'base64');
      const { Readable } = require('stream');
      const stream = Readable.from(buffer);

      const uploaded = await drive.files.create({
        resource: {
          name: fileName,
          parents: [categoryFolderId],
        },
        media: {
          mimeType: mimeType || 'application/octet-stream',
          body: stream,
        },
        fields: 'id, webViewLink',
      });

      await drive.permissions.create({
        fileId: uploaded.data.id,
        resource: {
          role: 'reader',
          type: 'anyone',
        },
      });

      const fileData = await drive.files.get({
        fileId: uploaded.data.id,
        fields: 'id, webViewLink, name',
      });

      return {
        fileId: fileData.data.id,
        webViewLink: fileData.data.webViewLink || `https://drive.google.com/file/d/${fileData.data.id}/view`,
        fileName: fileData.data.name || fileName,
      };
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      const rawMessage =
        error?.message ||
        error?.response?.data?.error?.message ||
        (error?.errors && error.errors[0]?.message) ||
        (error?.response?.data?.error?.errors?.[0]?.message) ||
        String(error).slice(0, 300) ||
        'Unknown error';
      console.error('uploadFileToDrive error:', rawMessage, error);
      const userMessage =
        /403|forbidden|permission/i.test(rawMessage)
          ? 'Drive access denied. Share the root folder with the service account in Google Drive.'
          : /404|not found/i.test(rawMessage)
            ? 'Drive folder not found. Check DRIVE_ROOT_FOLDER_ID is correct and shared with the service account.'
            : /invalid|credential|key|jwt/i.test(rawMessage)
              ? 'Drive credentials invalid. Check DRIVE_CLIENT_EMAIL and DRIVE_PRIVATE_KEY.'
              : 'Document upload failed. Check Firebase Console → Functions → Logs for details.';
      throw new HttpsError('failed-precondition', userMessage);
    }
  },
);

exports.deleteFileFromDrive = onCall(
  {
    timeoutSeconds: 60,
    invoker: 'public',
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be logged in');
    }
    assertCallableObjectData(request.data);
    await enforceDriveCallableRateLimit(request.auth.uid);

    const { fileId } = request.data;
    if (typeof fileId !== 'string' || !fileId.trim()) {
      throw new HttpsError('invalid-argument', 'fileId required');
    }
    try {
      const drive = getDriveClient();
      await drive.files.delete({
        fileId: fileId.trim(),
      });
      return { success: true };
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      const rawMessage = error?.message || error?.response?.data?.error?.message || String(error).slice(0, 300) || 'Unknown error';
      console.error('deleteFileFromDrive error:', rawMessage, error);
      throw new HttpsError('failed-precondition', 'Could not delete file. Check Firebase logs for details.');
    }
  },
);

// ─── FCM: Firestore triggers (collection name is `leave`, not `leaves`) ───

exports.onNewLeaveRequest = functions.firestore
  .document('companies/{companyId}/leave/{leaveId}')
  .onCreate(async (snap, context) => {
    const leave = snap.data();
    const { companyId } = context.params;

    if (!leave || !leave.employeeName) return;

    await sendToCompanyHR(
      companyId,
      {
        title: '🏖️ New Leave Request',
        body: `${leave.employeeName} has applied for ${leave.days || 1} day${leave.days !== 1 ? 's' : ''} of ${leave.leaveType || 'leave'}`,
      },
      {
        type: 'leave',
        url: `/company/${companyId}/leave`,
        leaveId: context.params.leaveId,
      },
    );
  });

exports.onLeaveStatusChanged = functions.firestore
  .document('companies/{companyId}/leave/{leaveId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    const { companyId } = context.params;

    if (before.status === after.status) return;
    if (after.status !== 'Approved' && after.status !== 'Rejected') return;

    await sendToCompanyHR(
      companyId,
      {
        title: after.status === 'Approved' ? '✅ Leave Approved' : '❌ Leave Rejected',
        body: `${after.employeeName}'s ${after.leaveType || 'leave'} request has been ${after.status.toLowerCase()}`,
      },
      {
        type: 'leave',
        url: `/company/${companyId}/leave`,
        leaveId: context.params.leaveId,
      },
    );
  });

exports.onNewEmployee = functions.firestore
  .document('companies/{companyId}/employees/{empId}')
  .onCreate(async (snap, context) => {
    const emp = snap.data();
    const { companyId } = context.params;

    if (!emp || !emp.fullName) return;

    await sendToCompanyHR(
      companyId,
      {
        title: '👤 New Employee Added',
        body: `${emp.fullName} has joined ${emp.department ? `the ${emp.department} department` : 'the company'}`,
      },
      {
        type: 'employee',
        url: `/company/${companyId}/employees/${context.params.empId}`,
        empId: context.params.empId,
      },
    );
  });

exports.onResignationRecorded = functions.firestore
  .document('companies/{companyId}/employees/{empId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    const { companyId } = context.params;

    if (before.status === after.status) return;
    if (after.status !== 'Notice Period') return;

    const lastDay = formatDayForMessage(after.offboarding?.expectedLastDay);

    await sendToCompanyHR(
      companyId,
      {
        title: '🚪 Resignation Recorded',
        body: `${after.fullName} has resigned. Last day: ${lastDay}`,
      },
      {
        type: 'offboarding',
        url: `/company/${companyId}/employees/${context.params.empId}?tab=offboarding`,
        empId: context.params.empId,
      },
    );
  });

exports.dailyCelebrationReminders = functions.pubsub
  .schedule('0 9 * * *')
  .timeZone('Asia/Kolkata')
  .onRun(async () => {
    const today = new Date();
    const todayMonth = today.getMonth() + 1;
    const todayDate = today.getDate();

    const companiesSnap = await db.collection('companies').get();

    for (const companyDoc of companiesSnap.docs) {
      const companyId = companyDoc.id;

      const empSnap = await db
        .collection('companies')
        .doc(companyId)
        .collection('employees')
        .where('status', 'in', ['Active', 'Notice Period'])
        .get();

      const birthdays = [];
      const workAnniversaries = [];
      const weddingAnniversaries = [];

      empSnap.docs.forEach((doc) => {
        const emp = doc.data();

        if (emp.dateOfBirth) {
          const dob = toJsDate(emp.dateOfBirth);
          if (dob && dob.getMonth() + 1 === todayMonth && dob.getDate() === todayDate) {
            birthdays.push(emp.fullName);
          }
        }

        if (emp.joiningDate && emp.status === 'Active') {
          const jd = toJsDate(emp.joiningDate);
          if (jd) {
            const years = today.getFullYear() - jd.getFullYear();
            if (years >= 1 && jd.getMonth() + 1 === todayMonth && jd.getDate() === todayDate) {
              workAnniversaries.push({ name: emp.fullName, years });
            }
          }
        }

        if (emp.maritalStatus === 'Married' && emp.marriageDate) {
          const md = toJsDate(emp.marriageDate);
          if (md) {
            const years = today.getFullYear() - md.getFullYear();
            if (years >= 1 && md.getMonth() + 1 === todayMonth && md.getDate() === todayDate) {
              weddingAnniversaries.push({ name: emp.fullName, years });
            }
          }
        }
      });

      if (birthdays.length > 0) {
        await sendToCompanyHR(
          companyId,
          {
            title: '🎂 Birthday Today!',
            body:
              birthdays.length === 1
                ? `Today is ${birthdays[0]}'s birthday! Don't forget to wish them.`
                : `${birthdays.join(', ')} have birthdays today!`,
          },
          {
            type: 'birthday',
            url: `/company/${companyId}/dashboard`,
          },
        );
      }

      if (workAnniversaries.length > 0) {
        const msg = workAnniversaries
          .map((e) => `${e.name} (${e.years} year${e.years !== 1 ? 's' : ''})`)
          .join(', ');
        await sendToCompanyHR(
          companyId,
          {
            title: '🏆 Work Anniversary!',
            body: `${msg} — celebrate their milestone!`,
          },
          {
            type: 'anniversary',
            url: `/company/${companyId}/dashboard`,
          },
        );
      }

      if (weddingAnniversaries.length > 0) {
        const msg = weddingAnniversaries
          .map((e) => `${e.name} (${e.years} year${e.years !== 1 ? 's' : ''})`)
          .join(', ');
        await sendToCompanyHR(
          companyId,
          {
            title: '💍 Wedding Anniversary!',
            body: `${msg} — wish them well!`,
          },
          {
            type: 'wedding',
            url: `/company/${companyId}/dashboard`,
          },
        );
      }
    }

    return null;
  });

exports.dailyOnboardingOverdue = functions.pubsub
  .schedule('0 10 * * *')
  .timeZone('Asia/Kolkata')
  .onRun(async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const companiesSnap = await db.collection('companies').get();

    for (const companyDoc of companiesSnap.docs) {
      const companyId = companyDoc.id;

      const empSnap = await db
        .collection('companies')
        .doc(companyId)
        .collection('employees')
        .where('status', '==', 'Active')
        .get();

      const overdueEmployees = [];

      empSnap.docs.forEach((doc) => {
        const emp = doc.data();
        if (!emp.onboarding?.tasks) return;
        if (emp.onboarding.status === 'completed') return;

        const overdueTasks = emp.onboarding.tasks.filter((task) => {
          if (task.completed) return false;
          if (!task.dueDate) return false;
          const due = toJsDate(task.dueDate);
          if (!due) return false;
          due.setHours(0, 0, 0, 0);
          return due < today;
        });

        if (overdueTasks.length > 0) {
          overdueEmployees.push({
            name: emp.fullName,
            count: overdueTasks.length,
            id: doc.id,
          });
        }
      });

      if (overdueEmployees.length === 0) continue;

      const body =
        overdueEmployees.length === 1
          ? `${overdueEmployees[0].name} has ${overdueEmployees[0].count} overdue onboarding task${overdueEmployees[0].count !== 1 ? 's' : ''}`
          : `${overdueEmployees.length} employees have overdue onboarding tasks`;

      await sendToCompanyHR(
        companyId,
        {
          title: '⚠️ Onboarding Overdue',
          body,
        },
        {
          type: 'onboarding',
          url: `/company/${companyId}/employees`,
        },
      );
    }

    return null;
  });

exports.dailyOffboardingOverdue = functions.pubsub
  .schedule('0 10 * * *')
  .timeZone('Asia/Kolkata')
  .onRun(async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const companiesSnap = await db.collection('companies').get();

    for (const companyDoc of companiesSnap.docs) {
      const companyId = companyDoc.id;

      const empSnap = await db
        .collection('companies')
        .doc(companyId)
        .collection('employees')
        .where('status', '==', 'Offboarding')
        .get();

      const overdueEmployees = [];

      empSnap.docs.forEach((doc) => {
        const emp = doc.data();
        if (!emp.offboarding?.tasks) return;

        const overdueTasks = emp.offboarding.tasks.filter((task) => {
          if (task.completed) return false;
          if (!task.dueDate) return false;
          const due = toJsDate(task.dueDate);
          if (!due) return false;
          due.setHours(0, 0, 0, 0);
          return due < today;
        });

        if (overdueTasks.length > 0) {
          overdueEmployees.push({
            name: emp.fullName,
            count: overdueTasks.length,
            id: doc.id,
          });
        }
      });

      if (overdueEmployees.length === 0) continue;

      const body =
        overdueEmployees.length === 1
          ? `${overdueEmployees[0].name} has ${overdueEmployees[0].count} overdue exit task${overdueEmployees[0].count !== 1 ? 's' : ''}`
          : `${overdueEmployees.length} employees have overdue exit tasks`;

      await sendToCompanyHR(
        companyId,
        {
          title: '⚠️ Exit Tasks Overdue',
          body,
        },
        {
          type: 'offboarding',
          url: `/company/${companyId}/employees`,
        },
      );
    }

    return null;
  });

// Auto-delete error logs older than 30d
exports.cleanupErrorLogs = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async () => {
    const now = admin.firestore.Timestamp.now();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const cutoff = admin.firestore.Timestamp.fromDate(thirtyDaysAgo);

    const [byTtl, byTimestamp] = await Promise.all([
      db.collection('errorLogs').where('ttl', '<=', now).limit(500).get(),
      db.collection('errorLogs').where('timestamp', '<=', cutoff).where('ttl', '==', null).limit(500).get(),
    ]);

    const batch = db.batch();
    const seen = new Set();
    let count = 0;

    byTtl.docs.forEach((docSnap) => {
      if (seen.has(docSnap.id)) return;
      seen.add(docSnap.id);
      batch.delete(docSnap.ref);
      count += 1;
    });

    byTimestamp.docs.forEach((docSnap) => {
      if (seen.has(docSnap.id)) return;
      seen.add(docSnap.id);
      batch.delete(docSnap.ref);
      count += 1;
    });

    if (count === 0) {
      console.log('No expired logs');
      return null;
    }

    await batch.commit();
    console.log(`Deleted ${count} expired logs`);
    return null;
  });

// ─── Audit FCM notifications ───

exports.onAuditAssigned = functions.firestore
  .document('companies/{companyId}/audits/{auditId}')
  .onCreate(async (snap, context) => {
    const audit = snap.data();
    const { companyId, auditId } = context.params;
    if (!audit) return;

    if (audit.auditorEmail) {
      await sendToUser(
        audit.auditorEmail,
        {
          title: '📋 Audit Assigned to You',
          body: `${audit.auditRefId || 'Audit'}: ${audit.auditTypeName || 'Audit'}${
            audit.branch ? ` — ${audit.branch}` : ''
          }. Due: ${audit.endDate || 'No date set'}`,
        },
        {
          type: 'audit_assigned',
          auditId,
          companyId,
          url: `/company/${companyId}/audit`,
        },
      );
    }

    if (audit.teamMembers?.length > 0) {
      for (const member of audit.teamMembers) {
        if (member.email) {
          await sendToUser(
            member.email,
            {
              title: '👥 Added to Audit Team',
              body: `${audit.auditRefId || 'Audit'}: ${audit.auditTypeName || 'Audit'}${
                audit.branch ? ` — ${audit.branch}` : ''
              }. Lead: ${audit.auditorName || '—'}`,
            },
            {
              type: 'audit_team_added',
              auditId,
              companyId,
              url: `/company/${companyId}/audit`,
            },
          );
        }
      }
    }

    await sendToCompanyHR(
      companyId,
      {
        title: '🔍 New Audit Assigned',
        body: `${audit.auditRefId || 'Audit'}: ${audit.auditTypeName || 'Audit'}${
          audit.branch ? ` — ${audit.branch}` : ''
        } assigned to ${audit.auditorName || 'auditor'}`,
      },
      {
        type: 'audit_assigned',
        auditId,
        companyId,
        url: `/company/${companyId}/audit`,
      },
    );
  });

exports.onAuditStatusChanged = functions.firestore
  .document('companies/{companyId}/audits/{auditId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    const { companyId, auditId } = context.params;
    if (!before || !after) return;
    if (before.status === after.status) return;

    const refId = after.auditRefId || 'Audit';
    const typeName = after.auditTypeName || 'Audit';
    const branch = after.branch || '';

    if (after.status === 'Submitted') {
      await sendToCompanyHR(
        companyId,
        {
          title: '📤 Audit Submitted for Review',
          body: `${refId}: ${typeName}${branch ? ` — ${branch}` : ''} submitted by ${after.auditorName || 'auditor'}`,
        },
        {
          type: 'audit_submitted',
          auditId,
          companyId,
          url: `/company/${companyId}/audit`,
        },
      );
    }

    if (before.status === 'Submitted' && after.status === 'In Progress') {
      await sendToUser(
        after.auditorEmail,
        {
          title: '↩ Audit Sent Back',
          body: `${refId}: ${typeName}${branch ? ` — ${branch}` : ''} has been sent back for corrections`,
        },
        {
          type: 'audit_sent_back',
          auditId,
          companyId,
          url: `/company/${companyId}/audit`,
        },
      );
      if (after.teamMembers?.length > 0) {
        for (const member of after.teamMembers) {
          if (member.email) {
            await sendToUser(
              member.email,
              {
                title: '↩ Audit Sent Back',
                body: `${refId}: ${typeName} sent back for corrections`,
              },
              {
                type: 'audit_sent_back',
                auditId,
                companyId,
                url: `/company/${companyId}/audit`,
              },
            );
          }
        }
      }
    }

    if (after.status === 'Closed') {
      await sendToUser(
        after.auditorEmail,
        {
          title: '✅ Audit Closed',
          body: `${refId}: ${typeName}${branch ? ` — ${branch}` : ''} has been reviewed and closed`,
        },
        {
          type: 'audit_closed',
          auditId,
          companyId,
          url: `/company/${companyId}/audit`,
        },
      );
      if (after.teamMembers?.length > 0) {
        for (const member of after.teamMembers) {
          if (member.email) {
            await sendToUser(
              member.email,
              {
                title: '✅ Audit Closed',
                body: `${refId}: ${typeName} closed`,
              },
              {
                type: 'audit_closed',
                auditId,
                companyId,
                url: `/company/${companyId}/audit`,
              },
            );
          }
        }
      }
    }
  });

exports.dailyOverdueAuditAlert = functions.pubsub
  .schedule('30 9 * * *')
  .timeZone('Asia/Kolkata')
  .onRun(async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const companiesSnap = await db.collection('companies').get();

    for (const companyDoc of companiesSnap.docs) {
      const companyId = companyDoc.id;

      const auditsSnap = await db
        .collection('companies')
        .doc(companyId)
        .collection('audits')
        .where('status', 'in', ['Assigned', 'In Progress', 'Submitted', 'Under Review'])
        .get();

      const overdueAudits = auditsSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((a) => {
          const end = a.endDate || a.dueDate;
          if (!end) return false;
          const d = toJsDate(end) || new Date(end);
          if (!d || Number.isNaN(d.getTime())) return false;
          d.setHours(0, 0, 0, 0);
          return d < today;
        });

      if (overdueAudits.length === 0) continue;

      const body =
        overdueAudits.length === 1
          ? `${overdueAudits[0].auditRefId || 'Audit'}: ${overdueAudits[0].auditTypeName || 'Audit'}${
              overdueAudits[0].branch ? ` — ${overdueAudits[0].branch}` : ''
            } is overdue`
          : `${overdueAudits.length} audits are overdue and need attention`;

      await sendToCompanyHR(
        companyId,
        {
          title: '⚠️ Overdue Audits',
          body,
        },
        {
          type: 'audit_overdue',
          companyId,
          count: String(overdueAudits.length),
          url: `/company/${companyId}/audit`,
        },
      );

      const auditorOverdueMap = {};
      overdueAudits.forEach((a) => {
        if (a.auditorEmail) {
          if (!auditorOverdueMap[a.auditorEmail]) auditorOverdueMap[a.auditorEmail] = [];
          auditorOverdueMap[a.auditorEmail].push(a);
        }
      });

      for (const [email, myAudits] of Object.entries(auditorOverdueMap)) {
        const auditorBody =
          myAudits.length === 1
            ? `${myAudits[0].auditRefId || 'Your audit'}: ${myAudits[0].auditTypeName || 'Audit'} is overdue. Please complete and submit.`
            : `You have ${myAudits.length} overdue audits. Please complete and submit.`;

        await sendToUser(
          email,
          {
            title: '⚠️ Your Audit is Overdue',
            body: auditorBody,
          },
          {
            type: 'audit_overdue_auditor',
            companyId,
            url: `/company/${companyId}/audit`,
          },
        );
      }
    }

    return null;
  });

exports.dailyAuditActionOverdue = functions.pubsub
  .schedule('0 10 * * *')
  .timeZone('Asia/Kolkata')
  .onRun(async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const companiesSnap = await db.collection('companies').get();

    for (const companyDoc of companiesSnap.docs) {
      const companyId = companyDoc.id;

      const auditsSnap = await db.collection('companies').doc(companyId).collection('audits').get();

      const ownerOverdueMap = {};

      auditsSnap.docs.forEach((d) => {
        const audit = { id: d.id, ...d.data() };
        if (audit.status === 'Closed') return;

        (audit.checklist || []).forEach((item) => {
          if (!item.ownerEmail) return;
          if (item.resolved) return;
          if (!item.targetDate) return;
          const td = toJsDate(item.targetDate) || new Date(item.targetDate);
          if (!td || Number.isNaN(td.getTime())) return;
          td.setHours(0, 0, 0, 0);
          if (td >= today) return;

          if (!ownerOverdueMap[item.ownerEmail]) ownerOverdueMap[item.ownerEmail] = [];
          ownerOverdueMap[item.ownerEmail].push({
            question: item.question,
            auditRefId: audit.auditRefId,
            auditTypeName: audit.auditTypeName,
            branch: audit.branch,
            targetDate: item.targetDate,
          });
        });
      });

      for (const [email, items] of Object.entries(ownerOverdueMap)) {
        const body =
          items.length === 1
            ? `Action item from ${items[0].auditRefId || 'audit'}: "${(items[0].question || '').substring(0, 50)}..." is overdue`
            : `You have ${items.length} overdue audit action items to resolve`;

        await sendToUser(
          email,
          {
            title: '🔴 Action Item Overdue',
            body,
          },
          {
            type: 'audit_action_overdue',
            companyId,
            url: `/company/${companyId}/audit`,
          },
        );
      }

      const totalOverdue = Object.values(ownerOverdueMap).reduce((sum, arr) => sum + arr.length, 0);

      if (totalOverdue > 0) {
        await sendToCompanyHR(
          companyId,
          {
            title: '🔴 Overdue Audit Actions',
            body: `${totalOverdue} audit action item${totalOverdue !== 1 ? 's' : ''} overdue across all audits`,
          },
          {
            type: 'audit_action_overdue',
            companyId,
            url: `/company/${companyId}/audit`,
          },
        );
      }
    }

    return null;
  });

