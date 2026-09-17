// Browsers give the page no way to know how many pages printing will
// actually produce (no CSS/JS API reports it, and Chrome ignores @page
// margin-box counters), so an exact "page X of Y" isn't achievable from
// here. This estimates the page count from row count instead, so a long
// sheet at least shows more than 1 rather than a permanently-stuck "1 of 1"
// -- rowsPerPage should roughly match how many table rows this particular
// print layout actually fits on one sheet.
export function estimatePageLabel(rowCount, rowsPerPage = 20, prefix = '') {
  const total = Math.max(1, Math.ceil(rowCount / rowsPerPage));
  return `${prefix}1 of ${total}`;
}

// Matches the official F-LAB template's print header (school seal + page
// label) and footer (form code/revision). Print-only -- the app's own
// Layout header already covers the on-screen view.
export function PrintHeader({ pageLabel = 'Page 1 of 1' }) {
  return (
    <div className="hidden print:grid grid-cols-3 items-center mb-3">
      <span />
      <img src="/lsgh-logo.png" alt="La Salle Green Hills" className="h-14 w-auto justify-self-center" />
      <span className="italic text-sm text-slate-700 justify-self-end">{pageLabel}</span>
    </div>
  );
}

export function PrintFooter({ code, date, rev = 'Rev. 0' }) {
  return (
    <p className="hidden print:block text-right text-xs text-slate-600 mt-8">
      {code} {rev} ({date})
    </p>
  );
}
