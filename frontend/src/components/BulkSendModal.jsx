import { useEffect, useState } from 'react';
import * as api from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function BulkSendModal({ leadIds, onClose, onSent }) {
  const { user, can } = useAuth();
  const [templates, setTemplates] = useState([]);
  const [channel, setChannel] = useState('whatsapp');
  const [templateId, setTemplateId] = useState('');
  const [customBody, setCustomBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => { api.listTemplates().then(setTemplates); }, []);

  const channelTemplates = templates.filter((t) => t.channel === channel);
  const permFor = { whatsapp: 'message.send_whatsapp', sms: 'message.send_sms', email: 'message.send_email' };

  async function send() {
    setBusy(true);
    try {
      const res = await api.sendBulkMessage({ leadIds, channel, templateId: templateId ? Number(templateId) : null, customBody }, user.id);
      setResult(res);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Bulk send to {leadIds.length} lead(s)</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">✕</button>
        </div>

        {!result ? (
          <div className="space-y-4">
            <div className="flex gap-2">
              {['whatsapp', 'sms', 'email'].map((c) => (
                <button key={c} onClick={() => { setChannel(c); setTemplateId(''); }} disabled={!can(permFor[c])}
                  className={`btn btn-sm ${channel === c ? 'btn-primary' : 'btn-secondary'}`}>
                  {c === 'whatsapp' ? 'WhatsApp' : c.toUpperCase()}
                </button>
              ))}
            </div>

            <div>
              <label className="text-sm font-medium block mb-1">Template (optional)</label>
              <select className="input" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                <option value="">Custom message below</option>
                {channelTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>

            {!templateId && (
              <div>
                <label className="text-sm font-medium block mb-1">Message</label>
                <textarea className="input" rows={4} value={customBody} onChange={(e) => setCustomBody(e.target.value)} placeholder="Use {{contact_name}}, {{company_name}} placeholders..." />
              </div>
            )}

            <button className="btn btn-primary w-full" disabled={busy || !can(permFor[channel])} onClick={send}>
              {busy ? 'Sending...' : `Send ${channel} to ${leadIds.length} lead(s)`}
            </button>
            {!can(permFor[channel]) && <div className="text-xs text-red-500">You don't have permission to send {channel}.</div>}
          </div>
        ) : (
          <div>
            <div className="text-sm text-slate-500 mb-3">
              Sent: {result.filter((r) => r.status === 'sent').length} · Failed: {result.filter((r) => r.status === 'failed').length}
            </div>
            <div className="max-h-56 overflow-y-auto border rounded-lg divide-y">
              {result.map((r) => (
                <div key={r.id} className="px-3 py-2 text-sm flex justify-between">
                  <span>{r.recipient}</span>
                  <span className={r.status === 'sent' ? 'text-green-600' : 'text-red-500'}>{r.status}</span>
                </div>
              ))}
            </div>
            <button className="btn btn-primary w-full mt-4" onClick={onSent}>Done</button>
          </div>
        )}
      </div>
    </div>
  );
}
