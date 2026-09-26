// Single API surface used by every page. Talks to the live CodeIgniter
// REST API. The backend uses its own conventions (snake_case fields,
// {rows: [...]} envelopes on lists, {user: {...}} on /me) — this file is
// the ONE place that normalizes those into what the UI components use
// (camelCase-ish, unwrapped arrays), so page components never touch raw
// backend shapes directly.
import { http } from './client.js';

function rowsOf(data) {
  return data?.rows ?? (Array.isArray(data) ? data : []);
}

export async function login(email, password) {
  const { data } = await http.post('/auth/login', { email, password });
  return data; // { token, user } — already matches
}

export async function me() {
  const { data } = await http.get('/auth/me');
  return data.user ?? data;
}

// Which of email / mobile is missing on a directory row. Drives the
// three-case listing view (item 6): 'email' = no email, 'mobile' = no
// mobile, 'both' = neither, '' = both present.
export function missingKind(r) {
  const noEmail = !String(r?.EmailAddress ?? '').trim();
  const noMobile = !String(r?.MobileNumber ?? '').trim();
  if (noEmail && noMobile) return 'both';
  if (noEmail) return 'email';
  if (noMobile) return 'mobile';
  return '';
}

// Premium flag can come back under a few spellings depending on how the
// backend exposes tbl_directory — normalize them all into a single
// boolean `is_premium`. See backend/API_CHANGE_premium_and_missing_filters.md.
function readPremium(r) {
  const v = r?.is_premium ?? r?.IsPremium ?? r?.Premium ?? r?.is_premium_listing ?? r?.ListingType ?? r?.SubscriptionType;
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'premium' || s === 'paid';
}

function normalizeDirectoryRow(r) {
  const row = { ...r, CategoryName: r.CategoryName ?? r.category_names ?? '' };
  row.is_premium = readPremium(r);
  row.missing_kind = missingKind(row);
  return row;
}

// `contactStatus` = '' | 'email' | 'mobile' | 'both' | 'complete'
// `premium` = '' | 'premium' | 'non'
// These are passed through to the backend (see the API_CHANGE doc); we
// ALSO filter client-side as a fallback so the feature works today even
// before the backend honors the params.
export async function listDirectory(params) {
  const { data } = await http.get('/directory', { params });
  let rows = rowsOf(data).map(normalizeDirectoryRow);
  const { contactStatus, premium } = params || {};
  if (contactStatus === 'complete') rows = rows.filter((r) => r.missing_kind === '');
  else if (contactStatus) rows = rows.filter((r) => r.missing_kind === contactStatus);
  if (premium === 'premium') rows = rows.filter((r) => r.is_premium);
  else if (premium === 'non') rows = rows.filter((r) => !r.is_premium);
  return { ...data, rows };
}

export async function updateDirectoryField(directoryId, field, value) {
  const { data } = await http.patch(`/directory/${directoryId}`, { field, value });
  return data;
}

export async function getDirectoryEditLog(directoryId) {
  const { data } = await http.get(`/directory/${directoryId}/history`);
  return rowsOf(data);
}

export async function revertDirectoryEdit(logId) {
  const { data } = await http.post(`/directory/history/${logId}/revert`);
  return data;
}

function normalizeLead(l) {
  if (!l) return l;
  return {
    ...l,
    // is_flagged_missing comes back as the string "0"/"1", which is
    // truthy either way in JS — normalize so `is_flagged_missing || ...`
    // checks downstream don't treat every lead as flagged.
    is_flagged_missing: Number(l.is_flagged_missing) === 1,
    directory: l.directory ? normalizeDirectoryRow(l.directory) : l.directory,
  };
}

export async function listLeads(params) {
  const { data } = await http.get('/leads', { params });
  return rowsOf(data).map(normalizeLead);
}

export async function getLead(id) {
  const { data } = await http.get(`/leads/${id}`);
  return normalizeLead(data.lead ?? data);
}

export async function createLeadFromDirectory(directoryId, userId, extra) {
  const { data } = await http.post('/leads', { directory_id: directoryId, ...extra });
  return normalizeLead(data.lead ?? data);
}

export async function updateLead(id, patch) {
  const { data } = await http.put(`/leads/${id}`, patch);
  return normalizeLead(data.lead ?? data);
}

export async function deleteLead(id) {
  await http.delete(`/leads/${id}`);
}

export async function listActivities(leadId) {
  const { data } = await http.get(`/leads/${leadId}/activities`);
  return rowsOf(data);
}

export async function addActivity(leadId, payload) {
  const { data } = await http.post(`/leads/${leadId}/activities`, payload);
  return data;
}

export async function listTemplates() {
  const { data } = await http.get('/templates');
  return rowsOf(data);
}

export async function sendBulkMessage(payload) {
  const { data } = await http.post('/messages/bulk-send', payload);
  return rowsOf(data);
}

export async function listMessageLog(leadId) {
  const { data } = await http.get(`/leads/${leadId}/messages`);
  return rowsOf(data);
}

export async function listUsers() {
  const { data } = await http.get('/users');
  // is_active/role_id come back as strings (e.g. "0") from the API,
  // which are truthy in JS — normalize to real numbers so `is_active ?
  // ... : ...` checks downstream behave correctly instead of treating
  // "0" as active.
  return rowsOf(data).map((u) => ({
    ...u,
    role: u.role ?? u.role_name,
    is_active: Number(u.is_active),
    role_id: Number(u.role_id),
  }));
}

export async function createUser(payload) {
  const { data } = await http.post('/users', payload);
  return data;
}

export async function updateUser(id, patch) {
  const { data } = await http.put(`/users/${id}`, patch);
  return data;
}

// Needs POST /api/users/{id}/reset-password on the backend — see
// backend/API_CHANGE_password_reset.md. Returns { temp_password } once,
// same shape as createUser.
export async function resetUserPassword(id) {
  const { data } = await http.post(`/users/${id}/reset-password`);
  return data;
}

export async function listRoles() {
  const { data } = await http.get('/roles');
  // is_system comes back as "0"/"1" (string) — normalize so truthy
  // checks (e.g. "is this the Owner role") work correctly; "0" is
  // truthy in JS and was disabling permission checkboxes for every
  // non-Owner role too.
  return rowsOf(data).map((r) => ({ ...r, is_system: Number(r.is_system) === 1 }));
}

export async function listPermissions() {
  const { data } = await http.get('/permissions');
  return rowsOf(data);
}

export async function getRolePermissions(roleId) {
  const { data } = await http.get(`/roles/${roleId}/permissions`);
  return data?.permissions ?? rowsOf(data);
}

export async function setRolePermissions(roleId, codes) {
  const { data } = await http.put(`/roles/${roleId}/permissions`, { permissions: codes });
  return data;
}

// leads_by_type / leads_by_stage come back as arrays of rows, e.g.
// [{lead_type:'hot', count:'3'}, ...] — key names not fully confirmed
// against live data yet (leads table was empty at integration time), so
// this reads a few likely key spellings defensively.
function bucketCounts(arr, keyNames, buckets) {
  const out = Object.fromEntries(buckets.map((b) => [b, 0]));
  (arr || []).forEach((row) => {
    const key = keyNames.map((k) => row[k]).find((v) => v != null);
    const count = Number(row.count ?? row.cnt ?? row.total ?? 0);
    if (key != null && key in out) out[key] = count;
  });
  return out;
}

export async function dashboardStats() {
  const { data } = await http.get('/dashboard/stats');
  return {
    totalListings: Number(data.total_listings ?? data.totalListings ?? 0),
    missingCount: Number(data.missing_count ?? data.missingCount ?? 0),
    leadsByType: bucketCounts(data.leads_by_type ?? data.leadsByType, ['lead_type', 'type'], ['hot', 'medium', 'cold']),
    leadsByStage: bucketCounts(data.leads_by_stage ?? data.leadsByStage, ['stage'], ['new', 'contacted', 'followup', 'converted', 'lost']),
    followupsToday: Number(data.followups_today ?? data.followupsToday ?? 0),
    messagesSentTotal: Number(data.messages_sent ?? data.messagesSentTotal ?? 0),
    // Per-case missing breakdown (email-only / mobile-only / both).
    // Needs backend support — see API_CHANGE_premium_and_missing_filters.md.
    // null when the backend doesn't return it yet, so the UI can show
    // "—" instead of a wrong 0.
    missingEmailCount: data.missing_email_count != null ? Number(data.missing_email_count) : null,
    missingMobileCount: data.missing_mobile_count != null ? Number(data.missing_mobile_count) : null,
    missingBothCount: data.missing_both_count != null ? Number(data.missing_both_count) : Number(data.missing_count ?? data.missingCount ?? 0),
  };
}

// `category`/`city` scope the OTHER list — pass the currently selected
// category to get back only the cities that have listings in it (and
// vice versa). Requires backend support — see API_REQUIREMENTS.md
// ("Scoped filter metadata"). Until that ships, the backend currently
// ignores these params and returns the full unscoped lists either way.
export async function filterMeta({ category = '', city = '' } = {}) {
  const { data } = await http.get('/filters/meta', { params: { category, city } });
  const categories = (data.categories ?? []).map((c) => (typeof c === 'string' ? c : c.CategoryName));
  const cities = (data.cities ?? []).map((c) => (typeof c === 'string' ? c : c.CurrentCity ?? c.CityName));
  return { categories, cities };
}
