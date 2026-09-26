# Backend changes needed: All-details, missing-field cases, Premium filter, and messaging

This covers the five Listings/Directory changes just built on the
frontend. The UI already works today against the **current** API using
client-side fallbacks, but each item below is what the backend must add
so it works correctly at full scale (across all pages, not just the 20
rows currently on screen).

Frontend files touched (for reference): `frontend/src/api/index.js`,
`frontend/src/pages/Listings.jsx`, `frontend/src/pages/LeadDetail.jsx`,
`frontend/src/components/Badge.jsx`.

---

## 1. Return ALL `tbl_directory` columns (item: "Directory all details should be open")

The Lead detail page now renders **every** field present on the
directory object (not just Company/Category/City/Contact/Email/Mobile),
each with a red "This is missing" flag when empty.

**What's needed:** `GET /api/directory` (list) and the `directory`
object embedded in `GET /api/leads/{id}` should include the full set of
`tbl_directory` columns for each row — e.g. `CompanyName`,
`ContactName`, `EmailAddress`, `MobileNumber`, `PhoneNumber`,
`CurrentCity`, `Address`, `Pincode`, `State`, `Website`, `WhatsAppNumber`,
`Description`, `RegistrationDate`, etc. — whatever exists on the table.

Today only a subset comes back. Please `SELECT d.*` (or an explicit full
column list) rather than the trimmed set. The frontend renders whatever
keys it receives, so no frontend change is required once more columns
appear — they show up automatically.

---

## 2. Premium vs Non-premium (item: "Filtration of PREMIUM and NON-PREMIUM listing")

The Listings page has a new filter: **All listings / Premium only /
Non-premium only**, and rows show a ★ Premium badge.

**2a. Expose the premium flag.** Each directory row in the API response
must include a field that says whether the listing is premium. The
frontend reads any of these spellings and treats them as premium when
the value is `1/true/yes/premium/paid`:

```
is_premium  |  IsPremium  |  Premium  |  is_premium_listing  |  ListingType  |  SubscriptionType
```

Please return whichever column actually represents this in
`tbl_directory` (we don't know its real name yet — **please confirm the
column name**). Ideally normalize it to a boolean `is_premium` (0/1).

**2b. Honor a `premium` query param** on `GET /api/directory`:

```
GET /api/directory?premium=premium   -> only premium listings
GET /api/directory?premium=non       -> only non-premium listings
GET /api/directory?premium=          -> all (unchanged)
```

This must be applied in SQL **before** pagination/`total`, so the count
and page numbers are correct. (Right now the frontend filters only the
current page as a stopgap, which makes totals inexact until this ships.)

---

## 3. Missing-contact cases (items: "Missing field should be shown" + the 3 cases)

New filter on Listings: **Any contact status / Has email & mobile /
Email missing / Mobile missing / Email & mobile missing**, with distinct
badges per case. The three requested cases map to:

- `email`  = has a mobile but **no email**
- `mobile` = has an email but **no mobile**
- `both`   = **neither** email nor mobile

**What's needed:** honor a `contactStatus` query param on
`GET /api/directory`, applied in SQL before pagination:

```
GET /api/directory?contactStatus=email     -> EmailAddress empty  AND MobileNumber not empty
GET /api/directory?contactStatus=mobile    -> MobileNumber empty  AND EmailAddress not empty
GET /api/directory?contactStatus=both      -> EmailAddress empty  AND MobileNumber empty
GET /api/directory?contactStatus=complete  -> both present
GET /api/directory?contactStatus=          -> no filter (unchanged)
```

Suggested WHERE fragments (treat NULL and '' both as empty):

```sql
-- email missing only
WHERE (d.EmailAddress IS NULL OR d.EmailAddress = '')
  AND (d.MobileNumber IS NOT NULL AND d.MobileNumber <> '')

-- mobile missing only
WHERE (d.MobileNumber IS NULL OR d.MobileNumber = '')
  AND (d.EmailAddress IS NOT NULL AND d.EmailAddress <> '')

-- both missing
WHERE (d.EmailAddress IS NULL OR d.EmailAddress = '')
  AND (d.MobileNumber IS NULL OR d.MobileNumber = '')
```

The existing `missingOnly=1` param (both-missing) stays as-is for
backwards compatibility; `contactStatus` is the richer replacement.

---

## 4. WhatsApp / SMS / Email — individual + bulk by category (items 3 & 4)

The UI now offers three send paths, all through the existing
`POST /api/messages/bulk-send` (channel = `whatsapp` | `sms` | `email`):

1. **Individual** — a "Send" button per row and on the Lead detail page
   (sends to a single `leadId`).
2. **Selected rows** — the existing "Bulk send (N)" button.
3. **Whole category / whole filter** — a new "Send to all N" button that
   messages every listing matching the current filters.

**Works today** because the frontend gathers the lead IDs and calls
`bulk-send` with the full list. **Two backend asks:**

**4a. Efficiency (optional but recommended).** For "send to all in a
category", the frontend currently (a) fetches all matching directory
rows, (b) ensures a `crm_lead` row exists for each, then (c) posts every
lead ID. For large categories that's a lot of round-trips. A dedicated
endpoint would be far cheaper:

```
POST /api/messages/bulk-send-by-filter
{
  "channel": "whatsapp",
  "templateId": 12,               // or null
  "customBody": "...",            // when no template
  "filters": { "category": "Plumbers", "city": "Rourkela",
               "contactStatus": "", "premium": "", "search": "" }
}
```

Backend resolves the matching listings, auto-creates any missing
`crm_leads`, sends, and returns the same per-recipient result array
`[{ id, recipient, status }]` that `bulk-send` returns today.

**4b. Skip un-messageable rows.** WhatsApp/SMS need a mobile; email needs
an email. Please skip (or return `status: "failed"`, `reason: "no
<channel> contact"`) for listings missing the relevant field, rather
than erroring the whole batch. This pairs naturally with the item-3
missing-contact filter (e.g. filter to "Has email & mobile" before an
email blast).

---

## 5. "All users can see" (permissions)

Requirement: every logged-in user should be able to **see** all listing
details and the missing/premium status. Viewing is already open to any
authenticated user (the detail page isn't gated). Only these remain
permission-gated, which we recommend keeping:

- **Editing** a directory field inline — `directory.edit`
- **Sending** WhatsApp/SMS/Email — `message.send_*` / `message.bulk_send`

If you want the Send buttons visible to **all** roles too, grant
`message.bulk_send` (and the per-channel `message.send_whatsapp` /
`message.send_sms` / `message.send_email`) to the relevant roles in the
Roles UI — no code change needed. **Please confirm** whether sending
should be open to all users or stay restricted; if it should be open,
just adjust the role permissions.

---

## 6. Editable "All details" — widen the PATCH whitelist  (item: "should be able to get and update this field also")

The Lead detail page now renders every `tbl_directory` field with an
inline **Edit / Fill** control that saves via the existing
`PATCH /api/directory/{id}` `{ field, value }` endpoint.

**Confirmed live against `/api/directory/8808`** — the endpoint already
enforces a whitelist:

- **Editable today (returns `200 {ok:true, log_id, old_value}`):**
  `ContactName`, `Address1`, `Location`, `CurrentCity`, `State`,
  `Pincode`, `PhoneNumber`, `MobileNumber`, `EmailAddress`, `Website`
- **Rejected today (returns `422 "Field not editable: <name>"`):**
  `EstablishYear`, `Keywords`, `BusinessInfo`, `BannerImage`,
  `DirectorySlug`, `Status`, `ApprovalDate`, `is_verified`, `likes_count`

The UI shows an Edit button **only** for the editable set, so nothing
looks broken. **Ask:** please add these business-relevant fields to the
whitelist so staff can maintain them too:

```
EstablishYear   Keywords   BusinessInfo   BannerImage
```

(Leave `DirectorySlug`, `Status`, `ApprovalDate`, `is_verified`,
`likes_count` locked — those are system/derived.) Every edit already
lands in `crm_directory_edit_log` and stays revertable, so widening the
whitelist keeps the audit trail. Once these are added, they become
editable in the UI automatically — no frontend change needed.

---

## 7. Dashboard: per-case missing counts  (item: "how many email missing / mobile missing / both")

The dashboard now has three clickable tiles — **Email missing**,
**Mobile missing**, **Email & mobile missing** — each linking to the
matching filtered Listings view.

`GET /api/dashboard/stats` currently returns only `missing_count` (the
"both" case = 1286 live). **Email missing** and **Mobile missing**
therefore show "—" until these two fields are added to the response:

```json
{
  "missing_email_count":  <count: EmailAddress empty AND MobileNumber present>,
  "missing_mobile_count": <count: MobileNumber empty AND EmailAddress present>,
  "missing_both_count":   <count: both empty>   // may reuse existing missing_count
}
```

Suggested SQL (mirror the item-3 emptiness rules):

```sql
SELECT
  SUM((EmailAddress IS NULL OR EmailAddress='') AND (MobileNumber IS NOT NULL AND MobileNumber<>'')) AS missing_email_count,
  SUM((MobileNumber IS NULL OR MobileNumber='') AND (EmailAddress IS NOT NULL AND EmailAddress<>'')) AS missing_mobile_count,
  SUM((EmailAddress IS NULL OR EmailAddress='') AND (MobileNumber IS NULL OR MobileNumber='')) AS missing_both_count
FROM tbl_directory;
```

The frontend reads these keys if present and shows the number; if absent
it falls back to "—" (email/mobile) and to `missing_count` (both). No
frontend change needed once they ship.

---

## 8. BUG: Dashboard "Email missing" / "Mobile missing" show "—" (confirmed live)

The Dashboard's two new tiles read `missing_email_count` and
`missing_mobile_count` from `GET /api/dashboard/stats`. **Confirmed by
calling the live endpoint just now** — the response only contains:

```json
{"total_listings":7121,"missing_count":1286,"leads_by_type":[...],
 "leads_by_stage":[...],"followups_today":0,"messages_sent":23}
```

Neither `missing_email_count` nor `missing_mobile_count` is present, so
those two tiles correctly show "—" (no wrong data is shown — this is
intentional on the frontend side until the fields exist). **This is not
a frontend bug** — it's exactly the gap described in §7 above. Adding
the two SQL fields from §7 to this endpoint's response is the fix; no
other change needed.

---

## 9. PERFORMANCE: every endpoint is slow (confirmed live, please investigate)

Timed just now against the live API (browser network timing, not
network-limited — same machine, same connection):

| Endpoint | Response time |
|---|---|
| `GET /directory?page=1&perPage=20` | **2.8s** |
| `GET /leads` | **1.1s** |
| `GET /dashboard/stats` | **1.1s** |
| `GET /filters/meta` | **1.1s** |
| `GET /users` | **1.2s** |

Every one of these is slow, including endpoints returning a handful of
rows (`/users`, `/dashboard/stats`) — that rules out "it's just a big
table" as the only cause and points at something systemic. Likely
culprits, roughly in order of how common they are for this symptom:

1. **Missing indexes** — `tbl_directory` has ~7,100 rows; if
   `EmailAddress`, `MobileNumber`, `CurrentCity`, or whatever
   `/filters/meta` and `/directory` filter/group on aren't indexed,
   MySQL does a full table scan on every request. Run `EXPLAIN` on the
   actual queries behind `/directory` and `/filters/meta` first — this
   is the most common cause of a flat ~1s floor even on small tables.
2. **No connection pooling / a fresh DB connection per request** — a
   flat ~1.1s floor on even the tiny `/users` and `/dashboard/stats`
   responses (which return almost no data) suggests most of that time
   isn't query execution at all, but per-request overhead (DB connect,
   TLS handshake to the DB, or PHP bootstrap). Worth confirming with a
   quick server-side timing log around just the DB connect step vs. the
   query itself.
3. **N+1 queries** — `/leads` embeds each lead's `directory` object; if
   that's one query per lead instead of a single JOIN, it'll scale badly
   as leads grow.
4. **No caching on `/filters/meta`** — the category/city lists change
   rarely; consider a short server-side cache (even 60s) instead of
   recomputing on every keystroke-triggered filter change.

Practical impact on the frontend right now: the Listings page fires
`/directory` and `/leads` in parallel on every filter change, so page
loads currently take ~2.8s (the slower of the two) rather than instant.
The "Send to all" bulk-by-filter action (item 4) will be markedly worse
until this is fixed, since it also creates a `crm_leads` row per
listing sequentially.

**Ask:** please profile these five endpoints server-side (slow query
log or `EXPLAIN`) and report back what's actually taking the time —
happy to adjust the frontend's request pattern once we know whether the
bottleneck is indexes, connection setup, or something else.

---

## Summary of new/changed query params on `GET /api/directory`

| Param           | Values                                   | Applied before pagination? |
|-----------------|------------------------------------------|----------------------------|
| `premium`       | `premium` \| `non` \| (empty)            | **yes** |
| `contactStatus` | `email` \| `mobile` \| `both` \| `complete` \| (empty) | **yes** |

Plus: return the premium flag and the full `tbl_directory` column set on
every directory row (items 1 & 2a).

Nothing here changes existing response shapes destructively — these are
additive fields and additive filters, so older callers keep working.
