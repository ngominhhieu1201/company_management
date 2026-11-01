import { useEffect, useRef, useState } from 'react';

const MONTHS_VN = [
  'Th1',
  'Th2',
  'Th3',
  'Th4',
  'Th5',
  'Th6',
  'Th7',
  'Th8',
  'Th9',
  'Th10',
  'Th11',
  'Th12',
];

function parseKey(key: string) {
  const [ys, ms] = key.split('-');
  return { y: Number(ys), m: Number(ms) };
}

function toKey(y: number, m: number) {
  return `${y}-${String(m).padStart(2, '0')}`;
}

function displayLabel(key: string) {
  const { y, m } = parseKey(key);
  if (!y || !m) return key;
  return `Tháng ${m}/${y}`;
}

type Props = {
  value: string;
  onChange: (monthKey: string) => void;
  className?: string;
};

/** Custom month picker — replaces native `<input type="month">`. */
export default function MonthPicker({ value, onChange, className }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const selected = parseKey(value);
  const [viewYear, setViewYear] = useState(selected.y || new Date().getFullYear());

  useEffect(() => {
    if (open) setViewYear(selected.y || new Date().getFullYear());
  }, [open, selected.y]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const now = new Date();
  const thisMonth = toKey(now.getFullYear(), now.getMonth() + 1);

  return (
    <div className={`nx-month-picker ${className || ''}`.trim()} ref={rootRef}>
      <button
        type="button"
        className="nx-month-picker-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{displayLabel(value)}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" />
          <path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div className="nx-month-picker-pop" role="dialog" aria-label="Chọn tháng">
          <div className="nx-month-picker-year">
            <button
              type="button"
              aria-label="Năm trước"
              onClick={() => setViewYear((y) => y - 1)}
            >
              ‹
            </button>
            <strong>{viewYear}</strong>
            <button
              type="button"
              aria-label="Năm sau"
              onClick={() => setViewYear((y) => y + 1)}
            >
              ›
            </button>
          </div>
          <div className="nx-month-picker-grid">
            {MONTHS_VN.map((label, i) => {
              const m = i + 1;
              const key = toKey(viewYear, m);
              const active = value === key;
              return (
                <button
                  key={key}
                  type="button"
                  className={active ? 'active' : undefined}
                  onClick={() => {
                    onChange(key);
                    setOpen(false);
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div className="nx-month-picker-foot">
            <button
              type="button"
              className="ghost"
              onClick={() => {
                onChange(thisMonth);
                setOpen(false);
              }}
            >
              Tháng này
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
