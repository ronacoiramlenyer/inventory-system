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

// Fallback split used by PrintPages before its first measurement lands (and
// if measuring cannot run at all). Chrome gives a printed page no way to know
// its own page number -- no CSS or JS API reports it, and Chrome ignores
// @page margin-box counters -- so a single table relying on the browser's
// native page breaks can never show a real "Page 2 of 12" on its second page:
// every repeating header row is the same DOM element with the same text on
// every page it lands on. The only way around that is to stop relying on the
// browser to decide where pages break and render each page as its own table
// with its own correctly-numbered header. How many rows go on a page is
// PrintPages' job, since it depends on how tall the rows actually are; this
// is just an even split by count for the moment before that is known.
export function paginatePrintRows(rows, perPage) {
  const pageCount = Math.max(1, Math.ceil(rows.length / perPage));
  return Array.from({ length: pageCount }, (_, i) => padRows(rows.slice(i * perPage, (i + 1) * perPage), perPage));
}
