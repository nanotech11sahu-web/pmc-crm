#!/bin/bash
# Reproduces the broken `category` filter on GET /api/directory.
# Expected: each category returns a different, correctly-filtered total.
# Actual: every category (including ones that don't exist) returns the
# same total=21 and the same two blank/orphaned rows (DirectoryID 8618, 6275).

set -e

EMAIL="${CRM_EMAIL:-pmcyellowpages@gmail.com}"
PASSWORD="${CRM_PASSWORD:?Set CRM_PASSWORD env var before running, e.g. CRM_PASSWORD='...' ./category_filter_bug_repro.sh}"
BASE="https://pmcyellowpages.com/api"

TOKEN=$(curl -s -X POST "$BASE/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

echo "== no filter (baseline) =="
curl -s "$BASE/directory?perPage=2" -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

echo "== category=Advocate (real category) =="
curl -s "$BASE/directory?category=Advocate&perPage=2" -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

echo "== category=ThisCategoryDoesNotExistXYZ123 (garbage) =="
curl -s "$BASE/directory?category=ThisCategoryDoesNotExistXYZ123&perPage=2" -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

echo "== city=Agartala (WORKS correctly, for contrast) =="
curl -s "$BASE/directory?city=Agartala&perPage=2" -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
