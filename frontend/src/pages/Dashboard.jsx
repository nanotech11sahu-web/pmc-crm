import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import Spinner from '../components/Spinner.jsx';

const TONES = { slate: 'text-slate-900', red: 'text-red-600', amber: 'text-amber-600', orange: 'text-orange-600', blue: 'text-blue-600', green: 'text-green-600' };

function StatCard({ label, value, sub, tone = 'slate' }) {
  return (
    <div className="card p-5">
      <div className="text-xs font-medium text-slate-400 uppercase tracking-wide">{label}</div>
      <div className={`text-3xl font-bold mt-1 ${TONES[tone]}`}>{value}</div>
      {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
    </div>
  );
}

// Clickable stat: jumps to Listings pre-filtered to the matching case.
function LinkStatCard({ label, value, sub, tone = 'slate', to }) {
  return (
    <Link to={to} className="card p-5 hover:border-slate-300 hover:shadow-sm transition group block">
      <div className="text-xs font-medium text-slate-400 uppercase tracking-wide">{label}</div>
      <div className={`text-3xl font-bold mt-1 ${TONES[tone]}`}>{value == null ? '—' : value}</div>
      <div className="text-xs text-slate-400 mt-1 group-hover:text-slate-600">{sub} →</div>
    </Link>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.dashboardStats().then(setStats);
  }, []);

  if (!stats) return <div className="p-16 flex items-center justify-center"><Spinner size="lg" /></div>;

  return (
    <div className="p-8 max-w-6xl">
      <h1 className="text-2xl font-bold mb-1">Welcome back, {user?.name?.split(' ')[0]}</h1>
      <p className="text-slate-500 mb-6">Here's what's happening across your directory and leads.</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <StatCard label="Total Listings" value={stats.totalListings} />
        <StatCard label="Hot Leads" value={stats.leadsByType.hot} tone="red" />
        <StatCard label="Follow-ups Today" value={stats.followupsToday} tone="amber" />
        <StatCard label="Messages Sent" value={stats.messagesSentTotal} tone="green" />
      </div>

      <div className="mb-2 text-xs font-semibold text-slate-400 uppercase tracking-wide">Missing contact details — click to see those listings</div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <LinkStatCard label="Email missing" value={stats.missingEmailCount} tone="amber"
          sub="Has mobile, no email" to="/listings?contactStatus=email" />
        <LinkStatCard label="Mobile missing" value={stats.missingMobileCount} tone="orange"
          sub="Has email, no mobile" to="/listings?contactStatus=mobile" />
        <LinkStatCard label="Email & mobile missing" value={stats.missingBothCount} tone="red"
          sub="Neither on file" to="/listings?contactStatus=both" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card p-5">
          <div className="font-semibold mb-3">Leads by type</div>
          <div className="space-y-2">
            {Object.entries(stats.leadsByType).map(([type, count]) => (
              <div key={type} className="flex items-center gap-3">
                <div className="w-16 text-sm capitalize">{type}</div>
                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${type === 'hot' ? 'bg-red-500' : type === 'medium' ? 'bg-amber-500' : 'bg-blue-500'}`}
                    style={{ width: `${(count / (stats.leadsByType.hot + stats.leadsByType.medium + stats.leadsByType.cold || 1)) * 100}%` }}
                  />
                </div>
                <div className="w-6 text-sm text-right text-slate-500">{count}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <div className="font-semibold mb-3">Leads by stage</div>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(stats.leadsByStage).map(([stage, count]) => (
              <div key={stage} className="rounded-lg bg-slate-50 px-3 py-2">
                <div className="text-xs text-slate-400 capitalize">{stage}</div>
                <div className="font-bold">{count}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 flex gap-3">
        <Link to="/listings" className="btn btn-primary">Go to listings</Link>
      </div>
    </div>
  );
}
