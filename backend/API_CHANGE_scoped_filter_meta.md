# API change needed: scope `GET /api/filters/meta` by category/city

## What the frontend already sends

The Listings page's category and city dropdowns call this whenever either
filter changes:

```
GET /api/filters/meta?category=<selected category, or omitted>&city=<selected city, or omitted>
```

Confirmed live just now: the endpoint accepts these two query params
without error, but **ignores them** — the response is identical (28
cities) whether `category` is set to a real category, a nonexense value,
or omitted entirely.

## What it should do instead

- **When `category` is set:** `cities` in the response should only include
  cities that have at least one `tbl_directory` row in that category
  (i.e. joined through `tbl_dir_cat` → `tbl_category`).
- **When `city` is set:** `categories` in the response should only include
  categories that have at least one listing in that city.
- **When both are set:** both lists narrow to listings matching both.
- **When neither is set:** current behavior (full unscoped lists) —
  unchanged.

This is what lets the two dropdowns cross-filter each other — e.g.
picking "Advocate" as the category should make the city dropdown only
show cities that actually have advocates listed, instead of all 28
cities city-wide.

## Suggested query shape

Something close to:

```sql
-- cities scoped by category
SELECT DISTINCT d.CurrentCity
FROM tbl_directory d
JOIN tbl_dir_cat dc ON dc.DirectoryID = d.DirectoryID
JOIN tbl_category c ON c.CategoryID = dc.CategoryID
WHERE c.CategoryName = :category
  AND d.CurrentCity IS NOT NULL AND d.CurrentCity != ''
ORDER BY d.CurrentCity;

-- categories scoped by city
SELECT DISTINCT c.CategoryName
FROM tbl_directory d
JOIN tbl_dir_cat dc ON dc.DirectoryID = d.DirectoryID
JOIN tbl_category c ON c.CategoryID = dc.CategoryID
WHERE d.CurrentCity = :city
ORDER BY c.CategoryName;
```

If both `category` and `city` are supplied at once, apply both WHERE
conditions to each query (so `cities` still respects `category`, and
`categories` still respects `city`).

## Response shape — unchanged

```json
{ "categories": [{"CategoryID": "2", "CategoryName": "Advocate"}, ...],
  "cities": [{"CurrentCity": "Rourkela"}, ...] }
```

Same shape as today, just filtered — no frontend change needed once this
ships, it's already calling the endpoint this way.
