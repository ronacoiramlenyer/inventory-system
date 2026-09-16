import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'inventory.db');
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

function seed() {
  const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (userCount > 0) return;

  const adminPasswordHash = bcrypt.hashSync('admin123', 10);
  db.prepare(
    `INSERT INTO users (full_name, username, password_hash, role) VALUES (?, ?, ?, 'admin')`
  ).run('Administrator', 'admin', adminPasswordHash);
  const adminId = db.prepare('SELECT id FROM users WHERE username = ?').get('admin').id;

  const insertDept = db.prepare(`INSERT INTO departments (name) VALUES (?)`);
  const scienceDeptId = insertDept.run('Science').lastInsertRowid;
  const computerDeptId = insertDept.run('Computer').lastInsertRowid;

  const staffPasswordHash = bcrypt.hashSync('staff123', 10);
  const insertStaff = db.prepare(
    `INSERT INTO users (full_name, username, password_hash, role, department_id) VALUES (?, ?, ?, 'staff', ?)`
  );
  insertStaff.run('Science Staff', 'science_staff', staffPasswordHash, scienceDeptId);
  insertStaff.run('Computer Staff', 'computer_staff', staffPasswordHash, computerDeptId);

  const insertLab = db.prepare(
    `INSERT INTO laboratories (name, department_id, location, status, requested_by, reviewed_by, reviewed_at)
     VALUES (?, ?, ?, 'approved', ?, ?, datetime('now'))`
  );
  const scienceLabId = insertLab.run('Science Laboratory', scienceDeptId, 'Rm 201', adminId, adminId)
    .lastInsertRowid;
  const computerLabId = insertLab.run('Computer Laboratory', computerDeptId, 'Rm 305', adminId, adminId)
    .lastInsertRowid;

  const insertItem = db.prepare(
    `INSERT INTO items (laboratory_id, item_name, category, unit_of_measure, initial_balance, reorder_level, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  insertItem.run(scienceLabId, 'Test Tube', 'Glassware', 'pcs', 125, 30, '');
  insertItem.run(scienceLabId, 'Bunsen Burner', 'Equipment', 'pcs', 15, 5, '');
  insertItem.run(scienceLabId, 'Sodium Chloride', 'Reagent', 'bottle', 8, 3, '');
  insertItem.run(computerLabId, 'Wireless Mouse', 'Peripheral', 'pcs', 40, 10, '');
  insertItem.run(computerLabId, 'HDMI Cable', 'Cable', 'pcs', 20, 5, '');
  insertItem.run(computerLabId, 'Ethernet Cable (5m)', 'Cable', 'pcs', 25, 5, '');
}

seed();

export default db;
