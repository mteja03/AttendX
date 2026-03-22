// Seed utility — console output is intentional for CLI / dev progress
import { collection, addDoc, getDocs, doc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from './config';

export async function seedData(createdBy) {
  try {
    console.log('🌱 Starting seed...');

    const existing = await getDocs(collection(db, 'companies'));
    if (!existing.empty) {
      console.log('Already has data, skip seed');
      return {
        success: false,
        message: 'Companies already exist',
      };
    }

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const by = createdBy || 'seed';

    const ts = (d) => Timestamp.fromDate(d instanceof Date ? d : new Date(d));

    const SEED_LEAVE_TYPES = [
      { name: 'Casual Leave', shortCode: 'CL', isPaid: true },
      { name: 'Sick Leave', shortCode: 'SL', isPaid: true },
      { name: 'Earned Leave', shortCode: 'EL', isPaid: true },
      { name: 'Maternity Leave', shortCode: 'ML', isPaid: true },
      { name: 'Paternity Leave', shortCode: 'PL', isPaid: true },
      { name: 'Bereavement Leave', shortCode: 'BL', isPaid: true },
      { name: 'Compensatory Leave', shortCode: 'CO', isPaid: true },
      { name: 'Marriage Leave', shortCode: 'MAR', isPaid: true },
      { name: 'Study Leave', shortCode: 'STL', isPaid: false },
      { name: 'Unpaid Leave', shortCode: 'UL', isPaid: false },
    ];
    const SEED_LEAVE_POLICY = {
      CL: 12,
      SL: 12,
      EL: 15,
      ML: 12,
      PL: 12,
      BL: 12,
      CO: 12,
      MAR: 12,
    };

    // ================================
    // COMPANY 1 — TechCorp India
    // ================================
    console.log('Creating TechCorp India...');

    const company1Ref = await addDoc(collection(db, 'companies'), {
      name: 'TechCorp India',
      initials: 'TC',
      color: '#1B6B6B',
      industry: 'IT',
      location: 'Mumbai',
      employeeCount: 3,
      isActive: true,
      createdAt: Timestamp.now(),
      createdBy: by,
      departments: ['Engineering', 'HR', 'Sales', 'Finance', 'Operations', 'Design'],
      branches: ['Head Office', 'Branch 1'],
      designations: ['Director', 'Manager', 'Team Lead', 'Senior Executive', 'Executive', 'Intern'],
      employmentTypes: ['Full-time', 'Part-time', 'Contract', 'Internship'],
      categories: ['Permanent', 'Trainee', 'Contractual', 'Probationary'],
      qualifications: ['Graduate (B.E./B.Tech)', 'Post Graduate (MBA)', 'Graduate (B.Com/BBA)', 'Diploma', '12th Pass'],
      assetTypes: [
        { name: 'Laptop', mode: 'trackable' },
        { name: 'Mobile Phone', mode: 'trackable' },
        { name: 'ID Card', mode: 'consumable' },
        { name: 'Uniform', mode: 'consumable' },
        { name: 'SIM Card', mode: 'consumable' },
      ],
      leavePolicy: SEED_LEAVE_POLICY,
      leaveTypes: SEED_LEAVE_TYPES,
    });

    const c1Id = company1Ref.id;
    console.log('TechCorp created:', c1Id);

    const tc1Ref = await addDoc(collection(db, 'companies', c1Id, 'employees'), {
      empId: 'EMP001',
      fullName: 'Rahul Sharma',
      email: 'rahul@techcorp.in',
      phone: '9876543210',
      department: 'Engineering',
      designation: 'Sr. Developer',
      branch: 'Head Office',
      employmentType: 'Full-time',
      category: 'Permanent',
      joiningDate: ts('2023-03-12'),
      ctc: 1200000,
      ctcPerAnnum: 1200000,
      basicSalary: 50000,
      hra: 20000,
      status: 'Active',
      panNumber: 'ABCRS1234F',
      pfNumber: 'MH/BOM/12345',
      aadhaarNumber: '123456789012',
      gender: 'Male',
      dateOfBirth: ts('1995-08-15'),
      fatherName: 'Suresh Sharma',
      streetAddress: '101 Andheri West',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400058',
      country: 'India',
      emergencyContact: {
        name: 'Suresh Sharma',
        relationship: 'Father',
        phone: '9876543200',
        email: '',
        address: '',
      },
      reportingManagerId: '',
      reportingManagerName: '',
      reportingManagerEmpId: '',
      documents: [],
      createdAt: Timestamp.now(),
    });

    const tc2Ref = await addDoc(collection(db, 'companies', c1Id, 'employees'), {
      empId: 'EMP002',
      fullName: 'Priya Krishnan',
      email: 'priya@techcorp.in',
      phone: '9876543211',
      department: 'HR',
      designation: 'HR Manager',
      branch: 'Head Office',
      employmentType: 'Full-time',
      category: 'Permanent',
      joiningDate: ts('2022-07-05'),
      ctc: 800000,
      ctcPerAnnum: 800000,
      basicSalary: 35000,
      hra: 14000,
      status: 'Active',
      panNumber: 'ABCPK5678F',
      pfNumber: 'MH/BOM/12346',
      aadhaarNumber: '234567890123',
      gender: 'Female',
      dateOfBirth: ts('1992-03-22'),
      fatherName: 'Mohan Krishnan',
      streetAddress: '45 Bandra East',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400051',
      country: 'India',
      emergencyContact: {
        name: 'Mohan Krishnan',
        relationship: 'Father',
        phone: '9876543201',
        email: '',
        address: '',
      },
      reportingManagerId: tc1Ref.id,
      reportingManagerName: 'Rahul Sharma',
      reportingManagerEmpId: 'EMP001',
      documents: [],
      createdAt: Timestamp.now(),
    });

    const tc3Ref = await addDoc(collection(db, 'companies', c1Id, 'employees'), {
      empId: 'EMP003',
      fullName: 'Arjun Mehta',
      email: 'arjun@techcorp.in',
      phone: '9876543212',
      department: 'Sales',
      designation: 'Sales Lead',
      branch: 'Branch 1',
      employmentType: 'Full-time',
      category: 'Permanent',
      joiningDate: ts('2024-01-19'),
      ctc: 950000,
      ctcPerAnnum: 950000,
      basicSalary: 40000,
      hra: 16000,
      status: 'Active',
      panNumber: 'ABCAM9012F',
      pfNumber: 'MH/BOM/12347',
      aadhaarNumber: '345678901234',
      gender: 'Male',
      dateOfBirth: ts('1998-11-30'),
      fatherName: 'Vijay Mehta',
      streetAddress: '78 Powai Lake View',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400076',
      country: 'India',
      emergencyContact: {
        name: 'Vijay Mehta',
        relationship: 'Father',
        phone: '9876543202',
        email: '',
        address: '',
      },
      reportingManagerId: tc2Ref.id,
      reportingManagerName: 'Priya Krishnan',
      reportingManagerEmpId: 'EMP002',
      documents: [],
      createdAt: Timestamp.now(),
    });

    await addDoc(collection(db, 'companies', c1Id, 'leave'), {
      employeeId: tc1Ref.id,
      employeeName: 'Rahul Sharma',
      leaveType: 'Casual Leave',
      startDate: Timestamp.fromDate(new Date()),
      endDate: Timestamp.fromDate(new Date()),
      days: 1,
      reason: 'Personal work',
      status: 'Pending',
      appliedAt: Timestamp.now(),
    });

    const slApplied = new Date(Date.now() - 86400000);
    await addDoc(collection(db, 'companies', c1Id, 'leave'), {
      employeeId: tc2Ref.id,
      employeeName: 'Priya Krishnan',
      leaveType: 'Sick Leave',
      startDate: Timestamp.fromDate(slApplied),
      endDate: Timestamp.fromDate(slApplied),
      days: 1,
      reason: 'Fever',
      status: 'Approved',
      appliedAt: Timestamp.fromDate(slApplied),
      decidedAt: Timestamp.fromDate(slApplied),
    });

    await addDoc(collection(db, 'companies', c1Id, 'leave'), {
      employeeId: tc3Ref.id,
      employeeName: 'Arjun Mehta',
      leaveType: 'Earned Leave',
      startDate: Timestamp.fromDate(new Date(Date.now() + 86400000 * 5)),
      endDate: Timestamp.fromDate(new Date(Date.now() + 86400000 * 9)),
      days: 5,
      reason: 'Family vacation',
      status: 'Pending',
      appliedAt: Timestamp.now(),
    });

    await setDoc(doc(db, 'companies', c1Id, 'attendance', `${todayStr}_${tc1Ref.id}`), {
      employeeId: tc1Ref.id,
      employeeName: 'Rahul Sharma',
      date: todayStr,
      status: 'Present',
      createdAt: Timestamp.now(),
    });

    await setDoc(doc(db, 'companies', c1Id, 'attendance', `${todayStr}_${tc2Ref.id}`), {
      employeeId: tc2Ref.id,
      employeeName: 'Priya Krishnan',
      date: todayStr,
      status: 'Present',
      createdAt: Timestamp.now(),
    });

    await setDoc(doc(db, 'companies', c1Id, 'attendance', `${todayStr}_${tc3Ref.id}`), {
      employeeId: tc3Ref.id,
      employeeName: 'Arjun Mehta',
      date: todayStr,
      status: 'Absent',
      createdAt: Timestamp.now(),
    });

    await addDoc(collection(db, 'companies', c1Id, 'assets'), {
      assetId: 'LAP001',
      name: 'Dell Laptop',
      type: 'Laptop',
      mode: 'trackable',
      brand: 'Dell',
      model: 'Inspiron 15',
      serialNumber: 'DL123456',
      status: 'Assigned',
      assignedToId: tc1Ref.id,
      assignedToName: 'Rahul Sharma',
      assignedToEmpId: 'EMP001',
      issueDate: ts('2023-03-12'),
      condition: 'Good',
      isReturnable: true,
      purchaseDate: ts('2023-01-01'),
      purchasePrice: 65000,
      notes: '',
      history: [
        {
          action: 'created',
          date: ts('2023-01-01'),
          notes: 'Asset added to inventory',
          performedBy: by,
        },
        {
          action: 'assigned',
          employeeId: tc1Ref.id,
          employeeName: 'Rahul Sharma',
          date: ts('2023-03-12'),
          condition: 'Good',
          notes: 'Issued on joining',
          performedBy: by,
        },
      ],
      createdAt: Timestamp.now(),
      createdBy: by,
    });

    await addDoc(collection(db, 'companies', c1Id, 'assets'), {
      assetId: 'IDC',
      name: 'ID Card',
      type: 'ID Card',
      mode: 'consumable',
      totalStock: 10,
      availableStock: 7,
      issuedCount: 3,
      unit: 'pieces',
      isReturnable: true,
      assignments: [
        {
          employeeId: tc1Ref.id,
          employeeName: 'Rahul Sharma',
          empId: 'EMP001',
          quantity: 1,
          issueDate: ts('2023-03-12'),
          condition: 'New',
          returned: false,
          notes: '',
        },
        {
          employeeId: tc2Ref.id,
          employeeName: 'Priya Krishnan',
          empId: 'EMP002',
          quantity: 1,
          issueDate: ts('2022-07-05'),
          condition: 'New',
          returned: false,
          notes: '',
        },
        {
          employeeId: tc3Ref.id,
          employeeName: 'Arjun Mehta',
          empId: 'EMP003',
          quantity: 1,
          issueDate: ts('2024-01-19'),
          condition: 'New',
          returned: false,
          notes: '',
        },
      ],
      history: [
        {
          action: 'created',
          date: Timestamp.now(),
          notes: '10 ID cards added to stock',
          performedBy: by,
        },
      ],
      createdAt: Timestamp.now(),
      createdBy: by,
    });

    console.log('✅ TechCorp India complete!');

    // ================================
    // COMPANY 2 — GreenStar Pvt Ltd
    // ================================
    console.log('Creating GreenStar Pvt Ltd...');

    const company2Ref = await addDoc(collection(db, 'companies'), {
      name: 'GreenStar Pvt Ltd',
      initials: 'GS',
      color: '#1D9E75',
      industry: 'Manufacturing',
      location: 'Pune',
      employeeCount: 3,
      isActive: true,
      createdAt: Timestamp.now(),
      createdBy: by,
      departments: ['Operations', 'Finance', 'Engineering', 'HR', 'Quality'],
      branches: ['Head Office', 'Plant 1', 'Plant 2'],
      designations: ['Plant Manager', 'Supervisor', 'Engineer', 'Technician', 'Accountant', 'Executive'],
      employmentTypes: ['Full-time', 'Contract', 'Part-time', 'Internship'],
      categories: ['Permanent', 'Contractual', 'Trainee', 'Seasonal'],
      qualifications: ['Diploma', 'Graduate (B.E./B.Tech)', 'ITI', '12th Pass', '10th Pass'],
      assetTypes: [
        { name: 'Laptop', mode: 'trackable' },
        { name: 'Uniform', mode: 'consumable' },
        { name: 'Safety Equipment', mode: 'consumable' },
        { name: 'Tools', mode: 'trackable' },
      ],
      leavePolicy: SEED_LEAVE_POLICY,
      leaveTypes: SEED_LEAVE_TYPES,
    });

    const c2Id = company2Ref.id;

    const gs1Ref = await addDoc(collection(db, 'companies', c2Id, 'employees'), {
      empId: 'EMP001',
      fullName: 'Vikram Rao',
      email: 'vikram@greenstar.in',
      phone: '9123456789',
      department: 'Operations',
      designation: 'Plant Manager',
      branch: 'Plant 1',
      employmentType: 'Full-time',
      category: 'Permanent',
      joiningDate: ts('2021-06-01'),
      ctc: 1500000,
      ctcPerAnnum: 1500000,
      basicSalary: 65000,
      hra: 26000,
      status: 'Active',
      panNumber: 'ABCVR3456F',
      pfNumber: 'MH/PUN/23456',
      aadhaarNumber: '456789012345',
      gender: 'Male',
      dateOfBirth: ts('1985-04-10'),
      fatherName: 'Krishna Rao',
      streetAddress: '12 Kothrud',
      city: 'Pune',
      state: 'Maharashtra',
      pincode: '411038',
      country: 'India',
      emergencyContact: {
        name: 'Krishna Rao',
        relationship: 'Father',
        phone: '9123456700',
        email: '',
        address: '',
      },
      reportingManagerId: '',
      reportingManagerName: '',
      reportingManagerEmpId: '',
      documents: [],
      createdAt: Timestamp.now(),
    });

    const gs2Ref = await addDoc(collection(db, 'companies', c2Id, 'employees'), {
      empId: 'EMP002',
      fullName: 'Sunita Patel',
      email: 'sunita@greenstar.in',
      phone: '9123456790',
      department: 'Finance',
      designation: 'Accountant',
      branch: 'Head Office',
      employmentType: 'Full-time',
      category: 'Permanent',
      joiningDate: ts('2022-04-15'),
      ctc: 600000,
      ctcPerAnnum: 600000,
      basicSalary: 28000,
      hra: 11200,
      status: 'Active',
      panNumber: 'ABCSP7890F',
      pfNumber: 'MH/PUN/23457',
      aadhaarNumber: '567890123456',
      gender: 'Female',
      dateOfBirth: ts('1993-07-18'),
      fatherName: 'Ramesh Patel',
      streetAddress: '34 Aundh Road',
      city: 'Pune',
      state: 'Maharashtra',
      pincode: '411007',
      country: 'India',
      emergencyContact: {
        name: 'Ramesh Patel',
        relationship: 'Father',
        phone: '9123456701',
        email: '',
        address: '',
      },
      reportingManagerId: gs1Ref.id,
      reportingManagerName: 'Vikram Rao',
      reportingManagerEmpId: 'EMP001',
      documents: [],
      createdAt: Timestamp.now(),
    });

    const gs3Ref = await addDoc(collection(db, 'companies', c2Id, 'employees'), {
      empId: 'EMP003',
      fullName: 'Deepak Nair',
      email: 'deepak@greenstar.in',
      phone: '9123456791',
      department: 'Engineering',
      designation: 'Technician',
      branch: 'Plant 2',
      employmentType: 'Full-time',
      category: 'Permanent',
      joiningDate: ts('2023-08-20'),
      ctc: 550000,
      ctcPerAnnum: 550000,
      basicSalary: 25000,
      hra: 10000,
      status: 'Active',
      panNumber: 'ABCDN1234F',
      pfNumber: 'MH/PUN/23458',
      aadhaarNumber: '678901234567',
      gender: 'Male',
      dateOfBirth: ts('1997-12-05'),
      fatherName: 'Gopalan Nair',
      streetAddress: '56 Wakad',
      city: 'Pune',
      state: 'Maharashtra',
      pincode: '411057',
      country: 'India',
      emergencyContact: {
        name: 'Gopalan Nair',
        relationship: 'Father',
        phone: '9123456702',
        email: '',
        address: '',
      },
      reportingManagerId: gs1Ref.id,
      reportingManagerName: 'Vikram Rao',
      reportingManagerEmpId: 'EMP001',
      documents: [],
      createdAt: Timestamp.now(),
    });

    await addDoc(collection(db, 'companies', c2Id, 'leave'), {
      employeeId: gs1Ref.id,
      employeeName: 'Vikram Rao',
      leaveType: 'Earned Leave',
      startDate: Timestamp.fromDate(new Date(Date.now() + 86400000 * 3)),
      endDate: Timestamp.fromDate(new Date(Date.now() + 86400000 * 7)),
      days: 5,
      reason: 'Family vacation',
      status: 'Pending',
      appliedAt: Timestamp.now(),
    });

    const clApplied = new Date(Date.now() - 86400000 * 3);
    await addDoc(collection(db, 'companies', c2Id, 'leave'), {
      employeeId: gs2Ref.id,
      employeeName: 'Sunita Patel',
      leaveType: 'Casual Leave',
      startDate: Timestamp.fromDate(new Date(Date.now() - 86400000 * 2)),
      endDate: Timestamp.fromDate(new Date(Date.now() - 86400000 * 2)),
      days: 1,
      reason: 'Personal work',
      status: 'Approved',
      appliedAt: Timestamp.fromDate(clApplied),
      decidedAt: Timestamp.fromDate(clApplied),
    });

    await setDoc(doc(db, 'companies', c2Id, 'attendance', `${todayStr}_${gs1Ref.id}`), {
      employeeId: gs1Ref.id,
      employeeName: 'Vikram Rao',
      date: todayStr,
      status: 'Present',
      createdAt: Timestamp.now(),
    });

    await setDoc(doc(db, 'companies', c2Id, 'attendance', `${todayStr}_${gs2Ref.id}`), {
      employeeId: gs2Ref.id,
      employeeName: 'Sunita Patel',
      date: todayStr,
      status: 'Present',
      createdAt: Timestamp.now(),
    });

    await setDoc(doc(db, 'companies', c2Id, 'attendance', `${todayStr}_${gs3Ref.id}`), {
      employeeId: gs3Ref.id,
      employeeName: 'Deepak Nair',
      date: todayStr,
      status: 'On Leave',
      createdAt: Timestamp.now(),
    });

    console.log('✅ GreenStar Pvt Ltd complete!');
    console.log('✅ Seed completed successfully!');

    return {
      success: true,
      message:
        'Sample data created! 2 companies with employees, leave requests and attendance added.',
    };
  } catch (error) {
    console.error('❌ Seed error:', error.message, error);
    return {
      success: false,
      message: `Seed failed: ${error.message}`,
    };
  }
}
