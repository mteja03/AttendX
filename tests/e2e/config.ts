export const TEST_COMPANY_ID = 'vwxXIWbJ4zMi2lwWcaS2';

export const BASE_URL = '';

export const URLS = {
  documents: `${BASE_URL}/company/${TEST_COMPANY_ID}/documents`,
  orgchart: `${BASE_URL}/company/${TEST_COMPANY_ID}/orgchart`,
  team: `${BASE_URL}/company/${TEST_COMPANY_ID}/team`,
  assets: `${BASE_URL}/company/${TEST_COMPANY_ID}/assets`,
  reports: `${BASE_URL}/company/${TEST_COMPANY_ID}/reports`,
  settings: `${BASE_URL}/company/${TEST_COMPANY_ID}/settings`,
  library: `${BASE_URL}/company/${TEST_COMPANY_ID}/policies`,
  calendar: `${BASE_URL}/company/${TEST_COMPANY_ID}/calendar`,
  dashboard: `/company/${TEST_COMPANY_ID}/dashboard`,
  employees: `/company/${TEST_COMPANY_ID}/employees`,
  leave:     `/company/${TEST_COMPANY_ID}/leave`,
  audit:     `/company/${TEST_COMPANY_ID}/audit`,
};

export const EMPLOYEES = {
  danielRobert:    { empId: 'EMP005', name: 'Daniel Robert',    email: 'daniel.robert@testmail.com' },
  john:            { empId: 'EMP003', name: 'John',             email: 'john.smith1@testmail.com'   },
  sarahJohnson:    { empId: 'EMP004', name: 'Sarah Johnson',    email: 'sarah.johnson@testmail.com' },
  sona:            { empId: 'EMP002', name: 'Sona',             email: 'mattapallikrishnateja123@gmail.com' },
  vineethTirukoti: { empId: 'EMP001', name: 'Vineeth tirukoti', email: 'Sona@gmail.com' },
};
