// DEMO-ONLY stand-in for the Campaigns API (backend/API_CHANGE_campaigns.md).
// Used automatically while the real /api/campaigns endpoints don't exist
// yet, so the whole Campaigns UI can be built, clicked through and shown
// before the backend ships. It stores campaigns in this browser's
// localStorage and SIMULATES sending progress over time — it never calls
// any send endpoint and never contacts anyone. Numbers other than the
// audience size (which comes from the real directory) are made up.

const KEY = 'pmc_demo_campaigns_v1';
const DURATION_MS = 4 * 60 * 1000; // a demo campaign "finishes" after ~4 min so each 60s poll shows movement
const SKIP_RATE = { whatsapp: 0.06, sms: 0.06, email: 0.4 };
const FAIL_RATE = 0.03;

function read() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
}
function write(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* storage unavailable — demo just won't persist */ }
}

function channelCounts(channel, audience, progress, retried) {
  const total = audience;
  const skipped = Math.round(total * (SKIP_RATE[channel] ?? 0.05));
  const eligible = total - skipped;
  const processed = Math.round(eligible * progress);
  const failed = retried ? 0 : Math.round(processed * FAIL_RATE);
  const sent = processed - failed;
  return { total, queued: eligible - processed, sent, delivered: Math.floor(sent * 0.9), failed, skipped };
}

// Turn a stored record into the same shape the real API returns.
function view(rec, now = Date.now()) {
  const elapsed = now - rec.created_at;
  let progress = Math.min(1, Math.max(0, (elapsed - 10_000) / DURATION_MS));
  let by_channel = {};
  rec.channels.forEach((c) => { by_channel[c] = channelCounts(c, rec.audience_total, progress, rec.retried); });

  let status;
  if (rec.cancelled_snapshot) {
    by_channel = rec.cancelled_snapshot;
    status = 'cancelled';
  } else if (elapsed < 10_000) status = 'queued';
  else if (progress < 1) status = 'running';
  else status = Object.values(by_channel).some((b) => b.failed > 0) ? 'completed_with_errors' : 'completed';

  const totals = { total: 0, queued: 0, sent: 0, delivered: 0, failed: 0, skipped: 0 };
  Object.values(by_channel).forEach((b) => Object.keys(totals).forEach((k) => { totals[k] += b[k]; }));
  const iso = (ms) => new Date(ms).toISOString();
  return {
    id: rec.id, name: rec.name, status,
    categories: rec.categories, city: rec.city, filters: rec.filters, channels: rec.channels,
    audience_total: rec.audience_total,
    created_by: rec.created_by,
    created_at: iso(rec.created_at),
    started_at: elapsed >= 10_000 ? iso(rec.created_at + 10_000) : null,
    finished_at: status === 'completed' || status === 'completed_with_errors' ? iso(rec.created_at + 10_000 + DURATION_MS) : (rec.cancelled_snapshot ? iso(rec.cancelled_at) : null),
    updated_at: iso(now),
    totals, by_channel,
  };
}

export const demo = {
  list({ page = 1, perPage = 20 } = {}) {
    const all = read().sort((a, b) => b.created_at - a.created_at);
    const rows = all.slice((page - 1) * perPage, page * perPage).map((r) => view(r));
    return { rows, total: all.length, page, per_page: perPage };
  },
  get(id) {
    const rec = read().find((r) => String(r.id) === String(id));
    if (!rec) throw Object.assign(new Error('Campaign not found'), { demoNotFound: true });
    return { campaign: view(rec) };
  },
  create(payload, audienceTotal, user) {
    const list = read();
    const id = (list.reduce((m, r) => Math.max(m, r.id), 0) || 0) + 1;
    const now = new Date();
    const first = payload.categories[0];
    const rec = {
      id,
      name: payload.name?.trim() || `${first}${payload.categories.length > 1 ? ` +${payload.categories.length - 1}` : ''} – ${now.toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`,
      categories: payload.categories, city: payload.city || null,
      filters: payload.filters || { premium: 'all', contact_status: '' },
      channels: payload.channels, content: payload.content,
      audience_total: audienceTotal,
      created_by: { id: user?.id, name: user?.name },
      created_at: Date.now(),
    };
    write([rec, ...list]);
    return { campaign: view(rec) };
  },
  cancel(id) {
    const list = read();
    const rec = list.find((r) => String(r.id) === String(id));
    if (!rec) throw Object.assign(new Error('Campaign not found'), { demoNotFound: true });
    const now = Date.now();
    const current = view(rec, now);
    if (current.status !== 'queued' && current.status !== 'running') {
      throw Object.assign(new Error('Campaign already finished'), { demoConflict: true });
    }
    // Mirror the real contract: remaining queued rows become "skipped" so total stays = queued+sent+failed+skipped.
    const snap = {};
    Object.entries(current.by_channel).forEach(([c, b]) => { snap[c] = { ...b, skipped: b.skipped + b.queued, queued: 0 }; });
    rec.cancelled_snapshot = snap;
    rec.cancelled_at = now;
    write(list);
    return { campaign: view(rec, now) };
  },
  retryFailed(id) {
    const list = read();
    const rec = list.find((r) => String(r.id) === String(id));
    if (!rec) throw Object.assign(new Error('Campaign not found'), { demoNotFound: true });
    const before = view(rec);
    const failed = before.totals.failed;
    rec.retried = true;
    write(list);
    return { campaign: view(rec), requeued: failed };
  },
  recipients() {
    return { rows: [], total: 0, page: 1, per_page: 50, demo: true };
  },
};
