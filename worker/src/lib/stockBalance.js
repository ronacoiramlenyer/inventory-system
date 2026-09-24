// The stock balance of an item, as SQL.
//
// It used to be a plain `initial_balance + SUM(in) - SUM(out)`, but closing
// an inventory period breaks that: a physical count that finds 43 where the
// book said 45 has to leave the balance at 43, and the F-LAB-006 rules say
// that difference must NOT be booked as a fictitious IN or OUT row. So a
// close writes a `period_open` row carrying the counted quantity in
// `balance_after`, and that row becomes the new anchor the running total
// starts from -- everything before it belongs to a closed period and no
// longer contributes.
//
// Anchored on `id` rather than `entry_date` so it cannot be shifted by a
// back-dated entry; transactions.js refuses to record one into a closed
// period, which is what keeps that id order and the date order agreeing.
//
// `alias` is the table alias the items row is under in the query using this.
export function balanceExpr(alias = 'i') {
  const anchorId = `(SELECT po.id FROM transactions po
       WHERE po.item_id = ${alias}.id AND po.entry_type = 'period_open'
       ORDER BY po.id DESC LIMIT 1)`;
  return `(
    COALESCE((SELECT po.balance_after FROM transactions po
       WHERE po.item_id = ${alias}.id AND po.entry_type = 'period_open'
       ORDER BY po.id DESC LIMIT 1), ${alias}.initial_balance)
    + COALESCE((SELECT SUM(t.in_qty - t.out_qty) FROM transactions t
       WHERE t.item_id = ${alias}.id
         AND t.entry_type = 'txn'
         AND t.id > COALESCE(${anchorId}, 0)), 0)
  )`;
}

// The same thing with the column name the routes all expect.
export function balanceSubquery(alias = 'i') {
  return `${balanceExpr(alias)} AS current_balance`;
}
