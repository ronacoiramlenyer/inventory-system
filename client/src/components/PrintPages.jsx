import { useLayoutEffect, useRef, useState } from 'react';
import { PrintOrientation } from './PrintHeaderFooter';
import { paginatePrintRows } from '../utils/padRows';

const PX_PER_MM = 96 / 25.4;

// Every printed form here is a table split into one <table> per physical
// page so each page can carry its own "Page N of M" (Chrome exposes no page
// number to CSS or JS -- see paginatePrintRows). Getting the split right
// means knowing how many rows actually fit, and that cannot be a constant:
// a row holding "3D Printer Bambu lab. Serial No.03900D5C1511117" wraps to
// four lines and is roughly twice the height of a one-line row. Ten rows of
// the first overflow the sheet, the browser splits the table anyway, repeats
// its <thead>, and the same "Page 1 of 2" prints twice. So measure the rows
// instead of guessing: render the whole table off-screen at the real printed
// content width, read each row's height, and pack pages to the height that
// is genuinely left on the paper.
//
// Which paper, though, is the print dialog's business, not ours, and the two
// in use here differ in both directions -- A4 is taller than Letter but
// Letter is wider, and a narrower page wraps rows taller. So measure against
// both and give each row the larger of its two shares of a page. A split
// that fits the worse paper fits the other one too, at the cost of a little
// space at the bottom of the sheet when the better paper is loaded.
const PAPERS_MM = [
  { w: 210, h: 297 }, // A4
  { w: 215.9, h: 279.4 }, // US Letter
];
// The margins index.css declares for @page. Content is laid out inside them.
const MARGIN_X_MM = 0.4 * 2 * 25.4;
const MARGIN_Y_MM = (0.4 + 0.75) * 25.4;
// Rounding, borders collapsing differently at print scale, and hinting all
// cost a pixel here and there; a page filled to the last pixel would tip
// over on any of them, and tipping over is exactly the bug being fixed.
const SAFETY = 0.98;

function contentBoxes(landscape) {
  return PAPERS_MM.map(({ w, h }) => {
    const [across, down] = landscape ? [h, w] : [w, h];
    return {
      width: (across - MARGIN_X_MM) * PX_PER_MM,
      height: (down - MARGIN_Y_MM) * PX_PER_MM * SAFETY,
    };
  });
}

// Rows are packed by the fraction of a page each one takes up rather than by
// height, because "a page" is two different heights depending on the paper.
// Greedily fill to a whole page, then top up with blank rows so the sheet
// keeps the pre-numbered-paper-form look the templates use.
function packPages(rowShares, blankShare) {
  const pages = [];
  let count = 0;
  let used = 0;
  rowShares.forEach((share) => {
    // count > 0 keeps a row taller than a whole page on its own page rather
    // than looping forever trying to find one it fits on.
    if (count > 0 && used + share > 1) {
      pages.push({ count, used });
      count = 0;
      used = 0;
    }
    count += 1;
    used += share;
  });
  pages.push({ count, used });

  return pages.map(({ count: n, used: u }) => {
    let blanks = 0;
    let filled = u;
    while (blankShare > 0 && filled + blankShare <= 1) {
      filled += blankShare;
      blanks += 1;
    }
    return { count: n, blanks };
  });
}

function sameShape(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  return a.every((p, i) => p.count === b[i].count && p.blanks === b[i].blanks);
}

// Row heights and header height out of one rendered measuring copy, or null
// if it has not rendered yet.
function readTable(el, rowCount) {
  const table = el?.querySelector('table');
  const bodyRows = table?.tBodies?.[0]?.rows;
  if (!table || !bodyRows?.length) return null;
  const heights = Array.from(bodyRows, (tr) => tr.getBoundingClientRect().height);
  return {
    head: table.tHead ? table.tHead.getBoundingClientRect().height : 0,
    rows: heights.slice(0, rowCount),
    // The measuring copy carries one extra blank row at the end purely to
    // find out how tall an empty row is -- that is what a page is topped up
    // with, and it is shorter than most real rows.
    blank: heights[heights.length - 1],
  };
}

/**
 * Renders a multi-page printout of `rows`, one <table> per physical page.
 *
 * `children` is a render function called as
 * `(pageRows, pageIndex, pageCount, startIndex)` and must return the whole
 * table for that page -- including its <thead>, so the measuring pass sees
 * the same header the printer will. `startIndex` is the 1-based number of
 * the page's first row in the full list, for an "Item No." column.
 *
 * `minRows` is only the fallback split used if measuring cannot run at all.
 */
export default function PrintPages({ rows, landscape = false, minRows = 10, footer, children }) {
  const measureRefs = useRef([]);
  const [shape, setShape] = useState(null);
  const boxes = contentBoxes(landscape);
  const probeRows = [...rows, { __blank: true, id: '__print-probe' }];

  // No dependency array on purpose: row heights change with the data and
  // with the fonts finishing loading. Re-measuring every render is cheap,
  // and setShape keeps the previous object when nothing moved, so this
  // settles after one pass instead of looping.
  useLayoutEffect(() => {
    const measured = boxes.map((box, i) => {
      const m = readTable(measureRefs.current[i], rows.length);
      return m && box.height - m.head > 0 ? { ...m, budget: box.height - m.head } : null;
    });
    if (measured.some((m) => !m)) return;

    const shareOf = (pick) => Math.max(...measured.map((m) => pick(m) / m.budget));
    const rowShares = rows.map((_, i) => shareOf((m) => m.rows[i]));
    const next = packPages(rowShares, shareOf((m) => m.blank));
    setShape((prev) => (sameShape(prev, next) ? prev : next));
  });

  // Until the first measurement lands (and if the table never renders at
  // all), fall back to the old fixed split rather than printing nothing.
  let pages;
  if (shape) {
    let cursor = 0;
    pages = shape.map(({ count, blanks }, pageIndex) => {
      const slice = rows.slice(cursor, cursor + count);
      const start = cursor + 1;
      cursor += count;
      return {
        start,
        rows: [
          ...slice,
          ...Array.from({ length: blanks }, (_, i) => ({ __blank: true, id: `blank-${pageIndex}-${i}` })),
        ],
      };
    });
  } else {
    pages = paginatePrintRows(rows, minRows).map((pageRows, i) => ({
      start: i * minRows + 1,
      rows: pageRows,
    }));
  }

  return (
    <>
      {/* One copy per paper size, each laid out at that paper's printed
          content width but parked off-screen. They cannot live inside the
          print-only block below: that is display:none on screen, and a
          hidden element measures as zero. */}
      {boxes.map((box, i) => (
        <div
          key={i}
          aria-hidden
          className="no-print print-measure"
          style={{ position: 'absolute', top: 0, left: '-20000px', width: `${box.width}px` }}
        >
          <div ref={(el) => { measureRefs.current[i] = el; }}>{children(probeRows, 0, 1, 1)}</div>
        </div>
      ))}

      <div className="print-sheets hidden print:block">
        <PrintOrientation landscape={landscape} />
        {pages.map((page, i) => (
          <div key={i} style={i < pages.length - 1 ? { breakAfter: 'page' } : undefined}>
            {children(page.rows, i, pages.length, page.start)}
          </div>
        ))}
        {footer}
      </div>
    </>
  );
}
