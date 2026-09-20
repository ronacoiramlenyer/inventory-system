-- Create equipment_instances table to track individual equipment units
-- Each instance represents one physical piece of equipment with its own serial number

CREATE TABLE IF NOT EXISTS equipment_instances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  serial_number TEXT NOT NULL,
  location TEXT,
  status TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(item_id, serial_number)
);

CREATE INDEX IF NOT EXISTS idx_equipment_instances_item ON equipment_instances(item_id);
