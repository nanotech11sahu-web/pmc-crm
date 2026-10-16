import { useEffect, useState } from 'react';
import * as api from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import MultiSearchSelect from './MultiSearchSelect.jsx';
import SearchableSelect from './SearchableSelect.jsx';
import CampaignMessagePreview from './CampaignMessagePreview.jsx';

const CHANNELS = ['whatsapp', 'sms', 'email', 'voice'];
const LABEL = { whatsapp: 'WhatsApp', sms: 'SMS', email: 'Email', voice: 'Voice call' };
const PERM_FOR = { whatsapp: 'message.send_whatsapp', sms: 'message.send_sms', email: 'message.send_email', voice: 'message.send_voice' };
// "New campaign" form: pick one or many categories, one or many channels
// (each sends its own fixed message set up on the server), see the audience, then send. The
// campaign is saved straight away and tracked on the Campaigns page.
export default function CampaignForm({ onClose, onCreated }) {
  const { user, can } = useAuth();
  const [meta, setMeta] = useState({ categories: [], cities: [] });
  const [name, setName] = useState('');
  const [categories, setCategories] = useState([]);
  const [city, setCity] = useState('');
  const [premium, setPremium] = useState('all');
  const [channels, setChannels] = useState([]);
  const [preview, setPreview] = useState(null); // null | 'loading' | 'error' | {blocked: message} | {listings, by_channel, demo}
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // One key per opened form: a double click / retry can't create two campaigns.
  const [idempotencyKey] = useState(() => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`));

  useEffect(() => {
    api.filterMeta().then(setMeta).catch(() => {});
  }, []);

  // Live audience preview, debounced so ticking several categories fires one request.
  useEffect(() => {
    if (categories.length === 0) { setPreview(null); return undefined; }
    let stale = false;
    setPreview('loading');
    const t = setTimeout(() => {
      api.previewCampaign({ categories, city: city || null, filters: { premium, contact_status: '' }, channels })
        .then((p) => { if (!stale) setPreview(p); })
        .catch((e) => {
          if (stale) return;
          // 422 = the audience itself is unusable (no listings / over the cap / unknown category): say why.
          setPreview(e.response?.status === 422 ? { blocked: e.response.data?.error || 'No listings match these filters' } : 'error');
        });
    }, 500);
    return () => { stale = true; clearTimeout(t); };
  }, [categories, city, premium, channels]);

  function toggleChannel(c) {
    setChannels((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }

  const previewBlocked = preview && typeof preview === 'object' ? preview.blocked : '';
  const previewReady = preview && typeof preview === 'object' && !preview.blocked;
  const permsOk = channels.every((c) => can(PERM_FOR[c]));
  const canSubmit = categories.length > 0 && channels.length > 0 && permsOk && !busy && !previewBlocked;

  async function submit() {
    const audience = previewReady ? `${preview.listings.toLocaleString()} listing(s)` : 'all matching listings';
    const msg = `Send to ${audience} in ${categories.length} categor${categories.length === 1 ? 'y' : 'ies'} via ${channels.map((c) => LABEL[c]).join(' + ')}?\n\nThis starts sending right away.`;
    if (!window.confirm(msg)) return;
    setBusy(true);
    setError('');
    try {
      const campaign = await api.createCampaign({
        idempotency_key: idempotencyKey,
        name: name.trim() || undefined,
        categories, city: city || null,
        filters: { premium, contact_status: '' },
        channels,
      }, user);
      onCreated(campaign);
    } catch (e) {
      const d = e.response?.data;
      setError(d?.error ? `${d.error}${d.fields ? ` — ${Object.values(d.fields).join('; ')}` : ''}` : e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="card w-full max-w-2xl p-6 my-4">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-bold">New campaign</h2>
            <p className="text-xs text-slate-400">Pick who to message and how. It's saved and tracked on the Campaigns page.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label="Close">✕</button>
        </div>

        <div className="space-y-5">
          <div>
            <label className="text-sm font-medium block mb-1">Campaign name <span className="text-slate-400 font-normal">(optional)</span></label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Diwali offer – Rourkela plumbers" />
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">1. Categories <span className="text-slate-400 font-normal">(pick one or many)</span></label>
            <MultiSearchSelect value={categories} onChange={setCategories} options={meta.categories} placeholder="Select categories…" noun="category" plural="categories" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium block mb-1">City <span className="text-slate-400 font-normal">(optional)</span></label>
              <SearchableSelect value={city} onChange={setCity} options={meta.cities} placeholder="All cities" />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Listing type <span className="text-slate-400 font-normal">(optional)</span></label>
              <select className="input" value={premium} onChange={(e) => setPremium(e.target.value)}>
                <option value="all">Premium + non-premium</option>
                <option value="premium">Premium only</option>
                <option value="non">Non-premium only</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">2. Channels <span className="text-slate-400 font-normal">(pick one or many)</span></label>
            <div className="flex gap-3 flex-wrap">
              {CHANNELS.map((c) => (
                <label key={c} className={`flex items-center gap-2 border rounded-lg px-3 py-2 text-sm cursor-pointer ${channels.includes(c) ? 'border-slate-900 bg-slate-50' : 'border-slate-200'} ${!can(PERM_FOR[c]) ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  <input type="checkbox" checked={channels.includes(c)} disabled={!can(PERM_FOR[c])} onChange={() => toggleChannel(c)} />
                  {LABEL[c]}
                  {c === 'voice' && !can(PERM_FOR[c]) && <span className="text-xs text-slate-400">(not enabled yet)</span>}
                </label>
              ))}
            </div>
            {!permsOk && <div className="text-xs text-red-500 mt-1">You don't have permission for one of the selected channels.</div>}
            <div className="text-xs text-slate-400 mt-2">Each channel sends its own fixed, pre-approved message (voice call = a fixed automated call) — there's nothing to write or choose here.</div>
          </div>

          <CampaignMessagePreview channels={channels} />

          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-sm">
            <div className="font-medium mb-1">Audience</div>
            {categories.length === 0 && <div className="text-slate-400">Select at least one category to see who will be messaged.</div>}
            {preview === 'loading' && <div className="text-slate-400">Counting listings…</div>}
            {preview === 'error' && <div className="text-amber-600">Couldn't load the audience count — you can still send.</div>}
            {previewBlocked && <div className="text-red-600">{previewBlocked}</div>}
            {previewReady && (
              <div className="space-y-1">
                <div><span className="text-xl font-bold">{preview.listings.toLocaleString()}</span> <span className="text-slate-500">listing(s) will be targeted</span></div>
                {preview.by_channel && (
                  <div className="flex gap-2 flex-wrap text-xs">
                    {Object.entries(preview.by_channel).map(([c, v]) => (
                      <span key={c} className="badge bg-white border border-slate-200 text-slate-600">
                        {LABEL[c] || c}: {Number(v.reachable).toLocaleString()} reachable · {Number(v.skipped).toLocaleString()} no contact
                      </span>
                    ))}
                  </div>
                )}
                {preview.demo && <div className="text-xs text-slate-400">Demo mode: listings in several chosen categories may be counted more than once, and per-channel reach isn't available.</div>}
              </div>
            )}
          </div>
        </div>

        {error && <div className="mt-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}

        <div className="mt-6 flex items-center justify-end gap-2">
          <button className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" disabled={!canSubmit} onClick={submit}>
            {busy ? 'Starting…' : `Send campaign${channels.length ? ` via ${channels.map((c) => LABEL[c]).join(' + ')}` : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
