-- Reset database: completely empty all tables for fresh start
-- This is useful after development with orphaned/inconsistent data

PRAGMA foreign_keys = OFF;

-- Truncate all data tables (child tables first, respecting FK constraints)
DELETE FROM secretary_departments;
DELETE FROM work_requests;
DELETE FROM bookstore_requisitions;
DELETE FROM supplies_requisitions;
DELETE FROM bgu_job_requests;
DELETE FROM borrowing_requests;
DELETE FROM equipment_logs;
DELETE FROM inventory_count_rows;
DELETE FROM inventory_counts;
DELETE FROM transactions;
DELETE FROM items;
DELETE FROM users;
DELETE FROM laboratories;
DELETE FROM departments;

-- Reset auto-increment counters
DELETE FROM sqlite_sequence;

PRAGMA foreign_keys = ON;
