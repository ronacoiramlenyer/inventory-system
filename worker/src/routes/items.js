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
  const { laboratory_id, low_stock, category } = c.req.query();
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
  if (category) {
    clauses.push('i.category = ?');
    params.push(category);
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

// No POST route here -- a new item (of any category, including Equipment)
// can only be created through the Inventory Sheet's "add row" flow
// (see inventory-counts.js), so there's exactly one place that has to
// enforce a category being chosen and stay in sync with the EMR/Stock
// Card lists that read from this table.

items.put('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const existing = await dbGet(c.env.DB, ITEM_SELECT + ' WHERE i.id = ?', id);
  if (!existing) return c.json({ error: 'Item not found' }, 404);
  if (!labAccessibleToUser(user, { department_id: existing.department_id, status: 'approved' })) {
    return c.json({ error: 'You do not have access to this item' }, 403);
  }

  const { item_name, category, unit_of_measure, reorder_level, notes, laboratory_id, serial_number, location } =
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
    `UPDATE items SET item_name = ?, category = ?, unit_of_measure = ?, reorder_level = ?, notes = ?, laboratory_id = ?,
       serial_number = ?, location = ?
     WHERE id = ?`,
    item_name?.trim() || existing.item_name,
    category?.trim() ?? existing.category,
    unit_of_measure?.trim() || existing.unit_of_measure,
    reorder_level !== undefined ? Number(reorder_level) : existing.reorder_level,
    notes?.trim() ?? existing.notes,
    targetLabId,
    serial_number?.trim() ?? existing.serial_number,
    location?.trim() ?? existing.location,
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
