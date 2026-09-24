import { Hono } from 'hono';
import { dbAll, dbBatch, dbGet, dbRun } from '../db/helpers.js';
import { requireAuth } from '../middleware/auth.js';
import { balanceSubquery } from '../lib/stockBalance.js';
import {
  closeBlockers,
  closingRemark,
  formatReferenceNo,
  isClosed,
  openingRemark,
  periodLabelFor,
  tracksLiveBalance,
} from '../lib/inventoryPeriod.js';

const inventoryCounts = new Hono();
inventoryCounts.use('*', requireAuth);

const BALANCE_SUBQUERY = balanceSubquery('i');

const COUNT_SELECT = `
  SELECT ic.*, l.name AS laboratory_name, l.department_id, d.name AS department_name,
    cu.full_name AS created_by_name, au.full_name AS applied_by_name,
    (SELECT ia.id FROM inventory_archives ia WHERE ia.inventory_count_id = ic.id) AS archive_id,
    (SELECT COUNT(*) FROM inventory_count_items ici WHERE ici.inventory_count_id = ic.id) AS item_count
  FROM inventory_counts ic
  JOIN laboratories l ON l.id = ic.laboratory_id
  JOIN departments d ON d.id = l.department_id
  LEFT JOIN users cu ON cu.id = ic.created_by
  LEFT JOIN users au ON au.id = ic.applied_by
`;

// Why this sheet can't be edited right now, or null if it can.
function editLockReason(count) {
  if (isClosed(count.status)) {
    return 'This inventory period is closed. Its archived copy is read-only; start the next period to record a new count.';
  }
  if (count.status === 'applied') {
    return 'This count has already been applied and can no longer be edited';
  }
  return null;
}

function labAccessibleToUser(user, lab) {
  if (!lab) return false;
  if (user.role === 'admin') return true;
  return Number(lab.department_id) === Number(user.department_id) && lab.status === 'approved';
}

// INV-YYYY-NNN, sequential within the calendar year across the whole school.
// Derived from the highest number already issued rather than a row count, so
// deleting a sheet can never hand its number to a later one -- the number is
// quoted on Stock Card annotations and has to stay unique for good.
async function nextReferenceNo(db, year) {
  const prefix = `INV-${year}-`;
  const row = await dbGet(
    db,
    `SELECT COALESCE(MAX(CAST(substr(reference_no, ?) AS INTEGER)), 0) AS n
     FROM inventory_counts WHERE reference_no LIKE ?`,
    prefix.length + 1,
    `${prefix}%`
  );
  return formatReferenceNo(year, Number(row?.n || 0) + 1);
}

// A sheet that predates inventory periods has no reference number, no
// inventory date and no period label, which leaves it unclosable -- the
// validation that protects a real close would reject it for good. Rather
// than back-fill every historical row on deploy, give a sheet what it is
// missing the first time someone opens it, and only while it is still live.
async function ensurePeriodFields(db, count) {
  if (!count || isClosed(count.status) || count.status === 'applied') return count;
  const patch = {};
  if (!count.reference_no) {
    patch.reference_no = await nextReferenceNo(db, new Date().toISOString().slice(0, 4));
  }
  if (!count.inventory_date) {
    patch.inventory_date = (count.created_at || new Date().toISOString()).slice(0, 10);
  }
  const label = count.period_label || periodLabelFor(patch.inventory_date || count.inventory_date);
  if (label && label !== count.period_label) patch.period_label = label;
  if (!Object.keys(patch).length) return count;

  const sets = Object.keys(patch).map((k) => `${k} = ?`).join(', ');
  await dbRun(db, `UPDATE inventory_counts SET ${sets} WHERE id = ?`, ...Object.values(patch), count.id);
  return { ...count, ...patch };
}

async function createDraftCount(db, laboratoryId, preparedBy, createdBy) {
  const items = await dbAll(
    db,
    `SELECT i.*, ${BALANCE_SUBQUERY} FROM items i WHERE i.laboratory_id = ? ORDER BY i.item_name`,
    laboratoryId
  );

  const today = new Date().toISOString().slice(0, 10);
  const referenceNo = await nextReferenceNo(db, today.slice(0, 4));

  const result = await dbRun(
    db,
    `INSERT INTO inventory_counts (laboratory_id, prepared_by, created_by, status, reference_no, inventory_date, period_label)
     VALUES (?, ?, ?, 'open', ?, ?, ?)`,
    laboratoryId,
    preparedBy,
    createdBy,
    referenceNo,
    today,
    periodLabelFor(today)
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

// Until the cutoff is set, "Quantity as per Record" is a live read of the
// Stock Card, not a number snapshotted when the sheet was opened -- a receipt
// booked halfway through counting has to show up, or the variance it produces
// is one nobody can explain. Variances are recomputed with it so the two
// never disagree.
async function refreshRecordedQuantities(db, count) {
  const balances = await dbAll(
    db,
    `SELECT ici.id, ici.quantity_actual, ici.quantity_recorded, ${BALANCE_SUBQUERY}
     FROM inventory_count_items ici
     JOIN items i ON i.id = ici.item_id
     WHERE ici.inventory_count_id = ?`,
    count.id
  );
  const statements = [];
  for (const row of balances) {
    const recorded = Number(row.current_balance);
    if (recorded === row.quantity_recorded) continue;
    const variance = row.quantity_actual === null ? null : row.quantity_actual - recorded;
    statements.push(
      db
        .prepare('UPDATE inventory_count_items SET quantity_recorded = ?, variance = ? WHERE id = ?')
        .bind(recorded, variance, row.id)
    );
  }
  await dbBatch(db, statements);
}

// ready_to_close is not a step anyone clicks -- it is simply what
// for_reconciliation becomes once nothing is outstanding, and it drops back
// again if a row is cleared. Only those two states are derived; open,
// counting and closed are set deliberately elsewhere.
async function refreshCloseReadiness(db, countId) {
  const count = await dbGet(db, 'SELECT * FROM inventory_counts WHERE id = ?', countId);
  if (!count || (count.status !== 'for_reconciliation' && count.status !== 'ready_to_close')) return;
  const rows = await dbAll(
    db,
    'SELECT * FROM inventory_count_items WHERE inventory_count_id = ?',
    countId
  );
  const next = closeBlockers(count, rows).length ? 'for_reconciliation' : 'ready_to_close';
  if (next !== count.status) {
    await dbRun(db, 'UPDATE inventory_counts SET status = ? WHERE id = ?', next, countId);
  }
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
    'SELECT * FROM inventory_counts WHERE laboratory_id = ? ORDER BY created_at DESC LIMIT 1',
    laboratory_id
  );

  // A closed period is history; an 'applied' one predates periods and is
  // likewise finished. Either way the laboratory needs a fresh sheet.
  let countId = latest?.id;
  if (!latest || latest.status === 'closed' || latest.status === 'applied') {
    countId = await createDraftCount(c.env.DB, laboratory_id, user.full_name, user.id);
  } else {
    await ensurePeriodFields(c.env.DB, latest);
  }

  return c.json({ id: countId });
});

inventoryCounts.get('/:id', async (c) => {
  const user = c.get('user');
  const { count, allowed } = await getCountWithAccess(c.env.DB, c.req.param('id'), user);
  if (!count) return c.json({ error: 'Inventory count not found' }, 404);
  if (!allowed) return c.json({ error: 'You do not have access to this inventory count' }, 403);

  await ensurePeriodFields(c.env.DB, count);
  if (tracksLiveBalance(count.status)) {
    await refreshRecordedQuantities(c.env.DB, count);
  }

  // category lives on items, not on the count row -- join it in so the sheet
  // shows what each row is actually classified as. Without this every saved
  // row came back with category undefined, which read as "uncategorised".
  const items = await dbAll(
    c.env.DB,
    `SELECT ici.*, i.category
     FROM inventory_count_items ici
     LEFT JOIN items i ON i.id = ici.item_id
     WHERE ici.inventory_count_id = ? ORDER BY ici.item_no`,
    count.id
  );
  const fresh = await dbGet(c.env.DB, COUNT_SELECT + ' WHERE ic.id = ?', count.id);
  return c.json({ ...fresh, items, close_blockers: closeBlockers(fresh, items) });
});

inventoryCounts.put('/:id', async (c) => {
  const user = c.get('user');
  const { count, allowed } = await getCountWithAccess(c.env.DB, c.req.param('id'), user);
  if (!count) return c.json({ error: 'Inventory count not found' }, 404);
  if (!allowed) return c.json({ error: 'You do not have access to this inventory count' }, 403);
  const locked = editLockReason(count);
  if (locked) return c.json({ error: locked }, 400);

  const { prepared_by, inventory_date, items } = await c.req.json().catch(() => ({}));

  if (prepared_by?.trim()) {
    await dbRun(c.env.DB, 'UPDATE inventory_counts SET prepared_by = ? WHERE id = ?', prepared_by.trim(), count.id);
  }
  // The inventory's own date, which is what the archived form and both Stock
  // Card rows are dated -- not the day somebody happens to press Close.
  if (inventory_date) {
    await dbRun(
      c.env.DB,
      'UPDATE inventory_counts SET inventory_date = ?, period_label = ? WHERE id = ?',
      inventory_date,
      periodLabelFor(inventory_date),
      count.id
    );
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

      // Classifying an existing row retags the item itself -- the sheet is
      // the entry point for categorising stock that predates the category
      // list, so this has to land somewhere permanent rather than only in
      // the page's own state.
      const newCategory = row.category?.trim();
      if (newCategory && existingRow.item_id) {
        await dbRun(c.env.DB, 'UPDATE items SET category = ? WHERE id = ?', newCategory, existingRow.item_id);
      }
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
            // No serial/location here: this sheet counts equipment in
            // aggregate, and a row with quantity 5 has five serials, not one.
            // They belong to the individual units on F-LAB-001.
            `INSERT INTO items (laboratory_id, item_name, category, unit_of_measure, initial_balance, reorder_level)
             VALUES (?, ?, ?, ?, 0, 0)`,
            count.laboratory_id,
            description,
            category,
            unit
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

  const rows = await dbAll(
    c.env.DB,
    'SELECT * FROM inventory_count_items WHERE inventory_count_id = ? ORDER BY item_no',
    count.id
  );

  // An open sheet becomes a count in progress the moment a quantity is
  // entered on it, so the status reflects what is actually happening
  // without anyone having to declare it.
  if (count.status === 'open' && rows.some((r) => r.quantity_actual !== null)) {
    await dbRun(c.env.DB, `UPDATE inventory_counts SET status = 'counting' WHERE id = ?`, count.id);
  }
  await refreshCloseReadiness(c.env.DB, count.id);

  const updated = await dbGet(c.env.DB, COUNT_SELECT + ' WHERE ic.id = ?', count.id);
  return c.json({ ...updated, items: rows, errors, close_blockers: closeBlockers(updated, rows) });
});

inventoryCounts.delete('/:id/items/:rowId', async (c) => {
  const user = c.get('user');
  const { count, allowed } = await getCountWithAccess(c.env.DB, c.req.param('id'), user);
  if (!count) return c.json({ error: 'Inventory count not found' }, 404);
  if (!allowed) return c.json({ error: 'You do not have access to this inventory count' }, 403);
  const locked = editLockReason(count);
  if (locked) return c.json({ error: locked }, 400);

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

// Sets the inventory cutoff. Up to here "Quantity as per Record" has been a
// live read of the Stock Card; from here it is frozen at the balances the
// count was actually taken against, which is what makes the variance on the
// signed form mean something.
inventoryCounts.post('/:id/cutoff', async (c) => {
  const user = c.get('user');
  const { count, allowed } = await getCountWithAccess(c.env.DB, c.req.param('id'), user);
  if (!count) return c.json({ error: 'Inventory count not found' }, 404);
  if (!allowed) return c.json({ error: 'You do not have access to this inventory count' }, 403);
  const locked = editLockReason(count);
  if (locked) return c.json({ error: locked }, 400);
  if (count.status === 'for_reconciliation' || count.status === 'ready_to_close') {
    return c.json({ error: 'The cutoff for this inventory has already been set' }, 400);
  }

  await refreshRecordedQuantities(c.env.DB, count);
  await dbRun(
    c.env.DB,
    `UPDATE inventory_counts SET status = 'for_reconciliation', cutoff_at = ? WHERE id = ?`,
    new Date().toISOString(),
    count.id
  );
  await refreshCloseReadiness(c.env.DB, count.id);
  return c.json(await dbGet(c.env.DB, COUNT_SELECT + ' WHERE ic.id = ?', count.id));
});

// Undoes the cutoff, back to counting. A cutoff set on the wrong day would
// otherwise be a dead end -- the sheet could neither be corrected nor closed
// against the right balances.
inventoryCounts.post('/:id/reopen-counting', async (c) => {
  const user = c.get('user');
  const { count, allowed } = await getCountWithAccess(c.env.DB, c.req.param('id'), user);
  if (!count) return c.json({ error: 'Inventory count not found' }, 404);
  if (!allowed) return c.json({ error: 'You do not have access to this inventory count' }, 403);
  const locked = editLockReason(count);
  if (locked) return c.json({ error: locked }, 400);

  await dbRun(
    c.env.DB,
    `UPDATE inventory_counts SET status = 'counting', cutoff_at = NULL WHERE id = ?`,
    count.id
  );
  await refreshRecordedQuantities(c.env.DB, { ...count, status: 'counting' });
  return c.json(await dbGet(c.env.DB, COUNT_SELECT + ' WHERE ic.id = ?', count.id));
});

// Close Inventory: the one controlled operation that ends a period.
//
// For every item on the sheet it closes the Stock Card period with an
// annotation naming this F-LAB-010, then opens the next period at the counted
// quantity. The variance is deliberately NOT booked as an IN or OUT: the
// completed form is the documentary explanation for the difference between
// the old Ending Balance and the new Beginning Balance, and a fictitious
// receipt or issuance would misstate what actually moved.
//
// It then freezes a copy of the sheet into the archive, marks the period
// closed, and opens the next one.
//
// Idempotent by construction. D1 offers no interactive transaction spanning
// the whole operation, so instead every write is guarded by what is already
// there: UNIQUE(inventory_count_id) on inventory_archives allows exactly one
// archive per session, and each item's Stock Card rows are skipped if this
// session already wrote them. A retry after a partial failure resumes; it
// never doubles up.
inventoryCounts.post('/:id/close', async (c) => {
  const user = c.get('user');
  const { count, allowed } = await getCountWithAccess(c.env.DB, c.req.param('id'), user);
  if (!count) return c.json({ error: 'Inventory count not found' }, 404);
  if (!allowed) return c.json({ error: 'You do not have access to this inventory count' }, 403);

  const existingArchive = await dbGet(
    c.env.DB,
    'SELECT * FROM inventory_archives WHERE inventory_count_id = ?',
    count.id
  );
  if (existingArchive || isClosed(count.status)) {
    return c.json({
      already_closed: true,
      archive: existingArchive || null,
      count: await dbGet(c.env.DB, COUNT_SELECT + ' WHERE ic.id = ?', count.id),
    });
  }
  if (count.status === 'applied') {
    return c.json({ error: 'This sheet was finished under the old Apply action and cannot be closed.' }, 400);
  }

  const { confirm } = await c.req.json().catch(() => ({}));
  if (confirm !== true) {
    return c.json({ error: 'Closing an inventory period has to be confirmed.' }, 400);
  }

  const rows = await dbAll(
    c.env.DB,
    'SELECT * FROM inventory_count_items WHERE inventory_count_id = ? ORDER BY item_no',
    count.id
  );

  const blockers = closeBlockers(count, rows);
  if (blockers.length) return c.json({ error: blockers[0], blockers }, 400);

  const closedAt = new Date().toISOString();
  const inventoryDate = count.inventory_date;

  // --- 1/4 Stock Cards: close each period, then open the next one ---
  const alreadyWritten = await dbAll(
    c.env.DB,
    `SELECT DISTINCT item_id FROM transactions WHERE inventory_count_id = ? AND entry_type = 'inventory_close'`,
    count.id
  );
  const done = new Set(alreadyWritten.map((r) => Number(r.item_id)));

  const statements = [];
  for (const row of rows) {
    if (!row.item_id || done.has(Number(row.item_id))) continue;
    const variance = Number(row.variance || 0);
    statements.push(
      c.env.DB.prepare(
        `INSERT INTO transactions (item_id, entry_date, in_qty, out_qty, remarks, handled_by, entry_type, inventory_count_id, created_by)
         VALUES (?, ?, 0, 0, ?, ?, 'inventory_close', ?, ?)`
      ).bind(
        row.item_id,
        inventoryDate,
        closingRemark(count.reference_no, row.quantity_recorded, row.quantity_actual, variance),
        count.prepared_by,
        count.id,
        user.id
      ),
      // Inserted after the closing row in the same batch, so it always sorts
      // below it: the Stock Card orders by date then insertion id, and both
      // rows carry the same date.
      c.env.DB.prepare(
        `INSERT INTO transactions (item_id, entry_date, in_qty, out_qty, remarks, handled_by, entry_type, balance_after, inventory_count_id, created_by)
         VALUES (?, ?, 0, 0, ?, ?, 'period_open', ?, ?, ?)`
      ).bind(
        row.item_id,
        inventoryDate,
        openingRemark(count.reference_no),
        count.prepared_by,
        row.quantity_actual,
        count.id,
        user.id
      )
    );
  }
  await dbBatch(c.env.DB, statements);

  // --- 2/4 Archive: a frozen copy that later stock movements cannot touch ---
  const varianceCount = rows.filter((r) => Number(r.variance || 0) !== 0).length;
  let archiveId;
  try {
    const res = await dbRun(
      c.env.DB,
      `INSERT INTO inventory_archives
        (inventory_count_id, laboratory_id, laboratory_name, department_id, department_name,
         reference_no, period_label, inventory_date, conducted_by, closed_by_name, closed_at,
         item_count, variance_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      count.id,
      count.laboratory_id,
      count.laboratory_name,
      count.department_id,
      count.department_name,
      count.reference_no,
      count.period_label,
      inventoryDate,
      count.prepared_by,
      user.full_name,
      closedAt,
      rows.length,
      varianceCount
    );
    archiveId = res.lastInsertRowid;
  } catch (err) {
    // Lost a race against a second Close on the same session -- the UNIQUE
    // constraint did its job; hand back the archive that won.
    const winner = await dbGet(c.env.DB, 'SELECT * FROM inventory_archives WHERE inventory_count_id = ?', count.id);
    if (!winner) throw err;
    return c.json({ already_closed: true, archive: winner, count });
  }

  await dbBatch(
    c.env.DB,
    rows.map((row) =>
      c.env.DB.prepare(
        `INSERT INTO inventory_archive_items
          (inventory_archive_id, source_item_id, item_no, description, unit, category,
           quantity_recorded, quantity_actual, variance, remarks)
         VALUES (?, ?, ?, ?, ?, (SELECT category FROM items WHERE id = ?), ?, ?, ?, ?)`
      ).bind(
        archiveId,
        row.item_id,
        row.item_no,
        row.description,
        row.unit,
        row.item_id,
        row.quantity_recorded,
        row.quantity_actual,
        row.variance,
        row.remarks
      )
    )
  );

  // --- 3/4 Finalize the sheet ---
  await dbRun(
    c.env.DB,
    `UPDATE inventory_counts SET status = 'closed', closed_at = ?, closed_by = ?, closed_by_name = ? WHERE id = ?`,
    closedAt,
    user.id,
    user.full_name,
    count.id
  );

  // --- 4/4 Open the next period, already carrying the counted quantities ---
  const nextCountId = await createDraftCount(c.env.DB, count.laboratory_id, user.full_name, user.id);

  return c.json({
    archive: await dbGet(c.env.DB, 'SELECT * FROM inventory_archives WHERE id = ?', archiveId),
    count: await dbGet(c.env.DB, COUNT_SELECT + ' WHERE ic.id = ?', count.id),
    next_count_id: nextCountId,
  });
});

inventoryCounts.delete('/:id', async (c) => {
  const user = c.get('user');
  const { count, allowed } = await getCountWithAccess(c.env.DB, c.req.param('id'), user);
  if (!count) return c.json({ error: 'Inventory count not found' }, 404);
  if (!allowed) return c.json({ error: 'You do not have access to this inventory count' }, 403);
  if (isClosed(count.status) || count.status === 'applied') {
    return c.json({ error: 'A closed inventory period cannot be deleted' }, 400);
  }
  await dbRun(c.env.DB, 'DELETE FROM inventory_counts WHERE id = ?', count.id);
  return c.body(null, 204);
});

export default inventoryCounts;
