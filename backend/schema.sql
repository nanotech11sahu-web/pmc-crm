-- =====================================================================
-- PMC CRM — new tables only.
-- Runs inside the EXISTING `pmcyello21` database, alongside tbl_directory
-- etc. Nothing here alters or drops any existing tbl_* table.
-- Every new table is prefixed `crm_` to stay unmistakably separate from
-- the PHP site's own tables.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. AUTH & PERMISSIONS  (completely separate from tbl_admin_user)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS crm_users (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(120)      NOT NULL,
  email           VARCHAR(150)      NOT NULL UNIQUE,
  mobile          VARCHAR(20)       DEFAULT NULL,
  password_hash   VARCHAR(255)      NOT NULL,
  role_id         INT UNSIGNED      NOT NULL,
  is_active       TINYINT(1)        NOT NULL DEFAULT 1,
  google_refresh_token TEXT         DEFAULT NULL,   -- for point 10 (Contacts/Tasks)
  created_at      DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS crm_roles (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(60)  NOT NULL UNIQUE,        -- e.g. Owner, Manager, Telecaller
  description VARCHAR(255) DEFAULT NULL,
  is_system   TINYINT(1)   NOT NULL DEFAULT 0       -- Owner role can't be deleted
) ENGINE=InnoDB;

-- Master list of every permission the app can check. Seeded by the app,
-- editable only by adding rows (never delete one in production).
CREATE TABLE IF NOT EXISTS crm_permissions (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code        VARCHAR(80)  NOT NULL UNIQUE,   -- e.g. 'lead.edit', 'lead.delete', 'directory.export'
  label       VARCHAR(150) NOT NULL,
  module      VARCHAR(60)  NOT NULL           -- groups permissions in the UI: Directory, Leads, WhatsApp, Users...
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS crm_role_permissions (
  role_id       INT UNSIGNED NOT NULL,
  permission_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  FOREIGN KEY (role_id) REFERENCES crm_roles(id) ON DELETE CASCADE,
  FOREIGN KEY (permission_id) REFERENCES crm_permissions(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Per-user override on top of role permissions (grant or explicitly revoke
-- one permission for one user, e.g. "this telecaller can also delete leads").
CREATE TABLE IF NOT EXISTS crm_user_permission_overrides (
  user_id       INT UNSIGNED NOT NULL,
  permission_id INT UNSIGNED NOT NULL,
  allow         TINYINT(1)   NOT NULL,   -- 1 = grant, 0 = explicit deny
  PRIMARY KEY (user_id, permission_id),
  FOREIGN KEY (user_id) REFERENCES crm_users(id) ON DELETE CASCADE,
  FOREIGN KEY (permission_id) REFERENCES crm_permissions(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS crm_auth_tokens (       -- refresh-token store
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED NOT NULL,
  token_hash  VARCHAR(255) NOT NULL,
  expires_at  DATETIME     NOT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at  DATETIME     DEFAULT NULL,
  FOREIGN KEY (user_id) REFERENCES crm_users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 2. LEADS  (item 2 & 4 — one row per directory listing that becomes a lead;
--    the CRM's own table, NOT tbl_directory)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS crm_leads (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  directory_id    INT UNSIGNED     NOT NULL,        -- FK to tbl_directory.DirectoryID (no formal FK: different logical owner)
  lead_type       ENUM('hot','medium','cold') NOT NULL DEFAULT 'cold',
  stage           ENUM('new','contacted','followup','converted','lost') NOT NULL DEFAULT 'new',
  owner_user_id   INT UNSIGNED     DEFAULT NULL,     -- telecaller/agent assigned
  remark          TEXT             DEFAULT NULL,     -- item 4: "on one cat 10 listing = one lead" grouping note
  batch_label     VARCHAR(120)     DEFAULT NULL,     -- e.g. "Plumbers - Kothrud - Batch 3" grouping tag for item 4
  is_flagged_missing TINYINT(1)    NOT NULL DEFAULT 0, -- cached: no email AND no mobile (item 1)
  next_followup_at   DATETIME     DEFAULT NULL,
  created_by      INT UNSIGNED     DEFAULT NULL,
  created_at      DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_directory (directory_id),
  KEY idx_type (lead_type),
  KEY idx_stage (stage),
  KEY idx_owner (owner_user_id),
  FOREIGN KEY (owner_user_id) REFERENCES crm_users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES crm_users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 3. FULL ACTIVITY / FOLLOW-UP HISTORY  (item 4 & 9 — "full track" of
--    everything done on a lead, and each listing shows follow-up count)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS crm_lead_activities (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  lead_id       INT UNSIGNED  NOT NULL,
  user_id       INT UNSIGNED  DEFAULT NULL,          -- who performed it (NULL = system/cron)
  activity_type ENUM(
                  'call','whatsapp','sms','email','note',
                  'status_change','type_change','assignment_change',
                  'field_update','followup_scheduled','system'
                ) NOT NULL,
  outcome       VARCHAR(60)   DEFAULT NULL,           -- e.g. 'connected','no_answer','not_interested','converted'
  notes         TEXT          DEFAULT NULL,
  meta_json     JSON          DEFAULT NULL,           -- e.g. {"from":"cold","to":"hot"} for status_change
  occurred_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_lead (lead_id, occurred_at),
  FOREIGN KEY (lead_id) REFERENCES crm_leads(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES crm_users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 4. DIRECTORY EDIT LOG + REVERT  (item 6 — telecaller updates old data,
--    but every change is versioned and can be reverted)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS crm_directory_edit_log (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  directory_id  INT UNSIGNED  NOT NULL,
  user_id       INT UNSIGNED  DEFAULT NULL,
  field_name    VARCHAR(80)   NOT NULL,               -- e.g. 'EmailAddress', 'MobileNumber'
  old_value     TEXT          DEFAULT NULL,
  new_value     TEXT          DEFAULT NULL,
  reverted      TINYINT(1)    NOT NULL DEFAULT 0,
  reverted_by   INT UNSIGNED  DEFAULT NULL,
  reverted_at   DATETIME      DEFAULT NULL,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_dir (directory_id, created_at),
  FOREIGN KEY (user_id) REFERENCES crm_users(id) ON DELETE SET NULL,
  FOREIGN KEY (reverted_by) REFERENCES crm_users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 5. WHATSAPP / SMS / EMAIL — messages + templates + the 9pm cron queue
--    (items 5 & 8)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS crm_message_templates (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  channel       ENUM('whatsapp','sms','email') NOT NULL,
  name          VARCHAR(120)  NOT NULL,
  wa_template_name VARCHAR(120) DEFAULT NULL,          -- Meta-approved template name, if channel=whatsapp
  subject       VARCHAR(200)  DEFAULT NULL,            -- email only
  body          TEXT          NOT NULL,                -- may contain {{company_name}}, {{contact_name}} etc.
  is_active     TINYINT(1)    NOT NULL DEFAULT 1,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS crm_message_log (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  lead_id       INT UNSIGNED  DEFAULT NULL,
  directory_id  INT UNSIGNED  DEFAULT NULL,
  channel       ENUM('whatsapp','sms','email') NOT NULL,
  template_id   INT UNSIGNED  DEFAULT NULL,
  recipient     VARCHAR(150)  NOT NULL,                -- mobile or email actually sent to
  message_body  TEXT          DEFAULT NULL,
  status        ENUM('queued','sent','failed','delivered') NOT NULL DEFAULT 'queued',
  provider_response TEXT      DEFAULT NULL,
  provider_message_id VARCHAR(120) DEFAULT NULL,
  sent_by_user_id INT UNSIGNED DEFAULT NULL,           -- NULL = sent by cron
  is_automated  TINYINT(1)    NOT NULL DEFAULT 0,      -- 1 = cron-generated (item 5), 0 = manual bulk send (item 8)
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_lead (lead_id),
  KEY idx_channel_status (channel, status),
  FOREIGN KEY (lead_id) REFERENCES crm_leads(id) ON DELETE SET NULL,
  FOREIGN KEY (template_id) REFERENCES crm_message_templates(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 6. REMINDERS  (item 10 — daily WhatsApp "who to call today" + 10am nudge,
--    optionally sourced from Google Tasks/Contacts)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS crm_reminders (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id         INT UNSIGNED  NOT NULL,             -- the owner/telecaller to remind
  lead_id         INT UNSIGNED  DEFAULT NULL,
  title           VARCHAR(200)  NOT NULL,             -- e.g. "Call Mr. Sharma re: renewal"
  remind_on_date  DATE          NOT NULL,
  source          ENUM('manual','google_task','followup_due') NOT NULL DEFAULT 'manual',
  google_task_id  VARCHAR(120)  DEFAULT NULL,
  status          ENUM('pending','sent_evening','sent_morning','done','dismissed') NOT NULL DEFAULT 'pending',
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_user_date (user_id, remind_on_date),
  FOREIGN KEY (user_id) REFERENCES crm_users(id) ON DELETE CASCADE,
  FOREIGN KEY (lead_id) REFERENCES crm_leads(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 7. SAVED FILTERS  (item 7)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS crm_saved_filters (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED  NOT NULL,
  name        VARCHAR(120)  NOT NULL,
  filter_json JSON          NOT NULL,     -- {category, city, lead_type, stage, missing_only, owner, date_range, ...}
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES crm_users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Seed baseline roles + permissions
-- ---------------------------------------------------------------------

INSERT IGNORE INTO crm_roles (id, name, description, is_system) VALUES
  (1, 'Owner',      'Full access to everything, incl. user & permission management', 1),
  (2, 'Manager',    'Manage leads, users read-only, send messages, view reports', 0),
  (3, 'Telecaller', 'Work assigned leads, log calls, send messages to own leads', 0);

INSERT IGNORE INTO crm_permissions (code, label, module) VALUES
  ('directory.view',        'View directory listings',            'Directory'),
  ('directory.edit',        'Edit directory listing fields',      'Directory'),
  ('directory.export',      'Export directory data',              'Directory'),
  ('lead.view',              'View leads',                        'Leads'),
  ('lead.create',            'Create leads',                      'Leads'),
  ('lead.edit',              'Edit lead (type/stage/remark)',     'Leads'),
  ('lead.delete',            'Delete leads',                      'Leads'),
  ('lead.assign',            'Assign leads to users',             'Leads'),
  ('lead.view_all',          'View leads not owned by self',      'Leads'),
  ('message.send_whatsapp',  'Send WhatsApp manually',            'Messaging'),
  ('message.send_sms',       'Send SMS manually',                 'Messaging'),
  ('message.send_email',     'Send Email manually',               'Messaging'),
  ('message.bulk_send',      'Bulk-send to multiple leads',       'Messaging'),
  ('template.manage',        'Create/edit message templates',     'Messaging'),
  ('user.manage',            'Create/edit users and roles',       'Admin'),
  ('permission.manage',      'Edit role/user permissions',        'Admin'),
  ('reminder.manage',        'Manage own reminders',              'Reminders'),
  ('google.connect',         'Connect own Google account',        'Integrations'),
  ('report.view',            'View reports/dashboard',            'Reports');

-- Owner gets everything
INSERT IGNORE INTO crm_role_permissions (role_id, permission_id)
  SELECT 1, id FROM crm_permissions;

-- Manager: all except user.manage / permission.manage
INSERT IGNORE INTO crm_role_permissions (role_id, permission_id)
  SELECT 2, id FROM crm_permissions WHERE code NOT IN ('user.manage','permission.manage');

-- Telecaller: working set only
INSERT IGNORE INTO crm_role_permissions (role_id, permission_id)
  SELECT 3, id FROM crm_permissions WHERE code IN (
    'directory.view','lead.view','lead.create','lead.edit',
    'message.send_whatsapp','message.send_sms','message.send_email',
    'reminder.manage','google.connect'
  );
