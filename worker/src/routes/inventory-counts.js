import { Hono } from 'hono';
import { dbAll, dbGet, dbRun } from '../db/helpers.js';
import { requireAuth } from '../middleware/auth.js';

const inventoryCounts = new Hono();
inventoryCounts.use('*', requireAuth);

const BALANCE_SUBQUERY = `
  i.initial_balance
  + COALESCE((SELECT SUM(t.in_qty) FROM transactions t WHERE t.item_id = i.id), 0)
  - COALESCE((SELECT SUM(t.out_qty) FROM transactions t WHERE t.item_id = i.id), 0)
  AS current_balance
`;

const COUNT_SELECT = `
  SELECT ic.*, l.name AS laboratory_name, l.department_id, d.name AS department_name,
    cu.full_name AS created_by_name, au.full_name AS applied_by_name,
    (SELECT COUNT(*) FROM inventory_count_items ici WHERE ici.inventory_count_id = ic.id) AS item_count
  FROM inventory_counts ic
  JOIN laboratories l ON l.id = ic.laboratory_id
  JOIN departments d ON d.id = l.department_id
  LEFT JOIN users cu ON cu.id = ic.created_by
  LEFT JOIN users au ON au.id = ic.applied_by
`;

function labAccessibleToUser(user, lab) {
  if (!lab) return false;
  if (user.role === 'admin') return true;
  return Number(lab.department_id) === Number(user.department_id) && lab.status === 'approved';
}

async function createDraftCount(db, laboratoryId, preparedBy, createdBy) {
  const items = await dbAll(
    db,
    `SELECT i.*, ${BALANCE_SUBQUERY} FROM items i WHERE i.laboratory_id = ? ORDER BY i.item_name`,
    laboratoryId
  );

  const result = await dbRun(
    db,
    `INSERT INTO inventory_counts (laboratory_id, prepared_by, created_by) VALUES (?, ?, ?)`,
    laboratoryId,
    preparedBy,
    createdBy
  );
  const countId = result.lastInsertRowid;

  let itemNo = 1;
  for (const item of items) {
    await dbRun(
      db,
      `INSERT INTO inventory_count_items (inventory_count_id, item_id, item_no, description, unit, quantity_recorded)
       VALUES (?, ?, ?, ?, ?, ?)`,
      countId,
      item.id,
      itemNo++,
      item.item_name,
      item.unit_of_measure,
      item.current_balance
    );
  }

  return countId;
}

async function getCountWithAccess(db, id, user) {
  const count = await dbGet(db, COUNT_SELECT + ' WHERE ic.id = ?', id);
  if (!count) return { count: null, allowed: false };
  const allowed =
    user.role === 'admin' ||
    (Number(count.department_id) === Number(user.department_id) && true);
  return { count, allowed };
}

inventoryCounts.get('/', async (c) => {
  const user = c.get('user');
  const { laboratory_id } = c.req.query();
  const clauses = [];
  const params = [];

  if (user.role !== 'admin') {
    clauses.push('l.department_id = ?');
    params.push(user.department_id);
  }
  if (laboratory_id) {
    clauses.push('ic.laboratory_id = ?');
    params.push(laboratory_id);
  }

  let sql = COUNT_SELECT;
  if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
  sql += ' ORDER BY ic.created_at DESC';

  return c.json(await dbAll(c.env.DB, sql, ...params));
});

// Returns the one current F-LAB-010 sheet for a laboratory: the latest count if
// it's still a draft, or a freshly-started one if there isn't one yet or the
// latest was already applied. This is the app's single point of entry for
// viewing and adding items in a laboratory — there is no list of past sheets.
inventoryCounts.get('/current', async (c) => {
  const user = c.get('user');
  const { laboratory_id } = c.req.query();
  if (!laboratory_id) return c.json({ error: 'laboratory_id is required' }, 400);

  const lab = await dbGet(c.env.DB, 'SELECT * FROM laboratories WHERE id = ?', laboratory_id);
  if (!labAccessibleToUser(user, lab)) {
    return c.json({ error: 'You do not have access to that laboratory' }, 403);
  }

  const latest = await dbGet(
    c.env.DB,
    'SELECT id, status FROM inventory_counts WHERE laboratory_id = ? ORDER BY created_at DESC LIMIT 1',
    laboratory_id
  );

  let countId = latest?.id;
  if (!latest || latest.status === 'applied') {
    countId = await createDraftCount(c.env.DB, laboratory_id, user.full_name, user.id);
  }

  return c.json({ id: countId });
});

inventoryCounts.get('/:id', async (c) => {
  const user = c.get('user');
  const { count, allowed } = await getCountWithAccess(c.env.DB, c.req.param('id'), user);
  if (!count) return c.json({ error: 'Inventory count not found' }, 404);
  if (!allowed) return c.json({ error: 'You do not have access to this inventory count' }, 403);

  const items = await dbAll(
    c.env.DB,
    'SELECT * FROM inventory_count_items WHERE inventory_count_id = ? ORDER BY item_no',
    count.id
  );
  return c.json({ ...count, items });
});

inventoryCounts.put('/:id', async (c) => {
  const user = c.get('user');
  const { count, allowed } = await getCountWithAccess(c.env.DB, c.req.param('id'), user);
  if (!count) return c.json({ error: 'Inventory count not found' }, 404);
  if (!allowed) return c.json({ error: 'You do not have access to this inventory count' }, 403);
  if (count.status === 'applied') {
    return c.json({ error: 'This count has already been applied and can no longer be edited' }, 400);
  }

  const { prepared_by, items } = await c.req.json().catch(() => ({}));

  if (prepared_by?.trim()) {
    await dbRun(c.env.DB, 'UPDATE inventory_counts SET prepared_by = ? WHERE id = ?', prepared_by.trim(), count.id);
  }

  const errors = [];

  for (const row of items || []) {
    const actual = row.quantity_actual === '' || row.quantity_actual === undefined || row.quantity_actual === null
      ? null
      : Number(row.quantity_actual);

    if (row.id) {
      const existingRow = await dbGet(
        c.env.DB,
        'SELECT * FROM inventory_count_items WHERE id = ? AND inventory_count_id = ?',
        row.id,
        count.id
      );
      if (!existingRow) continue;

      const variance = actual === null ? null : actual - existingRow.quantity_recorded;
      await dbRun(
        c.env.DB,
        'UPDATE inventory_count_items SET quantity_actual = ?, variance = ?, remarks = ? WHERE id = ?',
        actual,
        variance,
        row.remarks?.trim() || null,
        existingRow.id
      );
    } else {
      // A row added directly on the sheet: create the item (or reuse one that
      // already matches by name in this lab) and link a new count-item row to it.
      const description = row.description?.trim();
      const unit = row.unit?.trim();
      const category = row.category?.trim();
      if (!description || !unit) {
        errors.push(`A new row is missing ${!description ? 'a description' : 'a unit'} and was skipped.`);
        continue;
      }
      // The Inventory Sheet is the only place a new item gets created (the
      // standalone Add Item/Add Equipment forms were removed), so a
      // category has to be chosen here -- otherwise the item would never
      // show up on the Inventory list or, if it's equipment, on the EMR.
      if (!category) {
        errors.push(`"${description}": missing a category and was skipped.`);
        continue;
      }

      let item = await dbGet(
        c.env.DB,
        'SELECT * FROM items WHERE laboratory_id = ? AND item_name = ? COLLATE NOCASE',
        count.laboratory_id,
        description
      );
      let createdNewItem = 0;
      if (!item) {
        try {
          const result = await dbRun(
            c.env.DB,
            `INSERT INTO items (laboratory_id, item_name, category, unit_of_measure, initial_balance, reorder_level, serial_number, location)
             VALUES (?, ?, ?, ?, 0, 0, ?, ?)`,
            count.laboratory_id,
            description,
            category,
            unit,
            row.serial_number?.trim() || null,
            row.location?.trim() || null
          );
          item = await dbGet(c.env.DB, 'SELECT * FROM items WHERE id = ?', result.lastInsertRowid);
          createdNewItem = 1;
        } catch (err) {
          errors.push(`"${description}": ${String(err.message).includes('UNIQUE') ? 'already exists' : 'failed to create'}`);
          continue;
        }
      }

      const maxItemNo = await dbGet(
        c.env.DB,
        'SELECT COALESCE(MAX(item_no), 0) AS n FROM inventory_count_items WHERE inventory_count_id = ?',
        count.id
      );

      await dbRun(
        c.env.DB,
        `INSERT INTO inventory_count_items
          (inventory_count_id, item_id, item_no, description, unit, quantity_recorded, quantity_actual, variance, remarks, created_new_item)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
        count.id,
        item.id,
        maxItemNo.n + 1,
        description,
        unit,
        actual,
        actual, // variance against a starting record of 0 is just the actual quantity
        row.remarks?.trim() || null,
        createdNewItem
      );
    }
  }

  const updated = await dbGet(c.env.DB, COUNT_SELECT + ' WHERE ic.id = ?', count.id);
  const rows = await dbAll(
    c.env.DB,
    'SELECT * FROM inventory_count_items WHERE inventory_count_id = ? ORDER BY item_no',
    count.id
  );
  return c.json({ ...updated, items: rows, errors });
});

inventoryCounts.delete('/:id/items/:rowId', async (c) => {
  const user = c.get('user');
  const { count, allowed } = await getCountWithAccess(c.env.DB, c.req.param('id'), user);
  if (!count) return c.json({ error: 'Inventory count not found' }, 404);
  if (!allowed) return c.json({ error: 'You do not have access to this inventory count' }, 403);
  if (count.status === 'applied') {
    return c.json({ error: 'This count has already been applied and can no longer be edited' }, 400);
  }

  const row = await dbGet(
    c.env.DB,
    'SELECT * FROM inventory_count_items WHERE id = ? AND inventory_count_id = ?',
    c.req.param('rowId'),
    count.id
  );
  if (!row) return c.json({ error: 'Row not found' }, 404);
  if (!row.created_new_item) {
    return c.json({ error: 'Only a row that created a new item on this sheet can be removed this way' }, 400);
  }

  await dbRun(c.env.DB, 'DELETE FROM inventory_count_items WHERE id = ?', row.id);
  if (row.item_id) {
    await dbRun(c.env.DB, 'DELETE FROM items WHERE id = ?', row.item_id);
  }
  return c.body(null, 204);
});

inventoryCounts.post('/:id/apply', async (c) => {
  const user = c.get('user');
  const { count, allowed } = await getCountWithAccess(c.env.DB, c.req.param('id'), user);
  if (!count) return c.json({ error: 'Inventory count not found' }, 404);
  if (!allowed) return c.json({ error: 'You do not have access to this inventory count' }, 403);
  if (count.status === 'applied') {
    return c.json({ error: 'This count has already been applied' }, 400);
  }

  const rows = await dbAll(
    c.env.DB,
    'SELECT * FROM inventory_count_items WHERE inventory_count_id = ? ORDER BY item_no',
    count.id
  );

  const today = new Date().toISOString().slice(0, 10);
  for (const row of rows) {
    if (!row.item_id) continue;

    if (row.variance) {
      const inQty = row.variance > 0 ? row.variance : 0;
      const outQty = row.variance < 0 ? Math.abs(row.variance) : 0;
      await dbRun(
        c.env.DB,
        `INSERT INTO transactions (item_id, entry_date, in_qty, out_qty, remarks, handled_by, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        row.item_id,
        today,
        inQty,
        outQty,
        `Physical count adjustment (Inventory Sheet #${count.id})`,
        count.prepared_by,
        user.id
      );
    }

    // A divider row on the item's Stock Card marking this reconciliation
    // point, whether or not the count changed its balance -- inserted after
    // any adjustment above so it lands below it (both dated today, and
    // display order falls back to insertion id).
    await dbRun(
      c.env.DB,
      `INSERT INTO transactions (item_id, entry_date, remarks, handled_by, is_period_marker, created_by)
       VALUES (?, ?, ?, ?, 1, ?)`,
      row.item_id,
      today,
      `Inventory Sheet #${count.id} applied`,
      count.prepared_by,
      user.id
    );
  }

  await dbRun(
    c.env.DB,
    `UPDATE inventory_counts SET status = 'applied', applied_at = ?, applied_by = ? WHERE id = ?`,
    new Date().toISOString(),
    user.id,
    count.id
  );

  return c.json(await dbGet(c.env.DB, COUNT_SELECT + ' WHERE ic.id = ?', count.id));
});

inventoryCounts.delete('/:id', async (c) => {
  const user = c.get('user');
  const { count, allowed } = await getCountWithAccess(c.env.DB, c.req.param('id'), user);
  if (!count) return c.json({ error: 'Inventory count not found' }, 404);
  if (!allowed) return c.json({ error: 'You do not have access to this inventory count' }, 403);
  if (count.status === 'applied') {
    return c.json({ error: 'Applied counts cannot be deleted' }, 400);
  }
  await dbRun(c.env.DB, 'DELETE FROM inventory_counts WHERE id = ?', count.id);
  return c.body(null, 204);
});

export default inventoryCounts;
