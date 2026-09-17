import { Hono } from 'hono';
import { dbAll, dbGet, dbRun } from '../db/helpers.js';
import { requireAuth } from '../middleware/auth.js';

// Bookstore Requisition Slip and Supplies Requisition Slip are identically
// shaped per-lab requisition logs, so both routers are built from this one
// factory, parametrized by their (fixed, hardcoded) table name.
export function createRequisitionRoutes(table) {
  const router = new Hono();
  router.use('*', requireAuth);

  const SELECT = `
    SELECT r.*, l.name AS laboratory_name, l.department_id, l.status AS lab_status, d.name AS department_name
    FROM ${table} r
    JOIN laboratories l ON l.id = r.laboratory_id
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

  router.get('/', async (c) => {
    const user = c.get('user');
    const { laboratory_id } = c.req.query();
    const clauses = [];
    const params = [];

    if (user.role !== 'admin') {
      clauses.push('l.department_id = ?', "l.status = 'approved'");
      params.push(user.department_id);
    }
    if (laboratory_id) {
      clauses.push('r.laboratory_id = ?');
      params.push(laboratory_id);
    }

    let sql = SELECT;
    if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
    sql += ' ORDER BY r.request_date DESC, r.id DESC';

    return c.json(await dbAll(c.env.DB, sql, ...params));
  });

  router.post('/', async (c) => {
    const user = c.get('user');
    const { laboratory_id, request_date, item_description, quantity, unit, purpose, requested_by } =
      await c.req.json().catch(() => ({}));
    if (!laboratory_id || !request_date || !item_description?.trim()) {
      return c.json({ error: 'laboratory_id, request_date and item_description are required' }, 400);
    }

    const lab = await dbGet(c.env.DB, 'SELECT * FROM laboratories WHERE id = ?', laboratory_id);
    if (!labAccessibleToUser(user, lab)) {
      return c.json({ error: 'You do not have access to that laboratory' }, 403);
    }

    const result = await dbRun(
      c.env.DB,
      `INSERT INTO ${table} (laboratory_id, request_date, item_description, quantity, unit, purpose, requested_by, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      laboratory_id,
      request_date,
      item_description.trim(),
      quantity?.trim() || null,
      unit?.trim() || null,
      purpose?.trim() || null,
      requested_by?.trim() || user.full_name,
      user.id
    );
    return c.json(await dbGet(c.env.DB, SELECT + ' WHERE r.id = ?', result.lastInsertRowid), 201);
  });

  router.put('/:id', async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');
    const existing = await dbGet(c.env.DB, SELECT + ' WHERE r.id = ?', id);
    if (!existing) return c.json({ error: 'Not found' }, 404);
    if (!userCanAccessRow(user, existing)) {
      return c.json({ error: 'You do not have access to this requisition' }, 403);
    }

    const { request_date, item_description, quantity, unit, purpose, requested_by, status } =
      await c.req.json().catch(() => ({}));

    await dbRun(
      c.env.DB,
      `UPDATE ${table} SET request_date = ?, item_description = ?, quantity = ?, unit = ?, purpose = ?,
         requested_by = ?, status = ? WHERE id = ?`,
      request_date || existing.request_date,
      item_description?.trim() || existing.item_description,
      quantity?.trim() ?? existing.quantity,
      unit?.trim() ?? existing.unit,
      purpose?.trim() ?? existing.purpose,
      requested_by?.trim() ?? existing.requested_by,
      status || existing.status,
      id
    );
    return c.json(await dbGet(c.env.DB, SELECT + ' WHERE r.id = ?', id));
  });

  router.delete('/:id', async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');
    const existing = await dbGet(c.env.DB, SELECT + ' WHERE r.id = ?', id);
    if (!existing) return c.json({ error: 'Not found' }, 404);
    if (!userCanAccessRow(user, existing)) {
      return c.json({ error: 'You do not have access to this requisition' }, 403);
    }
    await dbRun(c.env.DB, `DELETE FROM ${table} WHERE id = ?`, id);
    return c.body(null, 204);
  });

  return router;
}

export const bookstoreRequisitionRoutes = createRequisitionRoutes('bookstore_requisitions');
export const suppliesRequisitionRoutes = createRequisitionRoutes('supplies_requisitions');
