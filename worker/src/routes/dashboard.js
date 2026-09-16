import { Hono } from 'hono';
import { dbAll, dbGet } from '../db/helpers.js';
import { requireAuth } from '../middleware/auth.js';

const dashboard = new Hono();
dashboard.use('*', requireAuth);

const BALANCE_SUBQUERY = `
  i.initial_balance
  + COALESCE((SELECT SUM(t.in_qty) FROM transactions t WHERE t.item_id = i.id), 0)
  - COALESCE((SELECT SUM(t.out_qty) FROM transactions t WHERE t.item_id = i.id), 0)
  AS current_balance
`;

dashboard.get('/summary', async (c) => {
  const user = c.get('user');
  const isAdmin = user.role === 'admin';
  const deptClause = isAdmin ? '' : " AND l.department_id = ? AND l.status = 'approved'";
  const deptParams = isAdmin ? [] : [user.department_id];

  const laboratoryCount = (
    await dbGet(
      c.env.DB,
      `SELECT COUNT(*) AS c FROM laboratories l WHERE l.status = 'approved'${isAdmin ? '' : ' AND l.department_id = ?'}`,
      ...(isAdmin ? [] : [user.department_id])
    )
  ).c;

  const itemCount = (
    await dbGet(
      c.env.DB,
      `SELECT COUNT(*) AS c FROM items i JOIN laboratories l ON l.id = i.laboratory_id WHERE 1=1${deptClause}`,
      ...deptParams
    )
  ).c;

  const transactionCount = (
    await dbGet(
      c.env.DB,
      `SELECT COUNT(*) AS c FROM transactions t
       JOIN items i ON i.id = t.item_id JOIN laboratories l ON l.id = i.laboratory_id WHERE 1=1${deptClause}`,
      ...deptParams
    )
  ).c;

  const items = await dbAll(
    c.env.DB,
    `SELECT i.*, l.name AS laboratory_name, d.name AS department_name, ${BALANCE_SUBQUERY}
     FROM items i
     JOIN laboratories l ON l.id = i.laboratory_id
     JOIN departments d ON d.id = l.department_id
     WHERE 1=1${deptClause}`,
    ...deptParams
  );
  const lowStockItems = items.filter((it) => it.current_balance <= it.reorder_level);

  const perLab = await dbAll(
    c.env.DB,
    `SELECT l.id, l.name, d.name AS department_name, COUNT(i.id) AS item_count
     FROM laboratories l
     JOIN departments d ON d.id = l.department_id
     LEFT JOIN items i ON i.laboratory_id = l.id
     WHERE l.status = 'approved'${isAdmin ? '' : ' AND l.department_id = ?'}
     GROUP BY l.id ORDER BY l.name`,
    ...(isAdmin ? [] : [user.department_id])
  );

  const recentTransactions = await dbAll(
    c.env.DB,
    `SELECT t.*, i.item_name, l.name AS laboratory_name, d.name AS department_name
     FROM transactions t
     JOIN items i ON i.id = t.item_id
     JOIN laboratories l ON l.id = i.laboratory_id
     JOIN departments d ON d.id = l.department_id
     WHERE 1=1${deptClause}
     ORDER BY t.created_at DESC, t.id DESC
     LIMIT 10`,
    ...deptParams
  );

  const response = { laboratoryCount, itemCount, transactionCount, lowStockItems, perLab, recentTransactions };

  if (isAdmin) {
    response.pendingLaboratoryCount = (
      await dbGet(c.env.DB, `SELECT COUNT(*) AS c FROM laboratories WHERE status = 'pending'`)
    ).c;
  }

  return c.json(response);
});

export default dashboard;
