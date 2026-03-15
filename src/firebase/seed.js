import {
  collection,
  addDoc,
  getDocs,
  doc,
  setDoc,
  Timestamp,
} from 'firebase/firestore';
import { db } from './config';

export async function seedData(createdBy) {
  try {
    console.log('Starting seed...');

    // Check if already seeded
    const existing = await getDocs(collection(db, 'companies'));
    if (!existing.empty) {
      console.log('Already has data, skipping seed');
      return { success: false, message: 'Data already exists' };
    }

    console.log('Creating TechCorp India...');

    // Company 1
    const company1Ref = await addDoc(collection(db, 'companies'), {
      name: 'TechCorp India',
      initials: 'TC',
      color: '#378ADD',
      industry: 'IT',
      location: 'Mumbai',
      employeeCount: 3,
      isActive: true,
      createdAt: Timestamp.now(),
      createdBy,
    });

    console.log('TechCorp created:', company1Ref.id);

    // TechCorp employees
    const tc1Ref = await addDoc(
      collection(db, 'companies', company1Ref.id, 'employees'),
      {
        empId: 'EMP001',
        fullName: 'Rahul Sharma',
        email: 'rahul@techcorp.in',
        phone: '9876543210',
        department: 'Engineering',
        designation: 'Sr. Developer',
        employmentType: 'Full-time',
        joiningDate: Timestamp.fromDate(new Date('2023-03-12')),
        ctc: 1200000,
        basicSalary: 50000,
        status: 'Active',
        panNumber: 'ABCRS1234F',
        pfNumber: 'MH/BOM/12345',
        documents: [],
        createdAt: Timestamp.now(),
      },
    );

    const tc2Ref = await addDoc(
      collection(db, 'companies', company1Ref.id, 'employees'),
      {
        empId: 'EMP002',
        fullName: 'Priya Krishnan',
        email: 'priya@techcorp.in',
        phone: '9876543211',
        department: 'HR',
        designation: 'HR Manager',
        employmentType: 'Full-time',
        joiningDate: Timestamp.fromDate(new Date('2022-07-05')),
        ctc: 800000,
        basicSalary: 35000,
        status: 'Active',
        panNumber: 'ABCPK5678F',
        pfNumber: 'MH/BOM/12346',
        documents: [],
        createdAt: Timestamp.now(),
      },
    );

    const tc3Ref = await addDoc(
      collection(db, 'companies', company1Ref.id, 'employees'),
      {
        empId: 'EMP003',
        fullName: 'Arjun Mehta',
        email: 'arjun@techcorp.in',
        phone: '9876543212',
        department: 'Sales',
        designation: 'Sales Lead',
        employmentType: 'Full-time',
        joiningDate: Timestamp.fromDate(new Date('2024-01-19')),
        ctc: 950000,
        basicSalary: 40000,
        status: 'Active',
        panNumber: 'ABCAM9012F',
        pfNumber: 'MH/BOM/12347',
        documents: [],
        createdAt: Timestamp.now(),
      },
    );

    // TechCorp leave requests
    await addDoc(
      collection(db, 'companies', company1Ref.id, 'leave'),
      {
        employeeId: tc1Ref.id,
        employeeName: 'Rahul Sharma',
        leaveType: 'Casual',
        startDate: Timestamp.now(),
        endDate: Timestamp.now(),
        days: 1,
        reason: 'Personal work',
        status: 'Pending',
        appliedAt: Timestamp.now(),
      },
    );

    await addDoc(
      collection(db, 'companies', company1Ref.id, 'leave'),
      {
        employeeId: tc2Ref.id,
        employeeName: 'Priya Krishnan',
        leaveType: 'Sick',
        startDate: Timestamp.fromDate(new Date(Date.now() - 86400000)),
        endDate: Timestamp.fromDate(new Date(Date.now() - 86400000)),
        days: 1,
        reason: 'Fever',
        status: 'Approved',
        appliedAt: Timestamp.fromDate(new Date(Date.now() - 86400000)),
      },
    );

    // TechCorp attendance today
    const today = new Date().toISOString().split('T')[0];

    await setDoc(
      doc(db, 'companies', company1Ref.id, 'attendance', `${today}_${tc1Ref.id}`),
      {
        employeeId: tc1Ref.id,
        employeeName: 'Rahul Sharma',
        date: today,
        status: 'Present',
        createdAt: Timestamp.now(),
      },
    );

    await setDoc(
      doc(db, 'companies', company1Ref.id, 'attendance', `${today}_${tc2Ref.id}`),
      {
        employeeId: tc2Ref.id,
        employeeName: 'Priya Krishnan',
        date: today,
        status: 'Present',
        createdAt: Timestamp.now(),
      },
    );

    await setDoc(
      doc(db, 'companies', company1Ref.id, 'attendance', `${today}_${tc3Ref.id}`),
      {
        employeeId: tc3Ref.id,
        employeeName: 'Arjun Mehta',
        date: today,
        status: 'Absent',
        createdAt: Timestamp.now(),
      },
    );

    console.log('Creating GreenStar Pvt Ltd...');

    // Company 2
    const company2Ref = await addDoc(collection(db, 'companies'), {
      name: 'GreenStar Pvt Ltd',
      initials: 'GS',
      color: '#1D9E75',
      industry: 'Manufacturing',
      location: 'Pune',
      employeeCount: 3,
      isActive: true,
      createdAt: Timestamp.now(),
      createdBy,
    });

    console.log('GreenStar created:', company2Ref.id);

    // GreenStar employees
    const gs1Ref = await addDoc(
      collection(db, 'companies', company2Ref.id, 'employees'),
      {
        empId: 'EMP001',
        fullName: 'Vikram Rao',
        email: 'vikram@greenstar.in',
        phone: '9123456789',
        department: 'Operations',
        designation: 'Plant Manager',
        employmentType: 'Full-time',
        joiningDate: Timestamp.fromDate(new Date('2021-06-01')),
        ctc: 1500000,
        basicSalary: 65000,
        status: 'Active',
        documents: [],
        createdAt: Timestamp.now(),
      },
    );

    const gs2Ref = await addDoc(
      collection(db, 'companies', company2Ref.id, 'employees'),
      {
        empId: 'EMP002',
        fullName: 'Sunita Patel',
        email: 'sunita@greenstar.in',
        phone: '9123456790',
        department: 'Finance',
        designation: 'Accountant',
        employmentType: 'Full-time',
        joiningDate: Timestamp.fromDate(new Date('2022-04-15')),
        ctc: 600000,
        basicSalary: 28000,
        status: 'Active',
        documents: [],
        createdAt: Timestamp.now(),
      },
    );

    const gs3Ref = await addDoc(
      collection(db, 'companies', company2Ref.id, 'employees'),
      {
        empId: 'EMP003',
        fullName: 'Deepak Nair',
        email: 'deepak@greenstar.in',
        phone: '9123456791',
        department: 'Engineering',
        designation: 'Technician',
        employmentType: 'Full-time',
        joiningDate: Timestamp.fromDate(new Date('2023-08-20')),
        ctc: 550000,
        basicSalary: 25000,
        status: 'Active',
        documents: [],
        createdAt: Timestamp.now(),
      },
    );

    // GreenStar leave
    await addDoc(
      collection(db, 'companies', company2Ref.id, 'leave'),
      {
        employeeId: gs1Ref.id,
        employeeName: 'Vikram Rao',
        leaveType: 'Earned',
        startDate: Timestamp.fromDate(new Date(Date.now() + 86400000 * 3)),
        endDate: Timestamp.fromDate(new Date(Date.now() + 86400000 * 7)),
        days: 5,
        reason: 'Family vacation',
        status: 'Pending',
        appliedAt: Timestamp.now(),
      },
    );

    await addDoc(
      collection(db, 'companies', company2Ref.id, 'leave'),
      {
        employeeId: gs2Ref.id,
        employeeName: 'Sunita Patel',
        leaveType: 'Casual',
        startDate: Timestamp.fromDate(new Date(Date.now() - 86400000 * 2)),
        endDate: Timestamp.fromDate(new Date(Date.now() - 86400000 * 2)),
        days: 1,
        reason: 'Personal work',
        status: 'Approved',
        appliedAt: Timestamp.fromDate(new Date(Date.now() - 86400000 * 3)),
      },
    );

    // GreenStar attendance today
    await setDoc(
      doc(db, 'companies', company2Ref.id, 'attendance', `${today}_${gs1Ref.id}`),
      {
        employeeId: gs1Ref.id,
        employeeName: 'Vikram Rao',
        date: today,
        status: 'On Leave',
        createdAt: Timestamp.now(),
      },
    );

    await setDoc(
      doc(db, 'companies', company2Ref.id, 'attendance', `${today}_${gs2Ref.id}`),
      {
        employeeId: gs2Ref.id,
        employeeName: 'Sunita Patel',
        date: today,
        status: 'Present',
        createdAt: Timestamp.now(),
      },
    );

    await setDoc(
      doc(db, 'companies', company2Ref.id, 'attendance', `${today}_${gs3Ref.id}`),
      {
        employeeId: gs3Ref.id,
        employeeName: 'Deepak Nair',
        date: today,
        status: 'Present',
        createdAt: Timestamp.now(),
      },
    );

    console.log('Seed completed successfully!');
    return {
      success: true,
      message: 'Sample data created successfully!',
    };
  } catch (error) {
    console.error('Seed error:', error);
    return {
      success: false,
      message: error.message,
    };
  }
}
