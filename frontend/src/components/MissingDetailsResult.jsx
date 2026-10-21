import { KIND_LABEL } from '../utils/missingDetails.js';

// Result of a "request missing details" WhatsApp send: totals per route,
// plus every listing that wasn't sent with the reason.
export default function MissingDetailsResult({ result, onClose }) {
  const sum = (k) => result.groups.reduce((s, g) => s + g[k], 0);
  const problems = result.groups.flatMap((g) => g.results.filter((r) => r.status !== 'sent').map((r) => ({ ...r, kind: g.kind })));
  const errors = result.groups.filter((g) => g.error);
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="card w-full max-w-xl p-5 sm:p-6 my-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Send result</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label="Close">✕</button>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="rounded-lg bg-green-50 border border-green-100 p-3"><div className="text-xs text-green-700">Sent</div><div className="text-2xl font-bold text-green-700">{sum('sent').toLocaleString()}</div></div>
          <div className="rounded-lg bg-red-50 border border-red-100 p-3"><div className="text-xs text-red-700">Failed</div><div className="text-2xl font-bold text-red-700">{sum('failed').toLocaleString()}</div></div>
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3"><div className="text-xs text-slate-500">Skipped</div><div className="text-2xl font-bold text-slate-600">{sum('skipped').toLocaleString()}</div></div>
        </div>
        <div className="text-xs text-slate-400 mb-3">
          "Sent" means it was accepted for delivery — delivery is confirmed later and shows in the listing's message history.
          {result.leftOut ? ` ${result.leftOut.toLocaleString()} listing(s) with complete details were left out.` : ''}
        </div>

        <div className="space-y-1 mb-3 text-sm">
          {result.groups.map((g) => (
            <div key={g.templateId || g.kind} className="flex justify-between">
              <span>{g.title || KIND_LABEL[g.kind]}{g.template ? <span className="text-slate-400"> · {g.template}</span> : null}</span>
              <span className="text-slate-500">{g.sent} sent · {g.failed} failed · {g.skipped} skipped</span>
            </div>
          ))}
        </div>

        {errors.map((g) => (
          <div key={g.templateId || g.kind} className="mb-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {g.title || KIND_LABEL[g.kind]}: {g.error}
          </div>
        ))}

        {problems.length > 0 && (
          <div className="max-h-64 overflow-y-auto border rounded-lg divide-y divide-slate-100 text-sm">
            {problems.map((p, i) => (
              <div key={`${p.directoryId}-${i}`} className="px-3 py-2">
                <div className="flex justify-between gap-2">
                  <span className="font-medium truncate">{result.names.get(p.directoryId) || `#${p.directoryId}`}</span>
                  <span className={p.status === 'failed' ? 'text-red-600' : 'text-slate-500'}>{p.status}</span>
                </div>
                <div className="text-xs text-slate-400">{p.error || '—'}</div>
              </div>
            ))}
          </div>
        )}

        <button className="btn btn-primary w-full mt-4" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}
