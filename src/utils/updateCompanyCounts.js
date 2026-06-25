import { collection, doc, getCountFromServer, query, updateDoc, where, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';

export async function updateCompanyCounts(companyId) {
  if (!companyId) return;
  try {
    const employeesRef = collection(db, 'companies', companyId, 'employees');
    const countDocs = async (refOrQuery) => {
      const snap = await getCountFromServer(refOrQuery);
      return snap.data().count || 0;
    };
    const [
      employeeCount,
      activeEmployeeCount,
      inactiveEmployeeCount,
      noticePeriodCount,
      offboardingCount,
    ] = await Promise.all([
      countDocs(employeesRef),
      countDocs(query(employeesRef, where('status', '==', 'Active'))),
      countDocs(query(employeesRef, where('status', '==', 'Inactive'))),
      countDocs(query(employeesRef, where('status', '==', 'Notice Period'))),
      countDocs(query(employeesRef, where('status', '==', 'Offboarding'))),
    ]);
    const counts = {
      employeeCount,
      activeEmployeeCount,
      inactiveEmployeeCount,
      noticePeriodCount,
      offboardingCount,
      lastActivityAt: serverTimestamp(),
    };
    await updateDoc(doc(db, 'companies', companyId), counts);
    return counts;
  } catch (e) {
    if (import.meta.env.DEV) console.error('Failed to update counts:', e);
  }
}
