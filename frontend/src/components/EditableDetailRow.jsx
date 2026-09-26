import { useState } from 'react';
import * as api from '../api/index.js';

// One row in the "All directory details" panel: shows a directory field
// and, when editable, lets you fill/correct it inline and save it back
// to tbl_directory via PATCH /directory/{id} (same endpoint the Listings
// email/mobile cells already use). Missing values show in red.
export default function EditableDetailRow({ directoryId, fieldKey, label, value, canEdit, readOnly, multiline, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const empty = value == null || String(value).trim() === '';

  async function save() {
    setSaving(true);
    setErr('');
    try {
      await api.updateDirectoryField(directoryId, fieldKey, draft.trim());
      setEditing(false);
      onSaved?.();
    } catch (e) {
      const msg = e.response?.data?.error || e.message || '';
      // The backend whitelist rejects some columns with 422 "Field not
      // editable" — turn that into plain guidance instead of a raw error.
      setErr(/not editable/i.test(msg)
        ? 'This field can\'t be saved yet — ask your admin to enable it in the backend.'
        : msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-3 gap-2 items-start py-2 group border-b border-slate-100">
      <div className="text-xs text-slate-400 pt-1.5">{label}</div>
      <div className="col-span-2 min-w-0">
        {editing ? (
          <div className="flex flex-col gap-1">
            <div className={`flex gap-1 ${multiline ? 'items-end' : 'items-center'}`}>
              {multiline ? (
                <textarea
                  autoFocus
                  rows={3}
                  className="input py-1 px-2 text-sm flex-1 min-w-0"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false); }}
                />
              ) : (
                <input
                  autoFocus
                  className="input py-1 px-2 text-sm flex-1 min-w-0"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
                />
              )}
              <button className="btn btn-primary btn-sm" disabled={saving} onClick={save}>{saving ? '…' : 'Save'}</button>
              <button className="text-xs text-slate-400 hover:text-slate-600 px-1" onClick={() => setEditing(false)}>✕</button>
            </div>
            {err && <div className="text-xs text-red-500">{err}</div>}
          </div>
        ) : (
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0 break-words">
              {empty
                ? <span className="text-red-600 font-semibold">This is missing</span>
                : <span>{String(value)}</span>}
            </div>
            {canEdit && !readOnly && (
              <button
                className="text-xs text-slate-400 hover:text-slate-700 opacity-0 group-hover:opacity-100 shrink-0 pt-0.5"
                onClick={() => { setDraft(empty ? '' : String(value)); setEditing(true); }}
                title={empty ? 'Fill this in' : 'Edit'}
              >
                {empty ? 'Fill' : '✎ Edit'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
