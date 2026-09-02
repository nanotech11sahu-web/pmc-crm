import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as api from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import { StageBadge, MissingBadge } from '../components/Badge.jsx';
import BulkSendModal from '../components/BulkSendModal.jsx';
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
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkLeadIds, setBulkLeadIds] = useState([]);
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
        setRows(leads.map((l) => ({
          DirectoryID: l.directory_id,
          CompanyName: l.directory?.CompanyName,
          CategoryName: l.directory?.CategoryName,
          CurrentCity: l.directory?.CurrentCity,
          ContactName: l.directory?.ContactName,
          EmailAddress: l.directory?.EmailAddress,
          MobileNumber: l.directory?.MobileNumber,
          is_missing: l.is_flagged_missing || (!l.directory?.EmailAddress && !l.directory?.MobileNumber),
          lead_id: l.id, lead_type: l.lead_type, stage: l.stage, owner_user_id: l.owner_user_id,
          owner_name: l.owner?.name, remark: l.remark, batch_label: l.batch_label, followup_count: l.followup_count,
        })));
        setTotal(leads.length);
      } else {
        const [dirRes, leads] = await Promise.all([
          api.listDirectory({ search: filters.search, category: filters.category, city: filters.city, missingOnly: filters.missingOnly, page, perPage: PER_PAGE }),
          api.listLeads({ category: filters.category, city: filters.city, search: filters.search }),
        ]);
        const leadByDirId = new Map(leads.map((l) => [l.directory_id, l]));
        setRows(dirRes.rows.map((r) => {
          const l = leadByDirId.get(r.DirectoryID);
          return {
            ...r,
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

  async function openBulkSend() {
    setLoading(true);
    try {
      const rowsByDirId = new Map(rows.map((r) => [r.DirectoryID, r]));
      const leadIds = [];
      for (const dirId of selected) {
        const row = rowsByDirId.get(dirId);
        leadIds.push(await ensureLead(row));
      }
      setBulkLeadIds(leadIds);
      setBulkOpen(true);
    } catch (e) {
      alert('Could not prepare selected rows: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  const totalPages = leadFilterActive ? 1 : Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <div className="p-4 sm:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Listings</h1>
          <p className="text-slate-500 text-sm">Every directory listing, workable directly — no separate "convert to lead" step. Rows missing an email or mobile are flagged.</p>
        </div>
        {can('message.bulk_send') && (
          <button className="btn btn-primary shrink-0 self-start sm:self-auto" disabled={selected.size === 0} onClick={openBulkSend}>
            Bulk send ({selected.size})
          </button>
        )}
      </div>

      <div className="card p-4 mb-4 flex flex-wrap gap-3 items-center">
        <input className="input max-w-xs" placeholder="Search company or contact..." value={filters.search} onChange={(e) => setFilter('search', e.target.value)} />
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
                  {r.is_missing && <div className="mt-1"><MissingBadge /></div>}
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
                  {r.is_missing && <div className="mt-1"><MissingBadge /></div>}
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
                <td className="px-4 py-3.5 text-right"><button className="btn btn-secondary btn-sm" onClick={() => openRow(r)}>Open</button></td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={11} className="px-4 py-14 text-center text-slate-400">No listings match these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {!leadFilterActive && (
        <div className="flex items-center justify-between mt-4 text-sm text-slate-500">
          <div>{total} listings</div>
          <div className="flex gap-2">
            <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
            <div className="px-2 py-1">Page {page} / {totalPages}</div>
            <button className="btn btn-secondary btn-sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        </div>
      )}

      {bulkOpen && (
        <BulkSendModal
          leadIds={bulkLeadIds}
          onClose={() => setBulkOpen(false)}
          onSent={() => { setBulkOpen(false); setSelected(new Set()); load(); }}
        />
      )}

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
