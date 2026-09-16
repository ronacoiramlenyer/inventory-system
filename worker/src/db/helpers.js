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
