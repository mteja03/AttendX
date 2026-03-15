const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { google } = require('googleapis');

admin.initializeApp();

function getDriveClient() {
  const config = functions.config().drive;
  if (!config || !config.client_email || !config.private_key) {
    throw new Error('Firebase config drive.client_email and drive.private_key must be set');
  }
  const auth = new google.auth.JWT({
    email: config.client_email,
    key: config.private_key.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  return google.drive({ version: 'v3', auth });
}

async function getOrCreateFolder(drive, name, parentId) {
  const rootFolderId = functions.config().drive.root_folder_id;
  const effectiveParentId = parentId || rootFolderId;
  const escapedName = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const q = `name='${escapedName}' and trashed=false and '${effectiveParentId}' in parents and mimeType='application/vnd.google-apps.folder'`;

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
      parents: [effectiveParentId],
    },
    fields: 'id',
  });
  return folder.data.id;
}

exports.uploadFileToDrive = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }

  const {
    fileBase64,
    fileName,
    mimeType,
    companyName,
    empId,
    empName,
    category,
  } = data;

  if (!fileBase64 || !fileName) {
    throw new functions.https.HttpsError('invalid-argument', 'fileBase64 and fileName required');
  }

  const drive = getDriveClient();
  const rootFolderId = functions.config().drive.root_folder_id;

  const companyFolderId = await getOrCreateFolder(drive, companyName, rootFolderId);
  const empFolderName = `${empId || 'Emp'} - ${empName || 'Employee'}`.replace(/[/\\?%*:|"<>]/g, '-');
  const empFolderId = await getOrCreateFolder(drive, empFolderName, companyFolderId);
  const categoryFolderId = await getOrCreateFolder(drive, category, empFolderId);

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
});

exports.deleteFileFromDrive = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }
  if (!data.fileId) {
    throw new functions.https.HttpsError('invalid-argument', 'fileId required');
  }
  try {
    const drive = getDriveClient();
    await drive.files.delete({
      fileId: data.fileId,
    });
    return { success: true };
  } catch (error) {
    throw new functions.https.HttpsError('internal', error.message);
  }
});
