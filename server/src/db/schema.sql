-- Laboratory Inventory Management System schema

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff', -- 'admin' | 'staff'
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS laboratories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,        -- e.g. "Science Laboratory"
  department TEXT NOT NULL,         -- e.g. "Science", "Computer"
  location TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
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

CREATE INDEX IF NOT EXISTS idx_items_lab ON items(laboratory_id);
CREATE INDEX IF NOT EXISTS idx_txn_item ON transactions(item_id);
CREATE INDEX IF NOT EXISTS idx_txn_date ON transactions(item_id, entry_date, id);
