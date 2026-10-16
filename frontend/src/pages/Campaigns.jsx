import { useCallback, useEffect, useRef, useState } from 'react';
import * as api from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import CampaignForm from '../components/CampaignForm.jsx';
import Spinner from '../components/Spinner.jsx';

// Campaigns: bulk send to whole categories on one or more channels, with
// live status. The list auto-refreshes every 60s so you see "X sent out of
// Y" move without reloading. API contract: backend/API_CHANGE_campaigns.md.

const POLL_MS = 60_000;
const PER_PAGE = 20;
const CHANNEL_LABEL = { whatsapp: 'WhatsApp', sms: 'SMS', email: 'Email', voice: 'Voice call' };

const STATUS = {
  queued: { label: 'Queued', cls: 'bg-slate-100 text-slate-600' },
  running: { label: 'Running', cls: 'bg-blue-100 text-blue-700' },
  completed: { label: 'Completed', cls: 'bg-green-100 text-green-700' },
  completed_with_errors: { label: 'Completed with errors', cls: 'bg-amber-100 text-amber-700' },
  cancelled: { label: 'Cancelled', cls: 'bg-slate-200 text-slate-500' },
  failed: { label: 'Failed', cls: 'bg-red-100 text-red-700' },
};
const isActive = (s) => s === 'queued' || s === 'running';
const processed = (c) => c.sent + c.failed + c.skipped;
const n = (v) => Number(v || 0).toLocaleString();
const fmt = (iso) => (iso ? new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

function StatusBadge({ status }) {
  const s = STATUS[status] || { label: status, cls: 'bg-slate-100 text-slate-600' };
  return (
    <span className={`badge ${s.cls}`}>
      {status === 'running' && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />}
      {s.label}
    </span>
  );
}

// Stacked bar: green = sent, red = failed, grey = skipped (no contact); the empty rest is still queued.
function ProgressBar({ counts }) {
  const total = counts.total || 1;
  const pct = (v) => `${(v / total) * 100}%`;
  return (
    <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden flex" title={`${n(processed(counts))} of ${n(counts.total)} processed`}>
      <div className="bg-green-500 h-full" style={{ width: pct(counts.sent) }} />
      <div className="bg-red-500 h-full" style={{ width: pct(counts.failed) }} />
      <div className="bg-slate-300 h-full" style={{ width: pct(counts.skipped) }} />
    </div>
  );
}

function Legend({ counts }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
      <span><b className="text-green-600">{n(counts.sent)}</b> sent</span>
      <span><b className="text-slate-700">{n(counts.delivered)}</b> delivered</span>
      <span><b className="text-red-600">{n(counts.failed)}</b> failed</span>
      <span><b className="text-slate-600">{n(counts.skipped)}</b> skipped</span>
      <span><b className="text-blue-600">{n(counts.queued)}</b> queued</span>
    </div>
  );
}

function CampaignCard({ c, onOpen }) {
  const shown = c.categories.slice(0, 4);
  return (
    <div
      role="button" tabIndex={0}
      onClick={onOpen} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(); }}
      className="card p-4 sm:p-5 cursor-pointer hover:border-slate-300 transition-colors"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold truncate">{c.name}</div>
          <div className="text-xs text-slate-400">
            {fmt(c.created_at)}{c.created_by?.name ? ` · by ${c.created_by.name}` : ''}{c.city ? ` · ${c.city}` : ''}
          </div>
        </div>
        <StatusBadge status={c.status} />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {shown.map((cat) => <span key={cat} className="badge bg-slate-100 text-slate-600">{cat}</span>)}
        {c.categories.length > shown.length && <span className="badge bg-slate-100 text-slate-500">+{c.categories.length - shown.length} more</span>}
        {c.channels.map((ch) => <span key={ch} className="badge bg-slate-900 text-white">{CHANNEL_LABEL[ch] || ch}</span>)}
      </div>

      <div className="mt-4 space-y-2">
        <div className="flex items-baseline justify-between text-sm">
          <span><b>{n(processed(c.totals))}</b> <span className="text-slate-400">of {n(c.totals.total)} processed</span></span>
          <span className="font-semibold">{c.totals.total ? Math.round((processed(c.totals) / c.totals.total) * 100) : 0}%</span>
        </div>
        <ProgressBar counts={c.totals} />
        <Legend counts={c.totals} />
      </div>

      {c.channels.length > 1 && (
        <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {c.channels.map((ch) => {
            const b = c.by_channel[ch];
            if (!b) return null;
            return (
              <div key={ch} className="text-xs">
                <div className="flex justify-between text-slate-500 mb-1"><span>{CHANNEL_LABEL[ch] || ch}</span><span>{n(b.sent)} / {n(b.total)} sent</span></div>
                <ProgressBar counts={b} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CampaignDetail({ id, initial, canCancel, canRetry, onClose, onChanged }) {
  const [c, setC] = useState(initial);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [rec, setRec] = useState(null); // null = not loaded
  const [recStatus, setRecStatus] = useState('failed');
  const [recChannel, setRecChannel] = useState('');
  const [recLoading, setRecLoading] = useState(false);

  const refresh = useCallback(async () => {
    try { setC(await api.getCampaign(id)); } catch (e) { setError(e.response?.data?.error || e.message); }
  }, [id]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    if (!isActive(c.status)) return undefined;
    const t = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, POLL_MS);
    return () => clearInterval(t);
  }, [c.status, refresh]);

  async function act(kind) {
    if (kind === 'cancel' && !window.confirm('Stop this campaign? Messages already sent stay sent; the rest will not be sent.')) return;
    setBusy(kind);
    setError('');
    try {
      if (kind === 'cancel') setC(await api.cancelCampaign(id));
      else { const r = await api.retryFailedCampaign(id); setC(r.campaign); }
      onChanged();
    } catch (e) {
      setError(e.response?.data?.error || e.message);
      // 409 = already finished / nothing to retry: pull the latest state so the buttons match reality.
      if (e.response?.status === 409) { refresh(); onChanged(); }
    } finally {
      setBusy('');
    }
  }

  async function loadRecipients() {
    setRecLoading(true);
    setError('');
    try { setRec(await api.listCampaignRecipients(id, { status: recStatus, channel: recChannel })); }
    catch (e) { setError(e.response?.data?.error || e.message); }
    finally { setRecLoading(false); }
  }

  const active = isActive(c.status);
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="card w-full max-w-3xl p-5 sm:p-6 my-4">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h2 className="text-lg font-bold truncate">{c.name}</h2>
            <div className="text-xs text-slate-400">
              Created {fmt(c.created_at)}{c.created_by?.name ? ` by ${c.created_by.name}` : ''} · Started {fmt(c.started_at)} · {c.finished_at ? `Finished ${fmt(c.finished_at)}` : 'Not finished'}
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <StatusBadge status={c.status} />
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label="Close">✕</button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 mb-4">
          {c.categories.map((cat) => <span key={cat} className="badge bg-slate-100 text-slate-600">{cat}</span>)}
          {c.city && <span className="badge bg-slate-100 text-slate-600">City: {c.city}</span>}
          {c.filters?.premium && c.filters.premium !== 'all' && <span className="badge bg-yellow-100 text-yellow-800">{c.filters.premium === 'premium' ? 'Premium only' : 'Non-premium only'}</span>}
        </div>

        <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 mb-4">
          <div className="flex items-baseline justify-between mb-2">
            <div className="text-sm text-slate-500"><b className="text-xl text-slate-900">{n(processed(c.totals))}</b> of {n(c.totals.total)} messages processed · {n(c.audience_total)} listings</div>
            <div className="font-semibold">{c.totals.total ? Math.round((processed(c.totals) / c.totals.total) * 100) : 0}%</div>
          </div>
          <ProgressBar counts={c.totals} />
          <div className="mt-2"><Legend counts={c.totals} /></div>
        </div>

        <div className="overflow-x-auto border rounded-lg mb-4">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-400 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-3 py-2">Channel</th>
                {['Total', 'Sent', 'Delivered', 'Failed', 'Skipped', 'Queued'].map((h) => <th key={h} className="text-right px-3 py-2">{h}</th>)}
                <th className="px-3 py-2 w-32" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {c.channels.map((ch) => {
                const b = c.by_channel[ch];
                if (!b) return null;
                return (
                  <tr key={ch}>
                    <td className="px-3 py-2 font-medium">{CHANNEL_LABEL[ch] || ch}</td>
                    <td className="px-3 py-2 text-right">{n(b.total)}</td>
                    <td className="px-3 py-2 text-right text-green-600">{n(b.sent)}</td>
                    <td className="px-3 py-2 text-right">{n(b.delivered)}</td>
                    <td className="px-3 py-2 text-right text-red-600">{n(b.failed)}</td>
                    <td className="px-3 py-2 text-right text-slate-500">{n(b.skipped)}</td>
                    <td className="px-3 py-2 text-right text-blue-600">{n(b.queued)}</td>
                    <td className="px-3 py-2"><ProgressBar counts={b} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="text-xs text-slate-400 -mt-2 mb-4">
          Skipped = the listing has no email / mobile for that channel. {active ? 'Auto-refreshing every 60 seconds.' : ''} Last updated {fmt(c.updated_at)}.
        </div>

        <div className="border rounded-lg p-3 mb-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-medium mr-auto">Recipients</div>
            <select className="input max-w-[150px]" value={recStatus} onChange={(e) => setRecStatus(e.target.value)}>
              <option value="failed">Failed</option>
              <option value="skipped">Skipped</option>
              <option value="">All</option>
              <option value="sent">Sent</option>
              <option value="queued">Queued</option>
            </select>
            <select className="input max-w-[140px]" value={recChannel} onChange={(e) => setRecChannel(e.target.value)}>
              <option value="">All channels</option>
              {c.channels.map((ch) => <option key={ch} value={ch}>{CHANNEL_LABEL[ch] || ch}</option>)}
            </select>
            <button className="btn btn-secondary btn-sm" onClick={loadRecipients} disabled={recLoading}>{recLoading ? 'Loading…' : 'Show'}</button>
          </div>
          {rec && (
            rec.demo ? (
              <div className="text-sm text-slate-400 mt-3">Recipient details aren't available in demo mode.</div>
            ) : rec.rows.length === 0 ? (
              <div className="text-sm text-slate-400 mt-3">No recipients match.</div>
            ) : (
              <div className="mt-3 max-h-64 overflow-y-auto divide-y divide-slate-100 text-sm">
                {rec.rows.map((r) => (
                  <div key={r.id} className="py-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                    <span className="badge bg-slate-100 text-slate-500">{CHANNEL_LABEL[r.channel] || r.channel}</span>
                    <span className="font-medium">{r.company_name || `#${r.directory_id}`}</span>
                    <span className="text-slate-500">{r.recipient || '—'}</span>
                    <span className={`ml-auto ${r.status === 'failed' ? 'text-red-600' : r.status === 'sent' || r.status === 'delivered' ? 'text-green-600' : 'text-slate-500'}`}>
                      {r.status}{r.error ? ` · ${r.error}` : ''}
                    </span>
                  </div>
                ))}
                {rec.total > rec.rows.length && <div className="py-2 text-xs text-slate-400">Showing {rec.rows.length} of {n(rec.total)}.</div>}
              </div>
            )
          )}
        </div>

        {error && <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}

        <div className="flex flex-wrap items-center justify-end gap-2">
          <button className="btn btn-secondary" onClick={refresh}>Refresh</button>
          {canRetry && c.status !== 'cancelled' && c.totals.failed > 0 && (
            <button className="btn btn-secondary" disabled={!!busy} onClick={() => act('retry')}>{busy === 'retry' ? 'Retrying…' : `Retry ${n(c.totals.failed)} failed`}</button>
          )}
          {canCancel && active && (
            <button className="btn btn-danger" disabled={!!busy} onClick={() => act('cancel')}>{busy === 'cancel' ? 'Stopping…' : 'Cancel campaign'}</button>
          )}
          <button className="btn btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

export default function Campaigns() {
  const { can } = useAuth();
  const canView = can('campaign.view') || can('message.bulk_send');
  const canCreate = can('campaign.create') || can('message.bulk_send');
  const canCancel = can('campaign.cancel') || canCreate;

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(''); // server said 403: this role lacks a campaign.* permission
  const [updatedAt, setUpdatedAt] = useState(null);
  const [demo, setDemo] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [detail, setDetail] = useState(null); // campaign being viewed
  const lastLoad = useRef(0);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.listCampaigns({ page, perPage: PER_PAGE });
      setRows(res.rows);
      setTotal(res.total);
      setDemo(api.campaignsInDemoMode());
      setError('');
      setForbidden('');
      lastLoad.current = Date.now();
      setUpdatedAt(new Date());
    } catch (e) {
      if (e.response?.status === 403) setForbidden(e.response.data?.error || 'Forbidden');
      else setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { if (canView) load(); }, [load, canView]);

  // Auto-refresh every 60s (skipped while the tab is hidden; catches up when it's shown again).
  useEffect(() => {
    if (!canView) return undefined;
    const tick = setInterval(() => { if (document.visibilityState === 'visible') load({ silent: true }); }, POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible' && Date.now() - lastLoad.current > POLL_MS) load({ silent: true }); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(tick); document.removeEventListener('visibilitychange', onVisible); };
  }, [load, canView]);

  if (!canView) {
    return <div className="p-8"><div className="card p-6 text-sm text-slate-500 max-w-md">You don't have access to Campaigns.</div></div>;
  }

  if (forbidden) {
    return (
      <div className="p-4 sm:p-8 max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">Campaigns</h1>
        <div className="card p-6 max-w-xl">
          <div className="font-semibold mb-1">You don't have access to Campaigns yet</div>
          <p className="text-sm text-slate-500 mb-3">The server says: <span className="text-red-600">{forbidden}</span></p>
          <p className="text-sm text-slate-500">Ask an admin to grant your role the <code>campaign.view</code>, <code>campaign.create</code> and <code>campaign.cancel</code> permissions (Users &amp; Roles), then reload this page.</p>
        </div>
      </div>
    );
  }

  const activeCount = rows.filter((r) => isActive(r.status)).length;
  const sentOnPage = rows.reduce((s, r) => s + r.totals.sent, 0);
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Campaigns</h1>
          <p className="text-slate-500 text-sm">Send to whole categories on WhatsApp, SMS and Email, and watch the status update live.</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button className="btn btn-secondary" onClick={() => load()} disabled={loading}>Refresh</button>
          {canCreate && <button className="btn btn-primary" onClick={() => setFormOpen(true)}>+ New campaign</button>}
        </div>
      </div>

      {demo && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <b>Demo mode.</b> The campaigns API isn't live yet, so campaigns here are saved in this browser only and progress is
          simulated — <b>no messages are actually sent</b>. It switches to the real thing automatically once the backend ships
          (see <code>backend/API_CHANGE_campaigns.md</code>).
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="card p-4"><div className="text-xs text-slate-400 uppercase tracking-wide">Campaigns</div><div className="text-2xl font-bold">{n(total)}</div></div>
        <div className="card p-4"><div className="text-xs text-slate-400 uppercase tracking-wide">Active now</div><div className="text-2xl font-bold text-blue-600">{n(activeCount)}</div></div>
        <div className="card p-4"><div className="text-xs text-slate-400 uppercase tracking-wide">Sent (this page)</div><div className="text-2xl font-bold text-green-600">{n(sentOnPage)}</div></div>
      </div>

      <div className="flex items-center justify-between text-xs text-slate-400 mb-3">
        <span>{updatedAt ? `Updated ${updatedAt.toLocaleTimeString()} · auto-refreshes every 60 seconds` : ''}</span>
      </div>

      {error && <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}

      {loading && rows.length === 0 ? (
        <div className="p-16 flex justify-center"><Spinner size="lg" /></div>
      ) : rows.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="font-semibold mb-1">No campaigns yet</div>
          <div className="text-sm text-slate-400 mb-4">Create one to message every listing in the categories you pick.</div>
          {canCreate && <button className="btn btn-primary" onClick={() => setFormOpen(true)}>+ New campaign</button>}
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((c) => <CampaignCard key={c.id} c={c} onOpen={() => setDetail(c)} />)}
        </div>
      )}

      {total > PER_PAGE && (
        <div className="flex items-center justify-between mt-4 text-sm text-slate-500">
          <div>{n(total)} campaigns</div>
          <div className="flex gap-2 items-center">
            <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
            <span>Page {page} / {totalPages}</span>
            <button className="btn btn-secondary btn-sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        </div>
      )}

      {formOpen && (
        <CampaignForm
          onClose={() => setFormOpen(false)}
          onCreated={(campaign) => { setFormOpen(false); setPage(1); load({ silent: true }); setDetail(campaign); }}
        />
      )}

      {detail && (
        <CampaignDetail
          key={detail.id}
          id={detail.id}
          initial={detail}
          canCancel={canCancel}
          canRetry={canCreate}
          onClose={() => setDetail(null)}
          onChanged={() => load({ silent: true })}
        />
      )}
    </div>
  );
}
