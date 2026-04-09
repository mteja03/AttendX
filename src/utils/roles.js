export const ROLES = {
  admin: 'admin',
  companyadmin: 'companyadmin',
  hrmanager: 'hrmanager',
  manager: 'manager',
  itmanager: 'itmanager',
  auditmanager: 'auditmanager',
  auditor: 'auditor',
};

export const ROLE_LABELS = {
  admin: 'Admin',
  companyadmin: 'Company Admin',
  hrmanager: 'HR Manager',
  manager: 'Manager',
  itmanager: 'IT Manager',
  auditmanager: 'Audit Manager',
  auditor: 'Auditor',
};

export const ROLE_COLORS = {
  admin: 'bg-purple-100 text-purple-700',
  companyadmin: 'bg-indigo-100 text-indigo-700',
  hrmanager: 'bg-green-100 text-green-700',
  manager: 'bg-amber-100 text-amber-700',
  itmanager: 'bg-[#C5E8E8] text-[#1B6B6B]',
  auditmanager: 'bg-blue-100 text-blue-700',
  auditor: 'bg-teal-100 text-teal-700',
};

export const ALL_NAV_ITEMS = [
  { to: 'dashboard', label: 'Dashboard' },
  { to: 'employees', label: 'Employees' },
  { to: 'leave', label: 'Leave' },
  { to: 'calendar', label: 'Calendar' },
  { to: 'documents', label: 'Documents' },
  { to: 'policies', label: 'Library' },
  { to: 'assets', label: 'Assets' },
  { to: 'reports', label: 'Reports' },
  { to: 'audit', label: 'Audit' },
  { to: 'team', label: 'Team Members' },
  { to: 'orgchart', label: 'Org Chart' },
  { to: 'settings', label: 'Settings' },
];

export const DEFAULT_PERMISSIONS = {
  admin: null,
  companyadmin: null,
  hrmanager: {
    employees: true,
    leave: true,
    calendar: true,
    documents: true,
    policies: true,
    assets: true,
    reports: true,
    audit: false,
    team: true,
    orgchart: true,
    settings: true,
  },
  manager: {
    employees: false,
    leave: true,
    calendar: true,
    documents: false,
    policies: false,
    assets: false,
    reports: true,
    audit: false,
    team: false,
    orgchart: true,
    settings: false,
  },
  itmanager: {
    employees: false,
    leave: false,
    calendar: true,
    documents: false,
    policies: false,
    assets: true,
    reports: true,
    audit: false,
    team: false,
    orgchart: false,
    settings: false,
  },
  auditmanager: {
    employees: false,
    leave: false,
    calendar: false,
    documents: false,
    policies: false,
    assets: false,
    reports: false,
    audit: true,
    team: false,
    orgchart: false,
    settings: false,
  },
  auditor: {
    employees: false,
    leave: false,
    calendar: false,
    documents: false,
    policies: false,
    assets: false,
    reports: false,
    audit: true,
    team: false,
    orgchart: false,
    settings: false,
  },
};

/** Company sidebar routes using role defaults + permissions */
export function getNavItems(role) {
  const effectivePermissions = DEFAULT_PERMISSIONS[role] ?? {};
  return ALL_NAV_ITEMS.filter((item) => {
    if (role === 'admin' || role === 'companyadmin') return true;
    if (item.to === 'dashboard') return true;
    return effectivePermissions[item.to] !== false;
  });
}

/** Platform-level user management (AttendX admin console only) */
export const ROLE_PERMISSIONS = {
  admin: {
    userManagement: true,
    hrModules: true,
    teamManagement: true,
    selfService: true,
  },
  companyadmin: {
    userManagement: true,
    hrModules: true,
    teamManagement: true,
    selfService: true,
  },
  hrmanager: {
    userManagement: false,
    hrModules: true,
    teamManagement: true,
    selfService: true,
  },
  manager: {
    userManagement: false,
    hrModules: false,
    teamManagement: true,
    selfService: true,
  },
  itmanager: {
    userManagement: false,
    hrModules: false,
    teamManagement: false,
    selfService: true,
  },
  auditmanager: {
    userManagement: false,
    hrModules: false,
    teamManagement: false,
    selfService: true,
  },
  auditor: {
    userManagement: false,
    hrModules: false,
    teamManagement: false,
    selfService: true,
  },
  employee: {
    userManagement: false,
    hrModules: false,
    teamManagement: false,
    selfService: true,
  },
};

export function canAccessUserManagement(role) {
  return ROLE_PERMISSIONS[role]?.userManagement === true;
}
