import { collection, getDocs, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';

export async function updateCompanyCounts(companyId) {
  if (!companyId) return;
  try {
    const snap = await getDocs(collection(db, 'companies', companyId, 'employees'));
    const employees = snap.docs.map((d) => d.data());
    const counts = {
      employeeCount: employees.length,
      activeEmployeeCount: employees.filter((e) => e.status === 'Active').length,
      inactiveEmployeeCount: employees.filter((e) => e.status === 'Inactive').length,
      noticePeriodCount: employees.filter((e) => e.status === 'Notice Period').length,
      offboardingCount: employees.filter((e) => e.status === 'Offboarding').length,
      lastActivityAt: serverTimestamp(),
    };
    await updateDoc(doc(db, 'companies', companyId), counts);
    return counts;
  } catch (e) {
    if (import.meta.env.DEV) console.error('Failed to update counts:', e);
  }
}
