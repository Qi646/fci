# Codex Prompt: Complete Backend — Municipal Data Infrastructure

## Context

You are working on a hackathon project: a federated municipal data infrastructure prototype for the Region of Waterloo. The backend is a **Python FastAPI server** at `backend/main.py` that serves municipal department datasets from JSON files in `backend/data/`, with a sophisticated RBAC+ABAC access control engine already in place.

The frontend (Next.js) is being developed separately **by Claude** — it will consume everything you build here. Do not touch anything in the `frontend/` directory. Claude is handling all remaining frontend work, improvements, and gap-filling (dark theme, deck.gl 3D map, before/after toggle, React Flow topology, catalog browser, NL query input UI, etc.). Your job is exclusively the backend.

## Existing State

**What already works:**
- `GET /health` — healthcheck
- `GET /catalog` — dataset listing with `?q=` search, `?classification=` filter, access-aware visibility
- `GET /datasets/{dataset_id}/query` — single-dataset query with `zone_id=`, `ward=`, `aggregate=count|sum|avg`, `field=`, `fields=` params, field masking, aggregate-only enforcement
- `POST /join` — cross-dataset join on shared spatial key with independent access checks on both datasets, field masking, derived classification
- `GET /audit` — last 50 audit log entries (restricted to `view_audit` permission)
- `GET /access-config` / `PUT /access-config/{dataset_id}` — owner-configurable sharing policy, allowed departments, delivery mode
- Full access control engine: user directory (9 users), classification clearance, share mode enforcement, purpose-of-use checks, field masking, row filter rules, join policy

**Existing data files (6):**
- `backend/data/eng_pressure_zones.json` — Engineering water pressure zones
- `backend/data/plan_permits_2024.json` — Planning residential permits
- `backend/data/health_cases.json` — Public Health weekly case surveillance
- `backend/data/transit_gtfs_stops.json` — Transit GTFS stops with ridership
- `backend/data/social_services_demographics.json` — Social services demographics
- `backend/data/climate_risk_overlays.json` — Climate risk overlays

**Existing user profiles:** `public_portal`, `eng_analyst`, `planner`, `planning_manager`, `health_steward`, `transit_analyst`, `social_manager`, `climate_analyst`, `city_admin`

**Access config is persisted to:** `backend/access_config.json`

**Dependencies:** see `backend/requirements.txt`

---

## Tasks — Complete All of the Following

### 1. Add Two New Mock Data Files

**`backend/data/zoning_districts.json`**

Create a dataset representing Planning's zoning classification per parcel. Use real Kitchener-Waterloo ward names and coordinates (~43.45N, ~80.49W). Include at least 20 records.

Each record should have:
- `parcel_id` (shared spatial key, e.g. `"KIT-00421"` — matching existing permit parcel_ids where possible)
- `ward` (e.g. `"ward-6"`)
- `zone_id` (link to engineering zones)
- `zoning_class` (e.g. `"R1"`, `"R2"`, `"R4"`, `"C1"`, `"MU-1"`, `"MU-2"`)
- `permitted_uses` (array, e.g. `["single_detached", "semi_detached"]`)
- `max_height_m` (number)
- `max_density_units_per_ha` (number)
- `allows_infill` (boolean)
- `lat`, `lng`

Wrap in the same dataset envelope structure as existing files:
```json
{
  "dataset_id": "zoning-districts",
  "name": "Zoning Districts",
  "owner_department": "planning",
  "classification": "open",
  "share_mode": "open",
  "spatial_key": "parcel_id",
  "last_updated": "2026-01-15T00:00:00Z",
  "quality_score": 0.91,
  "fields": ["parcel_id", "ward", "zone_id", "zoning_class", "permitted_uses", "max_height_m", "max_density_units_per_ha", "allows_infill", "lat", "lng"],
  "pii_fields": [],
  "field_mask_rules": {},
  "row_filter_rules": [],
  "join_policy": { "allow_cross_department_join": true, "allow_raw_row_output": true },
  "allowed_consumer_departments": ["public"],
  "permitted_use_cases": [],
  "records": [ ... ]
}
```

**`backend/data/scorecard_metrics.json`**

Create a dataset representing the Vision One Million scorecard — regional readiness indicators across 5 pillars: housing, transportation, healthcare, employment, placemaking. Each pillar has 3-5 indicators.

Each record should have:
- `indicator_id`
- `pillar` (one of the 5)
- `indicator_name` (e.g. `"Permits issued (YTD)"`, `"Infill share"`, `"Water capacity headroom"`, `"Transit ridership growth"`, `"Primary care wait time"`)
- `current_value` (number)
- `target_value` (number)
- `unit` (e.g. `"count"`, `"percent"`, `"days"`, `"ratio"`)
- `status` (`"on-track"`, `"at-risk"`, `"behind"`)
- `source_dataset_id` (which dataset feeds this, e.g. `"plan-permits-2024"`)
- `last_computed`

The housing pillar should prominently show the water capacity crisis: `"Water capacity headroom"` with `current_value: -0.067`, `target_value: 0.20`, `status: "behind"`.

Use dataset envelope:
```json
{
  "dataset_id": "scorecard-metrics",
  "name": "Vision One Million Scorecard",
  "owner_department": "city_manager",
  "classification": "internal",
  "share_mode": "municipal_internal",
  "spatial_key": "indicator_id",
  "last_updated": "2026-03-01T00:00:00Z",
  "quality_score": 0.85,
  "fields": ["indicator_id", "pillar", "indicator_name", "current_value", "target_value", "unit", "status", "source_dataset_id", "last_computed"],
  "pii_fields": [],
  "field_mask_rules": {},
  "row_filter_rules": [],
  "join_policy": { "allow_cross_department_join": true, "allow_raw_row_output": true },
  "allowed_consumer_departments": [],
  "permitted_use_cases": [],
  "records": [ ... ]
}
```

**Register both files** in the `DATASET_FILES` list in `main.py`. Add corresponding default entries to `access_config.json`. Add `default_viewer_note` entries for both.

---

### 2. Add Missing Query Parameters to `GET /datasets/{dataset_id}/query`

Add support for these query params (specified in the original hackathon spec):

- **`parcel_id`** — filter records where `record["parcel_id"] == parcel_id`
- **`bbox`** — bounding box filter as `min_lat,min_lng,max_lat,max_lng`. Filter records where `lat` and `lng` fall within the box. Parse from a comma-separated string.
- **`since`** — ISO timestamp string. Filter records where any date field (`issued_date`, `last_updated`, `week_start`, etc.) is >= this value. Use a reasonable heuristic: check common date fields in the record.

These should all compose with existing filters (`zone_id`, `ward`, `aggregate`, etc.).

---

### 3. Implement `POST /query/natural`

An AI-powered endpoint that accepts plain English questions and translates them into API calls.

**Request body:**
```json
{ "question": "Which wards have approved infill permits but are above 90% water capacity?" }
```

**Implementation:**
1. Accept the question string in a POST body
2. Build a system prompt that describes all available datasets, their fields, and the available query/join API
3. Call the Claude API using **model `claude-opus-4-20250514`** via the `anthropic` Python SDK
4. The system prompt should instruct Claude to return a JSON query plan, e.g.:
```json
{
  "action": "join",
  "params": {
    "left_dataset": "eng-pressure-zones",
    "right_dataset": "plan-permits-2024",
    "join_key": "zone_id",
    "left_fields": ["zone_id", "zone_name", "capacity_pct"],
    "right_fields": ["permit_id", "permit_type", "ward", "units"]
  },
  "post_filter": "capacity_pct > 90 AND permit_type == 'infill'"
}
```
Or for simpler queries:
```json
{
  "action": "query",
  "params": {
    "dataset_id": "plan-permits-2024",
    "ward": "ward-6"
  }
}
```
5. Parse Claude's JSON response, execute the appropriate internal query/join (reuse the existing endpoint logic — call the Python functions directly, don't make HTTP requests to yourself)
6. Apply any `post_filter` as a simple Python filter on the results
7. Return:
```json
{
  "question": "...",
  "query_plan": { ... },
  "explanation": "I joined the engineering pressure zones with planning permits on zone_id, then filtered for zones above 90% capacity with infill permits.",
  "result_count": 12,
  "results": [ ... ]
}
```
8. This endpoint requires at least `internal` clearance. The queries it generates internally should run with the calling user's access context (so access control is still enforced).
9. Add `anthropic` to `requirements.txt`. Read the API key from environment variable `ANTHROPIC_API_KEY`.
10. **Fallback:** If the Claude API call fails (rate limit, missing key, timeout), return a structured error with `"error": "natural_language_unavailable"` and HTTP 503 rather than crashing.
11. Write an audit entry for every NL query with the question and generated plan in the `extra` field.

---

### 4. Add WebSocket Audit Broadcast

Add a WebSocket endpoint at `ws://localhost:8000/ws/audit` that broadcasts new audit entries in real-time.

1. Use FastAPI's built-in WebSocket support
2. Maintain a set of connected clients
3. Whenever `write_audit_entry()` is called, broadcast the new entry as JSON to all connected WebSocket clients
4. Handle client disconnection gracefully
5. The WebSocket connection itself does not require authentication (the frontend needs it for the live audit panel)

---

### 5. Enrich Existing Mock Data

**`plan_permits_2024.json`** — The technical spec requires at least **40 records**. Check the current count. If it's under 40, add more records with this distribution:
- ~50% infill, ~50% subdivision
- ~60% of infill permits concentrated in Ward 6 (zone ENG-ZONE-002) and Ward 9 (zone ENG-ZONE-004)
- Infill: 4-24 units each, Subdivision: 20-120 units each
- Use real Kitchener-Waterloo addresses and coordinates
- Spread `issued_date` across 2024 months (Jan-Dec)
- All records need: `permit_id`, `civic_address`, `parcel_id`, `ward`, `zone_id`, `permit_type`, `units`, `status`, `issued_date`, `applicant_name` (set to `"REDACTED"`), `estimated_completion`, `lat`, `lng`

**`health_cases.json`** — The technical spec requires at least **180 records** (12 weeks x 5 zones x 3 case types). Check the current count. If it's under 180, generate records to fill. Each record needs: `record_id`, `zone_id`, `ward`, `week_start`, `case_count`, `case_type` (respiratory/gastrointestinal/dermatological), `rate_per_1000`, `alert` (boolean — true when rate_per_1000 >= 7.0).

---

### 6. General Improvements

- Add CORS support for WebSocket connections
- Make sure all new endpoints have proper error handling and return structured JSON errors consistent with the existing pattern
- Ensure all new endpoints write audit entries
- Add the `anthropic` package to `requirements.txt`
- Update the `default_viewer_note` dict in `main.py` for new datasets
- Ensure the new datasets integrate with the existing access config system (appear in `GET /access-config`, are configurable via `PUT /access-config/{id}`)

---

## Do NOT Change

- Do not alter the existing access control engine logic (the `evaluate_access` function and its supporting code)
- Do not change the existing endpoint signatures or response shapes
- Do not modify the user directory structure
- Do not remove any existing data files or datasets
- Do not change the FastAPI app configuration (CORS, title, etc.) beyond what's needed for WebSocket support
- Do not touch anything in the `frontend/` directory — Claude is handling all frontend work

---

## Testing

After implementing, verify:
1. `POST /query/natural` with `{"question": "How many infill permits are in ward 6?"}` returns a sensible result (or a clean 503 if no API key is set)
2. `GET /datasets/plan-permits-2024/query?bbox=43.44,-80.50,43.47,-80.48` returns filtered results
3. `GET /datasets/plan-permits-2024/query?parcel_id=KIT-00421` returns the matching record
4. `GET /datasets/zoning-districts/query` returns zoning data
5. `GET /catalog` now shows 8 datasets
6. WebSocket at `ws://localhost:8000/ws/audit` receives live events when other endpoints are called
7. All existing endpoints still work identically
8. `plan_permits_2024.json` has >= 40 records
9. `health_cases.json` has >= 180 records
