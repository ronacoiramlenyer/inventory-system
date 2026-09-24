export async function dbAll(db, sql, ...params) {
  const res = await db.prepare(sql).bind(...params).all();
  return res.results;
}

export async function dbGet(db, sql, ...params) {
  return db.prepare(sql).bind(...params).first();
}

export async function dbRun(db, sql, ...params) {
  const res = await db.prepare(sql).bind(...params).run();
  return { lastInsertRowid: res.meta.last_row_id, changes: res.meta.changes };
}

// maintenance_schedule_items/calibration_schedule_items/work_requests all
// reference items(id) via equipment_item_id with no ON DELETE action, so
// deleting an item those rows point to hits a foreign-key constraint and
// fails outright -- the item just sits there looking "stuck" with no
// error surfaced. Unlinking first (the schedule/request rows themselves
// are history and should stay) lets the delete go through, matching how
// equipment_logs already cascades on delete.
export async function clearEquipmentLinks(db, itemId) {
  await dbRun(db, 'UPDATE maintenance_schedule_items SET equipment_item_id = NULL WHERE equipment_item_id = ?', itemId);
  await dbRun(db, 'UPDATE calibration_schedule_items SET equipment_item_id = NULL WHERE equipment_item_id = ?', itemId);
  await dbRun(db, 'UPDATE work_requests SET equipment_item_id = NULL WHERE equipment_item_id = ?', itemId);
}

// D1 has no interactive transaction, but it does run a prepared-statement
// batch atomically. Closing an inventory period writes two Stock Card rows
// for every item on the sheet, so a 125-item laboratory is 250 inserts --
// far too many round trips one at a time, and each one its own commit.
export async function dbBatch(db, statements, chunkSize = 40) {
  for (let i = 0; i < statements.length; i += chunkSize) {
    await db.batch(statements.slice(i, i + chunkSize));
  }
}
