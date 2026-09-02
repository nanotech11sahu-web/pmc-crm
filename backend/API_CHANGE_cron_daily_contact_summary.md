# Cron 2: End-of-day owner digest — report + itemized "who to contact"

One WhatsApp message to the owner combining **both** pieces demonstrated
in chat: the counts summary ("Today's Report") and the itemized list of
leads still needing contact ("Follow-up Reminder"). Not two separate
messages — one message, two sections.

## What it does

Runs once a day, after the 8pm hot-lead cron — suggested **8:30 PM**:

1. **Counts, by type** — leads worked on today (at least one
   `crm_lead_activities` row with `occurred_at` = today), split into
   `lead_type = 'hot'` and `lead_type = 'medium'`.
2. **Still-pending leads, in full** — every `crm_leads` row where
   `stage NOT IN ('converted', 'lost')` and there's no activity today,
   fetched with enough detail to itemize each one (not just a count):
   company name, contact name, city, category, stage, most recent
   remark (latest `activity_type = 'note'`), and mobile number.
3. Send **one WhatsApp message** to **6265007710** via
   `Whatsapp_sender.php`, combining both sections, e.g.:

   ```
   📅 Today's Report
   ✅ Hot leads worked on: 1
   ✅ Medium leads worked on: 1
   ⏳ Still need contact: 2

   📋 Follow-up Reminder — 2 Leads

   1. POWER SOLUTIONS
   Contact: Sumit lall
   City: Rourkela
   Category: Battery & Inverter
   Stage: Contacted
   Last remark: No remarks yet
   📞 9861025770

   2. Utkal Pradeshik Marwari Sammelan
   Contact: Sri Jagdish Prasad Killa ( President )
   City: Rourkela
   Category: Social Services Organisation
   Stage: Contacted
   Last remark: No remarks yet
   📞 No number on file
   ```

   Per-lead format matches what was already approved and sent in chat —
   plain phone number as its own line (WhatsApp auto-links it), not a
   `wa.me` link. If a lead has no mobile number, print "No number on
   file" instead of omitting the line.

## Where this lives

- `application/controllers/cli/Daily_contact_summary.php`
- Cron entry:
  ```
  30 20 * * *  php /path/to/public_html/index.php cli/daily_contact_summary
  ```
- Reuses `Whatsapp_sender::send_text()` — no new integration.

## Query sketch

```sql
-- worked on today, by type
SELECT l.lead_type, COUNT(DISTINCT l.id) AS worked_today
FROM crm_leads l
JOIN crm_lead_activities a ON a.lead_id = l.id
WHERE DATE(a.occurred_at) = CURDATE()
  AND l.lead_type IN ('hot', 'medium')
GROUP BY l.lead_type;

-- still needing contact — full rows, not just a count
SELECT l.*, d.CompanyName, d.ContactName, d.CurrentCity, d.MobileNumber,
       c.CategoryName
FROM crm_leads l
JOIN tbl_directory d ON d.DirectoryID = l.directory_id
LEFT JOIN tbl_dir_cat dc ON dc.DirectoryID = d.DirectoryID
LEFT JOIN tbl_category c ON c.CategoryID = dc.CategoryID
WHERE l.stage NOT IN ('converted', 'lost')
  AND NOT EXISTS (
    SELECT 1 FROM crm_lead_activities a
    WHERE a.lead_id = l.id AND DATE(a.occurred_at) = CURDATE()
  )
GROUP BY l.id;

-- per lead in that list, most recent remark:
SELECT * FROM crm_lead_activities
WHERE lead_id = :lead_id AND activity_type = 'note'
ORDER BY occurred_at DESC
LIMIT 1;
```

## A note on message length

WhatsApp text messages aren't length-limited in a way that matters here,
but if "still needing contact" grows into the dozens, a wall of itemized
blocks stops being readable. Worth capping the itemized list at, say, the
top 15-20 (ordered by `next_followup_at` or `created_at`) and noting
"+N more — open PMC CRM to see the rest" rather than dumping an
unbounded list into one WhatsApp message. Flagging this now rather than
after it becomes a real problem.

## Relationship to Cron 1

Two crons total:
- **Cron 1** (`API_CHANGE_cron_hot_lead_8pm.md`, 8:00 PM) messages **the
  hot leads themselves** — a customer-facing "thanks for connecting"
  follow-up.
- **Cron 2** (this file, 8:30 PM) messages **the owner** — the combined
  report + itemized follow-up list, in a single message.

Both reuse the same WhatsApp sending path but go to completely different
recipients for completely different purposes.
