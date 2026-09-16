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

router.get('/summary', (req, res) => {
  const laboratoryCount = db.prepare('SELECT COUNT(*) AS c FROM laboratories').get().c;
  const itemCount = db.prepare('SELECT COUNT(*) AS c FROM items').get().c;
  const transactionCount = db.prepare('SELECT COUNT(*) AS c FROM transactions').get().c;

  const items = db
    .prepare(
      `SELECT i.*, l.name AS laboratory_name, l.department, ${BALANCE_SUBQUERY}
       FROM items i JOIN laboratories l ON l.id = i.laboratory_id`
    )
    .all();

  const lowStockItems = items.filter((it) => it.current_balance <= it.reorder_level);

  const perLab = db
    .prepare(
      `SELECT l.id, l.name, l.department, COUNT(i.id) AS item_count
       FROM laboratories l LEFT JOIN items i ON i.laboratory_id = l.id
       GROUP BY l.id ORDER BY l.name`
    )
    .all();

  const recentTransactions = db
    .prepare(
      `SELECT t.*, i.item_name, l.name AS laboratory_name
       FROM transactions t
       JOIN items i ON i.id = t.item_id
       JOIN laboratories l ON l.id = i.laboratory_id
       ORDER BY t.created_at DESC, t.id DESC
       LIMIT 10`
    )
    .all();

  res.json({
    laboratoryCount,
    itemCount,
    transactionCount,
    lowStockItems,
    perLab,
    recentTransactions,
  });
});

export default router;
