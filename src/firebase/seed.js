import {
  collection,
  doc,
  getDocs,
  addDoc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './config';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export async function seedData(createdBy = '') {
  console.log('[Seed] Step 1: Checking if companies collection has any documents...');
  const companiesSnap = await getDocs(collection(db, 'companies'));
  const count = companiesSnap.size;
  console.log('[Seed] Companies count:', count);

  if (count > 0) {
    console.log('[Seed] Companies already exist. Skipping seed.');
    return { seeded: false, message: 'Companies already exist.' };
  }

  console.log('[Seed] Step 2: Creating Company 1 (TechCorp India)...');
  const company1Data = {
    name: 'TechCorp India',
    initials: 'TC',
    color: '#378ADD',
    industry: 'IT',
    location: 'Mumbai',
    employeeCount: 3,
    isActive: true,
    createdAt: new Date(),
    createdBy,
  };
  const company1Ref = await addDoc(collection(db, 'companies'), company1Data);
  const company1Id = company1Ref.id;
  console.log('[Seed] Company 1 created with id:', company1Id);

  console.log('[Seed] Step 3: Creating TechCorp employees...');
  const techCorpEmployees = [
    {
      empId: 'EMP001',
      fullName: 'Rahul Sharma',
      email: 'rahul@techcorp.in',
      phone: '9876543210',
      department: 'Engineering',
      designation: 'Sr. Developer',
      employmentType: 'Full-time',
      joiningDate: new Date('2023-03-12'),
      ctc: 1200000,
      ctcPerAnnum: 1200000,
      basicSalary: 50000,
      status: 'Active',
      panNumber: 'ABCRS1234F',
      pfNumber: 'MH/BOM/12345',
      createdAt: serverTimestamp(),
    },
    {
      empId: 'EMP002',
      fullName: 'Priya Krishnan',
      email: 'priya@techcorp.in',
      phone: '9876543211',
      department: 'HR',
      designation: 'HR Manager',
      employmentType: 'Full-time',
      joiningDate: new Date('2022-07-05'),
      ctc: 800000,
      ctcPerAnnum: 800000,
      basicSalary: 35000,
      status: 'Active',
      panNumber: 'ABCPK5678F',
      pfNumber: 'MH/BOM/12346',
      createdAt: serverTimestamp(),
    },
    {
      empId: 'EMP003',
      fullName: 'Arjun Mehta',
      email: 'arjun@techcorp.in',
      phone: '9876543212',
      department: 'Sales',
      designation: 'Sales Lead',
      employmentType: 'Full-time',
      joiningDate: new Date('2024-01-19'),
      ctc: 950000,
      ctcPerAnnum: 950000,
      basicSalary: 40000,
      status: 'Active',
      panNumber: 'ABCAM9012F',
      pfNumber: 'MH/BOM/12347',
      createdAt: serverTimestamp(),
    },
  ];

  const emp1Refs = [];
  for (const e of techCorpEmployees) {
    const ref = await addDoc(collection(db, 'companies', company1Id, 'employees'), e);
    emp1Refs.push({ id: ref.id, ...e });
  }
  console.log('[Seed] TechCorp employee ids:', emp1Refs.map((r) => r.id));

  const today = todayStr();
  const todayDate = new Date();

  console.log('[Seed] Step 4: Creating TechCorp leave requests...');
  await addDoc(collection(db, 'companies', company1Id, 'leave'), {
    employeeId: emp1Refs[0].id,
    employeeName: 'Rahul Sharma',
    leaveType: 'CL',
    startDate: today,
    endDate: today,
    days: 1,
    reason: 'Personal work',
    status: 'Pending',
    appliedAt: todayDate,
  });
  await addDoc(collection(db, 'companies', company1Id, 'leave'), {
    employeeId: emp1Refs[1].id,
    employeeName: 'Priya Krishnan',
    leaveType: 'SL',
    startDate: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
    endDate: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
    days: 1,
    reason: 'Fever',
    status: 'Approved',
    appliedAt: todayDate,
    decidedAt: todayDate,
  });

  console.log('[Seed] Step 5: Creating TechCorp attendance for today...');
  await setDoc(doc(db, 'companies', company1Id, 'attendance', `${today}_${emp1Refs[0].id}`), {
    date: today,
    employeeId: emp1Refs[0].id,
    status: 'Present',
    updatedAt: todayDate,
  });
  await setDoc(doc(db, 'companies', company1Id, 'attendance', `${today}_${emp1Refs[1].id}`), {
    date: today,
    employeeId: emp1Refs[1].id,
    status: 'Present',
    updatedAt: todayDate,
  });
  await setDoc(doc(db, 'companies', company1Id, 'attendance', `${today}_${emp1Refs[2].id}`), {
    date: today,
    employeeId: emp1Refs[2].id,
    status: 'Absent',
    updatedAt: todayDate,
  });

  console.log('[Seed] Step 6: Creating Company 2 (GreenStar Pvt Ltd)...');
  const company2Data = {
    name: 'GreenStar Pvt Ltd',
    initials: 'GS',
    color: '#1D9E75',
    industry: 'Manufacturing',
    location: 'Pune',
    employeeCount: 3,
    isActive: true,
    createdAt: new Date(),
    createdBy,
  };
  const company2Ref = await addDoc(collection(db, 'companies'), company2Data);
  const company2Id = company2Ref.id;
  console.log('[Seed] Company 2 created with id:', company2Id);

  console.log('[Seed] Step 7: Creating GreenStar employees...');
  const greenStarEmployees = [
    {
      empId: 'EMP001',
      fullName: 'Vikram Rao',
      email: 'vikram@greenstar.in',
      phone: '9123456789',
      department: 'Operations',
      designation: 'Plant Manager',
      employmentType: 'Full-time',
      joiningDate: new Date('2021-06-01'),
      ctc: 1500000,
      ctcPerAnnum: 1500000,
      basicSalary: 65000,
      status: 'Active',
      createdAt: serverTimestamp(),
    },
    {
      empId: 'EMP002',
      fullName: 'Sunita Patel',
      email: 'sunita@greenstar.in',
      phone: '9123456790',
      department: 'Finance',
      designation: 'Accountant',
      employmentType: 'Full-time',
      joiningDate: new Date('2022-04-15'),
      ctc: 600000,
      ctcPerAnnum: 600000,
      basicSalary: 28000,
      status: 'Active',
      createdAt: serverTimestamp(),
    },
    {
      empId: 'EMP003',
      fullName: 'Deepak Nair',
      email: 'deepak@greenstar.in',
      phone: '9123456791',
      department: 'Engineering',
      designation: 'Technician',
      employmentType: 'Full-time',
      joiningDate: new Date('2023-08-20'),
      ctc: 550000,
      ctcPerAnnum: 550000,
      basicSalary: 25000,
      status: 'Active',
      createdAt: serverTimestamp(),
    },
  ];

  const emp2Refs = [];
  for (const e of greenStarEmployees) {
    const ref = await addDoc(collection(db, 'companies', company2Id, 'employees'), e);
    emp2Refs.push({ id: ref.id, ...e });
  }
  console.log('[Seed] GreenStar employee ids:', emp2Refs.map((r) => r.id));

  console.log('[Seed] Step 8: Creating GreenStar leave requests...');
  const fiveDaysLater = new Date();
  fiveDaysLater.setDate(fiveDaysLater.getDate() + 5);
  await addDoc(collection(db, 'companies', company2Id, 'leave'), {
    employeeId: emp2Refs[0].id,
    employeeName: 'Vikram Rao',
    leaveType: 'EL',
    startDate: today,
    endDate: fiveDaysLater.toISOString().slice(0, 10),
    days: 5,
    reason: 'Family vacation',
    status: 'Pending',
    appliedAt: todayDate,
  });
  await addDoc(collection(db, 'companies', company2Id, 'leave'), {
    employeeId: emp2Refs[1].id,
    employeeName: 'Sunita Patel',
    leaveType: 'CL',
    startDate: today,
    endDate: today,
    days: 1,
    reason: 'Personal work',
    status: 'Approved',
    appliedAt: todayDate,
    decidedAt: todayDate,
  });

  console.log('[Seed] Step 9: Creating GreenStar attendance for today...');
  await setDoc(doc(db, 'companies', company2Id, 'attendance', `${today}_${emp2Refs[0].id}`), {
    date: today,
    employeeId: emp2Refs[0].id,
    status: 'On Leave',
    updatedAt: todayDate,
  });
  await setDoc(doc(db, 'companies', company2Id, 'attendance', `${today}_${emp2Refs[1].id}`), {
    date: today,
    employeeId: emp2Refs[1].id,
    status: 'Present',
    updatedAt: todayDate,
  });
  await setDoc(doc(db, 'companies', company2Id, 'attendance', `${today}_${emp2Refs[2].id}`), {
    date: today,
    employeeId: emp2Refs[2].id,
    status: 'Present',
    updatedAt: todayDate,
  });

  console.log('[Seed] Step 10: All writes complete. Returning success.');
  return { seeded: true, company1Id, company2Id };
}
