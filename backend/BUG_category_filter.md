# Bug: `category` filter on GET /api/directory is a no-op

## Symptom
Selecting any category on the CRM's Directory/Leads pages returns the same
wrong result every time — same total count, same (blank) rows — no matter
which category is picked.

## Proof
Run `backend/category_filter_bug_repro.sh` (in this repo), or manually:

```bash
TOKEN=$(curl -s -X POST 'https://pmcyellowpages.com/api/auth/login' \
  -H 'Content-Type: application/json' \
  -d '{"email":"pmcyellowpages@gmail.com","password":"<current password>"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

# Baseline — no filter, correct data
curl -s "https://pmcyellowpages.com/api/directory?perPage=2" \
  -H "Authorization: Bearer $TOKEN"

# A REAL category name
curl -s "https://pmcyellowpages.com/api/directory?category=Advocate&perPage=2" \
  -H "Authorization: Bearer $TOKEN"

# A category name THAT DOES NOT EXIST
curl -s "https://pmcyellowpages.com/api/directory?category=ThisCategoryDoesNotExistXYZ123&perPage=2" \
  -H "Authorization: Bearer $TOKEN"
```

**Result:** both the real category and the nonsense category return the
identical `total: 21` and the identical two rows (`DirectoryID 8618` and
`6275`) — both of which have `category_names: null` and every text field
blank. The `category` query param is not reaching the WHERE clause at all;
the query always falls through to the 21 `tbl_directory` rows that have no
matching entry in `tbl_dir_cat`.

For contrast, `city`, `search`, and `missingOnly` on the same endpoint all
filter correctly (verified: `city=Agartala` narrows to exactly 1 real,
matching row).

## Where to look
`Directory_api.php`'s `index()` method, or wherever `Crm_directory_model`
builds the category join/filter. Likely causes:
- The category condition is written into the `JOIN ... ON` clause instead
  of `WHERE` (or vice versa), so a non-matching category silently falls
  back to unmatched/NULL-category rows instead of returning zero results.
- The `category` GET param isn't actually being read/passed into the query
  builder before the WHERE clause is built (a variable-name mismatch,
  wrong `$this->input->get(...)` key, etc.).

## Expected behavior
`GET /api/directory?category=<name>` should return only rows whose
`tbl_dir_cat` → `tbl_category` join matches that category name (or 0 rows
if there's no match) — same filtering behavior already working correctly
for `city`.
