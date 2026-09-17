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
