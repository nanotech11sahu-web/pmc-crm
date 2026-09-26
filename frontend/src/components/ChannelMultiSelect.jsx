import { useEffect, useRef, useState } from 'react';

const CHANNELS = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'sms', label: 'SMS' },
  { value: 'email', label: 'Email' },
];

// Compact multi-select for picking any combination of WhatsApp/SMS/Email
// at once (a plain <select> can only hold one value). `value` is a
// Set<string>, `onChange` receives the new Set.
export default function ChannelMultiSelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onDocClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  function toggle(v) {
    const next = new Set(value);
    next.has(v) ? next.delete(v) : next.add(v);
    if (next.size === 0) next.add(v); // never allow zero channels selected
    onChange(next);
  }

  const label = CHANNELS.filter((c) => value.has(c.value)).map((c) => c.label).join(' + ') || 'Select channel';

  return (
    <div className="relative" ref={ref}>
      <button type="button" className="input max-w-[220px] text-left flex items-center justify-between gap-2" onClick={() => setOpen((o) => !o)}>
        <span className="truncate">{label}</span>
        <span className="text-slate-400 text-xs">▾</span>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-48 card p-2 shadow-lg">
          {CHANNELS.map((c) => (
            <label key={c.value} className="flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-slate-50 cursor-pointer">
              <input type="checkbox" checked={value.has(c.value)} onChange={() => toggle(c.value)} />
              {c.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
