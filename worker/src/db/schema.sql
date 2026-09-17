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
  category TEXT,                    -- e.g. "Equipment", "Reagent", "Consumable"
  unit_of_measure TEXT NOT NULL,    -- e.g. "pcs", "bottle", "box"
  initial_balance INTEGER NOT NULL DEFAULT 0,
  reorder_level INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
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
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- F-LAB-010 Inventory Sheet: a point-in-time physical count reconciled
-- against the system's recorded balance. Descriptions/units/recorded
-- quantities are snapshotted at creation time so a saved sheet doesn't
-- change retroactively if items are later renamed or edited.
CREATE TABLE IF NOT EXISTS inventory_counts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  laboratory_id INTEGER NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  prepared_by TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft', -- 'draft' | 'applied'
  applied_at TEXT,
  applied_by INTEGER REFERENCES users(id),
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

-- F-LAB-001 Equipment Monitoring Record: non-consumable equipment (as opposed
-- to the quantity-tracked `items`), each with its own service/maintenance log.
CREATE TABLE IF NOT EXISTS equipment (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  laboratory_id INTEGER NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  name_description TEXT NOT NULL,
  serial_number TEXT,
  location TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS equipment_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  equipment_id INTEGER NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  entry_date TEXT NOT NULL,         -- YYYY-MM-DD
  service_performed TEXT NOT NULL,  -- e.g. "Preventive", "Repair", "Calibration"
  request_id TEXT,                  -- reference to an F-LAB-004 Equipment Work Request (free text for now)
  status TEXT,
  logged_by TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_equipment_lab ON equipment(laboratory_id);
CREATE INDEX IF NOT EXISTS idx_equipment_logs_equipment ON equipment_logs(equipment_id);

-- F-LAB-002 Preventive Maintenance Schedule and F-LAB-003 Equipment
-- Calibration Schedule are identically shaped per-lab schedules, kept as
-- separate tables since they're separate official forms.
CREATE TABLE IF NOT EXISTS maintenance_schedule_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  laboratory_id INTEGER NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  item_no INTEGER NOT NULL,
  equipment_name_description TEXT NOT NULL,
  serial_number TEXT,
  frequency TEXT,
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
  equipment_name_description TEXT NOT NULL,
  serial_number TEXT,
  frequency TEXT,
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
  equipment_name_description TEXT NOT NULL,
  serial_number TEXT,
  date_requested TEXT NOT NULL,     -- YYYY-MM-DD
  date_needed TEXT,
  nature_of_request TEXT,           -- "Preventive" | "Repair" | "Calibration"
  detailed_description TEXT,
  requested_by TEXT,
  approved_by TEXT,
  status TEXT NOT NULL DEFAULT 'Pending', -- 'Pending' | 'Approved' | 'In Progress' | 'Completed' | 'Rejected'
  date_completed TEXT,
  remarks TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_work_req_lab ON work_requests(laboratory_id);

-- F-LAB-007 Borrowing Request Form: one request per borrowing event, with a
-- list of items/equipment borrowed and their condition when returned.
CREATE TABLE IF NOT EXISTS borrowing_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  laboratory_id INTEGER NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  borrower_name TEXT NOT NULL,
  department_unit TEXT,
  date_needed TEXT,
  purpose TEXT,
  return_date TEXT,
  approved_by TEXT,                 -- Subject Coordinator's display name at approval time
  approved_by_id INTEGER REFERENCES users(id), -- the actual account that approved it
  approved_at TEXT,
  status TEXT NOT NULL DEFAULT 'Pending', -- 'Pending' | 'Approved' | 'Returned'
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
