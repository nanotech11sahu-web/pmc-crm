# Cron 1: 8 PM hot-lead WhatsApp, personalized by last remark

Supersedes the 9pm version described in `API_CHANGE_whatsapp_followup_digest.md`'s
original companion note — this is the actual spec to build for the
**outbound message sent to the lead/customer themselves** (not the owner).

## What it does

Runs once a day at **8:00 PM**:

1. Select every `crm_leads` row where `lead_type = 'hot'` and
   `stage NOT IN ('converted', 'lost')`.
2. For each, look up their most recent **remark** — a
   `crm_lead_activities` row with `activity_type = 'note'`
   (`ORDER BY occurred_at DESC LIMIT 1`). Remarks are entered from the
   CRM's Listings page ("Remarks" button on each row, opens a modal,
   each entry is stored as a `note` activity — not a single overwritable
   field, so this is genuinely the latest one of potentially many).
3. Compose a message personalized with that last remark's text, e.g.:

   > "Hi {ContactName}, following up on your listing for {CompanyName}
   > on PMC Yellow Pages. Last note on file: "{last remark text}" —
   > let us know if you have any questions!"

   If there is **no remark yet** for this lead (no `note` activity
   logged), fall back to a plain first-touch message instead — do not
   reference a remark that doesn't exist.
4. Send via the existing `Whatsapp_sender.php` (same credentials/pattern
   as everywhere else in the app) to the **lead's own mobile number**
   (`tbl_directory.MobileNumber`, falling back to `PhoneNumber`) — this
   is different from Cron 2, which messages the owner.
5. Log the send to `crm_message_log` (`is_automated = 1`) and mirror it
   into that lead's `crm_lead_activities` so it shows in their history
   like any manual message.
6. Skip (and log the skip, don't fail the batch) any hot lead with no
   usable mobile number.

## Where this lives

- `application/controllers/cli/Hot_lead_followup.php`
- Cron entry:
  ```
  0 20 * * *  php /path/to/public_html/index.php cli/hot_lead_followup
  ```

## Query sketch

```sql
SELECT l.*, d.ContactName, d.CompanyName, d.MobileNumber, d.PhoneNumber
FROM crm_leads l
JOIN tbl_directory d ON d.DirectoryID = l.directory_id
WHERE l.lead_type = 'hot' AND l.stage NOT IN ('converted', 'lost');

-- per lead, most recent remark (note-type activity only):
SELECT * FROM crm_lead_activities
WHERE lead_id = :lead_id AND activity_type = 'note'
ORDER BY occurred_at DESC
LIMIT 1;
```
