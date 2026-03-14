import {
  collection,
  doc,
  setDoc,
  addDoc,
  getDocs,
  updateDoc,
  serverTimestamp,
  increment,
} from 'firebase/firestore';
import { db } from './config';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export async function seedData(createdBy = '') {
  const companiesSnap = await getDocs(collection(db, 'companies'));
  if (companiesSnap.size > 0) return { seeded: false, message: 'Companies already exist.' };

  const today = todayStr();

  const company1 = {
    name: 'TechCorp India',
    initials: 'TC',
    color: '#378ADD',
    industry: 'IT',
    location: 'Mumbai',
    employeeCount: 0,
    isActive: true,
    createdAt: serverTimestamp(),
    createdBy,
  };
  const ref1 = doc(collection(db, 'companies'));
  await setDoc(ref1, company1);
  const company1Id = ref1.id;

  const emp1Data = [
    { fullName: 'Rahul Sharma', department: 'Engineering', designation: 'Sr. Developer', ctcPerAnnum: 1200000, email: 'rahul.sharma@techcorp.in', phone: '9876543210', empId: 'EMP001', status: 'Active', joiningDate: today, employmentType: 'Full-time', createdAt: serverTimestamp() },
    { fullName: 'Priya Krishnan', department: 'HR', designation: 'HR Manager', ctcPerAnnum: 800000, email: 'priya.k@techcorp.in', phone: '9876543211', empId: 'EMP002', status: 'Active', joiningDate: today, employmentType: 'Full-time', createdAt: serverTimestamp() },
    { fullName: 'Arjun Mehta', department: 'Sales', designation: 'Sales Lead', ctcPerAnnum: 950000, email: 'arjun.m@techcorp.in', phone: '9876543212', empId: 'EMP003', status: 'Active', joiningDate: today, employmentType: 'Full-time', createdAt: serverTimestamp() },
  ];
  const emp1Refs = [];
  for (const e of emp1Data) {
    const r = await addDoc(collection(db, 'companies', company1Id, 'employees'), e);
    emp1Refs.push({ id: r.id, ...e });
  }
  await updateDoc(doc(db, 'companies', company1Id), { employeeCount: increment(3) });

  await addDoc(collection(db, 'companies', company1Id, 'leave'), {
    employeeId: emp1Refs[0].id,
    employeeName: 'Rahul Sharma',
    leaveType: 'CL',
    startDate: today,
    endDate: today,
    days: 1,
    reason: 'Personal',
    status: 'Pending',
    appliedAt: serverTimestamp(),
  });
  await addDoc(collection(db, 'companies', company1Id, 'leave'), {
    employeeId: emp1Refs[1].id,
    employeeName: 'Priya Krishnan',
    leaveType: 'SL',
    startDate: today,
    endDate: today,
    days: 1,
    reason: 'Sick',
    status: 'Approved',
    appliedAt: serverTimestamp(),
    decidedAt: serverTimestamp(),
  });
  for (const e of emp1Refs) {
    await setDoc(doc(db, 'companies', company1Id, 'attendance', `${today}_${e.id}`), {
      date: today,
      employeeId: e.id,
      status: 'Present',
      updatedAt: new Date(),
    });
  }

  const company2 = {
    name: 'GreenStar Pvt Ltd',
    initials: 'GS',
    color: '#1D9E75',
    industry: 'Manufacturing',
    location: 'Pune',
    employeeCount: 0,
    isActive: true,
    createdAt: serverTimestamp(),
    createdBy,
  };
  const ref2 = doc(collection(db, 'companies'));
  await setDoc(ref2, company2);
  const company2Id = ref2.id;

  const emp2Data = [
    { fullName: 'Vikram Rao', department: 'Operations', designation: 'Plant Manager', ctcPerAnnum: 1500000, email: 'vikram.r@greenstar.in', phone: '9876543220', empId: 'EMP001', status: 'Active', joiningDate: today, employmentType: 'Full-time', createdAt: serverTimestamp() },
    { fullName: 'Sunita Patel', department: 'Finance', designation: 'Accountant', ctcPerAnnum: 600000, email: 'sunita.p@greenstar.in', phone: '9876543221', empId: 'EMP002', status: 'Active', joiningDate: today, employmentType: 'Full-time', createdAt: serverTimestamp() },
    { fullName: 'Deepak Nair', department: 'Engineering', designation: 'Technician', ctcPerAnnum: 550000, email: 'deepak.n@greenstar.in', phone: '9876543222', empId: 'EMP003', status: 'Active', joiningDate: today, employmentType: 'Full-time', createdAt: serverTimestamp() },
  ];
  const emp2Refs = [];
  for (const e of emp2Data) {
    const r = await addDoc(collection(db, 'companies', company2Id, 'employees'), e);
    emp2Refs.push({ id: r.id, ...e });
  }
  await updateDoc(doc(db, 'companies', company2Id), { employeeCount: increment(3) });

  await addDoc(collection(db, 'companies', company2Id, 'leave'), {
    employeeId: emp2Refs[0].id,
    employeeName: 'Vikram Rao',
    leaveType: 'EL',
    startDate: today,
    endDate: today,
    days: 1,
    reason: 'Family',
    status: 'Pending',
    appliedAt: serverTimestamp(),
  });
  await addDoc(collection(db, 'companies', company2Id, 'leave'), {
    employeeId: emp2Refs[1].id,
    employeeName: 'Sunita Patel',
    leaveType: 'CL',
    startDate: today,
    endDate: today,
    days: 1,
    reason: 'Personal',
    status: 'Approved',
    appliedAt: serverTimestamp(),
    decidedAt: serverTimestamp(),
  });
  for (const e of emp2Refs) {
    await setDoc(doc(db, 'companies', company2Id, 'attendance', `${today}_${e.id}`), {
      date: today,
      employeeId: e.id,
      status: 'Present',
      updatedAt: new Date(),
    });
  }

  return { seeded: true, company1Id, company2Id };
}
