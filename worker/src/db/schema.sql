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
  role TEXT NOT NULL DEFAULT 'staff', -- 'admin' | 'staff'
  department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL, -- required for staff, NULL for admin
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

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
  remarks TEXT
);

CREATE INDEX IF NOT EXISTS idx_inv_counts_lab ON inventory_counts(laboratory_id);
CREATE INDEX IF NOT EXISTS idx_inv_count_items_count ON inventory_count_items(inventory_count_id);

CREATE INDEX IF NOT EXISTS idx_users_dept ON users(department_id);
CREATE INDEX IF NOT EXISTS idx_labs_dept ON laboratories(department_id);
CREATE INDEX IF NOT EXISTS idx_labs_status ON laboratories(status);
CREATE INDEX IF NOT EXISTS idx_items_lab ON items(laboratory_id);
CREATE INDEX IF NOT EXISTS idx_txn_item ON transactions(item_id);
CREATE INDEX IF NOT EXISTS idx_txn_date ON transactions(item_id, entry_date, id);
