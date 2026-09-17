import { Hono } from 'hono';
import { dbAll, dbGet, dbRun } from '../db/helpers.js';
import { requireAuth } from '../middleware/auth.js';

const items = new Hono();
items.use('*', requireAuth);

const BALANCE_SUBQUERY = `
  i.initial_balance
  + COALESCE((SELECT SUM(t.in_qty) FROM transactions t WHERE t.item_id = i.id), 0)
  - COALESCE((SELECT SUM(t.out_qty) FROM transactions t WHERE t.item_id = i.id), 0)
  AS current_balance
`;

const ITEM_SELECT = `
  SELECT i.*, l.name AS laboratory_name, l.department_id, d.name AS department_name, ${BALANCE_SUBQUERY}
  FROM items i
  JOIN laboratories l ON l.id = i.laboratory_id
  JOIN departments d ON d.id = l.department_id
`;

function labAccessibleToUser(user, lab) {
  if (!lab) return false;
  if (user.role === 'admin') return true;
  return Number(lab.department_id) === Number(user.department_id) && lab.status === 'approved';
}

items.get('/', async (c) => {
  const user = c.get('user');
  const { laboratory_id, low_stock } = c.req.query();
  const clauses = [];
  const params = [];

  if (user.role !== 'admin') {
    clauses.push('l.department_id = ?', "l.status = 'approved'");
    params.push(user.department_id);
  }
  if (laboratory_id) {
    clauses.push('i.laboratory_id = ?');
    params.push(laboratory_id);
  }

  let sql = ITEM_SELECT;
  if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
  sql += ' ORDER BY i.item_name';

  let rows = await dbAll(c.env.DB, sql, ...params);
  if (low_stock === 'true') {
    rows = rows.filter((it) => it.current_balance <= it.reorder_level);
  }
  return c.json(rows);
});

items.get('/:id', async (c) => {
  const user = c.get('user');
  const item = await dbGet(c.env.DB, ITEM_SELECT + ' WHERE i.id = ?', c.req.param('id'));
  if (!item) return c.json({ error: 'Item not found' }, 404);
  if (!labAccessibleToUser(user, { department_id: item.department_id, status: 'approved' })) {
    return c.json({ error: 'You do not have access to this item' }, 403);
  }
  return c.json(item);
});

items.post('/', async (c) => {
  const user = c.get('user');
  const { laboratory_id, item_name, category, unit_of_measure, initial_balance, reorder_level, notes } =
    await c.req.json().catch(() => ({}));
  if (!laboratory_id || !item_name || !unit_of_measure) {
    return c.json({ error: 'laboratory_id, item_name and unit_of_measure are required' }, 400);
  }

  const lab = await dbGet(c.env.DB, 'SELECT * FROM laboratories WHERE id = ?', laboratory_id);
  if (!labAccessibleToUser(user, lab)) {
    return c.json({ error: 'You do not have access to that laboratory' }, 403);
  }

  try {
    const result = await dbRun(
      c.env.DB,
      `INSERT INTO items (laboratory_id, item_name, category, unit_of_measure, initial_balance, reorder_level, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      laboratory_id,
      item_name.trim(),
      category?.trim() || null,
      unit_of_measure.trim(),
      Number(initial_balance) || 0,
      Number(reorder_level) || 0,
      notes?.trim() || null
    );
    return c.json(await dbGet(c.env.DB, ITEM_SELECT + ' WHERE i.id = ?', result.lastInsertRowid), 201);
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      return c.json({ error: 'That item already exists in this laboratory' }, 409);
    }
    return c.json({ error: 'Failed to create item' }, 500);
  }
});

items.put('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const existing = await dbGet(c.env.DB, ITEM_SELECT + ' WHERE i.id = ?', id);
  if (!existing) return c.json({ error: 'Item not found' }, 404);
  if (!labAccessibleToUser(user, { department_id: existing.department_id, status: 'approved' })) {
    return c.json({ error: 'You do not have access to this item' }, 403);
  }

  const { item_name, category, unit_of_measure, reorder_level, notes, laboratory_id } =
    await c.req.json().catch(() => ({}));
  let targetLabId = existing.laboratory_id;
  if (laboratory_id && Number(laboratory_id) !== existing.laboratory_id) {
    const targetLab = await dbGet(c.env.DB, 'SELECT * FROM laboratories WHERE id = ?', laboratory_id);
    if (!labAccessibleToUser(user, targetLab)) {
      return c.json({ error: 'You do not have access to the target laboratory' }, 403);
    }
    targetLabId = laboratory_id;
  }

  await dbRun(
    c.env.DB,
    `UPDATE items SET item_name = ?, category = ?, unit_of_measure = ?, reorder_level = ?, notes = ?, laboratory_id = ?
     WHERE id = ?`,
    item_name?.trim() || existing.item_name,
    category?.trim() ?? existing.category,
    unit_of_measure?.trim() || existing.unit_of_measure,
    reorder_level !== undefined ? Number(reorder_level) : existing.reorder_level,
    notes?.trim() ?? existing.notes,
    targetLabId,
    id
  );
  return c.json(await dbGet(c.env.DB, ITEM_SELECT + ' WHERE i.id = ?', id));
});

// Deleting an item wipes its whole stock card history, so only admin can.
items.delete('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  if (user.role !== 'admin') {
    return c.json({ error: 'Only an admin can delete an item' }, 403);
  }
  const existing = await dbGet(c.env.DB, ITEM_SELECT + ' WHERE i.id = ?', id);
  if (!existing) return c.json({ error: 'Item not found' }, 404);
  await dbRun(c.env.DB, 'DELETE FROM items WHERE id = ?', id);
  return c.body(null, 204);
});

export default items;
