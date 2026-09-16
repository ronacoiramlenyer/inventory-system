import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

const BALANCE_SUBQUERY = `
  i.initial_balance
  + COALESCE((SELECT SUM(t.in_qty) FROM transactions t WHERE t.item_id = i.id), 0)
  - COALESCE((SELECT SUM(t.out_qty) FROM transactions t WHERE t.item_id = i.id), 0)
  AS current_balance
`;

router.get('/', (req, res) => {
  const { laboratory_id, low_stock } = req.query;
  let sql = `SELECT i.*, l.name AS laboratory_name, l.department, ${BALANCE_SUBQUERY}
             FROM items i JOIN laboratories l ON l.id = i.laboratory_id`;
  const params = [];
  const clauses = [];
  if (laboratory_id) {
    clauses.push('i.laboratory_id = ?');
    params.push(laboratory_id);
  }
  if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
  sql += ' ORDER BY i.item_name';
  let items = db.prepare(sql).all(...params);
  if (low_stock === 'true') {
    items = items.filter((it) => it.current_balance <= it.reorder_level);
  }
  res.json(items);
});

router.get('/:id', (req, res) => {
  const item = db
    .prepare(
      `SELECT i.*, l.name AS laboratory_name, l.department, ${BALANCE_SUBQUERY}
       FROM items i JOIN laboratories l ON l.id = i.laboratory_id WHERE i.id = ?`
    )
    .get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Item not found' });
  res.json(item);
});

router.post('/', (req, res) => {
  const { laboratory_id, item_name, category, unit_of_measure, initial_balance, reorder_level, notes } =
    req.body || {};
  if (!laboratory_id || !item_name || !unit_of_measure) {
    return res
      .status(400)
      .json({ error: 'laboratory_id, item_name and unit_of_measure are required' });
  }
  try {
    const result = db
      .prepare(
        `INSERT INTO items (laboratory_id, item_name, category, unit_of_measure, initial_balance, reorder_level, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        laboratory_id,
        item_name.trim(),
        category?.trim() || null,
        unit_of_measure.trim(),
        Number(initial_balance) || 0,
        Number(reorder_level) || 0,
        notes?.trim() || null
      );
    const item = db
      .prepare(
        `SELECT i.*, l.name AS laboratory_name, l.department, ${BALANCE_SUBQUERY}
         FROM items i JOIN laboratories l ON l.id = i.laboratory_id WHERE i.id = ?`
      )
      .get(result.lastInsertRowid);
    res.status(201).json(item);
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'That item already exists in this laboratory' });
    }
    res.status(500).json({ error: 'Failed to create item' });
  }
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM items WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Item not found' });
  const { item_name, category, unit_of_measure, reorder_level, notes, laboratory_id } = req.body || {};
  db.prepare(
    `UPDATE items SET item_name = ?, category = ?, unit_of_measure = ?, reorder_level = ?, notes = ?, laboratory_id = ?
     WHERE id = ?`
  ).run(
    item_name?.trim() || existing.item_name,
    category?.trim() ?? existing.category,
    unit_of_measure?.trim() || existing.unit_of_measure,
    reorder_level !== undefined ? Number(reorder_level) : existing.reorder_level,
    notes?.trim() ?? existing.notes,
    laboratory_id || existing.laboratory_id,
    req.params.id
  );
  const item = db
    .prepare(
      `SELECT i.*, l.name AS laboratory_name, l.department, ${BALANCE_SUBQUERY}
       FROM items i JOIN laboratories l ON l.id = i.laboratory_id WHERE i.id = ?`
    )
    .get(req.params.id);
  res.json(item);
});

router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM items WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Item not found' });
  db.prepare('DELETE FROM items WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

export default router;
