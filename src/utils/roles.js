export const ROLE_PERMISSIONS = {
  admin: {
    userManagement: true,
    hrModules: true,
    teamManagement: true,
    selfService: true,
  },
  hr: {
    userManagement: false,
    hrModules: true,
    teamManagement: false,
    selfService: true,
  },
  manager: {
    userManagement: false,
    hrModules: false,
    teamManagement: true,
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

