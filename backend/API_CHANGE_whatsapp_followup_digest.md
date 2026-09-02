> **SUPERSEDED** — do not build this version. Replaced by
> `API_CHANGE_cron_daily_contact_summary.md` (the "today's activity"
> framing) and `API_CHANGE_cron_hot_lead_8pm.md` (the customer-facing
> hot-lead message this file didn't originally separate out). Kept here
> only for history.

# New cron: daily WhatsApp follow-up digest to a fixed number

Replaces the manual Reminders module (removed from the CRM UI). Instead
of the owner having to type in reminders by hand, this runs automatically
every day and texts a summary straight to WhatsApp.

## What it does

Once a day (suggested time: **6:00 PM**, adjustable), a cron job:

1. Finds every `crm_leads` row where **either**:
   - `stage = 'contacted'` (leads that have only been contacted, no
     further action yet), **or**
   - `next_followup_at` falls on **tomorrow's date** (leads explicitly
     scheduled to be followed up the next day)
2. Counts them.
3. Sends **one WhatsApp message** to **6265007710** via the existing
   reseller API (`application/libraries/Whatsapp_sender.php` — same
   credentials already used elsewhere in the app, no new account needed).
4. Message text, roughly:

   > "You have **{N}** lead(s) that need follow-up tomorrow. Open PMC CRM
   > to review them."

   (Exact wording is up to you/the owner — the count and the "tomorrow"
   framing are the only hard requirements.)

## Where this lives

- New CLI controller: `application/controllers/cli/Followup_digest.php`
- Cron entry:
  ```
  0 18 * * *  php /path/to/public_html/index.php cli/followup_digest
  ```
- Reuses `Whatsapp_sender::send_text($to, $message)` — no new WhatsApp
  integration needed, just a new caller.
- Query needed (adjust table/column names if they differ from the schema
  in `pmc_crm/backend/schema.sql`):

  ```sql
  SELECT COUNT(*) AS cnt
  FROM crm_leads
  WHERE stage = 'contacted'
     OR DATE(next_followup_at) = DATE_ADD(CURDATE(), INTERVAL 1 DAY);
  ```

## Not needed

- No UI page for this — it's fire-and-forget, straight to WhatsApp.
- No per-user targeting — always sends to the one fixed number above.
- No dependency on the Reminders/`crm_reminders` table, Google Tasks, or
  any of the earlier per-user reminder scaffolding — that whole flow is
  being dropped in favor of this single daily digest.
