import { z } from 'zod';

// ---------------------------------------------------------------------------
// Employee schema — used in the AddEmployee 4-step flow (Employees.jsx)
// ---------------------------------------------------------------------------
export const employeeSchema = z.object({
  fullName: z.string().min(1, 'Full name is required'),
  email: z.string().min(1, 'Email is required').email('Please enter a valid email address'),
  department: z.string().min(1, 'Department is required'),
  designation: z.string().min(1, 'Designation is required'),
  employmentType: z.string().min(1, 'Employment type is required'),
  joiningDate: z.string().min(1, 'Joining date is required'),
});

// ---------------------------------------------------------------------------
// Leave request schema — used in the Add Leave modal (Leave.jsx)
// ---------------------------------------------------------------------------
export const leaveRequestSchema = z
  .object({
    employeeId: z.string().min(1, 'Please select an employee'),
    leaveType: z.string().min(1, 'Please select a leave type'),
    startDate: z.string().min(1, 'Start date is required'),
    endDate: z.string().min(1, 'End date is required'),
    reason: z.string().min(3, 'Reason must be at least 3 characters'),
  })
  .refine(
    (data) => {
      if (!data.startDate || !data.endDate) return true;
      return new Date(data.endDate) >= new Date(data.startDate);
    },
    { message: 'End date must be on or after start date', path: ['endDate'] },
  );

// ---------------------------------------------------------------------------
// Asset schema — used in AddAssetModal (Assets.jsx)
// ---------------------------------------------------------------------------
export const assetSchema = z.object({
  name: z.string().min(1, 'Asset name is required'),
  type: z.string().min(1, 'Asset type is required'),
  assetId: z.string().min(1, 'Asset ID is required'),
});
