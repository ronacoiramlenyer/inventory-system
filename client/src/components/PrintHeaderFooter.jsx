// Browsers give the page no way to know how many pages printing will
// actually produce (no CSS/JS API reports it, and Chrome ignores @page
// margin-box counters), so an exact "page X of Y" isn't achievable from
// here. This estimates the page count from row count instead, so a long
// sheet at least shows more than 1 rather than a permanently-stuck "1 of 1"
// -- rowsPerPage should roughly match how many table rows this particular
// print layout actually fits on one sheet.
export function estimatePageLabel(rowCount, rowsPerPage = 20) {
  const total = Math.max(1, Math.ceil(rowCount / rowsPerPage));
  return `Page 1 of ${total}`;
}

// Matches the official F-LAB template's print header (school seal + page
// label) and footer (form code/revision). Print-only -- the app's own
// Layout header already covers the on-screen view.
//
// This sits in normal document flow, so on a form whose printout runs to
// more than one physical page it only appears once, at the very top of
// page 1 -- Chrome has no reliable way to pin fixed-position content into
// a page's top margin for print (tried position:fixed with a negative
// top-offset pulled up from the @page content box; it rendered correctly
// on some pages and duplicated onto the wrong page on others). For a form
// whose printed table can span multiple pages, use PrintHeaderRow instead,
// placed as the first row of the table's own <thead> -- browsers already
// reliably repeat <thead> on every page a table breaks across, same as the
// column-header row already does.
export function PrintHeader({ pageLabel = 'Page 1 of 1' }) {
  return (
    <div className="hidden print:grid grid-cols-3 items-center mb-3">
      <span />
      <img src="/lsgh-logo.png" alt="La Salle Green Hills" className="h-14 w-auto justify-self-center" />
      <span className="italic text-sm text-slate-700 justify-self-end">{pageLabel}</span>
    </div>
  );
}

// Same content as PrintHeader, but as a <thead> row so it repeats on every
// physical page a long table spans -- see the note on PrintHeader above.
// colSpan must match the number of print-visible <th> columns in that
// table (i.e. excluding any no-print action column).
//
// Uses the same 3-column grid as PrintHeader (empty / logo centered / page
// label at the far right) instead of centering logo+label together as one
// block -- that made the label look glued to the logo's right edge rather
// than sitting at the true top-right corner of the table.
export function PrintHeaderRow({ pageLabel = 'Page 1 of 1', colSpan }) {
  return (
    <tr className="hidden print:table-row">
      <th colSpan={colSpan} className="p-0 border-0 font-normal pb-3">
        <div className="print:grid grid-cols-3 items-center w-full">
          <span />
          <img src="/lsgh-logo.png" alt="La Salle Green Hills" className="h-14 w-auto justify-self-center" />
          <span className="italic text-sm text-slate-700 justify-self-end">{pageLabel}</span>
        </div>
      </th>
    </tr>
  );
}

// Repeats the on-screen form title (and an optional subtitle line, e.g.
// "Laboratory: X") as the second row of the table's own <thead>, right
// after PrintHeaderRow -- these forms render their title as a normal <h2>
// (and sometimes a <p>) *before* the <table>, which put them above the
// seal in print despite PrintHeaderRow existing, since document flow just
// follows JSX order. The on-screen h2/p should carry `print:hidden` so
// they don't print twice once this takes over for print.
export function PrintTitleRow({ title, subtitle, colSpan, center = false }) {
  return (
    <tr className="hidden print:table-row">
      <th colSpan={colSpan} className={`p-0 border-0 font-normal pb-4 ${center ? 'text-center' : 'text-left'}`}>
        <div className="text-lg font-bold text-slate-800">{title}</div>
        {subtitle && <div className="text-sm font-normal text-slate-800 mt-1">{subtitle}</div>}
      </th>
    </tr>
  );
}

// position:fixed is one of the few pagination behaviors browsers *do*
// support reliably for print -- a fixed element repeats on every printed
// page -- so this uses it instead of being placed once at the end of the
// document's flow, which only ever landed on the last page.
export function PrintFooter({ code, date, rev = 'Rev. 0' }) {
  return (
    <p className="hidden print:block print:fixed print:bottom-2 print:right-6 text-right text-xs text-slate-600">
      {code} {rev} ({date})
    </p>
  );
}
