import { google } from 'googleapis';

const ROOT_FOLDER_NAME = 'AttendX HR Documents';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export { MAX_FILE_SIZE };

/**
 * Get or create a folder. If parentFolderId is null, search in root (no parent).
 */
export async function getOrCreateFolder(accessToken, folderName, parentFolderId) {
  if (!accessToken) throw new Error('Google Drive access token required. Please sign in again.');
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  const drive = google.drive({ version: 'v3', auth });

  const parentQuery = parentFolderId ? `'${parentFolderId}' in parents` : "'root' in parents";
  const escapedName = folderName.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const res = await drive.files.list({
    q: `${parentQuery} and name = '${escapedName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
    spaces: 'drive',
  });
  const existing = res.data.files?.[0];
  if (existing) return existing.id;

  const createRes = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentFolderId ? [parentFolderId] : ['root'],
    },
    fields: 'id',
  });
  return createRes.data.id;
}

/**
 * Upload a file to a Google Drive folder. file is a File (from input). Returns { fileId, fileName, webViewLink }.
 */
export async function uploadFileToDrive(accessToken, file, fileName, folderId) {
  if (!accessToken) throw new Error('Google Drive access token required. Please sign in again.');
  if (file.size > MAX_FILE_SIZE) throw new Error('File size must be under 10MB');

  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  const drive = google.drive({ version: 'v3', auth });

  const mimeType = file.type || 'application/octet-stream';
  const res = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
      mimeType,
    },
    media: {
      mimeType,
      body: file,
    },
    fields: 'id, name, webViewLink',
  });

  const fileId = res.data.id;
  let webViewLink = res.data.webViewLink || null;
  if (!webViewLink) {
    const linkRes = await makeFileViewable(accessToken, fileId);
    webViewLink = linkRes;
  }
  return {
    fileId,
    fileName: res.data.name || fileName,
    webViewLink: webViewLink || `https://drive.google.com/file/d/${fileId}/view`,
  };
}

/**
 * Permanently delete a file from Drive.
 */
export async function deleteFileFromDrive(accessToken, fileId) {
  if (!accessToken) throw new Error('Google Drive access token required. Please sign in again.');
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  const drive = google.drive({ version: 'v3', auth });
  await drive.files.delete({ fileId });
}

/**
 * Set file permission to "anyone with link can view". Returns webViewLink.
 */
export async function makeFileViewable(accessToken, fileId) {
  if (!accessToken) throw new Error('Google Drive access token required. Please sign in again.');
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  const drive = google.drive({ version: 'v3', auth });

  await drive.permissions.create({
    fileId,
    requestBody: {
      type: 'anyone',
      role: 'reader',
    },
  });

  const res = await drive.files.get({
    fileId,
    fields: 'webViewLink',
  });
  return res.data.webViewLink || `https://drive.google.com/file/d/${fileId}/view`;
}

/**
 * Build folder structure and return the final category folder ID.
 * Structure: AttendX HR Documents / {companyName} / {empId - empName} / {categoryName}
 */
export async function getOrCreateEmployeeCategoryFolder(accessToken, companyName, empId, empName, categoryName) {
  const rootId = await getOrCreateFolder(accessToken, ROOT_FOLDER_NAME, null);
  const companyId = await getOrCreateFolder(accessToken, companyName, rootId);
  const empFolderName = `${empId || 'Emp'} - ${empName || 'Employee'}`.replace(/[/\\?%*:|"<>]/g, '-');
  const empFolderId = await getOrCreateFolder(accessToken, empFolderName, companyId);
  const categoryId = await getOrCreateFolder(accessToken, categoryName, empFolderId);
  return categoryId;
}
