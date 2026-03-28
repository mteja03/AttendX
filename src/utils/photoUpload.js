import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { app } from '../firebase/config';

const storage = getStorage(app);

export const compressImage = (file) => {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 400;
      let w = img.width;
      let h = img.height;

      if (w > h) {
        if (w > MAX) {
          h = Math.round((h * MAX) / w);
          w = MAX;
        }
      } else if (h > MAX) {
        w = Math.round((w * MAX) / h);
        h = MAX;
      }

      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(img, 0, 0, w, h);

      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Compression failed'))),
        'image/jpeg',
        0.85,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    img.src = url;
  });
};

export const uploadEmployeePhoto = async (companyId, empId, file) => {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please select an image file (JPG, PNG)');
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('Image must be under 5MB');
  }

  const compressed = await compressImage(file);

  const photoRef = ref(storage, `companies/${companyId}/employees/${empId}/profile.jpg`);

  const snapshot = await uploadBytes(photoRef, compressed, {
    contentType: 'image/jpeg',
    customMetadata: {
      empId,
      companyId,
      uploadedAt: new Date().toISOString(),
    },
  });

  return getDownloadURL(snapshot.ref);
};

export const deleteEmployeePhoto = async (companyId, empId) => {
  try {
    const photoRef = ref(storage, `companies/${companyId}/employees/${empId}/profile.jpg`);
    await deleteObject(photoRef);
  } catch (error) {
    if (error?.code !== 'storage/object-not-found') {
      throw error;
    }
  }
};
