export const DOCUMENT_CHECKLIST = [
  {
    category: 'KYC Documents',
    mandatory: true,
    documents: [
      { id: 'pan_card', name: 'PAN Card', mandatory: true, accepts: ['.pdf', '.jpg', '.jpeg', '.png'], maxSizeMB: 5 },
      { id: 'aadhaar_card', name: 'Aadhaar Card', mandatory: true, accepts: ['.pdf', '.jpg', '.jpeg', '.png'], maxSizeMB: 5 },
      { id: 'passport', name: 'Passport', mandatory: false, accepts: ['.pdf', '.jpg', '.jpeg', '.png'], maxSizeMB: 5 },
      { id: 'voter_id', name: 'Voter ID', mandatory: false, accepts: ['.pdf', '.jpg', '.jpeg', '.png'], maxSizeMB: 5 },
      { id: 'driving_license', name: 'Driving License', mandatory: false, accepts: ['.pdf', '.jpg', '.jpeg', '.png'], maxSizeMB: 5 },
    ],
  },
  {
    category: 'Employment Documents',
    mandatory: true,
    documents: [
      { id: 'offer_letter', name: 'Offer Letter', mandatory: true, accepts: ['.pdf'], maxSizeMB: 10 },
      { id: 'appointment_letter', name: 'Appointment Letter', mandatory: true, accepts: ['.pdf'], maxSizeMB: 10 },
      { id: 'nda', name: 'NDA / Agreement', mandatory: false, accepts: ['.pdf'], maxSizeMB: 10 },
      { id: 'increment_letter', name: 'Increment Letter', mandatory: false, accepts: ['.pdf'], maxSizeMB: 5 },
    ],
  },
  {
    category: 'Education Certificates',
    mandatory: false,
    documents: [
      { id: '10th_marksheet', name: '10th Marksheet', mandatory: false, accepts: ['.pdf', '.jpg', '.jpeg', '.png'], maxSizeMB: 10 },
      { id: '12th_marksheet', name: '12th Marksheet', mandatory: false, accepts: ['.pdf', '.jpg', '.jpeg', '.png'], maxSizeMB: 10 },
      { id: 'graduation_certificate', name: 'Graduation Certificate', mandatory: false, accepts: ['.pdf', '.jpg', '.jpeg', '.png'], maxSizeMB: 10 },
      { id: 'post_graduation', name: 'Post Graduation Certificate', mandatory: false, accepts: ['.pdf', '.jpg', '.jpeg', '.png'], maxSizeMB: 10 },
      { id: 'other_education', name: 'Other Certificate', mandatory: false, accepts: ['.pdf', '.jpg', '.jpeg', '.png'], maxSizeMB: 10 },
    ],
  },
  {
    category: 'Previous Employment',
    mandatory: false,
    documents: [
      { id: 'relieving_letter', name: 'Relieving Letter', mandatory: false, accepts: ['.pdf'], maxSizeMB: 5 },
      { id: 'experience_certificate', name: 'Experience Certificate', mandatory: false, accepts: ['.pdf'], maxSizeMB: 5 },
      { id: 'last_payslip', name: 'Last 3 Months Payslips', mandatory: false, accepts: ['.pdf', '.xls', '.xlsx'], maxSizeMB: 10 },
      { id: 'form16', name: 'Form 16', mandatory: false, accepts: ['.pdf', '.xls', '.xlsx'], maxSizeMB: 10 },
    ],
  },
];

export const DOCUMENT_CATEGORIES = DOCUMENT_CHECKLIST.map((c) => c.category);

export function getMandatoryDocCount() {
  return DOCUMENT_CHECKLIST.reduce(
    (sum, cat) => sum + cat.documents.filter((d) => d.mandatory).length,
    0,
  );
}

export function getDocById(id) {
  for (const cat of DOCUMENT_CHECKLIST) {
    const doc = cat.documents.find((d) => d.id === id);
    if (doc) return { ...doc, category: cat.category };
  }
  return null;
}

export function acceptsFile(docType, fileName) {
  const d = typeof docType === 'string' ? getDocById(docType) : docType;
  if (!d?.accepts) return true;
  const ext = fileName.includes('.') ? '.' + fileName.split('.').pop().toLowerCase() : '';
  const accepts = Array.isArray(d.accepts)
    ? d.accepts
    : typeof d.accepts === 'string'
      ? d.accepts.split(',').map((x) => x.trim()).filter(Boolean)
      : [];
  if (!accepts.length) return true;
  return accepts.some((a) => a.trim().toLowerCase() === ext);
}

/** Settings UI: sections with editable names; persisted under companies/.../settings/documentTypes */
export function documentTypesToSections(legacy) {
  const list = Array.isArray(legacy) && legacy.length > 0 ? legacy : DOCUMENT_CHECKLIST;
  return list.map((cat, i) => ({
    id: `sec_${String(cat.category || 'section')
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '')}_${i}`,
    name: cat.category || 'Section',
    order: i + 1,
    mandatory: cat.mandatory !== false,
    types: Array.isArray(cat.documents) ? cat.documents.map((d) => ({ ...d })) : [],
  }));
}

/** Employee profile & company doc: flat categories with `documents` arrays */
export function sectionsToDocumentTypes(sections) {
  if (!Array.isArray(sections) || sections.length === 0) return DOCUMENT_CHECKLIST;
  return [...sections]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((s) => ({
      category: s.name,
      mandatory: s.mandatory !== false,
      documents: Array.isArray(s.types) ? s.types : [],
    }));
}
