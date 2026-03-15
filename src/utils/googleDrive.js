const authHeader = (token) => ({
  Authorization: `Bearer ${token}`,
});

/**
 * Find or create a folder. parentId = null means user's Drive root.
 */
export async function getOrCreateFolder(token, name, parentId = null) {
  let query = `name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  if (parentId) {
    query += ` and '${parentId}' in parents`;
  } else {
    query += ` and 'root' in parents`;
  }

  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`,
    { headers: authHeader(token) },
  );
  if (searchRes.status === 401 || searchRes.status === 403) throw new Error('Google Drive access expired');
  const searchData = await searchRes.json();
  if (searchData.error) throw new Error(searchData.error.message || 'Drive API error');
  if (searchData.files?.length > 0) return searchData.files[0].id;

  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      ...authHeader(token),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : [],
    }),
  });
  if (createRes.status === 401 || createRes.status === 403) throw new Error('Google Drive access expired');
  const folder = await createRes.json();
  if (folder.error) throw new Error(folder.error.message || 'Drive API error');
  return folder.id;
}

/**
 * Make file viewable by anyone with link. Returns webViewLink.
 */
export async function makeViewable(token, fileId) {
  const permRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`,
    {
      method: 'POST',
      headers: {
        ...authHeader(token),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    },
  );
  if (permRes.status === 401 || permRes.status === 403) throw new Error('Google Drive access expired');
  if (!permRes.ok) {
    const err = await permRes.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Failed to set permission');
  }
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=webViewLink`,
    { headers: authHeader(token) },
  );
  if (res.status === 401 || res.status === 403) throw new Error('Google Drive access expired');
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'Drive API error');
  return data.webViewLink || `https://drive.google.com/file/d/${fileId}/view`;
}

/**
 * Upload file using multipart. Returns { id, name, webViewLink }.
 */
export async function uploadFileToDrive(token, file, fileName, folderId) {
  const metadata = { name: fileName, parents: [folderId] };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', file);

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
    {
      method: 'POST',
      headers: authHeader(token),
      body: form,
    },
  );
  if (res.status === 401 || res.status === 403) throw new Error('Google Drive access expired');
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'Upload failed');
  return data;
}

/**
 * Delete file from Drive.
 */
export async function deleteFileFromDrive(token, fileId) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: authHeader(token),
  });
  if (res.status === 401 || res.status === 403) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Access expired');
  }
  if (!res.ok) throw new Error('Delete failed');
}

/**
 * Build folder structure, upload file, make viewable. Returns { fileId, fileName, webViewLink, fileSize }.
 */
export async function uploadEmployeeDocument(token, file, companyName, empId, empName, category) {
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('File too large. Maximum size is 10MB.');
  }

  const rootId = await getOrCreateFolder(token, 'AttendX HR Documents');
  const companyFolderId = await getOrCreateFolder(token, companyName, rootId);
  const empFolderName = `${empId || 'Emp'} - ${empName || 'Employee'}`.replace(/[/\\?%*:|"<>]/g, '-');
  const empFolderId = await getOrCreateFolder(token, empFolderName, companyFolderId);
  const categoryId = await getOrCreateFolder(token, category, empFolderId);

  const uploaded = await uploadFileToDrive(token, file, file.name, categoryId);
  const webViewLink = await makeViewable(token, uploaded.id);

  return {
    fileId: uploaded.id,
    fileName: file.name,
    webViewLink: webViewLink || `https://drive.google.com/file/d/${uploaded.id}/view`,
    fileSize: file.size,
  };
}
