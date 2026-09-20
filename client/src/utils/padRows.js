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

// Chrome gives a printed page no way to know its own page number (no CSS/JS
// API reports it, and Chrome ignores @page margin-box counters) -- so a
// single table relying on the browser's native page breaks can never show
// a real "Page 2 of 12" on its second page; every repeating header row is the
// same DOM element with the same text on every page it lands on. The only
// way around that is to stop relying on the browser to decide where pages
// break: split the rows into fixed-size chunks ourselves, render each
// chunk as its own <table> with its own correctly-numbered header, and
// force a page break between them (see ScheduleSheet.jsx). Each chunk is
// padded up to a full page so every page -- including the last -- keeps
// the pre-numbered-paper-form look the rest of this app already uses.
export function paginatePrintRows(rows, perPage) {
  const pageCount = Math.max(1, Math.ceil(rows.length / perPage));
  return Array.from({ length: pageCount }, (_, i) => padRows(rows.slice(i * perPage, (i + 1) * perPage), perPage));
}
