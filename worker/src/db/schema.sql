-- Laboratory Inventory Management System schema

CREATE TABLE IF NOT EXISTS departments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,        -- e.g. "Science", "Computer"
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff', -- 'admin' | 'staff' | 'subject_coordinator' | 'secretary'
  department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL, -- required for staff/subject_coordinator, NULL for admin/secretary
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- A Secretary can cover more than one department (staff and Subject
-- Coordinators are tied to exactly one via users.department_id above; a
-- Secretary's coverage lives here instead, so she can have several).
CREATE TABLE IF NOT EXISTS secretary_departments (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, department_id)
);

CREATE INDEX IF NOT EXISTS idx_secretary_departments_dept ON secretary_departments(department_id);

CREATE TABLE IF NOT EXISTS laboratories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,               -- e.g. "Science Laboratory 2"
  department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  location TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected'
  requested_by INTEGER REFERENCES users(id),
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at TEXT,
  rejection_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(department_id, name)
);

CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  laboratory_id INTEGER NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  category TEXT,                    -- "Equipment" | "Supplies" | "Materials" | "Chemicals" | "Glassware" | "Consumables" | "Other"
  unit_of_measure TEXT NOT NULL,    -- e.g. "pcs", "bottle", "box"
  initial_balance INTEGER NOT NULL DEFAULT 0,
  reorder_level INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  serial_number TEXT,               -- meaningful for category = "Equipment" (F-LAB-001)
  location TEXT,                    -- meaningful for category = "Equipment" (F-LAB-001)
  import_batch_id TEXT,             -- set when created via bulk Import Items, so a bad batch can be deleted together
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(laboratory_id, item_name)
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  entry_date TEXT NOT NULL,         -- YYYY-MM-DD
  in_qty INTEGER NOT NULL DEFAULT 0,
  out_qty INTEGER NOT NULL DEFAULT 0,
  remarks TEXT,
  expiry_date TEXT,
  invoice_no TEXT,
  handled_by TEXT,                  -- signature / name of the person who made the entry
  is_period_marker INTEGER NOT NULL DEFAULT 0, -- 1 = visual divider row (e.g. year-end inventory count)
  -- 'txn'             a real receipt or issuance; the only kind that moves stock
  -- 'inventory_close' the annotation closing a Stock Card period. Carries no
  --                   IN or OUT: the completed F-LAB-010 is the documentary
  --                   explanation for the difference, not a fictitious entry.
  -- 'period_open'     the new period's Beginning Balance. Sets the running
  --                   balance to balance_after rather than adjusting it.
  entry_type TEXT NOT NULL DEFAULT 'txn',
  balance_after INTEGER,            -- 'period_open' only: the finalized Actual Quantity
  inventory_count_id INTEGER,       -- the F-LAB-010 session a close/open row came from
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- F-LAB-010 Inventory Sheet: a point-in-time physical count reconciled
-- against the system's recorded balance. Descriptions/units/recorded
-- quantities are snapshotted at creation time so a saved sheet doesn't
-- change retroactively if items are later renamed or edited.
-- F-LAB-010 Inventory Sheet: one row per inventory period per laboratory.
--
-- A period runs open -> counting -> for_reconciliation -> ready_to_close ->
-- closed. While it is open or counting, "Quantity as per Record" tracks the
-- live Stock Card balance; moving to for_reconciliation sets the cutoff and
-- freezes it, so the variance a signatory reviews is the one they signed
-- against. Closing is the controlled operation that archives the sheet,
-- closes every Stock Card period and opens the next one -- see the close
-- route in inventory-counts.js.
CREATE TABLE IF NOT EXISTS inventory_counts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  laboratory_id INTEGER NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  prepared_by TEXT NOT NULL,
  -- 'open' | 'counting' | 'for_reconciliation' | 'ready_to_close' | 'closed'
  status TEXT NOT NULL DEFAULT 'open',
  reference_no TEXT UNIQUE,         -- INV-YYYY-NNN, shared with the Stock Card annotation
  period_label TEXT,                -- e.g. "September 2026", for the archive listing
  inventory_date TEXT,              -- the count's own date, NOT the day it happens to be closed
  cutoff_at TEXT,                   -- when recorded quantities were frozen
  applied_at TEXT,                  -- legacy: set by the old Apply action
  applied_by INTEGER REFERENCES users(id),
  closed_at TEXT,
  closed_by INTEGER REFERENCES users(id),
  closed_by_name TEXT,              -- captured as text so the archive survives the account
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS inventory_count_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inventory_count_id INTEGER NOT NULL REFERENCES inventory_counts(id) ON DELETE CASCADE,
  item_id INTEGER REFERENCES items(id) ON DELETE SET NULL,
  item_no INTEGER NOT NULL,
  description TEXT NOT NULL,
  unit TEXT NOT NULL,
  quantity_recorded INTEGER NOT NULL,
  quantity_actual INTEGER,
  variance INTEGER,
  remarks TEXT,
  created_new_item INTEGER NOT NULL DEFAULT 0 -- 1 = this row's item didn't exist before this sheet; can be undone while draft
);

CREATE INDEX IF NOT EXISTS idx_inv_counts_lab ON inventory_counts(laboratory_id);
CREATE INDEX IF NOT EXISTS idx_inv_count_items_count ON inventory_count_items(inventory_count_id);

-- A permanent, frozen copy of a closed F-LAB-010, kept separately from the
-- live sheet so it cannot drift when item quantities or Stock Card balances
-- move afterwards. Nothing here is a foreign key into items or users on
-- purpose: an archived form has to still print correctly in five years, when
-- the item has been deleted and the custodian's account is long gone.
--
-- UNIQUE(inventory_count_id) is what makes Close Inventory idempotent: a
-- second attempt on the same session cannot produce a second archive.
CREATE TABLE IF NOT EXISTS inventory_archives (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inventory_count_id INTEGER NOT NULL UNIQUE,
  laboratory_id INTEGER NOT NULL,
  laboratory_name TEXT NOT NULL,
  department_id INTEGER,
  department_name TEXT,
  reference_no TEXT NOT NULL,
  period_label TEXT,
  inventory_date TEXT,
  conducted_by TEXT,                -- prepared_by at the moment of closing
  closed_by_name TEXT,
  closed_at TEXT NOT NULL,
  item_count INTEGER NOT NULL DEFAULT 0,
  variance_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_inv_archives_lab ON inventory_archives(laboratory_id);

CREATE TABLE IF NOT EXISTS inventory_archive_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inventory_archive_id INTEGER NOT NULL REFERENCES inventory_archives(id) ON DELETE CASCADE,
  source_item_id INTEGER,           -- deliberately not a foreign key; see above
  item_no INTEGER NOT NULL,
  description TEXT NOT NULL,
  unit TEXT NOT NULL,
  category TEXT,
  quantity_recorded INTEGER NOT NULL,
  quantity_actual INTEGER,
  variance INTEGER,
  remarks TEXT
);
CREATE INDEX IF NOT EXISTS idx_inv_archive_items_archive ON inventory_archive_items(inventory_archive_id);

-- ISO records that are documents filed against the laboratory rather than
-- forms the app generates -- today R-LAB-101 Annual Approved CAPEX and
-- R-LAB-102 Annual Approved OPEX. Every other R-LAB record is produced by a
-- form the app already holds; these two have no form behind them, so the
-- approved document itself is the record and it gets attached here.
--
-- The bytes live in file_data for the same reason as borrowing_requests'
-- signed copy: no object storage is attached to this account, so a BLOB in
-- D1 it is, capped well under the 2MB per-row limit. Any query that isn't
-- serving the file must list columns explicitly rather than using *, so an
-- ordinary listing never drags a PDF along with it.
CREATE TABLE IF NOT EXISTS record_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  record_code TEXT NOT NULL,          -- 'R-LAB-101' | 'R-LAB-102'
  department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL, -- NULL = school-wide
  title TEXT NOT NULL,
  period_label TEXT,                  -- the budget year, e.g. "SY 2026-2027"
  document_date TEXT,
  notes TEXT,
  file_key TEXT,                      -- display label, or NULL if nothing attached
  file_data BLOB,
  file_content_type TEXT,
  file_uploaded_by INTEGER REFERENCES users(id),
  file_uploaded_at TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_record_documents_code ON record_documents(record_code);

-- F-LAB-001 Equipment Registry: simple per-item equipment tracking
-- This is populated directly from items with category = "Equipment"
-- Serial numbers and locations are free-text fields on the items table

-- SPEC-05 equipment individualisation: F-LAB-010 holds equipment in
-- aggregate (one items row, "Digital Multimeter", quantity 5) but each
-- physical unit needs its own F-LAB-001 "201 file" -- its own serial
-- number, location and service history. One row here per physical unit.
--
-- Units are generated to match the item's current balance and are never
-- removed automatically: a unit that leaves the lab is retired by the
-- custodian (status = 'Retired'), because only they know which serial
-- actually went, and the 201 file has to survive as history either way.
--
-- The System Equipment ID is derived from item_id + unit_no rather than
-- stored, so it can't drift out of sync with the row it names.
CREATE TABLE IF NOT EXISTS equipment_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  laboratory_id INTEGER NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  unit_no INTEGER NOT NULL,          -- 1..N within the item
  serial_number TEXT,
  location TEXT,
  status TEXT NOT NULL DEFAULT 'Active', -- 'Active' | 'Retired'
  retired_at TEXT,
  retired_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(item_id, unit_no)
);

CREATE INDEX IF NOT EXISTS idx_equipment_records_item ON equipment_records(item_id);
CREATE INDEX IF NOT EXISTS idx_equipment_records_lab ON equipment_records(laboratory_id);

-- The service history shown on an equipment's F-LAB-001 record: one row per
-- Preventive/Repair/Calibration job, appended either by hand on that page or
-- automatically when an EWR is marked Completed (see lib/autoLogEquipment.js).
-- equipment_id points at the items row (category = 'Equipment'), matching how
-- the schedules and work_requests tables reference equipment.
CREATE TABLE IF NOT EXISTS equipment_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  equipment_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  -- Which physical unit this service was performed on. Nullable so entries
  -- logged before units existed still load; new ones always set it.
  equipment_record_id INTEGER REFERENCES equipment_records(id) ON DELETE CASCADE,
  entry_date TEXT NOT NULL,         -- YYYY-MM-DD
  service_performed TEXT NOT NULL,  -- "Preventive" | "Repair" | "Calibration" / free text
  request_id TEXT,                  -- the originating EWR's request_no, when it came from one
  status TEXT,
  logged_by TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_equipment_logs_equipment ON equipment_logs(equipment_id);
CREATE INDEX IF NOT EXISTS idx_equipment_logs_record ON equipment_logs(equipment_record_id);

-- F-LAB-002 Preventive Maintenance Schedule and F-LAB-003 Equipment
-- Calibration Schedule are identically shaped per-lab schedules, kept as
-- separate tables since they're separate official forms.
CREATE TABLE IF NOT EXISTS maintenance_schedule_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  laboratory_id INTEGER NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  item_no INTEGER NOT NULL,
  equipment_item_id INTEGER REFERENCES items(id) ON DELETE SET NULL, -- reference to inventory item (optional)
  -- Which individual unit this is scheduled for. The serial below is
  -- snapshotted from that unit's F-LAB-001 record when it's picked, so a
  -- printed schedule keeps showing the serial it was filed against.
  equipment_record_id INTEGER REFERENCES equipment_records(id) ON DELETE SET NULL,
  equipment_name_description TEXT,   -- free-text equipment name/description
  serial_number TEXT,                -- serial as at the time it was scheduled
  frequency TEXT,
  department TEXT,
  location TEXT,
  scheduled_date TEXT,
  actual_date TEXT,
  remarks TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS calibration_schedule_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  laboratory_id INTEGER NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  item_no INTEGER NOT NULL,
  equipment_item_id INTEGER REFERENCES items(id) ON DELETE SET NULL, -- reference to inventory item (optional)
  -- Which individual unit this is scheduled for. The serial below is
  -- snapshotted from that unit's F-LAB-001 record when it's picked, so a
  -- printed schedule keeps showing the serial it was filed against.
  equipment_record_id INTEGER REFERENCES equipment_records(id) ON DELETE SET NULL,
  equipment_name_description TEXT,   -- free-text equipment name/description
  serial_number TEXT,                -- serial as at the time it was scheduled
  frequency TEXT,
  department TEXT,
  location TEXT,
  scheduled_date TEXT,
  actual_date TEXT,
  remarks TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_maint_sched_lab ON maintenance_schedule_items(laboratory_id);
CREATE INDEX IF NOT EXISTS idx_calib_sched_lab ON calibration_schedule_items(laboratory_id);

-- F-LAB-004 Equipment Work Request (the official per-request form) and
-- F-LAB-005 Equipment Monitoring Sheet (the per-lab log of those same
-- requests) are two views over one underlying record.
CREATE TABLE IF NOT EXISTS work_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  laboratory_id INTEGER NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  request_no TEXT NOT NULL UNIQUE,  -- EWR-YYYY-###, auto-generated
  equipment_item_id INTEGER REFERENCES items(id) ON DELETE SET NULL, -- reference to equipment item
  -- Which individual unit the work is for. The serial below is snapshotted
  -- from that unit's F-LAB-001 record when it's picked, so a printed request
  -- keeps showing the serial it was raised against.
  equipment_record_id INTEGER REFERENCES equipment_records(id) ON DELETE SET NULL,
  equipment_name_description TEXT,   -- free-text equipment name
  serial_number TEXT,                -- serial as at the time it was raised
  date_requested TEXT NOT NULL,     -- YYYY-MM-DD
  date_needed TEXT,
  nature_of_request TEXT,           -- "Preventive" | "Repair" | "Calibration"
  detailed_description TEXT,
  requested_by TEXT,
  approved_by TEXT,
  approved_by_id INTEGER REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'Pending', -- 'Pending' | 'Approved' | 'In Progress' | 'Completed' | 'Rejected'
  date_completed TEXT,
  remarks TEXT,
  -- Set when this EWR was filed from a due PMS/ECS entry (see
  -- GET /work-requests/pending-schedule) rather than typed up ad hoc (e.g.
  -- a Repair) -- 'PMS'/'ECS' + the source row's id in that table, so the
  -- same due entry doesn't get filed as an EWR twice.
  source_type TEXT,
  source_schedule_id INTEGER,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_work_req_lab ON work_requests(laboratory_id);

-- F-LAB-007 Borrowing Request Form: one request per borrowing event, with a
-- list of items/equipment borrowed and their condition when returned.
CREATE TABLE IF NOT EXISTS borrowing_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  laboratory_id INTEGER NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  reference_no TEXT,
  borrower_name TEXT NOT NULL,
  department_unit TEXT,
  date_needed TEXT,
  purpose TEXT,
  return_date TEXT,
  approved_by TEXT,                 -- Subject Coordinator's display name at approval time
  approved_by_id INTEGER REFERENCES users(id), -- the actual account that approved it
  approved_at TEXT,
  status TEXT NOT NULL DEFAULT 'Pending', -- 'Pending' | 'Approved' | 'Returned'
  -- The real signature on this form is wet-ink, on the printed copy the
  -- borrower actually signs -- these capture a photo/scan of that signed
  -- copy as the true record, alongside (not instead of) the digital one.
  -- The bytes live in signed_copy_data (D1 has no object storage attached,
  -- so this is stored as a BLOB directly, capped well under D1's 2MB
  -- per-row limit) -- routes must select every other column explicitly
  -- rather than table.*, so an ordinary fetch never pulls this along.
  signed_copy_key TEXT,               -- display label, or NULL if none attached
  signed_copy_data BLOB,
  signed_copy_content_type TEXT,
  signed_copy_uploaded_by INTEGER REFERENCES users(id),
  signed_copy_uploaded_at TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS borrowing_request_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  borrowing_request_id INTEGER NOT NULL REFERENCES borrowing_requests(id) ON DELETE CASCADE,
  item_no INTEGER NOT NULL,
  description TEXT NOT NULL,
  equipment_id_text TEXT,   -- "Equipment ID (if applicable)" -- free text, item may not be tagged equipment
  returned_condition TEXT
);

CREATE INDEX IF NOT EXISTS idx_borrow_req_lab ON borrowing_requests(laboratory_id);
CREATE INDEX IF NOT EXISTS idx_borrow_req_items_req ON borrowing_request_items(borrowing_request_id);

-- F-LAB-008 Waste Disposal Log: a straightforward per-lab running log.
CREATE TABLE IF NOT EXISTS waste_disposal_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  laboratory_id INTEGER NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  turnover_date TEXT NOT NULL,      -- YYYY-MM-DD
  waste_description TEXT NOT NULL,
  waste_classification TEXT,
  quantity_volume TEXT,
  disposal_method TEXT,
  remarks TEXT,
  received_by TEXT,
  logged_by TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_waste_log_lab ON waste_disposal_logs(laboratory_id);

-- F-LAB-009 Laboratory Incident Report: one record per incident.
CREATE TABLE IF NOT EXISTS incident_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  laboratory_id INTEGER NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  reference_no TEXT,                -- LIR-YYYY-###, auto-generated
  incident_datetime TEXT NOT NULL,  -- free-form date & time of incident
  class_name TEXT,
  teacher TEXT,
  incident_types TEXT,              -- comma-separated selections from the checkbox list
  incident_type_other TEXT,
  individuals_involved TEXT,
  detailed_description TEXT,
  immediate_actions_taken TEXT,
  prepared_by TEXT,
  designation TEXT,
  -- Same idea as borrowing_requests.signed_copy_* -- the real signature is
  -- wet-ink from those involved, on the printed copy, not anything captured
  -- on screen.
  signed_copy_key TEXT,
  signed_copy_data BLOB,
  signed_copy_content_type TEXT,
  signed_copy_uploaded_by INTEGER REFERENCES users(id),
  signed_copy_uploaded_at TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_incident_reports_lab ON incident_reports(laboratory_id);

-- Bookstore Requisition Slip and Supplies Requisition Slip: identically
-- shaped per-lab requisition logs, kept as separate tables since they're
-- separate forms. Same Pending -> Subject Coordinator approval -> Filed ->
-- Secretary fulfillment workflow as F-LAB-004 Equipment Work Request.
CREATE TABLE IF NOT EXISTS bookstore_requisitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  laboratory_id INTEGER NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  request_date TEXT NOT NULL,       -- YYYY-MM-DD
  item_description TEXT NOT NULL,
  quantity TEXT,
  unit TEXT,
  purpose TEXT,
  requested_by TEXT,
  approved_by TEXT,                 -- Subject Coordinator who filed it
  status TEXT NOT NULL DEFAULT 'Pending', -- 'Pending' | 'Filed' | 'Released' | 'Denied'
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS supplies_requisitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  laboratory_id INTEGER NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  request_date TEXT NOT NULL,       -- YYYY-MM-DD
  item_description TEXT NOT NULL,
  quantity TEXT,
  unit TEXT,
  purpose TEXT,
  requested_by TEXT,
  approved_by TEXT,                 -- Subject Coordinator who filed it
  status TEXT NOT NULL DEFAULT 'Pending', -- 'Pending' | 'Filed' | 'Released' | 'Denied'
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_bookstore_req_lab ON bookstore_requisitions(laboratory_id);
CREATE INDEX IF NOT EXISTS idx_supplies_req_lab ON supplies_requisitions(laboratory_id);

-- BGU Minor and Major Job Request: one form covering both job classes, same
-- Pending -> Subject Coordinator approval -> Filed -> Secretary workflow.
CREATE TABLE IF NOT EXISTS bgu_job_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  laboratory_id INTEGER NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  request_date TEXT NOT NULL,       -- YYYY-MM-DD
  job_classification TEXT NOT NULL, -- 'Minor' | 'Major'
  description TEXT NOT NULL,
  requested_by TEXT,
  approved_by TEXT,                 -- Subject Coordinator who filed it
  status TEXT NOT NULL DEFAULT 'Pending', -- 'Pending' | 'Filed' | 'In Progress' | 'Completed'
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_bgu_job_req_lab ON bgu_job_requests(laboratory_id);

CREATE INDEX IF NOT EXISTS idx_users_dept ON users(department_id);
CREATE INDEX IF NOT EXISTS idx_labs_dept ON laboratories(department_id);
CREATE INDEX IF NOT EXISTS idx_labs_status ON laboratories(status);
CREATE INDEX IF NOT EXISTS idx_items_lab ON items(laboratory_id);
CREATE INDEX IF NOT EXISTS idx_items_batch ON items(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_txn_item ON transactions(item_id);
CREATE INDEX IF NOT EXISTS idx_txn_date ON transactions(item_id, entry_date, id);
