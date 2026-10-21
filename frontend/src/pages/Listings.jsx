import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as api from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import { StageBadge, MissingBadge, MissingFieldBadge, PremiumBadge } from '../components/Badge.jsx';
import CallButton from '../components/CallButton.jsx';
import MissingDetailsResult from '../components/MissingDetailsResult.jsx';
import SendMessageModal from '../components/SendMessageModal.jsx';
import { KIND_LABEL } from '../config/messageTemplates.js';
import InlineContactCell from '../components/InlineContactCell.jsx';
import TableLoadingOverlay from '../components/TableLoadingOverlay.jsx';
import SearchableSelect from '../components/SearchableSelect.jsx';
import RemarkModal from '../components/RemarkModal.jsx';

// One unified table: every directory listing IS a lead — there's no
// separate "Directory" vs "Leads" concept in the UI. Type/stage/remark
// are editable directly on a row; picking a type on a row that has no
// crm_leads entry yet creates one transparently, no "convert" step.

const TYPES = ['hot', 'medium', 'cold'];
const STAGES = ['new', 'contacted', 'followup', 'converted', 'lost'];
const PER_PAGE = 20;

const TYPE_STYLES = {
  hot: 'bg-red-100 text-red-700 border-red-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  cold: 'bg-blue-100 text-blue-700 border-blue-200',
  '': 'bg-slate-100 text-slate-500 border-slate-200',
};

const STAGE_STYLES = {
  new: 'bg-slate-100 text-slate-600 border-slate-200',
  contacted: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  followup: 'bg-amber-100 text-amber-700 border-amber-200',
  converted: 'bg-green-100 text-green-700 border-green-200',
  lost: 'bg-slate-100 text-slate-400 border-slate-200',
};

// The leads list (/leads) does not include each listing's details (name, city,
// email, mobile…), so for the type / stage / owner filters we look them up from
// the lead's detail — cached, and only for the rows being shown (a few at a time).
const MAX_COMBINE = 200; // most leads we'll look up in one go (for filters that need every row)
const dirCache = new Map(); // lead id -> directory details

async function directoryOf(lead) {
  if (lead.directory && Object.keys(lead.directory).length) return lead.directory;
  if (dirCache.has(lead.id)) return dirCache.get(lead.id);
  try {
    const full = await api.getLead(lead.id);
    const d = full?.directory || {};
    dirCache.set(lead.id, d);
    return d;
  } catch {
    return {}; // leave it blank rather than failing the whole list; not cached, so it retries
  }
}

async function inChunks(items, size, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(...await Promise.all(items.slice(i, i + size).map(fn)));
  return out;
}

function leadToRow(l, d) {
  const mk = api.missingKind(d);
  return {
    DirectoryID: l.directory_id,
    CompanyName: d.CompanyName,
    CategoryName: d.CategoryName,
    CurrentCity: d.CurrentCity,
    ContactName: d.ContactName,
    EmailAddress: d.EmailAddress,
    MobileNumber: d.MobileNumber,
    PhoneNumber: d.PhoneNumber,
    is_premium: d.is_premium,
    missing_kind: mk,
    is_missing: l.is_flagged_missing || mk === 'both',
    lead_id: l.id, lead_type: l.lead_type, stage: l.stage, owner_user_id: l.owner_user_id,
    owner_name: l.owner?.name, remark: l.remark, batch_label: l.batch_label, followup_count: l.followup_count,
  };
}

async function leadsToRows(leads) {
  const dirs = await inChunks(leads, 5, directoryOf);
  return leads.map((l, i) => leadToRow(l, dirs[i]));
}

export default function Listings() {
  const { user, can } = useAuth();
  const navigate = useNavigate();

  // Filters + page live in the URL (not local state) so that opening a
  // listing's detail page and clicking back restores exactly what you
  // had filtered/paged to — browser back just restores the previous URL.
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo(() => ({
    search: searchParams.get('search') || '',
    category: searchParams.get('category') || '',
    city: searchParams.get('city') || '',
    missingOnly: searchParams.get('missingOnly') === '1',
    contactStatus: searchParams.get('contactStatus') || '', // '' | email | mobile | both | complete
    premium: searchParams.get('premium') || '',             // '' | premium | non
    leadType: searchParams.get('leadType') || '',
    stage: searchParams.get('stage') || '',
    ownerId: searchParams.get('ownerId') || '',
  }), [searchParams]);
  const page = Number(searchParams.get('page') || 1);

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [users, setUsers] = useState([]);
  const [meta, setMeta] = useState({ categories: [], cities: [] });
  const [selected, setSelected] = useState(new Set());
  const [missingBusy, setMissingBusy] = useState(false);
  const [missingResult, setMissingResult] = useState(null); // result screen after a send
  const [notice, setNotice] = useState('');
  const leadScope = useRef({ leads: [], rows: null }); // the full lead filter result (for "send to all")
  const [sendRows, setSendRows] = useState(null);           // listings the Send modal is open for
  const [remarkRow, setRemarkRow] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [loading, setLoading] = useState(true);

  // Lead-specific filters can't be answered by the directory endpoint
  // alone, so when one is active we drive the table from /leads instead
  // (already directory-joined) rather than paging through all listings.
  const leadFilterActive = !!(filters.leadType || filters.stage || filters.ownerId);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (leadFilterActive) {
        const leads = await api.listLeads({
          leadType: filters.leadType, stage: filters.stage, ownerId: filters.ownerId,
          missingOnly: filters.missingOnly, category: filters.category, city: filters.city, search: filters.search,
        });
        const from = (page - 1) * PER_PAGE;
        // Contact-status / premium filters need every lead's details, so they can only be
        // combined with a small result; otherwise only the visible page is looked up.
        const needAll = !!(filters.contactStatus || filters.premium);
        if (needAll && leads.length > MAX_COMBINE) {
          setNotice(`${leads.length.toLocaleString()} leads match — too many to also filter by contact status / premium. Narrow the type, stage or owner first.`);
        } else {
          setNotice('');
        }
        if (needAll && leads.length <= MAX_COMBINE) {
          let mapped = await leadsToRows(leads);
          if (filters.contactStatus === 'complete') mapped = mapped.filter((r) => r.missing_kind === '');
          else if (filters.contactStatus) mapped = mapped.filter((r) => r.missing_kind === filters.contactStatus);
          if (filters.premium === 'premium') mapped = mapped.filter((r) => r.is_premium);
          else if (filters.premium === 'non') mapped = mapped.filter((r) => !r.is_premium);
          leadScope.current = { leads, rows: mapped };
          setRows(mapped.slice(from, from + PER_PAGE));
          setTotal(mapped.length);
        } else {
          leadScope.current = { leads, rows: null };
          setRows(await leadsToRows(leads.slice(from, from + PER_PAGE)));
          setTotal(leads.length);
        }
      } else {
        setNotice('');
        const [dirRes, leads] = await Promise.all([
          api.listDirectory({ search: filters.search, category: filters.category, city: filters.city, missingOnly: filters.missingOnly, contactStatus: filters.contactStatus, premium: filters.premium, page, perPage: PER_PAGE }),
          api.listLeads({ category: filters.category, city: filters.city, search: filters.search }),
        ]);
        const leadByDirId = new Map(leads.map((l) => [l.directory_id, l]));
        setRows(dirRes.rows.map((r) => {
          const l = leadByDirId.get(r.DirectoryID);
          return {
            ...r,
            is_missing: r.is_missing ?? (r.missing_kind === 'both'),
            lead_id: l?.id ?? r.lead_id ?? null,
            lead_type: l?.lead_type ?? null,
            stage: l?.stage ?? null,
            owner_user_id: l?.owner_user_id ?? null,
            owner_name: l?.owner?.name,
            remark: l?.remark, batch_label: l?.batch_label, followup_count: l?.followup_count ?? 0,
          };
        }));
        setTotal(dirRes.total);
      }
    } finally {
      setLoading(false);
    }
  }, [filters, page, leadFilterActive]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.listUsers().then(setUsers); }, []);
  // Re-fetch filter metadata whenever category or city changes, so each
  // dropdown scopes down to what actually has matching data in the
  // other — e.g. picking a category narrows the city list to cities
  // that have listings in it.
  useEffect(() => {
    api.filterMeta({ category: filters.category, city: filters.city }).then(setMeta);
  }, [filters.category, filters.city]);

  function setFilter(key, value) {
    const next = new URLSearchParams(searchParams);
    if (value === '' || value === false) next.delete(key);
    else next.set(key, value === true ? '1' : value);
    next.delete('page');
    setSearchParams(next, { replace: true });
  }

  function setPage(updater) {
    const nextPage = typeof updater === 'function' ? updater(page) : updater;
    const next = new URLSearchParams(searchParams);
    if (nextPage <= 1) next.delete('page');
    else next.set('page', String(nextPage));
    setSearchParams(next, { replace: true });
  }

  function toggle(id) {
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((s) => (s.size === rows.length ? new Set() : new Set(rows.map((r) => r.DirectoryID))));
  }

  async function ensureLead(row, extra = {}) {
    if (row.lead_id) return row.lead_id;
    const lead = await api.createLeadFromDirectory(row.DirectoryID, user.id, extra);
    return lead.id;
  }

  async function setLeadType(row, value) {
    setBusyId(row.DirectoryID);
    try {
      const leadId = await ensureLead(row, { lead_type: value });
      if (row.lead_id) await api.updateLead(leadId, { lead_type: value });
      load();
    } catch (e) {
      alert(e.message);
    } finally {
      setBusyId(null);
    }
  }

  async function setStage(row, value) {
    setBusyId(row.DirectoryID);
    try {
      const leadId = await ensureLead(row);
      await api.updateLead(leadId, { stage: value });
      load();
    } catch (e) {
      alert(e.message);
    } finally {
      setBusyId(null);
    }
  }

  function openRow(row) {
    navigate(`/listings/${row.DirectoryID}`, { state: { leadId: row.lead_id } });
  }

  // Send (WhatsApp or SMS) to one listing, the ticked listings, or every listing
  // matching the current filters. The modal handles channel + message choice.
  function openSend(list) { setSendRows(list); }
  function openSendSelected() { openSend(rows.filter((r) => selected.has(r.DirectoryID))); }

  async function openSendAll() {
    setMissingBusy(true);
    try {
      let all;
      if (leadFilterActive) {
        const { leads, rows: mapped } = leadScope.current;
        if (leads.length > MAX_COMBINE) { alert(`${leads.length.toLocaleString()} leads match — too many to send to at once from this filter. Narrow the type, stage or owner first.`); return; }
        all = mapped || await leadsToRows(leads);
      } else {
        all = [];
        for (let pg = 1; pg <= 40; pg += 1) {
          const res = await api.listDirectory({
            search: filters.search, category: filters.category, city: filters.city,
            missingOnly: filters.missingOnly, contactStatus: filters.contactStatus, premium: filters.premium, page: pg, perPage: 500,
          });
          all.push(...res.rows);
          if (all.length >= res.total || res.rows.length === 0) break;
        }
      }
      if (all.length === 0) { alert('No listings match the current filters.'); return; }
      openSend(all);
    } catch (e) {
      alert(e.response?.data?.error || e.message);
    } finally {
      setMissingBusy(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <div className="p-4 sm:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Listings</h1>
          <p className="text-slate-500 text-sm">Every directory listing, workable directly — no separate "convert to lead" step. Rows missing an email or mobile are flagged.</p>
        </div>
        {can('message.bulk_send') && (selected.size > 0 || KIND_LABEL[filters.contactStatus] || filters.category) && (
          <div className="flex flex-wrap gap-2 shrink-0 self-start sm:self-auto items-center">
            {selected.size > 0 && (
              <button className="btn btn-primary" disabled={missingBusy} onClick={openSendSelected}>
                Send ({selected.size} selected)
              </button>
            )}
            {(KIND_LABEL[filters.contactStatus] || filters.category) && (
              <button className="btn btn-secondary" disabled={missingBusy} onClick={openSendAll} title="Send to every matching listing, not just this page">
                {missingBusy ? 'Loading…' : `Send · all ${total.toLocaleString()}${filters.category ? ` in ${filters.category}` : ''}${KIND_LABEL[filters.contactStatus] ? ` (${KIND_LABEL[filters.contactStatus].toLowerCase()})` : ''}`}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="card p-4 mb-4 flex flex-wrap gap-3 items-center">
        <input className="input max-w-xs" placeholder="Search company, contact, mobile or phone…" value={filters.search} onChange={(e) => setFilter('search', e.target.value)} />
        <SearchableSelect
          className="w-48"
          placeholder="All categories"
          value={filters.category}
          onChange={(v) => setFilter('category', v)}
          options={meta.categories}
        />
        <SearchableSelect
          className="w-44"
          placeholder="All cities"
          value={filters.city}
          onChange={(v) => setFilter('city', v)}
          options={meta.cities}
        />
        <select className="input max-w-[130px]" value={filters.leadType} onChange={(e) => setFilter('leadType', e.target.value)}>
          <option value="">All types</option>
          {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className="input max-w-[150px]" value={filters.stage} onChange={(e) => setFilter('stage', e.target.value)}>
          <option value="">All stages</option>
          {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="input max-w-[170px]" value={filters.ownerId} onChange={(e) => setFilter('ownerId', e.target.value)}>
          <option value="">All owners</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <select className="input max-w-[190px]" value={filters.contactStatus} onChange={(e) => setFilter('contactStatus', e.target.value)} title="Filter by which contact detail is missing">
          <option value="">Any contact status</option>
          <option value="complete">Has email & mobile</option>
          <option value="email">Email missing</option>
          <option value="mobile">Mobile missing</option>
          <option value="both">Email & mobile missing</option>
        </select>
        <select className="input max-w-[160px]" value={filters.premium} onChange={(e) => setFilter('premium', e.target.value)} title="Filter premium vs non-premium listings">
          <option value="">All listings</option>
          <option value="premium">Premium only</option>
          <option value="non">Non-premium only</option>
        </select>
        <label className="flex items-center gap-2 text-sm ml-auto">
          <input type="checkbox" checked={filters.missingOnly} onChange={(e) => setFilter('missingOnly', e.target.checked)} />
          Missing contact only
        </label>
      </div>

      {filters.category && (
        <div className="mb-3 flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Category</span>
          <span className="badge bg-slate-900 text-white">{filters.category}</span>
          <button className="text-xs text-slate-400 hover:text-slate-600" onClick={() => setFilter('category', '')}>clear</button>
        </div>
      )}

      {notice && <div className="mb-3 text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">{notice}</div>}

      {/* Mobile: card list instead of a 10-column table, which doesn't work on small screens */}
      <div className="md:hidden relative">
        <TableLoadingOverlay active={loading} />
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.DirectoryID} className={`card p-4 ${r.is_missing ? 'bg-red-50/50 border-red-100' : ''}`}>
              <div className="flex items-start gap-3">
                <input className="mt-1" type="checkbox" checked={selected.has(r.DirectoryID)} onChange={() => toggle(r.DirectoryID)} />
                <div className="flex-1 min-w-0">
                  <button className={`text-left font-medium hover:underline ${r.is_missing ? 'text-red-700' : 'text-slate-800'}`} onClick={() => openRow(r)}>
                    {r.CompanyName || <span className="italic text-red-400 font-normal">(no name)</span>}
                  </button>
                  <div className="text-xs text-slate-400">{r.CategoryName} · {r.CurrentCity}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {r.is_premium && <PremiumBadge />}
                    <MissingFieldBadge kind={r.missing_kind} />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-3 gap-y-2 mt-3 text-sm">
                <div className="min-w-0">
                  <div className="text-xs text-slate-400 mb-0.5">Email</div>
                  <InlineContactCell directoryId={r.DirectoryID} field="EmailAddress" value={r.EmailAddress} canEdit={can('directory.edit')} onSaved={load} />
                </div>
                <div className="min-w-0">
                  <div className="text-xs text-slate-400 mb-0.5">Mobile</div>
                  <InlineContactCell directoryId={r.DirectoryID} field="MobileNumber" value={r.MobileNumber} canEdit={can('directory.edit')} onSaved={load} />
                </div>
                <div className="min-w-0">
                  <div className="text-xs text-slate-400 mb-0.5">Type</div>
                  <select
                    className={`w-full text-xs font-medium border rounded-full pl-3 pr-2 py-1 capitalize cursor-pointer ${TYPE_STYLES[r.lead_type || '']}`}
                    value={r.lead_type || ''}
                    disabled={!can('lead.edit') && !can('lead.create') || busyId === r.DirectoryID}
                    onChange={(e) => setLeadType(r, e.target.value)}
                  >
                    <option value="" disabled>set type</option>
                    {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-0.5">Stage</div>
                  {r.lead_id ? (
                    <select
                      className={`w-full text-xs font-medium border rounded-full pl-3 pr-2 py-1 capitalize cursor-pointer ${STAGE_STYLES[r.stage || 'new']}`}
                      value={r.stage || 'new'}
                      disabled={!can('lead.edit') || busyId === r.DirectoryID}
                      onChange={(e) => setStage(r, e.target.value)}
                    >
                      {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  ) : (
                    <span className="text-xs text-slate-300">—</span>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
                <div className="text-xs text-slate-400">
                  {r.owner_name || 'No owner'} · {r.followup_count || 0} follow-up{r.followup_count === 1 ? '' : 's'}
                </div>
                <div className="flex gap-2">
                  {(can('message.send_whatsapp') || can('message.send_sms')) && (
                    <button className="btn btn-secondary btn-sm" onClick={() => openSend([r])} title="Send a WhatsApp or SMS to this listing">Send</button>
                  )}
                  <CallButton row={r} />
                  {(can('lead.edit') || can('lead.create')) && (
                    <button className="btn btn-secondary btn-sm" onClick={() => setRemarkRow(r)}>💬</button>
                  )}
                  <button className="btn btn-secondary btn-sm" onClick={() => openRow(r)}>Open</button>
                </div>
              </div>
            </div>
          ))}
          {!loading && rows.length === 0 && (
            <div className="card p-10 text-center text-slate-400">No listings match these filters.</div>
          )}
        </div>
      </div>

      {/* Desktop/tablet: full table */}
      <div className="hidden md:block card overflow-x-auto relative">
        <TableLoadingOverlay active={loading} />
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-400 text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3.5"><input type="checkbox" checked={selected.size > 0 && selected.size === rows.length} onChange={toggleAll} /></th>
              <th className="text-left px-4 py-3.5">Company</th>
              <th className="text-left px-4 py-3.5">City</th>
              <th className="text-left px-4 py-3.5">Email</th>
              <th className="text-left px-4 py-3.5">Mobile</th>
              <th className="text-left px-4 py-3.5">Type</th>
              <th className="text-left px-4 py-3.5">Stage</th>
              <th className="text-left px-4 py-3.5">Owner</th>
              <th className="text-left px-4 py-3.5">Remark</th>
              <th className="text-left px-4 py-3.5">Follow-ups</th>
              <th></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.DirectoryID} className={`transition-colors hover:bg-slate-50 ${r.is_missing ? 'bg-red-50/50' : ''}`}>
                <td className="px-4 py-3.5"><input type="checkbox" checked={selected.has(r.DirectoryID)} onChange={() => toggle(r.DirectoryID)} /></td>
                <td className={`px-4 py-3.5 font-medium whitespace-nowrap ${r.is_missing ? 'text-red-700' : 'text-slate-800'}`}>
                  <button className="hover:underline text-left" onClick={() => openRow(r)}>
                    {r.CompanyName || <span className="italic text-red-400 font-normal">(no name)</span>}
                  </button>
                  <div className="text-xs text-slate-400 font-normal">{r.CategoryName}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {r.is_premium && <PremiumBadge />}
                    <MissingFieldBadge kind={r.missing_kind} />
                  </div>
                </td>
                <td className="px-4 py-3.5 text-slate-500 whitespace-nowrap">{r.CurrentCity}</td>
                <td className="px-4 py-3.5 whitespace-nowrap">
                  <InlineContactCell
                    directoryId={r.DirectoryID}
                    field="EmailAddress"
                    value={r.EmailAddress}
                    canEdit={can('directory.edit')}
                    onSaved={load}
                  />
                </td>
                <td className="px-4 py-3.5 whitespace-nowrap">
                  <InlineContactCell
                    directoryId={r.DirectoryID}
                    field="MobileNumber"
                    value={r.MobileNumber}
                    canEdit={can('directory.edit')}
                    onSaved={load}
                  />
                </td>
                <td className="px-4 py-3.5">
                  <select
                    className={`text-xs font-medium border rounded-full pl-3 pr-2 py-1 capitalize cursor-pointer ${TYPE_STYLES[r.lead_type || '']}`}
                    value={r.lead_type || ''}
                    disabled={!can('lead.edit') && !can('lead.create') || busyId === r.DirectoryID}
                    onChange={(e) => setLeadType(r, e.target.value)}
                  >
                    <option value="" disabled>set type</option>
                    {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </td>
                <td className="px-4 py-3.5">
                  {r.lead_id ? (
                    <select
                      className={`text-xs font-medium border rounded-full pl-3 pr-2 py-1 capitalize cursor-pointer ${STAGE_STYLES[r.stage || 'new']}`}
                      value={r.stage || 'new'}
                      disabled={!can('lead.edit') || busyId === r.DirectoryID}
                      onChange={(e) => setStage(r, e.target.value)}
                    >
                      {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  ) : (
                    <span className="text-xs text-slate-300">—</span>
                  )}
                </td>
                <td className="px-4 py-3.5 text-slate-500 whitespace-nowrap">{r.owner_name || '—'}</td>
                <td className="px-4 py-3.5">
                  {can('lead.edit') || can('lead.create') ? (
                    <button className="btn btn-secondary btn-sm" onClick={() => setRemarkRow(r)}>
                      💬 Remarks
                    </button>
                  ) : (
                    <span className="text-xs text-slate-300">—</span>
                  )}
                </td>
                <td className="px-4 py-3.5 text-slate-500">{r.followup_count || 0}</td>
                <td className="px-4 py-3.5 text-right whitespace-nowrap">
                  {(can('message.send_whatsapp') || can('message.send_sms')) && (
                    <button className="btn btn-secondary btn-sm mr-2" onClick={() => openSend([r])} title="Send a WhatsApp or SMS to this listing">Send</button>
                  )}
                  <CallButton row={r} className="btn btn-secondary btn-sm mr-2" />
                  <button className="btn btn-secondary btn-sm" onClick={() => openRow(r)}>Open</button>
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={11} className="px-4 py-14 text-center text-slate-400">No listings match these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-4 text-sm text-slate-500">
        <div>{total.toLocaleString()} listings</div>
        <div className="flex gap-2">
          <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
          <div className="px-2 py-1">Page {page} / {totalPages}</div>
          <button className="btn btn-secondary btn-sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      </div>

      {sendRows && (
        <SendMessageModal
          rows={sendRows}
          onClose={() => setSendRows(null)}
          onSent={(result) => { setSendRows(null); setMissingResult(result); setSelected(new Set()); load(); }}
        />
      )}

      {missingResult && <MissingDetailsResult result={missingResult} onClose={() => setMissingResult(null)} />}

      {remarkRow && (
        <RemarkModal
          row={remarkRow}
          ensureLead={ensureLead}
          onClose={() => setRemarkRow(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}
