import { useRef, useState } from 'react';

// Drives a progress bar for actions with no real progress events to report
// (a JSON PUT/POST, not a file upload) -- eases toward 90% while the
// request is in flight and only jumps to 100% once it actually resolves,
// so it never claims to be done before the work is.
export function useProgress() {
  const [progress, setProgress] = useState(0);
  const [label, setLabel] = useState('');
  const timerRef = useRef(null);

  function start(startLabel) {
    clearInterval(timerRef.current);
    setLabel(startLabel);
    setProgress(8);
    timerRef.current = setInterval(() => {
      setProgress((p) => (p < 90 ? p + (90 - p) * 0.15 : p));
    }, 200);
  }

  function advance(nextLabel) {
    setLabel(nextLabel);
  }

  function finish() {
    clearInterval(timerRef.current);
    setProgress(100);
    setTimeout(() => {
      setProgress(0);
      setLabel('');
    }, 500);
  }

  function stop() {
    clearInterval(timerRef.current);
    setProgress(0);
    setLabel('');
  }

  return { progress, label, start, advance, finish, stop };
}

export default function ProgressBar({ progress, label }) {
  if (!progress) return null;
  return (
    <div className="no-print">
      {label && <p className="text-xs text-slate-500 mb-1">{label}</p>}
      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-emerald-500 rounded-full transition-all duration-300 ease-out"
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        />
      </div>
    </div>
  );
}
