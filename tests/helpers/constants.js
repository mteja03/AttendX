'use strict'

const COMPANY_ID = 'AomMUi1UlooVtPt8nvso'
const BASE = 'https://attendx-1cccb.web.app'
const COMPANY_BASE = `${BASE}/company/${COMPANY_ID}`

const URLS = {
  companies: `${BASE}/companies`,
  dashboard: `${COMPANY_BASE}/dashboard`,
  employees: `${COMPANY_BASE}/employees`,
  leave: `${COMPANY_BASE}/leave`,
  assets: `${COMPANY_BASE}/assets`,
  reports: `${COMPANY_BASE}/reports`,
  settings: `${COMPANY_BASE}/settings`,
  calendar: `${COMPANY_BASE}/calendar`,
  orgchart: `${COMPANY_BASE}/orgchart`,
  library: `${COMPANY_BASE}/policies`,
  team: `${COMPANY_BASE}/team`,
}

module.exports = {
  COMPANY_ID,
  BASE,
  COMPANY_BASE,
  URLS,
}
