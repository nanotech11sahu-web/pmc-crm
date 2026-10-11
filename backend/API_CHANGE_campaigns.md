# PMC CRM — Backend to-do: Campaigns (the only thing left)

**For:** the backend team. The frontend is built and waiting
(`frontend/src/pages/Campaigns.jsx`). Until `/api/campaigns` exists it runs in a
labelled demo mode (browser-only, simulated, sends nothing) and **switches to
the real API automatically** once these endpoints answer — no frontend change
needed if this contract is followed exactly.

**Verified on production today:** the `/campaigns` routes are deployed and
permission-checked (`GET /campaigns` and `POST /campaigns/preview` answer
`403 Forbidden: missing permission campaign.view / campaign.create`).
**Blocked on one thing only — the permissions (item 1 below). Item 2 is needed before real sending.**

**Already live — no action needed:** all directory columns incl. `is_premium` /
`contact_status`; `?premium=` and `?contactStatus=` filters; dashboard
`missing_email_count` / `missing_mobile_count` / `missing_both_count`;
editable `EstablishYear`, `Keywords`, `BusinessInfo`;
`POST /messages/bulk-send-by-filter`.

## TO-DO CHECKLIST
- [ ] **1. Create the permissions and grant them to Owner.** `campaign.view`, `campaign.create`, `campaign.cancel` are **not in `crm_permissions`** (the catalog has 19 permissions, none for campaigns), so even the Owner gets 403. Insert them (module `Campaigns`) and grant all three to the Owner role (section 6).
- [ ] **2. Configure the fixed message for each channel on the backend.** The frontend has **no template or message selection at all**: the user only picks categories + channels, and the backend sends its own fixed, already-approved WhatsApp / SMS / Email message. `GET /templates` is **not used** by Campaigns (section 4a).
- [ ] 3. Once 1 is done, confirm all 7 endpoints work end-to-end per section 4 (only preview/list were reachable so far, and both stopped at the permission check). `POST /campaigns` must return in **< 1 s**.
- [ ] 4. `POST /campaigns` carries **no message content** (no `content`, `template_id`, `custom_body`). Ignore any such field the client sends; always use the backend's fixed message per channel (sections 4, 4a).
- [ ] 5. Background worker/cron that sends in batches, rate-limited, and updates the counters + status (section 5). Counters are denormalised (section 2).
- [ ] 6. Keep response times low: re-checked today `GET /directory` took 1.8 s and `/dashboard/stats` 1.3 s (they were ~0.3 s earlier) — worth watching.
- [ ] 7. Pass the acceptance checklist (section 7).

---

## 1. What the user sees

A new **Campaigns** item in the sidebar. Clicking **New campaign** opens
a form where the user:

1. Picks **one or more categories** (216 exist, searchable multi-select).
2. Optionally narrows by **city** and **premium / non-premium**.
3. Picks **one or more channels**: WhatsApp, SMS, Email (any combination).
   **There is no template picker and no message box.** Each channel sends its
   own **fixed, already-approved message that lives on the backend**; the
   frontend never selects, writes or sends any message text.
4. Sees a live **audience preview** ("842 listings · WhatsApp 790 · SMS 790 · Email 311 reachable").
5. Clicks **Send**. The campaign is **saved immediately** and shown in the
   Campaigns list as *Queued → Running → Completed*.

The list/detail screens then **auto-refresh every 60 seconds** and show,
per campaign and per channel: **total, sent, delivered, failed, skipped,
still queued**, a progress bar, and "last updated" time. So "1–2 minutes
later the user sees the current status out of the total".

**Important:** `POST /campaigns` must return fast (< 1s) after saving and
queueing. Sending happens in the background (section 5), never inside the
request.

## 2. Database (suggested; adjust names to your conventions)

```sql
CREATE TABLE crm_campaigns (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(150) NOT NULL,
  status          ENUM('queued','running','completed','completed_with_errors','cancelled','failed')
                  NOT NULL DEFAULT 'queued',
  categories      JSON NOT NULL,                 -- ["Plumbers","Electricians"]
  city            VARCHAR(100) DEFAULT NULL,
  filter_premium  ENUM('all','premium','non') NOT NULL DEFAULT 'all',
  filter_contact_status VARCHAR(20) NOT NULL DEFAULT '',
  audience_total  INT UNSIGNED NOT NULL DEFAULT 0, -- distinct listings
  created_by      INT UNSIGNED NOT NULL,
  cancelled_by    INT UNSIGNED DEFAULT NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at      DATETIME DEFAULT NULL,
  finished_at     DATETIME DEFAULT NULL,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_status (status, created_at)
) ENGINE=InnoDB;

-- one row per channel in the campaign; holds the live counters
CREATE TABLE crm_campaign_channels (
  campaign_id  INT UNSIGNED NOT NULL,
  channel      ENUM('whatsapp','sms','email') NOT NULL,
  message_ref  VARCHAR(120) DEFAULT NULL,        -- optional audit snapshot: which fixed message/template was used
  total        INT UNSIGNED NOT NULL DEFAULT 0,  -- planned messages incl. skipped
  queued       INT UNSIGNED NOT NULL DEFAULT 0,
  sent         INT UNSIGNED NOT NULL DEFAULT 0,  -- accepted by provider (includes delivered)
  delivered    INT UNSIGNED NOT NULL DEFAULT 0,  -- provider-confirmed; subset of sent
  failed       INT UNSIGNED NOT NULL DEFAULT 0,
  skipped      INT UNSIGNED NOT NULL DEFAULT 0,  -- no valid email/mobile for this channel
  PRIMARY KEY (campaign_id, channel)
) ENGINE=InnoDB;

CREATE TABLE crm_campaign_recipients (
  id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  campaign_id         INT UNSIGNED NOT NULL,
  channel             ENUM('whatsapp','sms','email') NOT NULL,
  directory_id        INT UNSIGNED NOT NULL,
  lead_id             INT UNSIGNED DEFAULT NULL,
  recipient           VARCHAR(190) DEFAULT NULL,   -- number or email actually used
  status              ENUM('queued','sending','sent','delivered','failed','skipped') NOT NULL DEFAULT 'queued',
  error               VARCHAR(255) DEFAULT NULL,   -- e.g. 'no_contact', provider error text
  provider_message_id VARCHAR(120) DEFAULT NULL,
  attempts            TINYINT UNSIGNED NOT NULL DEFAULT 0,
  queued_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at             DATETIME DEFAULT NULL,
  delivered_at        DATETIME DEFAULT NULL,
  UNIQUE KEY uq_once (campaign_id, channel, directory_id),   -- never double-send
  KEY idx_work (campaign_id, channel, status)
) ENGINE=InnoDB;
```

**Counters are denormalised on purpose.** The status endpoints are
polled every 60s by every open browser; they must read the counter columns
in `crm_campaign_channels`, **never** `COUNT(*)` over
`crm_campaign_recipients` (that table can hold hundreds of thousands of
rows). The worker updates counters atomically
(`UPDATE ... SET sent = sent + 1, queued = queued - 1`). See also the


## 3. Audience rules (create + preview must use the SAME logic)

- Listings = `tbl_directory` rows joined via `tbl_dir_cat` / `tbl_category`
  to **any** of the selected category names (OR, not AND). **DISTINCT** by
  `DirectoryID` — a listing in two selected categories is messaged once per channel.
- Apply `city` if given; apply `premium` (`all|premium|non`) and
  `contact_status` using the same definitions as `GET /directory`
  (same definitions the already-live `GET /directory?premium=` and `?contactStatus=` use).
- Per channel, the recipient is:
  - `whatsapp` and `sms` → `MobileNumber`, falling back to `PhoneNumber`
    (same rule as `API_CHANGE_cron_hot_lead_8pm.md` (existing doc in this repo)); normalise to E.164 (+91 default).
  - `email` → `EmailAddress`.
- If the field is empty/invalid → insert the recipient row with
  `status='skipped'`, `error='no_contact'` (counts toward `total` and
  `skipped`). Do **not** drop it silently — the user wants "out of total".
- Ensure a `crm_leads` row exists for each listing (create if missing,
  same as `POST /leads`), and write each send to `crm_message_log` and the
  lead's activity timeline, so lead pages show campaign messages.

## 4. Endpoints

All require `Authorization: Bearer <jwt>` like the rest of the API.
JSON is `snake_case`. Counts should be real integers (the frontend
coerces strings defensively, but please send numbers). Timestamps:
ISO 8601 UTC, e.g. `"2026-10-09T12:50:11Z"`.

### Campaign object (returned by list, detail, create, cancel, retry)

```json
{
  "id": 12,
  "name": "Plumbers & Electricians – Rourkela",
  "status": "running",
  "categories": ["Plumbers", "Electricians"],
  "city": "Rourkela",
  "filters": { "premium": "all", "contact_status": "" },
  "channels": ["whatsapp", "sms"],
  "audience_total": 842,
  "created_by": { "id": 1, "name": "PMC Owner" },
  "created_at": "2026-10-09T12:50:11Z",
  "started_at": "2026-10-09T12:50:40Z",
  "finished_at": null,
  "updated_at": "2026-10-09T12:52:03Z",
  "totals": { "total": 1684, "queued": 900, "sent": 700, "delivered": 650, "failed": 40, "skipped": 44 },
  "by_channel": {
    "whatsapp": { "total": 842, "queued": 450, "sent": 350, "delivered": 330, "failed": 20, "skipped": 22 },
    "sms":      { "total": 842, "queued": 450, "sent": 350, "delivered": 320, "failed": 20, "skipped": 22 }
  }
}
```

`totals` = sum of `by_channel`. Invariant:
`total = queued + sent + failed + skipped` (`delivered` is a subset of `sent`).
`status` rules: `queued` (nothing started) → `running` → `completed`
(failed = 0) or `completed_with_errors` (failed > 0); `cancelled` (user
stopped it — every still-`queued` recipient is flipped to `skipped` with
`error='cancelled'`, so the invariant above keeps holding and `queued`
drops to 0); `failed` (whole campaign could not run, e.g. provider not configured).

### `POST /api/campaigns/preview`
Audience counts before sending (frontend debounces ~500ms). **No writes.**

Request:
```json
{ "categories": ["Plumbers"], "city": null,
  "filters": { "premium": "all", "contact_status": "" },
  "channels": ["whatsapp", "email"] }
```
Response `200`:
```json
{ "listings": 842,
  "by_channel": { "whatsapp": { "reachable": 790, "skipped": 52 },
                  "email":    { "reachable": 311, "skipped": 531 } } }
```

### `POST /api/campaigns`
Validate, save, create recipient rows, set counters, status `queued`,
return immediately.

Request:
```json
{
  "idempotency_key": "b1f6c0e2-0c5e-4a39-9a47-6d0f3f1f0a11",
  "name": "Optional — if empty, generate e.g. 'Plumbers – 9 Oct 18:20'",
  "categories": ["Plumbers", "Electricians"],
  "city": null,
  "filters": { "premium": "all", "contact_status": "" },
  "channels": ["whatsapp", "email"]
}
```
Response `201`: `{ "campaign": { ...campaign object... } }`

Validation → `422 {"error": "...", "fields": {"categories": "Select at least one"}}`:
- `categories`: 1–50 names that exist; `channels`: 1–3 of the allowed values.
- No message content is accepted: the backend uses its fixed message for each channel (section 4a). Ignore any `content` / `template_id` / `custom_body` the client sends.
- User must hold `message.send_<channel>` for **every** chosen channel
  (else `403` naming the channel) plus `campaign.create` (section 6).
- Audience of 0 listings → `422 "No listings match"`.
- Suggested cap: 20,000 recipients per campaign → `422` with a clear message.
- Honour the optional `idempotency_key` body field (a client-generated
  UUID) so a double-click / retry never creates two campaigns — return the
  existing campaign for a repeated key. (Body field, not a header, so no
  extra CORS `Access-Control-Allow-Headers` entry is needed.)

### `GET /api/campaigns?page=1&per_page=20&status=`
Response `200`: `{ "rows": [campaign...], "total": 37, "page": 1, "per_page": 20 }`,
newest first. `status` optional filter (`active` = queued+running).
**This is the endpoint polled every 60s** — it must be cheap
(counters only, no per-recipient counting). Optional but nice: send an
`ETag` and honour `If-None-Match` → `304`.

### `GET /api/campaigns/{id}`
Response `200`: `{ "campaign": {...} }`. `404` if missing.

### `GET /api/campaigns/{id}/recipients?channel=&status=&page=1&per_page=50`
Drill-down used by the detail view (mainly to see failures/skips).
Response `200`:
```json
{ "rows": [
    { "id": 9001, "channel": "whatsapp", "directory_id": 8808,
      "company_name": "Jungle safari 2.0", "recipient": "+918249030169",
      "status": "failed", "error": "Number not on WhatsApp",
      "sent_at": "2026-10-09T12:51:02Z" } ],
  "total": 20, "page": 1, "per_page": 50 }
```

### `POST /api/campaigns/{id}/cancel`
Only while `queued`/`running`; stops further sends, already-sent stay sent.
Returns `{ "campaign": {...} }`. `409` if already finished.

### `POST /api/campaigns/{id}/retry-failed`
Re-queues `failed` recipients (not `skipped`), moves campaign back to
`running`. Returns `{ "campaign": {...}, "requeued": 40 }`. `409` if there are no failed recipients or the campaign is `cancelled` (cancelled campaigns can't be retried; the user creates a new one).

### 4a. Fixed message per channel (backend-owned — no frontend dependency)

The frontend does **not** read `GET /templates` for campaigns and never sends
message text. For each channel the backend keeps **one fixed, already-approved
message** (in config, a settings table, or the existing templates table — your
choice; the frontend doesn't care):

- **WhatsApp:** the Meta-approved template name + language, with its variables.
- **SMS:** the registered/approved SMS text (plus template/DLT id and sender id if your gateway needs them).
- **Email:** the fixed subject + body.

Per recipient, fill the variables from the listing (e.g. `contact_name`,
`company_name`). If a channel has no fixed message configured, fail the
campaign creation with `422 "No message configured for <channel>"` so nothing
is half-sent.

## 5. Background sending (the part that makes "live status" real)

- A worker/cron (every minute is fine) picks up `queued`/`running`
  campaigns, processes recipients in **batches** (e.g. 50–200 per run per
  channel), respecting each provider's rate limit (WhatsApp Cloud API tier
  limits, SMS gateway TPS, SMTP/provider hourly caps).
- Per recipient: set `sending` → call provider → `sent` (store
  `provider_message_id`) or `failed` (store `error`, `attempts+1`; retry
  transient errors up to 3 times with backoff before marking `failed`).
- After each batch update the **counter columns** and the campaign's
  `status` / `started_at` / `finished_at` / `updated_at`.
- **WhatsApp:** always send the fixed Meta-approved **template message**
  (`wa_template_name` + language) with variables filled per recipient. Never free-text.
- **SMS:** send the fixed registered/approved text with variables filled
  (include the template/DLT id and sender id if the gateway needs them).
- **Email:** send the fixed subject + body with variables filled.
- **Delivery receipts (can be phase 2):** webhook from the provider flips
  `sent → delivered` and increments `delivered`. Until then `delivered`
  may stay 0 — the UI handles that.
- A cancelled campaign must be honoured within one batch.

## 6. Permissions

Add to `crm_permissions` (module `Campaigns`): `campaign.view`,
`campaign.create`, `campaign.cancel`. Owner gets all. Until they exist the
frontend falls back to `message.bulk_send` for showing the page and the
**New campaign** button, so nothing breaks while you roll this out.
Sending additionally requires the existing per-channel
`message.send_whatsapp|sms|email`.

## 7. Acceptance checklist (how we'll test together)

1. `POST /campaigns/preview` for 2 categories returns a listing count equal
   to the DISTINCT union of both categories (no double counting).
2. `POST /campaigns` returns `201` in < 1s even for 5,000+ recipients and
   the campaign appears at the top of `GET /campaigns` as `queued`.
3. After 1–2 minutes the same campaign shows `running` with `sent > 0`;
   `total = queued + sent + failed + skipped` on every poll.
4. A listing with no email shows up as `skipped` for the email channel, not missing from the total.
5. Sending the same campaign body twice quickly (double click) creates one campaign (idempotency).
6. Cancel stops further sends within ~1 batch; counters stay consistent.
7. A user without `message.send_sms` cannot create a campaign that includes SMS (`403`).
   `POST /campaigns` for a channel with no fixed message configured returns `422`.
8. Each sent message appears in that lead's activity history.

## 8. Frontend behaviour you can rely on

- Polls `GET /campaigns` every **60s** while the Campaigns page is open
  (paused when the browser tab is hidden); detail view polls
  `GET /campaigns/{id}` every 60s only while that campaign is
  `queued`/`running`.
- Progress % shown = `(sent + failed + skipped) / total`.
- Unknown extra fields are ignored; missing optional fields (e.g.
  `delivered`, `created_by`) are tolerated.
- Demo mode (backend returns 404 for `/campaigns`) is shown with a visible
  banner and uses browser storage only — it never calls any send endpoint.
