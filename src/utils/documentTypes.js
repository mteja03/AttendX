export const DOCUMENT_CHECKLIST = [
  {
    category: 'KYC Documents',
    mandatory: true,
    documents: [
      { id: 'pan_card', name: 'PAN Card', mandatory: true, accepts: '.pdf,.jpg,.jpeg,.png' },
      { id: 'aadhaar_card', name: 'Aadhaar Card', mandatory: true, accepts: '.pdf,.jpg,.jpeg,.png' },
      { id: 'passport', name: 'Passport', mandatory: false, accepts: '.pdf,.jpg,.jpeg,.png' },
      { id: 'voter_id', name: 'Voter ID', mandatory: false, accepts: '.pdf,.jpg,.jpeg,.png' },
      { id: 'driving_license', name: 'Driving License', mandatory: false, accepts: '.pdf,.jpg,.jpeg,.png' },
    ],
  },
  {
    category: 'Employment Documents',
    mandatory: true,
    documents: [
      { id: 'offer_letter', name: 'Offer Letter', mandatory: true, accepts: '.pdf' },
      { id: 'appointment_letter', name: 'Appointment Letter', mandatory: true, accepts: '.pdf' },
      { id: 'nda', name: 'NDA / Agreement', mandatory: false, accepts: '.pdf' },
      { id: 'increment_letter', name: 'Increment Letter', mandatory: false, accepts: '.pdf' },
    ],
  },
  {
    category: 'Education Certificates',
    mandatory: false,
    documents: [
      { id: '10th_marksheet', name: '10th Marksheet', mandatory: false, accepts: '.pdf,.jpg,.jpeg,.png' },
      { id: '12th_marksheet', name: '12th Marksheet', mandatory: false, accepts: '.pdf,.jpg,.jpeg,.png' },
      { id: 'graduation_certificate', name: 'Graduation Certificate', mandatory: false, accepts: '.pdf,.jpg,.jpeg,.png' },
      { id: 'post_graduation', name: 'Post Graduation Certificate', mandatory: false, accepts: '.pdf,.jpg,.jpeg,.png' },
      { id: 'other_education', name: 'Other Certificate', mandatory: false, accepts: '.pdf,.jpg,.jpeg,.png' },
    ],
  },
  {
    category: 'Previous Employment',
    mandatory: false,
    documents: [
      { id: 'relieving_letter', name: 'Relieving Letter', mandatory: false, accepts: '.pdf' },
      { id: 'experience_certificate', name: 'Experience Certificate', mandatory: false, accepts: '.pdf' },
      { id: 'last_payslip', name: 'Last 3 Months Payslips', mandatory: false, accepts: '.pdf' },
      { id: 'form16', name: 'Form 16', mandatory: false, accepts: '.pdf' },
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
  return d.accepts.split(',').some((a) => a.trim().toLowerCase() === ext);
}
