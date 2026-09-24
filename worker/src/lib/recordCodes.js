// The ISO records register: every record the laboratories retain, by code.
//
// Two kinds sit in here. Most codes name a record the app already produces --
// the Stock Card is a record the moment an entry is written to it, an
// Incident Report the moment it is filed -- so the register points at where
// those live and counts them. R-LAB-101 and R-LAB-102 have no form behind
// them at all: the approved budget document IS the record, so those are
// filed as attachments (see record_documents).
//
// `count` is the SQL that counts one record type for the laboratories a
// person can see; `{scope}` is replaced with a department clause, or with
// 1 = 1 for an admin.
export const RECORD_CODES = [
  {
    code: 'R-LAB-101',
    name: 'Annual Approved CAPEX',
    form: null,
    kind: 'document',
    retains: 'The approved capital expenditure budget for the year, as filed.',
  },
  {
    code: 'R-LAB-102',
    name: 'Annual Approved OPEX',
    form: null,
    kind: 'document',
    retains: 'The approved operating expenditure budget for the year, as filed.',
  },
  {
    code: 'R-LAB-103',
    name: 'Preventive Maintenance Schedule (PMS)',
    form: 'F-LAB-002',
    kind: 'form',
    retains: 'Every scheduled and completed maintenance entry.',
    count: `SELECT COUNT(*) AS n FROM maintenance_schedule_items t JOIN laboratories l ON l.id = t.laboratory_id WHERE {scope}`,
    where: 'Each laboratory · Preventive Maintenance Schedule tab',
    href: '/laboratories',
  },
  {
    code: 'R-LAB-104',
    name: 'Equipment Calibration Schedule (ECS)',
    form: 'F-LAB-003',
    kind: 'form',
    retains: 'Every scheduled and completed calibration entry.',
    count: `SELECT COUNT(*) AS n FROM calibration_schedule_items t JOIN laboratories l ON l.id = t.laboratory_id WHERE {scope}`,
    where: 'Each laboratory · Equipment Calibration Schedule tab',
    href: '/laboratories',
  },
  {
    code: 'R-LAB-105',
    name: 'Equipment Work Request (EWR)',
    form: 'F-LAB-004',
    kind: 'form',
    retains: 'Each individual repair or service request and how it was resolved.',
    count: `SELECT COUNT(*) AS n FROM work_requests t JOIN laboratories l ON l.id = t.laboratory_id WHERE {scope}`,
    where: 'Open from here · every laboratory',
    href: '/work-requests',
  },
  {
    code: 'R-LAB-106',
    name: 'EWR Monitoring Sheet (EMS)',
    form: 'F-LAB-005',
    kind: 'form',
    // Same rows as R-LAB-105: the EMS is the log view of the requests, and
    // the register says so rather than pretending to a separate count.
    retains: 'The same requests as R-LAB-105, as the laboratory-level monitoring log.',
    count: `SELECT COUNT(*) AS n FROM work_requests t JOIN laboratories l ON l.id = t.laboratory_id WHERE {scope}`,
    where: 'Each laboratory · Equipment Monitoring Sheet tab',
    href: '/laboratories',
  },
  {
    code: 'R-LAB-107',
    name: 'Stock Card',
    form: 'F-LAB-006',
    kind: 'form',
    retains: 'One running IN/OUT ledger per stock item, including its closed periods.',
    count: `SELECT COUNT(*) AS n FROM items t JOIN laboratories l ON l.id = t.laboratory_id WHERE t.category != 'Equipment' AND {scope}`,
    where: 'Each laboratory · Stock Card tab',
    href: '/laboratories',
  },
  {
    code: 'R-LAB-108',
    name: 'Borrowing Request Form (BRF)',
    form: 'F-LAB-007',
    kind: 'form',
    retains: 'Each borrowing request, its approval, and the signed hardcopy.',
    count: `SELECT COUNT(*) AS n FROM borrowing_requests t JOIN laboratories l ON l.id = t.laboratory_id WHERE {scope}`,
    where: 'Open from here · every laboratory',
    href: '/borrowing-requests',
  },
  {
    code: 'R-LAB-109',
    name: 'Waste Disposal Log',
    form: 'F-LAB-008',
    kind: 'form',
    retains: 'Every turnover of laboratory waste and who received it.',
    count: `SELECT COUNT(*) AS n FROM waste_disposal_logs t JOIN laboratories l ON l.id = t.laboratory_id WHERE {scope}`,
    where: 'Each laboratory · Waste Disposal Log tab',
    href: '/laboratories',
  },
  {
    code: 'R-LAB-110',
    name: 'Laboratory Incident Report (LIR)',
    form: 'F-LAB-009',
    kind: 'form',
    retains: 'Each filed incident, its reference number, and the signed hardcopy.',
    count: `SELECT COUNT(*) AS n FROM incident_reports t JOIN laboratories l ON l.id = t.laboratory_id WHERE {scope}`,
    where: 'Each laboratory · Laboratory Incident Report tab',
    href: '/laboratories',
  },
  {
    code: 'R-LAB-111',
    name: 'Inventory Sheet',
    form: 'F-LAB-010',
    kind: 'archive',
    retains: 'Each closed inventory period, frozen as it stood at closing.',
    count: `SELECT COUNT(*) AS n FROM inventory_archives t JOIN laboratories l ON l.id = t.laboratory_id WHERE {scope}`,
    where: 'Open from here · closed periods',
    href: '/inventory-archive',
  },
  {
    code: 'R-LAB-112',
    name: 'Equipment Monitoring Record (EMR)',
    form: 'F-LAB-001',
    kind: 'form',
    retains: 'One 201 file per physical unit, with its full service history.',
    count: `SELECT COUNT(*) AS n FROM equipment_records t JOIN laboratories l ON l.id = t.laboratory_id WHERE {scope}`,
    where: 'Each laboratory · Equipment Monitoring Record tab',
    href: '/laboratories',
  },
];

// The two codes whose record is an attached document rather than a form.
export const DOCUMENT_CODES = RECORD_CODES.filter((r) => r.kind === 'document').map((r) => r.code);

export function findRecordCode(code) {
  return RECORD_CODES.find((r) => r.code === code) || null;
}
