import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

// Mounted twice:
//   /api/items/:itemId/... (mergeParams) for stock-card + creating entries
//   /api/transactions/...  for editing/deleting a single entry
const router = Router({ mergeParams: true });
router.use(requireAuth);

function computeStockCard(itemId) {
  const item = db
    .prepare(
      `SELECT i.*, l.name AS laboratory_name, l.department
       FROM items i JOIN laboratories l ON l.id = i.laboratory_id WHERE i.id = ?`
    )
    .get(itemId);
  if (!item) return null;

  const rows = db
    .prepare(
      `SELECT * FROM transactions WHERE item_id = ? ORDER BY entry_date ASC, id ASC`
    )
    .all(itemId);

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

  return {
    item,
    initial_balance: item.initial_balance,
    current_balance: balance,
    entries,
  };
}

router.get('/items/:itemId/stock-card', (req, res) => {
  const card = computeStockCard(req.params.itemId);
  if (!card) return res.status(404).json({ error: 'Item not found' });
  res.json(card);
});

router.get('/items/:itemId/transactions', (req, res) => {
  const card = computeStockCard(req.params.itemId);
  if (!card) return res.status(404).json({ error: 'Item not found' });
  res.json(card.entries);
});

router.post('/items/:itemId/transactions', (req, res) => {
  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(req.params.itemId);
  if (!item) return res.status(404).json({ error: 'Item not found' });

  const {
    entry_date,
    in_qty,
    out_qty,
    remarks,
    expiry_date,
    invoice_no,
    handled_by,
    is_period_marker,
  } = req.body || {};

  if (!entry_date) return res.status(400).json({ error: 'entry_date is required' });

  const inQty = Number(in_qty) || 0;
  const outQty = Number(out_qty) || 0;
  if (inQty < 0 || outQty < 0) {
    return res.status(400).json({ error: 'Quantities cannot be negative' });
  }
  if (!is_period_marker && inQty === 0 && outQty === 0) {
    return res.status(400).json({ error: 'Provide an IN or OUT quantity' });
  }

  const result = db
    .prepare(
      `INSERT INTO transactions
        (item_id, entry_date, in_qty, out_qty, remarks, expiry_date, invoice_no, handled_by, is_period_marker, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      req.params.itemId,
      entry_date,
      inQty,
      outQty,
      remarks?.trim() || null,
      expiry_date || null,
      invoice_no?.trim() || null,
      handled_by?.trim() || req.user.full_name,
      is_period_marker ? 1 : 0,
      req.user.id
    );

  res.status(201).json(db.prepare('SELECT * FROM transactions WHERE id = ?').get(result.lastInsertRowid));
});

router.put('/transactions/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Transaction not found' });

  const {
    entry_date,
    in_qty,
    out_qty,
    remarks,
    expiry_date,
    invoice_no,
    handled_by,
    is_period_marker,
  } = req.body || {};

  db.prepare(
    `UPDATE transactions SET entry_date = ?, in_qty = ?, out_qty = ?, remarks = ?, expiry_date = ?,
       invoice_no = ?, handled_by = ?, is_period_marker = ? WHERE id = ?`
  ).run(
    entry_date || existing.entry_date,
    in_qty !== undefined ? Number(in_qty) || 0 : existing.in_qty,
    out_qty !== undefined ? Number(out_qty) || 0 : existing.out_qty,
    remarks?.trim() ?? existing.remarks,
    expiry_date ?? existing.expiry_date,
    invoice_no?.trim() ?? existing.invoice_no,
    handled_by?.trim() ?? existing.handled_by,
    is_period_marker !== undefined ? (is_period_marker ? 1 : 0) : existing.is_period_marker,
    req.params.id
  );

  res.json(db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id));
});

router.delete('/transactions/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Transaction not found' });
  db.prepare('DELETE FROM transactions WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

export default router;
