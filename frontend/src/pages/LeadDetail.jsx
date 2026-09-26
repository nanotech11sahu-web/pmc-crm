import { useEffect, useState, useCallback } from 'react';
import { useParams, useLocation, Link } from 'react-router-dom';
import * as api from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import { LeadTypeBadge, StageBadge, MissingFieldBadge, PremiumBadge } from '../components/Badge.jsx';
import Spinner from '../components/Spinner.jsx';
import BulkSendModal from '../components/BulkSendModal.jsx';
import EditableDetailRow from '../components/EditableDetailRow.jsx';

// tbl_directory columns that are internal/computed or already shown
// elsewhere on the page — everything else is rendered in "All details".
const HIDDEN_DIR_FIELDS = new Set([
  'is_premium', 'missing_kind', 'contact_status',      // computed flags (shown as badges/tiles)
  'DirectoryID', 'CompanyName',                        // shown in the page header
  'CategoryName', 'category_names',                    // shown in the header; injected empty by the normalizer
  'BannerImage',                                       // hidden per request — not useful as a text field here
]);

// System/derived columns that must never be hand-edited — kept
// read-only. Everything else (including EstablishYear, Keywords,
// BusinessInfo, BannerImage) is editable. NOTE: those four are currently
// blocked by the backend PATCH whitelist and will show a clear "ask your
// admin to enable" message until the backend adds them — see
// API_CHANGE_premium_and_missing_filters.md §6.
const READONLY_DIR_FIELDS = new Set([
  'DirectorySlug', 'Status', 'ApprovalDate', 'is_verified', 'likes_count',
]);

// Fields that hold long free text — edited with a textarea, not a
// one-line input.
const MULTILINE_DIR_FIELDS = new Set(['BusinessInfo', 'Keywords', 'Address1']);

// "EmailAddress" -> "Email Address", "CurrentCity" -> "Current City"
function prettyLabel(key) {
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const EMPTY = (v) => v == null || String(v).trim() === '';

const TYPES = ['hot', 'medium', 'cold'];
const STAGES = ['new', 'contacted', 'followup', 'converted', 'lost'];
const ACTIVITY_TYPES = ['call', 'whatsapp', 'sms', 'email', 'note'];
const OUTCOMES = ['connected', 'no_answer', 'not_interested', 'converted', 'callback_requested'];

const ICON = { call: '📞', whatsapp: '💬', sms: '✉️', email: '📧', note: '📝', status_change: '🔀', type_change: '🔥', assignment_change: '👤', system: '⚙️', followup_scheduled: '⏰' };

function ActivityRow({ a, users }) {
  const who = users.find((u) => u.id === a.user_id)?.name || 'System';
  return (
    <div className="flex gap-3 py-3">
      <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-sm shrink-0">{ICON[a.activity_type] || '•'}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium capitalize">{a.activity_type.replace('_', ' ')}</span>
          {a.outcome && <span className="text-xs text-slate-400">· {a.outcome.replace('_', ' ')}</span>}
          <span className="text-xs text-slate-400 ml-auto">{new Date(a.occurred_at).toLocaleString()}</span>
        </div>
        {a.notes && <div className="text-sm text-slate-600 mt-0.5">{a.notes}</div>}
        <div className="text-xs text-slate-400 mt-0.5">by {who}</div>
      </div>
    </div>
  );
}

export default function LeadDetail() {
  const { directoryId } = useParams();
  const location = useLocation();
  const { user, can } = useAuth();
  const [leadId, setLeadId] = useState(location.state?.leadId || null);
  const [resolveError, setResolveError] = useState('');
  const [lead, setLead] = useState(null);
  const [activities, setActivities] = useState([]);
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [remark, setRemark] = useState('');
  const [batchLabel, setBatchLabel] = useState('');
  const [logForm, setLogForm] = useState({ activity_type: 'call', outcome: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);

  // Every listing behaves as a lead: if we weren't handed a leadId (e.g.
  // a direct URL visit, a bookmark, or a page refresh — React Router
  // state doesn't survive any of those), find its existing lead first;
  // only create a new one if it genuinely doesn't have one yet, so
  // there's still no separate "convert to lead" step to remember.
  useEffect(() => {
    if (leadId) return;
    (async () => {
      try {
        const allLeads = await api.listLeads({});
        const existing = allLeads.find((l) => String(l.directory_id) === String(directoryId));
        if (existing) {
          setLeadId(existing.id);
          return;
        }
        const created = await api.createLeadFromDirectory(directoryId, user.id, {});
        setLeadId(created.id);
      } catch (e) {
        setResolveError(`Couldn't open this listing (${e.message}). Go back to Listings and click it from there instead.`);
      }
    })();
  }, [directoryId, leadId, user.id]);

  const load = useCallback(() => {
    if (!leadId) return;
    api.getLead(leadId).then((l) => { setLead(l); setRemark(l.remark || ''); setBatchLabel(l.batch_label || ''); });
    api.listActivities(leadId).then(setActivities);
    api.listMessageLog(leadId).then(setMessages);
  }, [leadId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.listUsers().then(setUsers); }, []);

  async function updateField(patch) {
    await api.updateLead(leadId, patch, user.id);
    load();
  }

  async function saveRemark() {
    setSaving(true);
    try { await updateField({ remark, batch_label: batchLabel }); } finally { setSaving(false); }
  }

  async function logActivity(e) {
    e.preventDefault();
    await api.addActivity(leadId, logForm, user.id);
    setLogForm({ activity_type: 'call', outcome: '', notes: '' });
    load();
  }

  if (resolveError) return <div className="p-8"><div className="card p-6 text-red-600 text-sm max-w-md">{resolveError}</div></div>;
  if (!lead) return <div className="p-16 flex items-center justify-center"><Spinner size="lg" /></div>;
  const dir = lead.directory;

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto">
      <Link to="/listings" className="text-sm text-slate-400 hover:text-slate-700">← Back to listings</Link>

      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 mt-2 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex flex-wrap items-center gap-2">
            {dir?.CompanyName}
            {dir?.is_premium && <PremiumBadge />}
            <MissingFieldBadge kind={api.missingKind(dir || {})} />
          </h1>
          <p className="text-slate-500 text-sm">{dir?.CategoryName} · {dir?.CurrentCity} · {dir?.ContactName}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LeadTypeBadge type={lead.lead_type} />
          <StageBadge stage={lead.stage} />
          {can('message.bulk_send') && (
            <button className="btn btn-primary btn-sm" onClick={() => setSendOpen(true)}>Send WhatsApp / SMS / Email</button>
          )}
        </div>
      </div>

      <div className="card p-6 mb-6">
        <div className="flex items-baseline justify-between mb-1">
          <h2 className="font-semibold text-lg">All directory details</h2>
          <span className="text-xs text-slate-400">{can('directory.edit') ? 'Hover a row to edit · missing fields in red' : 'Missing fields in red'}</span>
        </div>
        <div className="text-xs text-slate-400 mb-4">Every field stored for this listing.</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12">
          {dir && Object.keys(dir)
            .filter((k) => !HIDDEN_DIR_FIELDS.has(k))
            .map((k) => (
              <EditableDetailRow
                key={k}
                directoryId={dir.DirectoryID ?? directoryId}
                fieldKey={k}
                label={prettyLabel(k)}
                value={dir[k]}
                canEdit={can('directory.edit')}
                readOnly={READONLY_DIR_FIELDS.has(k)}
                multiline={MULTILINE_DIR_FIELDS.has(k)}
                onSaved={load}
              />
            ))}
          {(!dir || Object.keys(dir).filter((k) => !HIDDEN_DIR_FIELDS.has(k)).length === 0) && (
            <div className="text-slate-400 py-2">No directory details available.</div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <div className="card p-5">
            <div className="font-semibold mb-3">Log a follow-up</div>
            <form onSubmit={logActivity} className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <select className="input flex-1 min-w-[140px]" value={logForm.activity_type} onChange={(e) => setLogForm((f) => ({ ...f, activity_type: e.target.value }))}>
                  {ACTIVITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                {logForm.activity_type === 'call' && (
                  <select className="input flex-1 min-w-[140px]" value={logForm.outcome} onChange={(e) => setLogForm((f) => ({ ...f, outcome: e.target.value }))}>
                    <option value="">Outcome...</option>
                    {OUTCOMES.map((o) => <option key={o} value={o}>{o.replace('_', ' ')}</option>)}
                  </select>
                )}
              </div>
              <textarea className="input" rows={2} placeholder="What happened / notes..." value={logForm.notes} onChange={(e) => setLogForm((f) => ({ ...f, notes: e.target.value }))} />
              <button className="btn btn-primary btn-sm" disabled={!can('lead.edit')}>Add to history</button>
            </form>
          </div>

          <div className="card p-5">
            <div className="font-semibold mb-1">Full history ({activities.length + messages.length})</div>
            <div className="text-xs text-slate-400 mb-2">Every call, message and status change for this lead, most recent first.</div>
            <div className="divide-y divide-slate-100">
              {activities.map((a) => <ActivityRow key={a.id} a={a} users={users} />)}
              {activities.length === 0 && <div className="text-sm text-slate-400 py-6 text-center">No activity logged yet.</div>}
            </div>
          </div>

          {messages.length > 0 && (
            <div className="card p-5">
              <div className="font-semibold mb-3">Message log</div>
              <div className="divide-y divide-slate-100">
                {messages.map((m) => (
                  <div key={m.id} className="py-2 text-sm flex justify-between">
                    <div>
                      <span className="capitalize font-medium">{m.channel}</span> to {m.recipient}
                    </div>
                    <span className={m.status === 'sent' ? 'text-green-600' : 'text-red-500'}>{m.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="card p-5">
            <div className="font-semibold mb-3">Lead details</div>
            <div className="space-y-3 text-sm">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Type</label>
                <select className="input" value={lead.lead_type} disabled={!can('lead.edit')} onChange={(e) => updateField({ lead_type: e.target.value })}>
                  {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Stage</label>
                <select className="input" value={lead.stage} disabled={!can('lead.edit')} onChange={(e) => updateField({ stage: e.target.value })}>
                  {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Owner</label>
                <select className="input" value={lead.owner_user_id || ''} disabled={!can('lead.assign')} onChange={(e) => updateField({ owner_user_id: Number(e.target.value) })}>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Email</label>
                <div>{dir?.EmailAddress || <span className="text-red-600 font-semibold">This is missing</span>}</div>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Mobile</label>
                <div>{dir?.MobileNumber || <span className="text-red-600 font-semibold">This is missing</span>}</div>
              </div>
            </div>
          </div>

          <div className="card p-5">
            <div className="font-semibold mb-3">Batch & remark</div>
            <label className="text-xs text-slate-400 block mb-1">Batch label</label>
            <input className="input mb-3" value={batchLabel} onChange={(e) => setBatchLabel(e.target.value)} placeholder="e.g. Plumbers - Kothrud - Batch 3" />
            <label className="text-xs text-slate-400 block mb-1">Remark</label>
            <textarea className="input" rows={4} value={remark} onChange={(e) => setRemark(e.target.value)} disabled={!can('lead.edit')} />
            <button className="btn btn-primary btn-sm w-full mt-3" disabled={saving || !can('lead.edit')} onClick={saveRemark}>{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </div>
      </div>

      {sendOpen && (
        <BulkSendModal
          leadIds={[leadId]}
          onClose={() => setSendOpen(false)}
          onSent={() => { setSendOpen(false); load(); }}
        />
      )}
    </div>
  );
}
