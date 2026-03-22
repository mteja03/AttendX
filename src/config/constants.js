// AttendX Platform Configuration
export const PLATFORM_CONFIG = {
  // Platform admin email — this user gets admin role automatically on first login
  ADMIN_EMAIL: 'mteja0852@gmail.com',

  // App info
  APP_NAME: 'AttendX',
  APP_VERSION: '1.0.0',

  // Drive token expiry (55 mins in ms)
  DRIVE_TOKEN_EXPIRY_MS: 55 * 60 * 1000,

  // Roles that can upload to Drive
  DRIVE_UPLOAD_ROLES: ['admin', 'hrmanager'],

  // Pagination
  EMPLOYEES_PAGE_SIZE: 50,
};
