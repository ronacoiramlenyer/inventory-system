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
  if (userCount === 0) {
    const passwordHash = bcrypt.hashSync('admin123', 10);
    db.prepare(
      `INSERT INTO users (full_name, username, password_hash, role) VALUES (?, ?, ?, 'admin')`
    ).run('Administrator', 'admin', passwordHash);
  }

  const labCount = db.prepare('SELECT COUNT(*) AS c FROM laboratories').get().c;
  if (labCount === 0) {
    const insertLab = db.prepare(
      `INSERT INTO laboratories (name, department, location) VALUES (?, ?, ?)`
    );
    const scienceLabId = insertLab.run('Science Laboratory', 'Science', 'Rm 201').lastInsertRowid;
    const computerLabId = insertLab
      .run('Computer Laboratory', 'Computer', 'Rm 305')
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
}

seed();

export default db;
