import * as api from '../api/index.js';

export const KIND_LABEL = { mobile: 'Mobile missing', email: 'Email missing', both: 'Mobile & email missing' };

// Send the approved "your listing is missing details" WhatsApp to every
// listing in `rows` that is actually missing something, using the route
// that matches each listing's own state. Listings with complete details
// are left out. Returns null if the user cancels, else the results.
export async function runMissingDetails(rows, { confirm = true } = {}) {
  const groups = { mobile: [], email: [], both: [] };
  let complete = 0;
  rows.forEach((r) => { if (r.missing_kind) groups[r.missing_kind].push(r.DirectoryID); else complete += 1; });
  const parts = Object.entries(groups).filter(([, ids]) => ids.length);
  if (parts.length === 0) {
    window.alert('None of these listings is missing contact details.');
    return null;
  }
  const lines = parts.map(([k, ids]) => `• ${ids.length.toLocaleString()} × ${KIND_LABEL[k]}`).join('\n');
  const note = complete ? `\n\n${complete.toLocaleString()} listing(s) with complete details will be left out.` : '';
  if (confirm && !window.confirm(`Send the approved WhatsApp message asking each business for its missing details?\n\n${lines}${note}\n\nThis sends right away.`)) return null;

  const names = new Map(rows.map((r) => [r.DirectoryID, r.CompanyName]));
  const done = [];
  for (const [kind, ids] of parts) done.push(await api.sendMissingDetails(kind, ids));
  return { groups: done, leftOut: complete, names };
}
