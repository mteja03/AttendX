import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../firebase/config';

const functions = getFunctions(app);

export async function uploadEmployeeDocument(file, companyName, empId, empName, category) {
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('File too large. Maximum size is 10MB.');
  }

  const base64 = await new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = () => res(reader.result.split(',')[1]);
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });

  const uploadFn = httpsCallable(functions, 'uploadFileToDrive');
  const result = await uploadFn({
    fileBase64: base64,
    fileName: file.name,
    mimeType: file.type,
    companyName,
    empId,
    empName,
    category,
  });

  return {
    fileId: result.data.fileId,
    fileName: result.data.fileName,
    webViewLink: result.data.webViewLink,
    fileSize: file.size,
  };
}

export async function deleteFileFromDrive(fileId) {
  const deleteFn = httpsCallable(functions, 'deleteFileFromDrive');
  await deleteFn({ fileId });
}
