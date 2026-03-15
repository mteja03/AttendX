export async function uploadEmployeeDocument(accessToken, file, companyName, empId, empName, category) {
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('File too large. Maximum size is 10MB.');
  }

  const headers = {
    Authorization: `Bearer ${accessToken}`,
  };

  async function getOrCreateFolder(name, parentId = null) {
    let q = `name='${name}' and trashed=false and mimeType='application/vnd.google-apps.folder'`;
    if (parentId) {
      q += ` and '${parentId}' in parents`;
    }

    const searchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`,
      { headers },
    );
    const searchData = await searchRes.json();

    if (searchData.error) {
      throw new Error(searchData.error.message || 'Drive access error');
    }

    if (searchData.files?.length > 0) {
      return searchData.files[0].id;
    }

    const body = {
      name,
      mimeType: 'application/vnd.google-apps.folder',
    };
    if (parentId) body.parents = [parentId];

    const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const folder = await createRes.json();
    if (folder.error) {
      throw new Error(folder.error.message || 'Failed to create folder');
    }
    return folder.id;
  }

  const rootId = await getOrCreateFolder('AttendX HR Documents');
  const companyFolderId = await getOrCreateFolder(companyName, rootId);
  const empFolderId = await getOrCreateFolder(`${empId} - ${empName}`, companyFolderId);
  const categoryFolderId = await getOrCreateFolder(category, empFolderId);

  const metadata = {
    name: file.name,
    parents: [categoryFolderId],
  };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', file);

  const uploadRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
    {
      method: 'POST',
      headers,
      body: form,
    },
  );
  const uploaded = await uploadRes.json();
  if (uploaded.error) {
    throw new Error(uploaded.error.message || 'Upload failed');
  }

  await fetch(
    `https://www.googleapis.com/drive/v3/files/${uploaded.id}/permissions`,
    {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        role: 'reader',
        type: 'anyone',
      }),
    },
  );

  const fileRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${uploaded.id}?fields=id,name,webViewLink`,
    { headers },
  );
  const fileData = await fileRes.json();

  return {
    fileId: fileData.id,
    fileName: fileData.name,
    webViewLink: fileData.webViewLink,
    fileSize: file.size,
  };
}

export async function deleteFileFromDrive(accessToken, fileId) {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );
  if (!res.ok && res.status !== 204) {
    throw new Error('Failed to delete file');
  }
}
