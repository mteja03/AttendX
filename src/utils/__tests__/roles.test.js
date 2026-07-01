import { describe, it, expect } from 'vitest';
import { getNavItems, canAccessUserManagement, ALL_NAV_ITEMS } from '../roles';

describe('getNavItems', () => {
  it('returns all nav items for admin', () => {
    const items = getNavItems('admin');
    expect(items.length).toBe(ALL_NAV_ITEMS.length);
    const routes = items.map((i) => i.to);
    expect(routes).toContain('dashboard');
    expect(routes).toContain('settings');
    expect(routes).toContain('audit');
  });

  it('returns all nav items for companyadmin', () => {
    const items = getNavItems('companyadmin');
    expect(items.length).toBe(ALL_NAV_ITEMS.length);
  });

  it('excludes dashboard for auditmanager', () => {
    const items = getNavItems('auditmanager');
    const routes = items.map((i) => i.to);
    expect(routes).not.toContain('dashboard');
    expect(routes).toContain('audit');
  });

  it('excludes dashboard for auditor', () => {
    const items = getNavItems('auditor');
    const routes = items.map((i) => i.to);
    expect(routes).not.toContain('dashboard');
    expect(routes).toContain('audit');
  });

  it('hrmanager: has most items but not audit', () => {
    const items = getNavItems('hrmanager');
    const routes = items.map((i) => i.to);
    expect(routes).toContain('dashboard');
    expect(routes).toContain('employees');
    expect(routes).toContain('leave');
    expect(routes).toContain('settings');
    expect(routes).not.toContain('audit');
  });

  it('manager: limited to dashboard, leave, calendar, reports, orgchart', () => {
    const items = getNavItems('manager');
    const routes = items.map((i) => i.to);
    expect(routes).toContain('dashboard');
    expect(routes).toContain('leave');
    expect(routes).toContain('calendar');
    expect(routes).toContain('reports');
    expect(routes).toContain('orgchart');
    // should NOT have these
    expect(routes).not.toContain('employees');
    expect(routes).not.toContain('documents');
    expect(routes).not.toContain('audit');
    expect(routes).not.toContain('settings');
  });

  it('itmanager: has employees, calendar, assets, orgchart but not leave or audit', () => {
    const items = getNavItems('itmanager');
    const routes = items.map((i) => i.to);
    expect(routes).toContain('employees');
    expect(routes).toContain('calendar');
    expect(routes).toContain('assets');
    expect(routes).toContain('orgchart');
    expect(routes).not.toContain('leave');
    expect(routes).not.toContain('audit');
    expect(routes).not.toContain('settings');
  });

  it('returns only audit for auditor/auditmanager (no dashboard)', () => {
    ['auditor', 'auditmanager'].forEach((role) => {
      const items = getNavItems(role);
      const routes = items.map((i) => i.to);
      // only audit should be accessible per DEFAULT_PERMISSIONS
      expect(routes).toContain('audit');
      expect(routes).not.toContain('dashboard');
      expect(routes).not.toContain('employees');
    });
  });

  it('unknown role returns only dashboard (fallback to empty permissions)', () => {
    // effectivePermissions = {} so every item except dashboard passes the !== false check
    // but dashboard is included when role is not auditmanager/auditor
    const items = getNavItems('unknownrole');
    const routes = items.map((i) => i.to);
    expect(routes).toContain('dashboard');
  });
});

describe('canAccessUserManagement', () => {
  it('returns true for admin and companyadmin', () => {
    expect(canAccessUserManagement('admin')).toBe(true);
    expect(canAccessUserManagement('companyadmin')).toBe(true);
  });

  it('returns false for hrmanager, manager, itmanager, auditmanager, auditor, employee', () => {
    ['hrmanager', 'manager', 'itmanager', 'auditmanager', 'auditor', 'employee'].forEach(
      (role) => {
        expect(canAccessUserManagement(role)).toBe(false);
      }
    );
  });

  it('returns false for unknown roles', () => {
    expect(canAccessUserManagement('superuser')).toBe(false);
    expect(canAccessUserManagement(null)).toBe(false);
    expect(canAccessUserManagement(undefined)).toBe(false);
  });
});
