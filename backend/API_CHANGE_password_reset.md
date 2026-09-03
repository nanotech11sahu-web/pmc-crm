# API change needed: a way to reset a user's password

## The problem, found live

`POST /api/users` already generates and returns a `temp_password` once
in the create response — that part works correctly (verified: creating
a user returns `{"user": {...}, "temp_password": "13713882"}`). But
there was no endpoint to recover or reset a user's password if:

- The frontend didn't show it in time (this was a real bug — now fixed,
  see below)
- The user forgets their password later
- You want to force a password change for security reasons

Confirmed no such path exists today:
- `PUT /api/users/{id}` only accepts `name`, `mobile`, `role_id`,
  `is_active` — not password.
- `DELETE /api/users/{id}` returns `405 Method not allowed` — doesn't
  exist, so "delete and recreate" isn't an option either.

One real user (`PRAMOD KUMAR NATULYA`, id 2, pmcrourkela@gmail.com) is
currently locked out for exactly this reason — the frontend didn't show
the temp password when the account was created, and there's now no way
to recover or reset it via the API.

## What to add

`POST /api/users/{id}/reset-password` — Owner/`user.manage` permission
required. Generates a new random temp password the same way
`POST /api/users` already does, updates `crm_users.password_hash`, and
returns it once in the response:

```json
{ "temp_password": "48213967" }
```

## Frontend fix already made

`NewUserForm` (in `frontend/src/pages/Users.jsx`) previously sent a
hardcoded placeholder (`password_hash: 'set-on-first-login'`) as part
of the create payload — harmless since the backend ignores unrecognized
fields and generates its own temp password, but the bigger issue was
that the frontend discarded the response body entirely, so the
generated `temp_password` was never shown to the person adding the
user. Fixed: it's now displayed on-screen right after creation, with a
note that it's shown once and can't be retrieved later. Once the reset
endpoint above exists, the Users page will get a "Reset password"
button per user that surfaces the new temp password the same way.

## Immediate unblock for the locked-out user

Until the endpoint exists, the only way to fix `pmcrourkela@gmail.com`'s
account is a direct DB update — generate a bcrypt hash with PHP and set
it directly:

```php
<?php
echo password_hash('NewTempPassword123!', PASSWORD_DEFAULT);
```

```sql
UPDATE crm_users SET password_hash = '<hash from above>' WHERE id = 2;
```
