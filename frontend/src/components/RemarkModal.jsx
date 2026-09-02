import { useEffect, useState, useCallback } from 'react';
import * as api from '../api/index.js';

// Remarks are stored as 'note' activities (crm_lead_activities), not a
// single overwritable field — so a listing can accumulate a running
// history of remarks over time instead of losing the previous one every
// time someone jots a new note. Opened from the Listings table as a
// modal so you don't have to leave the list to add one.
export default function RemarkModal({ row, ensureLead, onClose, onSaved }) {
  const [leadId, setLeadId] = useState(row.lead_id || null);
  const [remarks, setRemarks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (id) => {
    setLoading(true);
    try {
      const activities = await api.listActivities(id);
      setRemarks(activities.filter((a) => a.activity_type === 'note'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const id = leadId || (await ensureLead(row));
      if (!leadId) setLeadId(id);
      load(id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addRemark() {
    if (!draft.trim()) return;
    setSaving(true);
    try {
      const id = leadId || (await ensureLead(row));
      if (!leadId) setLeadId(id);
      await api.addActivity(id, { activity_type: 'note', notes: draft.trim() });
      setDraft('');
      await load(id);
      onSaved?.();
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold">Remarks</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">✕</button>
        </div>
        <p className="text-sm text-slate-500 mb-4">{row.CompanyName}</p>

        <div className="space-y-2 mb-4">
          <textarea
            autoFocus
            className="input"
            rows={2}
            placeholder="Add a remark..."
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addRemark(); }}
          />
          <button className="btn btn-primary btn-sm" disabled={saving || !draft.trim()} onClick={addRemark}>
            {saving ? 'Adding...' : 'Add remark'}
          </button>
        </div>

        <div className="border-t border-slate-100 pt-3">
          <div className="text-xs font-semibold text-slate-400 uppercase mb-2">History ({remarks.length})</div>
          <div className="max-h-64 overflow-y-auto space-y-3">
            {loading && <div className="text-sm text-slate-400">Loading...</div>}
            {!loading && remarks.length === 0 && <div className="text-sm text-slate-400">No remarks yet.</div>}
            {remarks.map((r) => (
              <div key={r.id} className="text-sm">
                <div className="text-slate-700">{r.notes}</div>
                <div className="text-xs text-slate-400 mt-0.5">{new Date(r.occurred_at).toLocaleString()} · {r.user_name || 'System'}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
