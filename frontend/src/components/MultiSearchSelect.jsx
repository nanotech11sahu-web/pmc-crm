import { useEffect, useRef, useState } from 'react';

// Searchable multi-select for long lists (the 216 categories). `value` is
// an array of strings; selected items also show as removable chips below
// the trigger so the user always sees exactly what is chosen.
export default function MultiSearchSelect({ value, onChange, options, placeholder = 'Select…', noun = 'item', plural }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const selected = new Set(value);
  const many = plural || `${noun}s`;

  useEffect(() => {
    function onClickOutside(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) { setOpen(false); setQuery(''); }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  const filtered = query ? options.filter((o) => o.toLowerCase().includes(query.toLowerCase())) : options;

  function toggle(o) {
    onChange(selected.has(o) ? value.filter((v) => v !== o) : [...value, o]);
  }
  function addAllShown() {
    onChange([...new Set([...value, ...filtered])]);
  }

  return (
    <div ref={rootRef}>
      <div className="relative">
        <button type="button" className="input flex items-center justify-between text-left" onClick={() => setOpen((o) => !o)}>
          <span className={value.length ? '' : 'text-slate-400'}>
            {value.length ? `${value.length} ${value.length === 1 ? noun : many} selected` : placeholder}
          </span>
          <span className="text-slate-400 text-xs ml-2">▾</span>
        </button>

        {open && (
          <div className="absolute z-30 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
            <div className="p-2 border-b border-slate-100 flex gap-2">
              <input
                ref={inputRef}
                className="input py-1.5 text-sm"
                placeholder={`Search ${many}...`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') { setOpen(false); setQuery(''); } }}
              />
              <button type="button" className="btn btn-secondary btn-sm whitespace-nowrap" onClick={addAllShown} disabled={filtered.length === 0}>
                Add {query ? 'shown' : 'all'}
              </button>
            </div>
            <div className="max-h-64 overflow-y-auto py-1">
              {filtered.map((o) => (
                <label key={o} className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-slate-50 cursor-pointer">
                  <input type="checkbox" checked={selected.has(o)} onChange={() => toggle(o)} />
                  <span className="truncate">{o}</span>
                </label>
              ))}
              {filtered.length === 0 && <div className="px-3 py-2 text-sm text-slate-400">No matches</div>}
            </div>
          </div>
        )}
      </div>

      {value.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5 items-center">
          {value.map((v) => (
            <span key={v} className="badge bg-slate-900 text-white">
              {v}
              <button type="button" className="opacity-70 hover:opacity-100" onClick={() => toggle(v)} aria-label={`Remove ${v}`}>✕</button>
            </span>
          ))}
          <button type="button" className="text-xs text-slate-400 hover:text-slate-600" onClick={() => onChange([])}>clear all</button>
        </div>
      )}
    </div>
  );
}
