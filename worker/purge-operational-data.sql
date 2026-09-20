-- Clears all operational data while keeping the accounts and structure you
-- log in with: users, secretary_departments, departments and laboratories
-- are left untouched.
--
-- THIS IS NOT PART OF ANY DEPLOY. Nothing runs it automatically; it exists
-- to be run by hand, once, against a database you have exported first:
--
--   npx wrangler d1 export inventory-system-db --remote --output backup.sql
--   npx wrangler d1 execute inventory-system-db --remote --file=./purge-operational-data.sql
--
-- Order matters. D1 enforces foreign keys, and work_requests,
-- maintenance_schedule_items and calibration_schedule_items reference
-- items(id) with no ON DELETE action -- so items can only go once those
-- are gone. Everything else either cascades or nulls out.

-- Forms and requests that reference items, so they clear first.
DELETE FROM borrowing_request_items;
DELETE FROM borrowing_requests;
DELETE FROM work_requests;
DELETE FROM maintenance_schedule_items;
DELETE FROM calibration_schedule_items;

-- Standalone lab records.
DELETE FROM incident_reports;
DELETE FROM waste_disposal_logs;
DELETE FROM bookstore_requisitions;
DELETE FROM supplies_requisitions;
DELETE FROM bgu_job_requests;

-- Equipment service history, then the units it hangs off.
DELETE FROM equipment_logs;
DELETE FROM equipment_instances;

-- Inventory sheets, then stock movements, then the items themselves.
DELETE FROM inventory_count_items;
DELETE FROM inventory_counts;
DELETE FROM transactions;
DELETE FROM items;

-- Restart the id counters for the cleared tables so the fresh import reads
-- from 1 rather than continuing the old numbering. Untouched tables keep
-- theirs, which is why they're named individually here.
DELETE FROM sqlite_sequence WHERE name IN (
  'items',
  'transactions',
  'inventory_counts',
  'inventory_count_items',
  'equipment_instances',
  'equipment_logs',
  'work_requests',
  'maintenance_schedule_items',
  'calibration_schedule_items',
  'borrowing_requests',
  'borrowing_request_items',
  'incident_reports',
  'waste_disposal_logs',
  'bookstore_requisitions',
  'supplies_requisitions',
  'bgu_job_requests'
);
