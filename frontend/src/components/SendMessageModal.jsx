import { useMemo, useState } from 'react';
import * as api from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import { MISSING_TEMPLATE, KIND_LABEL } from '../config/messageTemplates.js';
import { useTemplates } from '../hooks/useTemplates.js';
import MessagePreview from './MessagePreview.jsx';

// "Send" for one listing, the ticked listings, or everything in a category.
// Step 1: WhatsApp or SMS. WhatsApp offers the Premium promo and — only when the
// listing is actually missing something — the matching "missing details"
// template (mobile / email / both). No dropdown, no typing: the messages are
// fixed on the server and every one is previewed here first.
export default function SendMessageModal({ rows, onClose, onSent }) {
  const { can } = useAuth();
  const TEMPLATES = useTemplates();
  const [channel, setChannel] = useState('whatsapp');
  const [waKind, setWaKind] = useState('promo'); // 'promo' | 'missing'
  const [busy, setBusy] = useState(false);

  const byKind = useMemo(() => {
    const g = { mobile: [], email: [], both: [] };
    rows.forEach((r) => { if (r.missing_kind) g[r.missing_kind].push(r.DirectoryID); });
    return g;
  }, [rows]);
  const kindsPresent = Object.keys(byKind).filter((k) => byKind[k].length);
  const missingCount = kindsPresent.reduce((n, k) => n + byKind[k].length, 0);
  const single = rows.length === 1;
  const allIds = rows.map((r) => r.DirectoryID);

  // What this click will send: [{templateId, ids}]
  const jobs = useMemo(() => {
    if (channel === 'sms') return [{ templateId: 'sms_promo', ids: allIds }];
    if (waKind === 'promo') return [{ templateId: 'wa_promo', ids: allIds }];
    return kindsPresent.map((k) => ({ templateId: MISSING_TEMPLATE[k], ids: byKind[k] }));
  }, [channel, waKind, allIds, kindsPresent, byKind]);

  const permNeeded = channel === 'sms' ? 'message.send_sms' : 'message.send_whatsapp';
  const allowed = can(permNeeded) && (single || can('message.bulk_send'));
  const total = jobs.reduce((n, j) => n + j.ids.length, 0);
  const canSend = allowed && total > 0 && !busy;

  async function send() {
    const lines = jobs.map((j) => `• ${j.ids.length.toLocaleString()} × ${TEMPLATES[j.templateId].title}`).join('\n');
    if (!single && !window.confirm(`Send now?\n\n${lines}\n\nThis sends right away.`)) return;
    setBusy(true);
    try {
      const groups = [];
      for (const j of jobs) groups.push(await api.sendTemplateMessage(j.templateId, j.ids));
      const names = new Map(rows.map((r) => [r.DirectoryID, r.CompanyName]));
      onSent({ groups, leftOut: 0, names });
    } catch (e) {
      alert(e.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  }

  const who = single ? (rows[0].CompanyName || `listing #${rows[0].DirectoryID}`) : `${rows.length.toLocaleString()} listings`;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="card w-full max-w-lg flex flex-col max-h-[88vh] my-4">
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 shrink-0">
          <div className="min-w-0">
            <h2 className="text-lg font-bold">Send message</h2>
            <div className="text-xs text-slate-400 truncate">To {who}</div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label="Close">✕</button>
        </div>

        <div className="px-5 overflow-y-auto flex-1 pb-3">
        <div className="grid grid-cols-2 gap-2 mb-3">
          {[['whatsapp', 'WhatsApp'], ['sms', 'SMS']].map(([c, label]) => (
            <button
              key={c} type="button" onClick={() => setChannel(c)}
              className={`rounded-lg border px-3 py-2.5 text-sm font-semibold ${channel === c ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
            >{label}</button>
          ))}
        </div>

        {channel === 'whatsapp' && (
          <div className="space-y-3">
            <label className={`block rounded-lg border p-2.5 cursor-pointer ${waKind === 'promo' ? 'border-slate-900 bg-slate-50' : 'border-slate-200'}`}>
              <div className="flex items-start gap-2 mb-2">
                <input className="mt-1" type="radio" name="wakind" checked={waKind === 'promo'} onChange={() => setWaKind('promo')} />
                <div>
                  <div className="font-semibold text-sm">{TEMPLATES.wa_promo.title}</div>
                  <div className="text-xs text-slate-400">{TEMPLATES.wa_promo.blurb}</div>
                </div>
              </div>
              {waKind === 'promo' && <MessagePreview template={TEMPLATES.wa_promo} count={total} />}
            </label>

            <label className={`block rounded-lg border p-2.5 ${missingCount ? 'cursor-pointer' : 'opacity-50'} ${waKind === 'missing' ? 'border-slate-900 bg-slate-50' : 'border-slate-200'}`}>
              <div className="flex items-start gap-2 mb-2">
                <input className="mt-1" type="radio" name="wakind" disabled={!missingCount} checked={waKind === 'missing'} onChange={() => setWaKind('missing')} />
                <div>
                  <div className="font-semibold text-sm">Missing details</div>
                  <div className="text-xs text-slate-400">
                    {missingCount
                      ? (single ? `This listing is missing: ${KIND_LABEL[kindsPresent[0]].toLowerCase().replace(' missing', '')}` : `${missingCount.toLocaleString()} of ${rows.length.toLocaleString()} listings are missing details — each gets the template for what it lacks`)
                      : 'Not available — this listing has both mobile and email'}
                  </div>
                </div>
              </div>
              {waKind === 'missing' && missingCount > 0 && (
                <div className="space-y-3">
                  {kindsPresent.map((k) => (
                    <div key={k}>
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">{KIND_LABEL[k]}</div>
                      <MessagePreview template={TEMPLATES[MISSING_TEMPLATE[k]]} count={single ? null : byKind[k].length} />
                    </div>
                  ))}
                </div>
              )}
            </label>
          </div>
        )}

        {channel === 'sms' && (
          <div className="rounded-lg border border-slate-900 bg-slate-50 p-2.5">
            <div className="font-semibold text-sm">{TEMPLATES.sms_promo.title}</div>
            <div className="text-xs text-slate-400 mb-2">{TEMPLATES.sms_promo.blurb}</div>
            <MessagePreview template={TEMPLATES.sms_promo} count={single ? null : total} />
          </div>
        )}

        {!allowed && (
          <div className="mt-3 text-xs text-red-500">
            {can(permNeeded) ? 'Sending to several listings needs the bulk-send permission.' : `You don't have permission to send ${channel === 'sms' ? 'SMS' : 'WhatsApp'}.`}
          </div>
        )}

        </div>

        <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2 shrink-0">
          <button className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" disabled={!canSend} onClick={send}>
            {busy ? 'Sending…' : `Send ${channel === 'sms' ? 'SMS' : 'WhatsApp'}${single ? '' : ` to ${total.toLocaleString()}`}`}
          </button>
        </div>
      </div>
    </div>
  );
}
