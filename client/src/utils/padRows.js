let seq = 0;

// Printed forms are pre-numbered sheets with blank rows ready to fill in --
// pad a data array with placeholder rows (row.__blank === true) so the
// table always shows at least minCount rows, matching that look, instead
// of stopping dead after the last real entry.
export function padRows(rows, minCount) {
  if (rows.length >= minCount) return rows;
  const padding = Array.from({ length: minCount - rows.length }, () => ({ __blank: true, id: `blank-${seq++}` }));
  return [...rows, ...padding];
}
