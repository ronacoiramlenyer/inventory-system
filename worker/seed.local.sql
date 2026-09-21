-- Starter data for a brand-new database. Every statement is INSERT OR
-- IGNORE against a UNIQUE column (users.username, departments.name,
-- laboratories(department_id,name), items(laboratory_id,item_name)), so
-- re-running this on a database already in use is a no-op and never
-- overwrites or removes real lab data.

INSERT OR IGNORE INTO users (full_name, username, password_hash, role) VALUES
  ('Administrator', 'admin', '$2b$10$VqCufdFFVTqoimYNqaaffelLTx6rRyRPVthlt7c6DrgN8aqb1INiS', 'admin');

INSERT OR IGNORE INTO departments (name) VALUES ('Science'), ('Computer');

INSERT OR IGNORE INTO users (full_name, username, password_hash, role, department_id) VALUES
  ('Science Staff', 'science_staff', '$2b$10$mSbqKE76U.LwKRNQbPO12OpqM9ckTkQO0KKO7mlmocJLnwyC0HSLu', 'staff', 1),
  ('Computer Staff', 'computer_staff', '$2b$10$mSbqKE76U.LwKRNQbPO12OpqM9ckTkQO0KKO7mlmocJLnwyC0HSLu', 'staff', 2);

INSERT OR IGNORE INTO laboratories (name, department_id, location, status, requested_by, reviewed_by, reviewed_at) VALUES
  ('Science Laboratory', 1, 'Rm 201', 'approved', 1, 1, datetime('now')),
  ('Computer Laboratory', 2, 'Rm 305', 'approved', 1, 1, datetime('now'));

INSERT OR IGNORE INTO items (laboratory_id, item_name, category, unit_of_measure, initial_balance, reorder_level, notes) VALUES
  (1, 'Test Tube', 'Tools & Materials', 'pcs', 125, 30, ''),
  (1, 'Bunsen Burner', 'Equipment', 'pcs', 15, 5, ''),
  (1, 'Sodium Chloride', 'Consumables', 'bottle', 8, 3, ''),
  (2, 'Wireless Mouse', 'Equipment', 'pcs', 40, 10, ''),
  (2, 'HDMI Cable', 'Supplies', 'pcs', 20, 5, ''),
  (2, 'Ethernet Cable (5m)', 'Supplies', 'pcs', 25, 5, '');
