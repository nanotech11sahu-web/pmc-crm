export function LeadTypeBadge({ type }) {
  const label = { hot: 'Hot', medium: 'Medium', cold: 'Cold' }[type] || type;
  return <span className={`badge badge-${type}`}>{label}</span>;
}

export function MissingBadge() {
  return <span className="badge badge-missing">Missing contact</span>;
}

// Three-case missing indicator (item 6): shows exactly what's absent.
export function MissingFieldBadge({ kind }) {
  if (!kind) return null;
  const map = {
    email: { label: 'No email', cls: 'bg-amber-500 text-white' },
    mobile: { label: 'No mobile', cls: 'bg-orange-500 text-white' },
    both: { label: 'No email & mobile', cls: 'bg-red-600 text-white' },
  };
  const s = map[kind];
  if (!s) return null;
  return <span className={`badge ${s.cls}`}>{s.label}</span>;
}

export function PremiumBadge() {
  return <span className="badge bg-yellow-400 text-yellow-900 border border-yellow-500">★ Premium</span>;
}

export function StageBadge({ stage }) {
  const styles = {
    new: 'bg-slate-100 text-slate-700',
    contacted: 'bg-indigo-100 text-indigo-700',
    followup: 'bg-amber-100 text-amber-700',
    converted: 'bg-green-100 text-green-700',
    lost: 'bg-slate-200 text-slate-500',
  };
  return <span className={`badge ${styles[stage] || 'bg-slate-100 text-slate-700'}`}>{stage}</span>;
}
