import { useState } from 'react';
import { SITE_ORIGIN } from '../api/client.js';

const CARD = `${SITE_ORIGIN}/assets/frontend/images/pmc-campaign-sample-card.jpg`;

// Compact, read-only preview of one fixed message, drawn like the channel it
// goes out on (WhatsApp / SMS bubble). Long messages show the first few lines
// with "Show full message" so the window stays small. The owner's name (when the
// template has one) is filled in by the backend when it actually sends.
export default function MessagePreview({ template, count }) {
  const [open, setOpen] = useState(false);
  const wa = template.channel === 'whatsapp';
  const long = (template.body || '').length > 140;
  return (
    <div className="space-y-1">
      <div className={`rounded-lg border px-2.5 py-2 text-xs leading-snug ${wa ? 'bg-green-50 border-green-100' : 'bg-slate-100 border-slate-200'}`}>
        {template.image && (
          <img
            src={template.imageUrl || CARD} alt="Sample PMC listing card"
            className="h-14 w-auto rounded border border-slate-200 mb-1.5"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        )}
        {template.body ? (
          <div className={`whitespace-pre-wrap text-slate-700 ${open ? 'max-h-60 overflow-y-auto' : 'max-h-[5.2rem] overflow-hidden'}`}>{template.body}</div>
        ) : (
          <div className="text-slate-500">
            Approved WhatsApp template{template.templateName ? <> <code>{template.templateName}</code></> : null}.
            <span className="block text-[11px] text-slate-400 mt-0.5">The exact wording is set on the server.</span>
          </div>
        )}
        {long && (
          <button type="button" className="mt-1.5 text-xs font-bold text-slate-800 hover:text-slate-950 underline-offset-2 hover:underline" onClick={() => setOpen((o) => !o)}>
            {open ? 'Show less ▴' : 'Show full message ▾'}
          </button>
        )}
      </div>
      <div className="text-[11px] text-slate-400">
        {count != null ? `${count.toLocaleString()} listing${count === 1 ? '' : 's'}` : ''}
        {count != null && template.abridged ? ' · ' : ''}
        {template.abridged ? 'wording shortened here' : ''}
      </div>
    </div>
  );
}
