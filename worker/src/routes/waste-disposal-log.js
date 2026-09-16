import { Hono } from 'hono';
import { dbAll, dbGet, dbRun } from '../db/helpers.js';
import { requireAuth } from '../middleware/auth.js';

// F-LAB-008 Waste Disposal Log: a straightforward per-lab running log.
const wasteDisposalLog = new Hono();
wasteDisposalLog.use('*', requireAuth);

const SELECT = `
  SELECT w.*, l.name AS laboratory_name, l.department_id, l.status AS lab_status, d.name AS department_name
  FROM waste_disposal_logs w
  JOIN laboratories l ON l.id = w.laboratory_id
  JOIN departments d ON d.id = l.department_id
`;

function labAccessibleToUser(user, lab) {
  if (!lab) return false;
  if (user.role === 'admin') return true;
  return Number(lab.department_id) === Number(user.department_id) && lab.status === 'approved';
}

function userCanAccessRow(user, row) {
  if (!row) return false;
  if (user.role === 'admin') return true;
  return Number(row.department_id) === Number(user.department_id) && row.lab_status === 'approved';
}

wasteDisposalLog.get('/', async (c) => {
  const user = c.get('user');
  const { laboratory_id } = c.req.query();
  const clauses = [];
  const params = [];

  if (user.role !== 'admin') {
    clauses.push('l.department_id = ?', "l.status = 'approved'");
    params.push(user.department_id);
  }
  if (laboratory_id) {
    clauses.push('w.laboratory_id = ?');
    params.push(laboratory_id);
  }

  let sql = SELECT;
  if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
  sql += ' ORDER BY w.turnover_date ASC, w.id ASC';

  return c.json(await dbAll(c.env.DB, sql, ...params));
});

wasteDisposalLog.post('/', async (c) => {
  const user = c.get('user');
  const {
    laboratory_id,
    turnover_date,
    waste_description,
    waste_classification,
    quantity_volume,
    disposal_method,
    remarks,
    received_by,
    logged_by,
  } = await c.req.json().catch(() => ({}));

  if (!laboratory_id || !turnover_date || !waste_description?.trim()) {
    return c.json({ error: 'laboratory_id, turnover_date and waste_description are required' }, 400);
  }

  const lab = await dbGet(c.env.DB, 'SELECT * FROM laboratories WHERE id = ?', laboratory_id);
  if (!labAccessibleToUser(user, lab)) {
    return c.json({ error: 'You do not have access to that laboratory' }, 403);
  }

  const result = await dbRun(
    c.env.DB,
    `INSERT INTO waste_disposal_logs
      (laboratory_id, turnover_date, waste_description, waste_classification, quantity_volume, disposal_method,
       remarks, received_by, logged_by, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    laboratory_id,
    turnover_date,
    waste_description.trim(),
    waste_classification?.trim() || null,
    quantity_volume?.trim() || null,
    disposal_method?.trim() || null,
    remarks?.trim() || null,
    received_by?.trim() || null,
    logged_by?.trim() || user.full_name,
    user.id
  );
  return c.json(await dbGet(c.env.DB, SELECT + ' WHERE w.id = ?', result.lastInsertRowid), 201);
});

wasteDisposalLog.delete('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const existing = await dbGet(c.env.DB, SELECT + ' WHERE w.id = ?', id);
  if (!existing) return c.json({ error: 'Not found' }, 404);
  if (!userCanAccessRow(user, existing)) {
    return c.json({ error: 'You do not have access to this entry' }, 403);
  }
  await dbRun(c.env.DB, 'DELETE FROM waste_disposal_logs WHERE id = ?', id);
  return c.body(null, 204);
});

export default wasteDisposalLog;
