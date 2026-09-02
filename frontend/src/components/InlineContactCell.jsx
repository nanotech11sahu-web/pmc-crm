import { useState } from 'react';
import * as api from '../api/index.js';

// Shows a directory field (email/mobile) if present; if blank, shows an
// inline input + save button right in the table so it can be filled in
// without leaving the Listings page.
export default function InlineContactCell({ directoryId, field, value, canEdit, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  if (value) {
    return <span className="break-all">{value}</span>;
  }

  if (!canEdit) {
    return <span className="text-red-600 font-semibold">This is missing</span>;
  }

  if (!editing) {
    return (
      <button className="text-red-600 font-semibold hover:underline" onClick={() => { setEditing(true); setDraft(''); }}>
        This is missing — click to fill
      </button>
    );
  }

  async function save() {
    if (!draft.trim()) return;
    setSaving(true);
    try {
      await api.updateDirectoryField(directoryId, field, draft.trim());
      setEditing(false);
      onSaved?.();
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-1">
      <input
        autoFocus
        className="input py-1 px-2 text-xs w-32"
        placeholder={field === 'EmailAddress' ? 'name@example.com' : '10-digit mobile'}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
      />
      <button className="btn btn-primary btn-sm px-2 py-1" disabled={saving} onClick={save}>{saving ? '...' : 'Save'}</button>
      <button className="text-xs text-slate-400 hover:text-slate-600" onClick={() => setEditing(false)}>✕</button>
    </div>
  );
}
