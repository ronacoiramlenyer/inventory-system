import { Hono } from 'hono';
import { dbAll, dbGet, dbRun } from '../db/helpers.js';
import { requireAuth } from '../middleware/auth.js';

// Mounted at '/' from index.js, alongside items/laboratories routes, so it
// can serve both /items/:itemId/... and /transactions/:id.
const transactions = new Hono();
transactions.use('*', requireAuth);

// The closing annotation and the Beginning Balance line are written by
// Close Inventory and traced by an auditor back to the archived F-LAB-010
// they name. Editing or deleting one would break that trace and silently
// change every balance after it.
const SYSTEM_ROW_ERROR =
  'This row was written by an inventory closing and cannot be edited or deleted. It is the Stock Card\'s link to the archived F-LAB-010.';

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

  // Mirrors balanceExpr() in lib/stockBalance.js -- keep the two in step.
  let balance = item.initial_balance;
  const entries = rows.map((row) => {
    // The Beginning Balance of a new inventory period. It sets the running
    // balance to the counted quantity instead of adjusting it, which is what
    // lets a variance be absorbed without a fictitious IN or OUT row.
    if (row.entry_type === 'period_open') {
      balance = row.balance_after;
      return { ...row, beginning_balance: balance, ending_balance: balance };
    }
    const beginning_balance = balance;
    // Annotations: the inventory closing line and the older divider rows.
    // Neither moves stock, so both carry the balance through untouched.
    if (row.entry_type === 'inventory_close' || row.is_period_marker) {
      return { ...row, beginning_balance, ending_balance: beginning_balance };
    }
    balance = balance + row.in_qty - row.out_qty;
    return { ...row, beginning_balance, ending_balance: balance };
  });

  const closedThrough = rows
    .filter((r) => r.entry_type === 'inventory_close')
    .reduce((latest, r) => (latest && latest > r.entry_date ? latest : r.entry_date), null);

  return { item, initial_balance: item.initial_balance, current_balance: balance, closed_through: closedThrough, entries };
}

// The inventory date of the item's most recent closing annotation, or null.
// A closed period is history: the archived F-LAB-010 was signed against these
// balances, so nothing may be recorded into it afterwards. Enforcing that is
// also what keeps the Stock Card's date order and the balance expression's id
// order agreeing -- see lib/stockBalance.js.
async function closedThroughDate(db, itemId) {
  const row = await dbGet(
    db,
    `SELECT MAX(entry_date) AS d FROM transactions WHERE item_id = ? AND entry_type = 'inventory_close'`,
    itemId
  );
  return row?.d || null;
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

  const closedThrough = await closedThroughDate(c.env.DB, itemId);
  if (closedThrough && entry_date <= closedThrough) {
    return c.json(
      {
        error: `This Stock Card is closed through ${closedThrough} by a physical inventory. Record this entry on ${closedThrough} or later, or ask an admin to correct the balance.`,
      },
      400
    );
  }

  const result = await dbRun(
    c.env.DB,
    `INSERT INTO transactions
      (item_id, entry_date, in_qty, out_qty, remarks, expiry_date, invoice_no, handled_by, is_period_marker, entry_type, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'txn', ?)`,
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

  if (existing.entry_type !== 'txn') {
    return c.json({ error: SYSTEM_ROW_ERROR }, 400);
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
  if (existing.entry_type !== 'txn') {
    return c.json({ error: SYSTEM_ROW_ERROR }, 400);
  }
  await dbRun(c.env.DB, 'DELETE FROM transactions WHERE id = ?', id);
  return c.body(null, 204);
});

export default transactions;
