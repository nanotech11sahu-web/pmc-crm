import { useEffect, useState } from 'react';
import * as api from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';

const CHANNELS = ['whatsapp', 'sms', 'email'];
const CHANNEL_LABEL = { whatsapp: 'WhatsApp', sms: 'SMS', email: 'Email' };
const PERM_FOR = { whatsapp: 'message.send_whatsapp', sms: 'message.send_sms', email: 'message.send_email' };

// `initialChannel` (single) still works for callers that only pass one;
// `initialChannels` (array) preselects multiple checkboxes at once.
export default function BulkSendModal({ leadIds, onClose, onSent, initialChannel = 'whatsapp', initialChannels }) {
  const { user, can } = useAuth();
  const [templates, setTemplates] = useState([]);
  const [selected, setSelected] = useState(() => new Set(initialChannels?.length ? initialChannels : [initialChannel]));
  // Per-channel template/message so WhatsApp/SMS/Email can each use their own content in one send.
  const [templateIdByChannel, setTemplateIdByChannel] = useState({});
  const [customBodyByChannel, setCustomBodyByChannel] = useState({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // [{channel, recipient, status, id}]

  useEffect(() => { api.listTemplates().then(setTemplates); }, []);

  function toggleChannel(c) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(c) ? next.delete(c) : next.add(c);
      return next;
    });
  }

  const channelList = [...selected];
  const sendableChannels = channelList.filter((c) => can(PERM_FOR[c]));
  const blockedChannels = channelList.filter((c) => !can(PERM_FOR[c]));

  async function send() {
    setBusy(true);
    try {
      const all = [];
      for (const c of sendableChannels) {
        const templateId = templateIdByChannel[c];
        const res = await api.sendBulkMessage({
          leadIds, channel: c,
          templateId: templateId ? Number(templateId) : null,
          customBody: customBodyByChannel[c] || '',
        }, user.id);
        res.forEach((r) => all.push({ ...r, channel: c }));
      }
      setResult(all);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Send to {leadIds.length} lead(s)</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">✕</button>
        </div>

        {!result ? (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium block mb-1">Channels (pick one or more)</label>
              <div className="flex gap-3 flex-wrap">
                {CHANNELS.map((c) => (
                  <label key={c} className={`flex items-center gap-2 border rounded-lg px-3 py-2 text-sm cursor-pointer ${selected.has(c) ? 'border-slate-900 bg-slate-50' : 'border-slate-200'} ${!can(PERM_FOR[c]) ? 'opacity-50' : ''}`}>
                    <input type="checkbox" checked={selected.has(c)} disabled={!can(PERM_FOR[c])} onChange={() => toggleChannel(c)} />
                    {CHANNEL_LABEL[c]}
                  </label>
                ))}
              </div>
              {blockedChannels.length > 0 && (
                <div className="text-xs text-red-500 mt-1">You don't have permission to send: {blockedChannels.map((c) => CHANNEL_LABEL[c]).join(', ')}.</div>
              )}
              {channelList.length === 0 && <div className="text-xs text-slate-400 mt-1">Select at least one channel.</div>}
            </div>

            {sendableChannels.map((c) => {
              const channelTemplates = templates.filter((t) => t.channel === c);
              const templateId = templateIdByChannel[c] || '';
              return (
                <div key={c} className="border rounded-lg p-3 space-y-2">
                  <div className="text-sm font-semibold">{CHANNEL_LABEL[c]}</div>
                  <select
                    className="input"
                    value={templateId}
                    onChange={(e) => setTemplateIdByChannel((m) => ({ ...m, [c]: e.target.value }))}
                  >
                    <option value="">Custom message below</option>
                    {channelTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  {!templateId && (
                    <textarea
                      className="input"
                      rows={3}
                      value={customBodyByChannel[c] || ''}
                      onChange={(e) => setCustomBodyByChannel((m) => ({ ...m, [c]: e.target.value }))}
                      placeholder="Use {{contact_name}}, {{company_name}} placeholders..."
                    />
                  )}
                </div>
              );
            })}

            <button className="btn btn-primary w-full" disabled={busy || sendableChannels.length === 0} onClick={send}>
              {busy ? 'Sending...' : `Send via ${sendableChannels.map((c) => CHANNEL_LABEL[c]).join(' + ') || '…'} to ${leadIds.length} lead(s)`}
            </button>
          </div>
        ) : (
          <div>
            <div className="text-sm text-slate-500 mb-3">
              Sent: {result.filter((r) => r.status === 'sent').length} · Failed: {result.filter((r) => r.status === 'failed').length}
            </div>
            <div className="max-h-72 overflow-y-auto border rounded-lg divide-y">
              {result.map((r, i) => (
                <div key={`${r.channel}-${r.id ?? i}`} className="px-3 py-2 text-sm flex justify-between gap-2">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="badge bg-slate-100 text-slate-500 shrink-0">{CHANNEL_LABEL[r.channel] || r.channel}</span>
                    <span className="truncate">{r.recipient}</span>
                  </span>
                  <span className={r.status === 'sent' ? 'text-green-600 shrink-0' : 'text-red-500 shrink-0'}>{r.status}</span>
                </div>
              ))}
              {result.length === 0 && <div className="px-3 py-4 text-sm text-slate-400 text-center">Nothing was sent.</div>}
            </div>
            <button className="btn btn-primary w-full mt-4" onClick={onSent}>Done</button>
          </div>
        )}
      </div>
    </div>
  );
}
