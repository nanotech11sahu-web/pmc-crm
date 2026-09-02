export function LeadTypeBadge({ type }) {
  const label = { hot: 'Hot', medium: 'Medium', cold: 'Cold' }[type] || type;
  return <span className={`badge badge-${type}`}>{label}</span>;
}

export function MissingBadge() {
  return <span className="badge badge-missing">Missing contact</span>;
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
