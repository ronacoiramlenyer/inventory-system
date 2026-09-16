import { Hono } from 'hono';
import { dbAll, dbGet, dbRun } from '../db/helpers.js';
import { requireAuth } from '../middleware/auth.js';

// Mounted at '/' from index.js, alongside items/laboratories routes, so it
// can serve both /items/:itemId/... and /transactions/:id.
const transactions = new Hono();
transactions.use('*', requireAuth);

async function getItemWithLab(db, itemId) {
  return dbGet(
    db,
    `SELECT i.*, l.name AS laboratory_name, l.department_id, l.status AS lab_status, d.name AS department_name
     FROM items i
     JOIN laboratories l ON l.id = i.laboratory_id
     JOIN departments d ON d.id = l.department_id
     WHERE i.id = ?`,
    itemId
  );
}

function userCanAccessItem(user, item) {
  if (!item) return false;
  if (user.role === 'admin') return true;
  return Number(item.department_id) === Number(user.department_id) && item.lab_status === 'approved';
}

async function computeStockCard(db, itemId) {
  const item = await getItemWithLab(db, itemId);
  if (!item) return null;

  const rows = await dbAll(
    db,
    `SELECT * FROM transactions WHERE item_id = ? ORDER BY entry_date ASC, id ASC`,
    itemId
  );

  let balance = item.initial_balance;
  const entries = rows.map((row) => {
    const beginning_balance = balance;
    if (!row.is_period_marker) {
      balance = balance + row.in_qty - row.out_qty;
    }
    return {
      ...row,
      beginning_balance,
      ending_balance: row.is_period_marker ? beginning_balance : balance,
    };
  });

  return { item, initial_balance: item.initial_balance, current_balance: balance, entries };
}

transactions.get('/items/:itemId/stock-card', async (c) => {
  const user = c.get('user');
  const item = await getItemWithLab(c.env.DB, c.req.param('itemId'));
  if (!item) return c.json({ error: 'Item not found' }, 404);
  if (!userCanAccessItem(user, item)) {
    return c.json({ error: 'You do not have access to this item' }, 403);
  }
  return c.json(await computeStockCard(c.env.DB, c.req.param('itemId')));
});

transactions.get('/items/:itemId/transactions', async (c) => {
  const user = c.get('user');
  const item = await getItemWithLab(c.env.DB, c.req.param('itemId'));
  if (!item) return c.json({ error: 'Item not found' }, 404);
  if (!userCanAccessItem(user, item)) {
    return c.json({ error: 'You do not have access to this item' }, 403);
  }
  const card = await computeStockCard(c.env.DB, c.req.param('itemId'));
  return c.json(card.entries);
});

transactions.post('/items/:itemId/transactions', async (c) => {
  const user = c.get('user');
  const itemId = c.req.param('itemId');
  const item = await getItemWithLab(c.env.DB, itemId);
  if (!item) return c.json({ error: 'Item not found' }, 404);
  if (!userCanAccessItem(user, item)) {
    return c.json({ error: 'You do not have access to this item' }, 403);
  }

  const { entry_date, in_qty, out_qty, remarks, expiry_date, invoice_no, handled_by, is_period_marker } =
    await c.req.json().catch(() => ({}));

  if (!entry_date) return c.json({ error: 'entry_date is required' }, 400);

  const inQty = Number(in_qty) || 0;
  const outQty = Number(out_qty) || 0;
  if (inQty < 0 || outQty < 0) {
    return c.json({ error: 'Quantities cannot be negative' }, 400);
  }
  if (!is_period_marker && inQty === 0 && outQty === 0) {
    return c.json({ error: 'Provide an IN or OUT quantity' }, 400);
  }

  const result = await dbRun(
    c.env.DB,
    `INSERT INTO transactions
      (item_id, entry_date, in_qty, out_qty, remarks, expiry_date, invoice_no, handled_by, is_period_marker, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    itemId,
    entry_date,
    inQty,
    outQty,
    remarks?.trim() || null,
    expiry_date || null,
    invoice_no?.trim() || null,
    handled_by?.trim() || user.full_name,
    is_period_marker ? 1 : 0,
    user.id
  );

  return c.json(await dbGet(c.env.DB, 'SELECT * FROM transactions WHERE id = ?', result.lastInsertRowid), 201);
});

transactions.put('/transactions/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const existing = await dbGet(c.env.DB, 'SELECT * FROM transactions WHERE id = ?', id);
  if (!existing) return c.json({ error: 'Transaction not found' }, 404);
  const item = await getItemWithLab(c.env.DB, existing.item_id);
  if (!userCanAccessItem(user, item)) {
    return c.json({ error: 'You do not have access to this item' }, 403);
  }

  const { entry_date, in_qty, out_qty, remarks, expiry_date, invoice_no, handled_by, is_period_marker } =
    await c.req.json().catch(() => ({}));

  await dbRun(
    c.env.DB,
    `UPDATE transactions SET entry_date = ?, in_qty = ?, out_qty = ?, remarks = ?, expiry_date = ?,
       invoice_no = ?, handled_by = ?, is_period_marker = ? WHERE id = ?`,
    entry_date || existing.entry_date,
    in_qty !== undefined ? Number(in_qty) || 0 : existing.in_qty,
    out_qty !== undefined ? Number(out_qty) || 0 : existing.out_qty,
    remarks?.trim() ?? existing.remarks,
    expiry_date ?? existing.expiry_date,
    invoice_no?.trim() ?? existing.invoice_no,
    handled_by?.trim() ?? existing.handled_by,
    is_period_marker !== undefined ? (is_period_marker ? 1 : 0) : existing.is_period_marker,
    id
  );

  return c.json(await dbGet(c.env.DB, 'SELECT * FROM transactions WHERE id = ?', id));
});

transactions.delete('/transactions/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const existing = await dbGet(c.env.DB, 'SELECT * FROM transactions WHERE id = ?', id);
  if (!existing) return c.json({ error: 'Transaction not found' }, 404);
  const item = await getItemWithLab(c.env.DB, existing.item_id);
  if (!userCanAccessItem(user, item)) {
    return c.json({ error: 'You do not have access to this item' }, 403);
  }
  await dbRun(c.env.DB, 'DELETE FROM transactions WHERE id = ?', id);
  return c.body(null, 204);
});

export default transactions;
