const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineString } = require('firebase-functions/params');
const admin = require('firebase-admin');
const { google } = require('googleapis');

admin.initializeApp();

const clientEmail = defineString('DRIVE_CLIENT_EMAIL');
const privateKey = defineString('DRIVE_PRIVATE_KEY');
const rootFolderId = defineString('DRIVE_ROOT_FOLDER_ID');

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

    const {
      fileBase64,
      fileName,
      mimeType,
      companyName,
      empId,
      empName,
      category,
    } = request.data || {};

    if (!fileBase64 || !fileName) {
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
      // Log full error for debugging (Firebase Console → Functions → Logs)
      console.error('uploadFileToDrive error:', rawMessage, error);
      // Use failed-precondition so the client receives the message (internal is often hidden by SDK)
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
  if (!request.data.fileId) {
    throw new HttpsError('invalid-argument', 'fileId required');
  }
  try {
    const drive = getDriveClient();
    await drive.files.delete({
      fileId: request.data.fileId,
    });
    return { success: true };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    const rawMessage = error?.message || error?.response?.data?.error?.message || String(error).slice(0, 300) || 'Unknown error';
    console.error('deleteFileFromDrive error:', rawMessage, error);
    throw new HttpsError('failed-precondition', 'Could not delete file. Check Firebase logs for details.');
  }
});
