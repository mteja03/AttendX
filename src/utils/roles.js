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
  itmanager: 'bg-blue-100 text-blue-700',
};

/** Company sidebar routes by login role */
export function getNavItems(role) {
  const base = [{ to: 'dashboard', label: 'Dashboard' }];

  if (role === 'admin' || role === 'hrmanager') {
    return [
      ...base,
      { to: 'employees', label: 'Employees' },
      { to: 'leave', label: 'Leave' },
      { to: 'documents', label: 'Documents' },
      { to: 'assets', label: 'Assets' },
      { to: 'team', label: 'Team Members' },
      { to: 'settings', label: 'Settings' },
    ];
  }

  if (role === 'manager') {
    return [...base, { to: 'employees', label: 'My Team' }, { to: 'leave', label: 'Leave' }];
  }

  if (role === 'itmanager') {
    return [...base, { to: 'employees', label: 'Employees' }, { to: 'assets', label: 'Assets' }];
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
