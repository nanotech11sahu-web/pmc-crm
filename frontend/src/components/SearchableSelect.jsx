import { useEffect, useRef, useState } from 'react';

// A searchable dropdown for long option lists (216 categories, dozens of
// cities) — typing filters the list instead of scrolling a giant native
// <select>. Value/onChange work with plain strings, same as a native
// select, so it drops in wherever one was used.
export default function SearchableSelect({ value, onChange, options, placeholder = 'All', className = '', disabled = false }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    function onClickOutside(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const filtered = query
    ? options.filter((o) => o.toLowerCase().includes(query.toLowerCase()))
    : options;

  function select(v) {
    onChange(v);
    setOpen(false);
    setQuery('');
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        className="input flex items-center justify-between text-left disabled:opacity-50 disabled:cursor-not-allowed"
        onClick={() => setOpen((o) => !o)}
      >
        <span className={value ? '' : 'text-slate-400'}>{value || placeholder}</span>
        <span className="text-slate-400 text-xs ml-2">▾</span>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full min-w-[220px] rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="p-2 border-b border-slate-100">
            <input
              ref={inputRef}
              className="input py-1.5 text-sm"
              placeholder={`Search ${placeholder.toLowerCase()}...`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') { setOpen(false); setQuery(''); } }}
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            <button
              type="button"
              className={`w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50 ${!value ? 'font-semibold text-slate-900' : 'text-slate-600'}`}
              onClick={() => select('')}
            >
              {placeholder}
            </button>
            {filtered.map((o) => (
              <button
                key={o}
                type="button"
                className={`w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50 ${value === o ? 'font-semibold text-slate-900 bg-slate-50' : 'text-slate-600'}`}
                onClick={() => select(o)}
              >
                {o}
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-sm text-slate-400">No matches</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
