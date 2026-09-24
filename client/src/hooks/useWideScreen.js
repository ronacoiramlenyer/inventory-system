import { useEffect, useState } from 'react';

// Whether the viewport is at least Tailwind's `lg` breakpoint.
//
// A CSS-only two-column layout would have to render both columns at every
// width and stack them on a narrow screen, which puts a second set of column
// headers halfway down the list. Asking the browser which width we are at
// lets a narrow screen render one column, with one header, as before.
export default function useWideScreen(query = '(min-width: 1024px)') {
  const [wide, setWide] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : true
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = (e) => setWide(e.matches);
    setWide(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return wide;
}
