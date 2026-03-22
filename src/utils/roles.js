export const ROLES = {
  admin: 'admin',
  hrmanager: 'hrmanager',
  manager: 'manager',
  itmanager: 'itmanager',
};

export const ROLE_LABELS = {
  admin: 'Admin',
  hrmanager: 'HR Manager',
  manager: 'Manager',
  itmanager: 'IT Manager',
};

export const ROLE_COLORS = {
  admin: 'bg-purple-100 text-purple-700',
  hrmanager: 'bg-green-100 text-green-700',
  manager: 'bg-amber-100 text-amber-700',
  itmanager: 'bg-[#C5E8E8] text-[#1B6B6B]',
};

/** Company sidebar routes by login role */
export function getNavItems(role) {
  const base = [{ to: 'dashboard', label: 'Dashboard' }];

  if (role === 'admin' || role === 'hrmanager') {
    return [
      ...base,
      { to: 'employees', label: 'Employees' },
      { to: 'leave', label: 'Leave' },
      { to: 'calendar', label: 'Calendar' },
      { to: 'documents', label: 'Documents' },
      { to: 'policies', label: 'Policies' },
      { to: 'assets', label: 'Assets' },
      { to: 'reports', label: 'Reports' },
      { to: 'team', label: 'Team Members' },
      { to: 'orgchart', label: 'Org Chart' },
      { to: 'settings', label: 'Settings' },
    ];
  }

  if (role === 'manager') {
    return [...base, { to: 'employees', label: 'My Team' }, { to: 'leave', label: 'Leave' }, { to: 'calendar', label: 'Calendar' }];
  }

  if (role === 'itmanager') {
    return [...base, { to: 'employees', label: 'Employees' }, { to: 'assets', label: 'Assets' }, { to: 'calendar', label: 'Calendar' }];
  }

  return base;
}

/** Platform-level user management (AttendX admin console only) */
export const ROLE_PERMISSIONS = {
  admin: {
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
