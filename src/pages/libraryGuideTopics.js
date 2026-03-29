/** HR Guide topics — Library → HR Guide tab */
export const GUIDE_TOPICS = [
  {
    id: 'employee_journey',
    icon: '🗺️',
    title: 'Employee Journey',
    color: 'teal',
    summary: 'Complete lifecycle from joining to exit and rehire',
    content: [
      {
        type: 'flow',
        steps: [
          {
            status: 'Added',
            color: 'teal',
            icon: '➕',
            desc: 'HR adds employee. Photo optional. Onboarding tab becomes available.',
          },
          {
            status: 'Active',
            color: 'green',
            icon: '✅',
            desc: 'Working normally. Leave, assets, documents, onboarding all managed here.',
          },
          {
            status: 'Notice Period',
            color: 'amber',
            icon: '⏰',
            desc: 'HR records resignation. Countdown begins. Can withdraw, buyout notice, or start exit tasks.',
          },
          {
            status: 'Offboarding',
            color: 'orange',
            icon: '🚪',
            desc: 'Exit tasks in progress. F&F settlement, asset return, letters issued.',
          },
          {
            status: 'Inactive',
            color: 'gray',
            icon: '🔴',
            desc: 'HR completes offboarding. Profile permanently locked. Read-only history preserved.',
          },
        ],
      },
      {
        type: 'rule',
        title: 'Withdrawal — Notice Period only',
        text: 'Withdrawal is only possible during Notice Period. Once exit tasks begin (Offboarding status), withdrawal is not available.',
      },
      {
        type: 'rule',
        title: 'Rehire',
        text: 'Inactive employees can be rehired. Click Rehire Employee on their profile. Enter new joining date. All previous history is preserved and shown under Employment History.',
      },
      {
        type: 'rule',
        title: 'Inactive = Locked',
        text: 'Inactive profiles are fully read-only. No editing, no document uploads, no asset assignment, no onboarding or offboarding actions.',
      },
    ],
  },
  {
    id: 'roles_access',
    icon: '🔐',
    title: 'Who Can Do What',
    color: 'purple',
    summary: 'Access levels for each platform role',
    content: [
      {
        type: 'table',
        headers: ['Action', 'Admin', 'HR Manager', 'IT Manager', 'Manager'],
        rows: [
          ['Add / Edit Employee', '✅', '✅', '❌', '❌'],
          ['Delete Employee permanently', '✅', '❌', '❌', '❌'],
          ['Upload Employee Photo', '✅', '✅', '❌', '❌'],
          ['Upload Documents', '✅', '✅', '❌', '❌'],
          ['Approve / Reject Leave', '✅', '✅', '❌', '✅'],
          ['Assign / Return Assets', '✅', '✅', '✅', '❌'],
          ['Start Onboarding', '✅', '✅', '❌', '❌'],
          ['Record Resignation', '✅', '✅', '❌', '❌'],
          ['Complete Offboarding', '✅', '✅', '❌', '❌'],
          ['Manage Settings', '✅', '✅', '❌', '❌'],
          ['View Reports', '✅', '✅', '✅', '✅'],
          ['View Org Chart', '✅', '✅', '✅', '✅'],
          ['Add Companies', '✅', '❌', '❌', '❌'],
          ['Manage Platform Users', '✅', '❌', '❌', '❌'],
          ['Rehire Employee', '✅', '✅', '❌', '❌'],
        ],
      },
      {
        type: 'tip',
        text: 'Permissions can be customised per user in Admin → Platform Users → Permissions. Toggle individual modules on or off.',
      },
    ],
  },
  {
    id: 'setup_guide',
    icon: '⚙️',
    title: 'Setting Up AttendX',
    color: 'teal',
    summary: 'Configure before adding employees',
    content: [
      {
        type: 'steps',
        items: [
          {
            step: 1,
            title: 'Manage Lists',
            desc: 'Settings → Manage Lists. Add your Departments, Branches, Locations, Employment Types, Categories, and Benefits. These populate all dropdowns.',
          },
          {
            step: 2,
            title: 'Leave Policy',
            desc: 'Settings → Leave. Add leave types with unique short codes (CL, SL, EL). Set annual allowance per type. Save Leave Policy.',
          },
          {
            step: 3,
            title: 'Document Types',
            desc: 'Settings → Document Types. Set up KYC, Employment, Education sections. Mark each as Mandatory or Optional.',
          },
          {
            step: 4,
            title: 'Onboarding Template',
            desc: 'Settings → Onboarding. Add tasks for HR, IT, Admin. Set days from joining. This template auto-generates for every new employee.',
          },
          {
            step: 5,
            title: 'Offboarding Template',
            desc: 'Settings → Offboarding. Add exit tasks. These generate when exit tasks begin for any employee.',
          },
          {
            step: 6,
            title: 'Designations',
            desc: 'Library → Designations. Add designations with salary bands, KPIs, and responsibilities. Used when adding employees.',
          },
          {
            step: 7,
            title: 'Add Employees',
            desc: 'Now add your employees. All dropdowns will be populated from your Settings.',
          },
        ],
      },
      {
        type: 'rule',
        title: 'Important',
        text: 'Always complete Settings setup before adding employees. If you add employees first, dropdowns will be empty and templates will not generate correctly.',
      },
    ],
  },
  {
    id: 'employee_guide',
    icon: '👥',
    title: 'Managing Employees',
    color: 'blue',
    summary: 'Add, edit, search, filter employees',
    content: [
      {
        type: 'steps',
        items: [
          {
            step: 1,
            title: 'Add Employee',
            desc: 'Employees → Add Employee. Fill required fields. Photo is optional — add it during add or later from the profile.',
          },
          {
            step: 2,
            title: 'Employee Photo',
            desc: 'Hover over the avatar in the profile header. Click the camera icon. Select image, crop to fit the circle, save.',
          },
          {
            step: 3,
            title: 'Edit Details',
            desc: 'Profile header → Edit button. Active employees only. Inactive employees are locked.',
          },
          {
            step: 4,
            title: 'Search',
            desc: 'Type 3+ characters in the search box — searches by name, Emp ID, email, and designation.',
          },
          {
            step: 5,
            title: 'Filters',
            desc: 'Click Filters to filter by Department, Branch, Location, Gender, Blood Group, PF/ESIC, Joining Year, and more.',
          },
        ],
      },
      {
        type: 'table',
        headers: ['Field', 'Where to set options'],
        rows: [
          ['Department', 'Settings → Manage Lists → Departments'],
          ['Branch', 'Settings → Manage Lists → Branches'],
          ['Location', 'Settings → Manage Lists → Locations'],
          ['Employment Type', 'Settings → Manage Lists → Employment Types'],
          ['Category', 'Settings → Manage Lists → Categories'],
          ['Designation', 'Library → Designations'],
          ['Benefits', 'Settings → Manage Lists → Benefits'],
        ],
      },
      {
        type: 'rule',
        title: 'Delete Employee',
        text: 'Only Admins can delete employees. This is permanent and removes all Firestore data, Google Drive folder, and Firebase Storage photo. Only use for incorrect or duplicate records.',
      },
    ],
  },
  {
    id: 'onboarding_guide',
    icon: '🎯',
    title: 'Onboarding',
    color: 'green',
    summary: 'Onboarding new employees step by step',
    content: [
      {
        type: 'steps',
        items: [
          {
            step: 1,
            title: 'Employee must be Active',
            desc: 'Onboarding can only be started for Active employees. The Start Onboarding button is hidden for other statuses.',
          },
          {
            step: 2,
            title: 'Start Onboarding',
            desc: 'Profile → Onboarding tab → Start Onboarding. Tasks are auto-generated from your Settings → Onboarding template.',
          },
          {
            step: 3,
            title: 'Complete Tasks',
            desc: 'HR, IT, and Admin complete their assigned tasks. Click Mark Complete. Add optional notes for each task.',
          },
          {
            step: 4,
            title: 'Track Progress',
            desc: 'Progress bar shows % complete. Dashboard → Onboarding in Progress shows all employees with incomplete onboarding.',
          },
          {
            step: 5,
            title: 'Undo a Task',
            desc: 'Click Undo next to a completed task to mark it incomplete again. Undo is not available for Inactive employees.',
          },
        ],
      },
      {
        type: 'rule',
        title: 'Offboarding before Onboarding complete',
        text: 'If an employee resigns before onboarding is complete, a warning is shown when recording the resignation. HR can still proceed with offboarding — onboarding completion is not mandatory.',
      },
      {
        type: 'tip',
        text: 'Click an employee in the Dashboard Onboarding widget to go directly to their Onboarding tab.',
      },
    ],
  },
  {
    id: 'offboarding_guide',
    icon: '🚪',
    title: 'Offboarding',
    color: 'orange',
    summary: 'Managing employee exits professionally',
    content: [
      {
        type: 'steps',
        items: [
          {
            step: 1,
            title: 'Record Resignation',
            desc: 'Active employee → Offboarding tab → Record Resignation. Enter resignation date and notice period days. Expected last day auto-calculates.',
          },
          {
            step: 2,
            title: 'Notice Period begins',
            desc: 'Status → Notice Period. Progress bar tracks days elapsed. Three options available: Withdraw, Notice Buyout, or Start Exit Tasks.',
          },
          {
            step: 3,
            title: 'Start Exit Tasks',
            desc: 'Click Start Exit Tasks — do not wait for the last day. HR should start exit tasks early to complete F&F before the employee leaves.',
          },
          {
            step: 4,
            title: 'Complete Exit Tasks',
            desc: 'Work through the Exit Tasks. Asset return, F&F settlement, experience letter, PF, knowledge transfer.',
          },
          {
            step: 5,
            title: 'Complete Offboarding',
            desc: 'When all required tasks are done, a green banner appears. Click Complete Offboarding & Mark as Inactive. Profile is permanently locked.',
          },
        ],
      },
      {
        type: 'table',
        headers: ['Situation', 'Action to take', 'Result'],
        rows: [
          ['Employee changes mind', 'Withdraw Resignation', '→ Back to Active'],
          ['Company pays for notice', 'Notice Buyout', '→ Enter actual last day, skip remaining notice'],
          ['Normal full notice', 'Start Exit Tasks', '→ Begin F&F process during Notice Period'],
          ['All exit tasks done', 'Complete Offboarding', '→ Employee becomes Inactive'],
          ['Need to exit early', 'Complete Offboarding Early', '→ HR confirms despite pending tasks'],
        ],
      },
      {
        type: 'rule',
        title: 'Withdrawal is only in Notice Period',
        text: 'Once HR clicks Start Exit Tasks and status becomes Offboarding — withdrawal is no longer possible. Only withdraw during Notice Period.',
      },
      {
        type: 'tip',
        text: 'Start exit tasks on Day 1 of Notice Period, not on the last day. This gives enough time for proper F&F settlement.',
      },
    ],
  },
  {
    id: 'leave_guide',
    icon: '🏖️',
    title: 'Leave Management',
    color: 'pink',
    summary: 'Adding, approving and tracking leaves',
    content: [
      {
        type: 'steps',
        items: [
          {
            step: 1,
            title: 'Add Leave',
            desc: 'Leave → Add Leave. Select employee (Inactive employees excluded). Select leave type. Pick dates — days are auto-calculated.',
          },
          {
            step: 2,
            title: 'Approve or Reject',
            desc: 'Pending leaves show in the list. Click Approve or Reject. Rejected leaves require a reason.',
          },
          {
            step: 3,
            title: 'View Balance',
            desc: "Reports → Leave → Leave Balance table shows each employee's used and remaining days per leave type.",
          },
        ],
      },
      {
        type: 'table',
        headers: ['Leave Setting', 'Where to configure'],
        rows: [
          ['Leave types (CL, SL, EL etc.)', 'Settings → Leave → Leave Types'],
          ['Annual allowance per type', 'Settings → Leave → Leave Allowance'],
          ['Paid vs Unpaid', 'Settings → Leave → Leave Types'],
          ['Short code (2-3 letters)', 'Settings → Leave → Add leave type'],
        ],
      },
      {
        type: 'rule',
        title: 'Pro-ration for New Joiners',
        text: 'Employees who join mid-year get a pro-rated leave balance. Example: joining in July = 6 months remaining = 50% of annual allowance. This is calculated automatically.',
      },
      {
        type: 'rule',
        title: 'Short Code must be unique',
        text: 'Each leave type needs a unique short code. For example: CL for Casual Leave, SL for Sick Leave, EL for Earned Leave. Duplicate codes cause balance calculation errors.',
      },
      {
        type: 'tip',
        text: 'Current year leaves load by default. Scroll to the bottom of the leave list and click Load previous year to see older records.',
      },
    ],
  },
  {
    id: 'assets_guide',
    icon: '📦',
    title: 'Asset Management',
    color: 'indigo',
    summary: 'Trackable and consumable assets',
    content: [
      {
        type: 'table',
        headers: ['Feature', 'Trackable', 'Consumable'],
        rows: [
          ['Examples', 'Laptop, Mobile, ID Card', 'Pen drives, SIM Cards, Stationery'],
          ['Tracking method', 'Unique Asset ID per item', 'Stock quantity'],
          ['Assign to employee', 'One specific item', 'Issue quantity from stock'],
          ['Return process', 'Mark as Available', 'Stock quantity increases'],
          ['Damage / Loss', 'Mark as Damaged or Lost', 'Not applicable'],
          ['Status options', 'Available / Assigned / Damaged / Lost', 'Stock count only'],
        ],
      },
      {
        type: 'steps',
        items: [
          {
            step: 1,
            title: 'Add Asset Type',
            desc: 'Settings → Manage Lists → Asset Types. Add Laptop, Mobile Phone etc. Choose Trackable or Consumable.',
          },
          {
            step: 2,
            title: 'Add Asset',
            desc: 'Assets → Add Asset. Select type, enter details. For trackable: enter unique Asset ID.',
          },
          {
            step: 3,
            title: 'Assign to Employee',
            desc: "Asset → Assign. Select employee. Confirmation required. Employee's Assets tab shows the item.",
          },
          {
            step: 4,
            title: 'Return Asset',
            desc: 'Asset → Return. Status goes back to Available.',
          },
        ],
      },
      {
        type: 'rule',
        title: 'Employee Exit',
        text: 'Asset return is part of the offboarding Exit Tasks. When an employee is deleted, assigned assets are automatically returned to Available status.',
      },
    ],
  },
  {
    id: 'documents_guide',
    icon: '📄',
    title: 'Documents',
    color: 'gray',
    summary: 'Uploading and managing employee documents',
    content: [
      {
        type: 'rule',
        title: 'Google Drive Required',
        text: 'Documents are stored in Google Drive. You must connect your Google Drive account before uploading. The sidebar shows "Drive: Connected" or "Drive: Session expired".',
      },
      {
        type: 'steps',
        items: [
          {
            step: 1,
            title: 'Connect Drive',
            desc: 'If sidebar shows "Drive: Session expired" — click it to reconnect. Drive sessions expire every few hours for security.',
          },
          {
            step: 2,
            title: 'Upload Document',
            desc: 'Employee profile → Documents tab → click Upload next to the document type. Upload buttons are disabled when Drive is expired.',
          },
          {
            step: 3,
            title: 'View Document',
            desc: 'Click View to open in Google Drive in a new tab. Documents are auto-organised by employee name and Emp ID.',
          },
          {
            step: 4,
            title: 'Replace Document',
            desc: 'Click Replace to upload a newer version. The old file is replaced in Drive.',
          },
          {
            step: 5,
            title: 'Track Completion',
            desc: 'Progress bar shows mandatory document completion %. Reports → Documents shows missing docs across all employees.',
          },
        ],
      },
      {
        type: 'table',
        headers: ['Document Setting', 'Where to configure'],
        rows: [
          ['Add document types', 'Settings → Document Types → Add'],
          ['Set Mandatory / Optional', 'Settings → Document Types → toggle'],
          ['Add new sections', 'Settings → Document Types → + Add New Section'],
          ['Rename sections', 'Settings → Document Types → click section name'],
        ],
      },
      {
        type: 'rule',
        title: 'Inactive Employee Documents',
        text: 'Documents for Inactive employees are read-only. Upload, Replace, and Delete buttons are hidden. Documents can still be viewed.',
      },
    ],
  },
  {
    id: 'designations_guide',
    icon: '🏗️',
    title: 'Designations',
    color: 'blue',
    summary: 'Setting up designations, salary bands and KPIs',
    content: [
      {
        type: 'steps',
        items: [
          {
            step: 1,
            title: 'Add Designation',
            desc: 'Library → Designations → + Add Designation. Enter the designation name, department it belongs to, and who it reports to.',
          },
          {
            step: 2,
            title: 'Set Salary Band',
            desc: 'Enter minimum and maximum monthly salary for this designation. This shows as a guide when adding employees.',
          },
          {
            step: 3,
            title: 'Add Responsibilities',
            desc: 'List the key responsibilities for this designation. These help HR and managers understand the role.',
          },
          {
            step: 4,
            title: 'Add KPIs',
            desc: 'Add measurable KPIs. These help in performance discussions.',
          },
          {
            step: 5,
            title: 'Add Required Skills',
            desc: 'List skills needed for this designation. Useful for hiring and appraisals.',
          },
        ],
      },
      {
        type: 'rule',
        title: 'Salary Band Validation',
        text: 'When adding an employee, if their Annual Gross Salary falls outside the designation salary band, a warning is shown. HR can still save — it is a guide, not a hard block.',
      },
      {
        type: 'rule',
        title: 'Delete Designation',
        text: 'A designation can only be deleted if 0 employees are assigned to it. The delete button shows a tooltip with the employee count if deletion is blocked.',
      },
      {
        type: 'tip',
        text: 'Use Job Architecture view in Library → Designations to see the full reporting hierarchy as a visual tree.',
      },
    ],
  },
  {
    id: 'celebrations_guide',
    icon: '🎉',
    title: 'Celebrations',
    color: 'pink',
    summary: 'Birthdays, work and wedding anniversaries',
    content: [
      {
        type: 'table',
        headers: ['Celebration', 'Icon', 'Data source', 'Who is shown'],
        rows: [
          ['Birthday', '🎂', 'Date of Birth in employee profile', 'Active and Notice Period employees only'],
          ['Work Anniversary', '🏆', 'Joining Date (must be 1+ year)', 'Active employees only'],
          ['Wedding Anniversary', '💍', 'Marriage Date (marital status = Married)', 'Active and Notice Period employees'],
        ],
      },
      {
        type: 'steps',
        items: [
          {
            step: 1,
            title: 'Today tab',
            desc: 'Shows all celebrations happening today. Check every morning.',
          },
          {
            step: 2,
            title: 'Tomorrow tab',
            desc: "Plan ahead for tomorrow's celebrations.",
          },
          {
            step: 3,
            title: 'This Week tab',
            desc: 'See all celebrations in the next 7 days.',
          },
          {
            step: 4,
            title: 'This Month tab',
            desc: 'Full month view for advance planning.',
          },
        ],
      },
      {
        type: 'rule',
        title: 'Inactive employees excluded',
        text: 'Inactive employees never appear in the Celebrations widget. Only Active and Notice Period employees are shown.',
      },
      {
        type: 'tip',
        text: 'Make sure employee Date of Birth and Marriage Date are filled in their profile for celebrations to work correctly.',
      },
    ],
  },
  {
    id: 'reports_guide',
    icon: '📊',
    title: 'Reports',
    color: 'teal',
    summary: 'All available reports and what they show',
    content: [
      {
        type: 'table',
        headers: ['Report Tab', 'Key Information'],
        rows: [
          [
            'Headcount',
            'Total, active, inactive counts. By department, branch, location, gender, employment type. Designation vacancy analysis.',
          ],
          ['Employees', 'Full employee table with filters. Export to Excel or CSV.'],
          [
            'Leave',
            'Leave by type, monthly trend, department wise. Leave balance per employee. Top 10 leave takers.',
          ],
          ['Assets', 'Total, assigned, available. By type. Consumable stock levels.'],
          ['Documents', 'Completion %. Employees with missing mandatory documents.'],
          ['Onboarding', 'Started, completed, in progress. Completion % by department.'],
          [
            'Offboarding',
            'Notice Period, Exit tasks, Withdrawn, Completed. Exit reasons. Monthly exits.',
          ],
          [
            'Compensation',
            'Total payroll, average salary, salary distribution. By department. PF/ESIC enrollment.',
          ],
        ],
      },
      {
        type: 'tip',
        text: 'All reports have a Print and Download Excel option. Offboarding Excel has 4 sheets: Notice Period, Exit In Progress, Withdrawn, Completed.',
      },
      {
        type: 'rule',
        title: 'Reports are live',
        text: 'Reports calculate from live data — no Refresh button needed. Switch between tabs and data updates automatically.',
      },
    ],
  },
  {
    id: 'session_guide',
    icon: '🔒',
    title: 'Security & Session',
    color: 'red',
    summary: 'Session rules, timeouts and security',
    content: [
      {
        type: 'table',
        headers: ['Security Feature', 'Detail'],
        rows: [
          ['Session timeout', '4 hours of inactivity → automatic sign out'],
          ['Warning', '5-minute warning banner before sign out'],
          ['Stay signed in', 'Click Stay Signed In to reset the 4-hour timer'],
          ['Activity detection', 'Mouse, keyboard, scroll, touch all reset the timer'],
          ['Google Drive session', 'Separate session — refresh when Upload buttons are disabled'],
          ['Sign out', 'Click Sign Out in the sidebar bottom at any time'],
        ],
      },
      {
        type: 'rule',
        title: 'Permanent Actions — Cannot be undone',
        text: 'Deleting an employee is permanent. Completing Offboarding and marking Inactive is permanent. Always double-check before confirming these actions.',
      },
      {
        type: 'rule',
        title: 'Inactive = Read Only Forever',
        text: 'Once an employee is marked Inactive through the offboarding process, their profile is permanently locked. The only exception is Rehire, which creates a new active tenure.',
      },
      {
        type: 'tip',
        text: 'If you are logged out due to inactivity, all your work is saved in Firestore. Nothing is lost — just sign in again.',
      },
    ],
  },
];
