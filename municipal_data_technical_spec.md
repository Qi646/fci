# Municipal Data Infrastructure
## Technical Specification — Data Layer & Visualisations
**Version 1.0 · Hackathon build · Region of Waterloo**

---

## Table of Contents

1. [Data layer overview](#1-data-layer-overview)
2. [Mock data files](#2-mock-data-files)
3. [Catalog schema](#3-catalog-schema)
4. [API endpoints](#4-api-endpoints)
5. [Access control middleware](#5-access-control-middleware)
6. [Audit log](#6-audit-log)
7. [Data quality model](#7-data-quality-model)
8. [Visualisation: ward capacity map](#8-visualisation-ward-capacity-map)
9. [Visualisation: data catalog browser](#9-visualisation-data-catalog-browser)
10. [Visualisation: planning permit timeline](#10-visualisation-planning-permit-timeline)
11. [Visualisation: public health heatmap](#11-visualisation-public-health-heatmap)
12. [Visualisation: transit network flow](#12-visualisation-transit-network-flow)
13. [Visualisation: social services demographic breakdown](#13-visualisation-social-services-demographic-breakdown)
14. [Visualisation: climate risk overlay](#14-visualisation-climate-risk-overlay)
15. [Shared frontend components](#15-shared-frontend-components)
16. [Server startup and project structure](#16-server-startup-and-project-structure)

---

## 1. Data Layer Overview

The data layer is a single API server that sits between departmental source systems (simulated as JSON files) and all consumer applications (dashboards, portals, integrations). It enforces access control, enables cross-departmental joins, and maintains an audit trail on every request.

### Design principles

- **Federated by default.** Each dataset stays owned by its department. The layer provides discoverability and access — not a centralised copy.
- **Privacy at the seam.** Access tier enforcement happens inside the API, not by trusting calling applications. A caller cannot retrieve data above their permitted tier regardless of how they construct the request.
- **Spatial key as the integration primitive.** `civic_address` and `parcel_id` are the shared identifiers that make cross-departmental joins possible without schema standardisation.
- **Audit everything.** Every request — successful or denied — is logged with requester identity, dataset, tier, timestamp, and outcome.

### Runtime environment

- **Language:** Node.js (Express) or Python (FastAPI) — spec uses pseudocode compatible with both
- **Port:** 3000
- **Data:** JSON files in `/data`, loaded into memory at startup
- **Auth:** Mock `Authorization: Bearer <role>` header — no real token validation
- **CORS:** Open for demo (`Access-Control-Allow-Origin: *`)

---

## 2. Mock Data Files

All files live in `/data`. Each record must include the shared spatial key field.

### 2.1 `eng_pressure_zones.json`

One record per pressure zone. Zones map to ward groups.

```json
[
  {
    "zone_id": "ENG-ZONE-001",
    "zone_name": "North zone",
    "wards": ["ward-1", "ward-2", "ward-3"],
    "capacity_pct": 62,
    "max_capacity_units": 4200,
    "current_load_units": 2604,
    "status": "safe",
    "last_updated": "2024-11-01T08:00:00Z",
    "civic_addresses": ["see parcel registry"],
    "centroid_lat": 43.481,
    "centroid_lng": -80.523
  },
  {
    "zone_id": "ENG-ZONE-002",
    "zone_name": "Ward 6",
    "wards": ["ward-6"],
    "capacity_pct": 97,
    "max_capacity_units": 1800,
    "current_load_units": 1746,
    "status": "critical",
    "last_updated": "2024-11-01T08:00:00Z",
    "centroid_lat": 43.451,
    "centroid_lng": -80.497
  },
  {
    "zone_id": "ENG-ZONE-003",
    "zone_name": "Central",
    "wards": ["ward-4", "ward-5"],
    "capacity_pct": 81,
    "max_capacity_units": 3100,
    "current_load_units": 2511,
    "status": "warning",
    "last_updated": "2024-11-01T08:00:00Z",
    "centroid_lat": 43.458,
    "centroid_lng": -80.511
  },
  {
    "zone_id": "ENG-ZONE-004",
    "zone_name": "Ward 9",
    "wards": ["ward-9", "ward-10"],
    "capacity_pct": 93,
    "max_capacity_units": 2200,
    "current_load_units": 2046,
    "status": "critical",
    "last_updated": "2024-11-01T08:00:00Z",
    "centroid_lat": 43.462,
    "centroid_lng": -80.484
  },
  {
    "zone_id": "ENG-ZONE-005",
    "zone_name": "South zone",
    "wards": ["ward-7", "ward-8"],
    "capacity_pct": 55,
    "max_capacity_units": 2800,
    "current_load_units": 1540,
    "status": "safe",
    "last_updated": "2024-11-01T08:00:00Z",
    "centroid_lat": 43.436,
    "centroid_lng": -80.508
  }
]
```

### 2.2 `plan_permits_2024.json`

One record per active residential permit. `applicant_name` is a PII field — stripped by the access layer when `aggregate` is used or when the requester does not have `restricted` access.

```json
[
  {
    "permit_id": "PLAN-2024-00421",
    "civic_address": "84 Bridge St W, Kitchener",
    "parcel_id": "KIT-00421",
    "ward": "ward-6",
    "zone_id": "ENG-ZONE-002",
    "permit_type": "infill",
    "units": 12,
    "status": "active",
    "issued_date": "2024-02-14",
    "applicant_name": "REDACTED",
    "estimated_completion": "2025-06",
    "lat": 43.449,
    "lng": -80.494
  },
  {
    "permit_id": "PLAN-2024-00538",
    "civic_address": "210 King St N, Waterloo",
    "parcel_id": "KIT-00538",
    "ward": "ward-9",
    "zone_id": "ENG-ZONE-004",
    "permit_type": "infill",
    "units": 8,
    "status": "active",
    "issued_date": "2024-03-22",
    "applicant_name": "REDACTED",
    "estimated_completion": "2025-03",
    "lat": 43.465,
    "lng": -80.481
  }
]
```

Include at least 40 records total. Distribution should be approximately:
- 50% infill, 50% subdivision
- ~60% of infill permits in Ward 6 (zone-002) and Ward 9 (zone-004)
- Range of unit counts: infill 4–24 units, subdivision 20–120 units

### 2.3 `health_cases.json`

Aggregated only — no individual records, no PII. One record per zone per week.

```json
[
  {
    "record_id": "HEALTH-2024-W44-ZONE002",
    "zone_id": "ENG-ZONE-002",
    "ward": "ward-6",
    "week_start": "2024-10-28",
    "case_count": 14,
    "case_type": "respiratory",
    "rate_per_1000": 3.2,
    "alert": false
  },
  {
    "record_id": "HEALTH-2024-W44-ZONE004",
    "zone_id": "ENG-ZONE-004",
    "ward": "ward-9",
    "week_start": "2024-10-28",
    "case_count": 31,
    "case_type": "respiratory",
    "rate_per_1000": 7.1,
    "alert": true
  }
]
```

Include 12 weeks × 5 zones × 3 case types = 180 records minimum.

### 2.4 `transit_gtfs_stops.json`

One record per stop. Ridership is weekly average boardings.

```json
[
  {
    "stop_id": "KW-STOP-001",
    "stop_name": "King & Victoria",
    "civic_address": "1 King St W, Kitchener",
    "parcel_id": "KIT-STOP-001",
    "lat": 43.451,
    "lng": -80.493,
    "routes": ["iXpress 200", "Route 7"],
    "weekly_boardings": 4820,
    "ward": "ward-6",
    "zone_id": "ENG-ZONE-002"
  }
]
```

Include ~30 stops covering all zones.

### 2.5 `social_services_demographics.json`

Aggregated cohort data by ward. Access tier: internal.

```json
[
  {
    "ward": "ward-6",
    "zone_id": "ENG-ZONE-002",
    "year": 2024,
    "cohort": "seniors_65_plus",
    "population": 3240,
    "households_in_need": 412,
    "active_cases": 187,
    "service_types": ["housing_support", "food_security", "mobility_aid"]
  }
]
```

Include all wards × 5 cohorts (seniors, children_0_14, low_income, disability, newcomers).

### 2.6 `climate_risk.json`

Risk scores per zone. Combines flood, heat island, and infrastructure age.

```json
[
  {
    "zone_id": "ENG-ZONE-002",
    "ward": "ward-6",
    "flood_risk_score": 72,
    "heat_island_score": 68,
    "infra_age_score": 81,
    "composite_risk": 74,
    "risk_tier": "high",
    "vulnerable_population_overlap": 0.61,
    "priority_rank": 1
  }
]
```

---

## 3. Catalog Schema

Every dataset registered in the system has a catalog entry. The catalog is defined as a static array in `/data/catalog.json` and served by `GET /catalog`.

### 3.1 Catalog entry fields

| Field | Type | Description |
|---|---|---|
| `dataset_id` | string | Unique identifier, kebab-case |
| `name` | string | Human-readable title |
| `description` | string | One sentence on what the dataset contains |
| `owner_dept` | enum | `engineering`, `planning`, `health`, `transit`, `social`, `climate` |
| `steward` | string | Named data steward (first initial, last name) |
| `access_tier` | enum | `open`, `internal`, `restricted`, `confidential` |
| `spatial_key` | string or null | Name of the field usable as a join key — `civic_address`, `parcel_id`, `zone_id`, or null |
| `temporal_resolution` | string | `real-time`, `weekly`, `monthly`, `annual` |
| `last_updated` | ISO timestamp | Freshness indicator |
| `record_count` | integer | Row count in current file |
| `fields` | Field[] | Column-level metadata — see below |
| `pii_fields` | string[] | Field names that contain PII — stripped on aggregated queries |
| `lineage` | string[] | Source system identifiers |
| `api_endpoint` | string | Path for `/datasets/:id/query` |
| `join_compatible` | string[] | dataset_ids this dataset can be joined with (shares a spatial key) |
| `quality_score` | float | 0.0–1.0, computed from completeness + freshness + consistency |
| `quality_flags` | string[] | Human-readable quality warnings, if any |

### 3.2 Field-level metadata

Each entry in `fields[]`:

```json
{
  "name": "permit_type",
  "type": "enum",
  "description": "Residential permit category",
  "enum_values": ["infill", "subdivision", "commercial", "industrial"],
  "is_pii": false,
  "is_spatial_key": false
}
```

### 3.3 Full catalog entries

```json
[
  {
    "dataset_id": "eng-pressure-zones",
    "name": "Water pressure zone capacity",
    "description": "Current water infrastructure capacity utilisation by pressure zone.",
    "owner_dept": "engineering",
    "steward": "R. Patel",
    "access_tier": "internal",
    "spatial_key": "zone_id",
    "temporal_resolution": "monthly",
    "last_updated": "2024-11-01T08:00:00Z",
    "record_count": 5,
    "pii_fields": [],
    "lineage": ["SAP-PM", "GIS-ESRI"],
    "api_endpoint": "/datasets/eng-pressure-zones/query",
    "join_compatible": ["plan-permits-2024", "health-cases", "social-demographics", "climate-risk"],
    "quality_score": 0.96,
    "quality_flags": []
  },
  {
    "dataset_id": "plan-permits-2024",
    "name": "Active residential permit register",
    "description": "All active residential building permits issued in 2024, including type and unit count.",
    "owner_dept": "planning",
    "steward": "J. Hoffman",
    "access_tier": "internal",
    "spatial_key": "civic_address",
    "temporal_resolution": "real-time",
    "last_updated": "2024-11-14T14:22:00Z",
    "record_count": 1847,
    "pii_fields": ["applicant_name"],
    "lineage": ["AMANDA-PERMITS"],
    "api_endpoint": "/datasets/plan-permits-2024/query",
    "join_compatible": ["eng-pressure-zones", "transit-gtfs-stops", "climate-risk"],
    "quality_score": 0.97,
    "quality_flags": []
  },
  {
    "dataset_id": "health-cases",
    "name": "Disease surveillance — aggregated zones",
    "description": "Weekly case counts by zone and case type. Aggregated only — no individual records.",
    "owner_dept": "health",
    "steward": "Dr. M. Okoro",
    "access_tier": "restricted",
    "spatial_key": "zone_id",
    "temporal_resolution": "weekly",
    "last_updated": "2024-11-11T06:00:00Z",
    "record_count": 180,
    "pii_fields": [],
    "lineage": ["iPHIS"],
    "api_endpoint": "/datasets/health-cases/query",
    "join_compatible": ["eng-pressure-zones", "social-demographics", "climate-risk"],
    "quality_score": 0.94,
    "quality_flags": []
  },
  {
    "dataset_id": "transit-gtfs-stops",
    "name": "Transit stop ridership",
    "description": "GTFS stop locations with weekly average boardings.",
    "owner_dept": "transit",
    "steward": "F. Mensah",
    "access_tier": "open",
    "spatial_key": "civic_address",
    "temporal_resolution": "weekly",
    "last_updated": "2024-11-10T00:00:00Z",
    "record_count": 312,
    "pii_fields": [],
    "lineage": ["GTFS-RT", "GRT-AVL"],
    "api_endpoint": "/datasets/transit-gtfs-stops/query",
    "join_compatible": ["plan-permits-2024", "social-demographics"],
    "quality_score": 0.99,
    "quality_flags": []
  },
  {
    "dataset_id": "social-demographics",
    "name": "Social services — ward cohort summary",
    "description": "Population and service uptake by ward and demographic cohort.",
    "owner_dept": "social",
    "steward": "L. Scian",
    "access_tier": "internal",
    "spatial_key": "zone_id",
    "temporal_resolution": "annual",
    "last_updated": "2024-01-15T00:00:00Z",
    "record_count": 55,
    "pii_fields": [],
    "lineage": ["SAMS", "Stats-Canada-2021"],
    "api_endpoint": "/datasets/social-demographics/query",
    "join_compatible": ["eng-pressure-zones", "health-cases", "climate-risk", "transit-gtfs-stops"],
    "quality_score": 0.88,
    "quality_flags": ["annual cadence — may not reflect 2024 population shifts"]
  },
  {
    "dataset_id": "climate-risk",
    "name": "Climate risk composite scores",
    "description": "Zone-level composite risk scores combining flood risk, heat island intensity, and infrastructure age.",
    "owner_dept": "engineering",
    "steward": "R. Patel",
    "access_tier": "open",
    "spatial_key": "zone_id",
    "temporal_resolution": "annual",
    "last_updated": "2024-06-01T00:00:00Z",
    "record_count": 5,
    "pii_fields": [],
    "lineage": ["FloodNet-ON", "Climate-Atlas-CA", "GIS-ESRI"],
    "api_endpoint": "/datasets/climate-risk/query",
    "join_compatible": ["eng-pressure-zones", "plan-permits-2024", "health-cases", "social-demographics"],
    "quality_score": 0.91,
    "quality_flags": []
  }
]
```

---

## 4. API Endpoints

### 4.1 `GET /catalog`

**Auth:** None required (open endpoint — returns tier-appropriate metadata only)

**Query parameters:**

| Parameter | Type | Description |
|---|---|---|
| `q` | string | Keyword match against `name`, `description`, and field names |
| `dept` | string | Filter by `owner_dept` |
| `tier` | string | Filter by `access_tier` |
| `spatial` | boolean | If true, only return datasets with a non-null `spatial_key` |
| `joinable_with` | string | Return only datasets that can be joined with the given `dataset_id` |

**Response:** Array of catalog entries. Full schema per section 3.1.

**Example:**
```
GET /catalog?q=water+capacity&spatial=true
```
```json
[
  {
    "dataset_id": "eng-pressure-zones",
    "name": "Water pressure zone capacity",
    "access_tier": "internal",
    "spatial_key": "zone_id",
    "quality_score": 0.96,
    "join_compatible": ["plan-permits-2024", "health-cases", "social-demographics", "climate-risk"],
    ...
  }
]
```

---

### 4.2 `GET /datasets/:id/query`

**Auth:** Required. Tier checked against requester role (see section 5).

**Path parameter:** `id` — `dataset_id` from catalog.

**Query parameters:**

| Parameter | Type | Description |
|---|---|---|
| `parcel_id` | string | Exact match on `parcel_id` field |
| `zone_id` | string | Exact match on `zone_id` field |
| `ward` | string | Exact match on `ward` field |
| `bbox` | string | `lat_min,lng_min,lat_max,lng_max` — spatial filter on `lat`/`lng` fields |
| `since` | ISO string | Return records where `last_updated` or `issued_date` is after this value |
| `fields` | comma-separated | Projection — only return named fields. PII fields are stripped if requester tier < restricted |
| `aggregate` | string | `count`, `sum:<field>`, or `avg:<field>`. PII fields stripped automatically |
| `limit` | integer | Max records returned. Default 500, max 5000 |

**Behaviour:**
- If the dataset's `access_tier` exceeds the requester's permitted tier, return `403` with a denial reason — and write to audit log
- If `aggregate` is used, PII fields listed in the dataset's `pii_fields` are excluded from the response regardless of requester tier
- All responses include an `X-Quality-Score` header with the dataset's current quality score

**Example:**
```
GET /datasets/plan-permits-2024/query?ward=ward-6&since=2024-01-01&fields=parcel_id,permit_type,units,lat,lng
Authorization: Bearer eng_staff
```
```json
{
  "dataset_id": "plan-permits-2024",
  "record_count": 23,
  "access_tier_used": "internal",
  "pii_stripped": true,
  "records": [
    { "parcel_id": "KIT-00421", "permit_type": "infill", "units": 12, "lat": 43.449, "lng": -80.494 },
    ...
  ]
}
```

---

### 4.3 `POST /join`

**Auth:** Required. Both datasets' tiers are checked — the stricter of the two applies.

**Request body:**

```json
{
  "left_dataset": "eng-pressure-zones",
  "right_dataset": "plan-permits-2024",
  "join_key": "zone_id",
  "left_fields": ["zone_name", "capacity_pct", "status"],
  "right_fields": ["permit_type", "units"],
  "right_aggregate": "sum:units",
  "right_filter": { "permit_type": "infill" }
}
```

| Field | Required | Description |
|---|---|---|
| `left_dataset` | Yes | Primary dataset `dataset_id` |
| `right_dataset` | Yes | Dataset to join |
| `join_key` | Yes | Shared field name. Must be present in both datasets' `fields[]` |
| `left_fields` | No | Fields to include from left. Defaults to all non-PII fields |
| `right_fields` | No | Fields to include from right. Defaults to all non-PII fields |
| `right_aggregate` | No | Aggregate applied to right dataset before join — e.g. `sum:units`, `count` |
| `right_filter` | No | Key-value filter applied to right dataset before join |
| `left_filter` | No | Key-value filter applied to left dataset before join |

**Validation:**
- Both dataset IDs must exist in the catalog
- `join_key` must appear in both datasets' `fields[]`
- The two datasets must appear in each other's `join_compatible` arrays
- If either dataset is `restricted`, requester must have `steward` role
- If either dataset is `confidential`, return `403` unconditionally

**Response:**

```json
{
  "join_id": "join-20241114-001",
  "left_dataset": "eng-pressure-zones",
  "right_dataset": "plan-permits-2024",
  "join_key": "zone_id",
  "access_tier_applied": "internal",
  "record_count": 5,
  "records": [
    {
      "zone_name": "Ward 6",
      "capacity_pct": 97,
      "status": "critical",
      "infill_units_sum": 184
    },
    {
      "zone_name": "Ward 9",
      "capacity_pct": 93,
      "status": "critical",
      "infill_units_sum": 121
    }
  ]
}
```

---

### 4.4 `GET /audit`

**Auth:** Requires `admin` or `cdo` role.

Returns the in-memory audit log as a JSON array, most recent first.

**Query parameters:**

| Parameter | Type | Description |
|---|---|---|
| `limit` | integer | Max entries. Default 50 |
| `outcome` | string | `approved` or `denied` |
| `dataset_id` | string | Filter to a specific dataset |

**Response:**

```json
[
  {
    "log_id": "audit-001",
    "timestamp": "2024-11-14T14:33:02Z",
    "requester_role": "eng_staff",
    "endpoint": "POST /join",
    "datasets": ["eng-pressure-zones", "plan-permits-2024"],
    "access_tier_required": "internal",
    "outcome": "approved",
    "pii_stripped": true,
    "record_count_returned": 5
  },
  {
    "log_id": "audit-002",
    "timestamp": "2024-11-14T14:35:17Z",
    "requester_role": "transit_staff",
    "endpoint": "GET /datasets/health-cases/query",
    "datasets": ["health-cases"],
    "access_tier_required": "restricted",
    "outcome": "denied",
    "denial_reason": "Role transit_staff does not have access to restricted tier"
  }
]
```

---

### 4.5 `GET /quality/:id`

Returns the detailed quality breakdown for a dataset.

**Auth:** Internal tier minimum.

**Response:**

```json
{
  "dataset_id": "plan-permits-2024",
  "overall_score": 0.97,
  "dimensions": {
    "completeness": { "score": 0.97, "detail": "56 of 1847 records missing units field" },
    "freshness": { "score": 1.0, "detail": "Updated 4 minutes ago — within real-time threshold" },
    "consistency": { "score": 0.95, "detail": "7 parcels have overlapping active permits" },
    "accuracy": { "score": 0.96, "detail": "71 parcel_ids do not resolve in GIS registry" }
  },
  "validation_rules": [
    { "rule": "permit_type is known enum", "pass": true, "fail_count": 0 },
    { "rule": "units is positive integer", "pass": false, "fail_count": 19 },
    { "rule": "parcel_id resolves in eng-pressure-zones", "pass": false, "fail_count": 71 },
    { "rule": "no duplicate active permits per parcel", "pass": false, "fail_count": 7 }
  ],
  "last_evaluated": "2024-11-14T14:00:00Z"
}
```

---

## 5. Access Control Middleware

Every request to `/datasets/*` and `/join` passes through this middleware before any data is loaded.

### 5.1 Role definitions

Defined as a static map in the server. For the demo, role is extracted directly from the `Authorization: Bearer <role>` header.

```json
{
  "public":         { "max_tier": "open" },
  "eng_staff":      { "max_tier": "internal", "dept": "engineering" },
  "plan_staff":     { "max_tier": "internal", "dept": "planning" },
  "health_staff":   { "max_tier": "internal", "dept": "health" },
  "transit_staff":  { "max_tier": "internal", "dept": "transit" },
  "social_staff":   { "max_tier": "internal", "dept": "social" },
  "health_steward": { "max_tier": "restricted", "dept": "health" },
  "plan_steward":   { "max_tier": "restricted", "dept": "planning" },
  "cdo":            { "max_tier": "restricted", "dept": "all" },
  "admin":          { "max_tier": "restricted", "dept": "all" }
}
```

Note: `confidential` tier is never accessible via the API regardless of role.

### 5.2 Tier ordering

```
open < internal < restricted < confidential
```

A request is approved if `role.max_tier >= dataset.access_tier` in this ordering.

### 5.3 Middleware logic (pseudocode)

```
function checkAccess(request, datasetId):
  role = parseBearer(request.Authorization)
  if role is null:
    role = "public"

  dataset = catalog.find(datasetId)
  if dataset is null:
    return 404

  if dataset.access_tier == "confidential":
    writeAuditLog(role, datasetId, "denied", "Confidential data is not accessible via API")
    return 403

  if tierRank(role.max_tier) < tierRank(dataset.access_tier):
    writeAuditLog(role, datasetId, "denied", "Role does not have access to " + dataset.access_tier + " tier")
    return 403

  writeAuditLog(role, datasetId, "approved")
  return PROCEED
```

For `POST /join`, run `checkAccess` for both datasets. Use the stricter (higher) tier of the two.

### 5.4 PII stripping

After access is approved, the response pipeline checks the dataset's `pii_fields` array. If the requester role is not `restricted` or above, any field listed in `pii_fields` is deleted from every record before the response is serialised.

---

## 6. Audit Log

The audit log is an in-memory array initialised at server startup. It is not persisted to disk — in production this would write to an append-only database table.

### 6.1 Log entry schema

```json
{
  "log_id": "audit-<sequential-integer>",
  "timestamp": "<ISO 8601>",
  "requester_role": "<role string>",
  "requester_dept": "<dept or null>",
  "endpoint": "<METHOD /path>",
  "datasets": ["<dataset_id>", ...],
  "access_tier_required": "<tier>",
  "outcome": "approved | denied",
  "denial_reason": "<string or null>",
  "pii_stripped": "<boolean>",
  "record_count_returned": "<integer or null>",
  "query_params": "<object — sanitised>",
  "duration_ms": "<integer>"
}
```

### 6.2 Demo requirements

The audit log must include at least one pre-seeded denied entry so the demo always shows a blocked access attempt even before the live demo triggers one. Seed it as:

```json
{
  "log_id": "audit-000",
  "timestamp": "<server_start_time - 5 minutes>",
  "requester_role": "transit_staff",
  "endpoint": "GET /datasets/health-cases/query",
  "datasets": ["health-cases"],
  "access_tier_required": "restricted",
  "outcome": "denied",
  "denial_reason": "Role transit_staff does not have access to restricted tier"
}
```

---

## 7. Data Quality Model

Quality scores are computed at server startup and cached. They are not recomputed on each request.

### 7.1 Scoring dimensions (equal weight, 0.25 each)

| Dimension | Calculation |
|---|---|
| Completeness | `non-null required fields / total required fields × records` |
| Freshness | `1.0` if updated within temporal resolution threshold, decays linearly to `0.0` at 5× the threshold |
| Consistency | `passing cross-field validation rules / total rules` |
| Accuracy | `records with resolvable spatial key / total records` — for datasets with a spatial key |

### 7.2 Quality thresholds

| Score | Status | Catalog badge |
|---|---|---|
| ≥ 0.95 | Good | Green |
| 0.85–0.94 | Acceptable | Amber |
| < 0.85 | Degraded | Red — warning shown to consumers |

---

## 8. Visualisation: Ward Capacity Map

**File:** `map.html`
**Datasets used:** `eng-pressure-zones` (internal), `plan-permits-2024` (internal via join)
**Primary API calls:** `GET /datasets/eng-pressure-zones/query`, `POST /join`

### 8.1 Purpose

Show the core anchor use case. Two states: before integration (subdivision-only capacity model) and after (full permit integration via POST /join). The before/after toggle is the centrepiece demo moment.

### 8.2 Layout

```
┌─────────────────────────────────┬──────────────────────┐
│                                 │  Before / After      │
│         Ward map                │  toggle              │
│         (Leaflet or SVG)        ├──────────────────────┤
│                                 │  Zone capacity bars  │
│                                 ├──────────────────────┤
│                                 │  Selected zone info  │
└─────────────────────────────────┴──────────────────────┘
```

### 8.3 Map component

**Option A — Leaflet.js** (preferred if GeoJSON is available)
- Load Kitchener ward boundary GeoJSON
- Colour each ward polygon by capacity status: `#C0DD97` (safe, <75%), `#FAC775` (warning, 75–90%), `#F09595` (critical, >90%)
- Render blue circle markers for each infill permit (`permit_type == "infill"`) — only visible in the "after" state
- Marker radius proportional to `units` (min radius 5, max 14)
- Click a ward to select it and update the side panel

**Option B — SVG map** (fallback)
- Use the pre-built SVG ward map from the planning session
- Colour zones by capacity status using the same palette
- Append `<circle>` elements for permit markers on top of the SVG

### 8.4 Before/after toggle

- **Before state:** Load only `eng-pressure-zones`. Show capacity percentages as-is. No permit markers. Side panel shows: "Model accounts for subdivision permits only."
- **After state:** Fire `POST /join` with `left: eng-pressure-zones`, `right: plan-permits-2024`, `join_key: zone_id`, `right_aggregate: sum:units`. Update capacity percentages to include infill load. Show permit markers. Side panel shows the delta.

**Capacity recalculation for "after" state:**
```
adjusted_capacity_pct = (current_load_units + infill_units_sum) / max_capacity_units × 100
```

Show both the old and new percentage in the zone info panel with a red delta indicator.

### 8.5 Side panel

On zone selection, show:
- Zone name and current status badge
- Capacity bar (animated width transition)
- Before/after capacity percentages (after state only)
- Count of active infill permits and total infill units in zone
- List of permit addresses (max 5, with "and N more")

### 8.6 Legend

```
● Infill permit (size = units)
■ Safe (<75%)  ■ Warning (75–90%)  ■ Critical (>90%)
```

---

## 9. Visualisation: Data Catalog Browser

**File:** `catalog.html`
**Datasets used:** All (metadata only)
**Primary API calls:** `GET /catalog`, `POST /join`, `GET /audit`

### 9.1 Purpose

Let judges explore the full dataset registry, understand access tiers and quality scores, and trigger a live cross-departmental join — watching the audit log update in real time.

### 9.2 Layout

```
┌──────────────────────────────────────────────────────────┐
│  Search bar + tier filter chips                          │
├──────────────────────────┬───────────────────────────────┤
│                          │                               │
│  Dataset cards (grid)    │  Audit log (live)             │
│                          │                               │
├──────────────────────────┴───────────────────────────────┤
│  Join result panel (appears after join is fired)         │
└──────────────────────────────────────────────────────────┘
```

### 9.3 Dataset card

Each card shows:
- Dataset name and owning department
- Access tier badge (colour-coded per tier)
- Quality score bar and numeric score
- Temporal resolution and last updated timestamp
- Spatial key field name (if present)
- "Join with..." button — only shown if `join_compatible` is non-empty and the current user role permits

### 9.4 Search and filter

- Keyword search filters cards client-side against `name`, `description`, and `owner_dept`
- Tier filter chips (All / Open / Internal / Restricted) toggle visibility
- Matching keyword is highlighted in card text

### 9.5 Join panel

When "Join with..." is clicked:
1. Show a dataset picker (pre-filtered to `join_compatible` datasets)
2. Show the join key (auto-populated from shared spatial key)
3. Optional aggregate selector (None / Count / Sum units / Avg capacity)
4. "Run join" button fires `POST /join`
5. Response renders as a compact table below the cards
6. Audit log entry for the join appears in the right panel immediately

### 9.6 Audit log panel

- Shows last 20 audit entries, auto-polled every 3 seconds via `GET /audit?limit=20`
- Approved entries show in default colour
- Denied entries show with a red left border and denial reason
- New entries animate in from the top

---

## 10. Visualisation: Planning Permit Timeline

**File:** `viz_planning.html`
**Datasets used:** `plan-permits-2024` (internal)
**Primary API calls:** `GET /datasets/plan-permits-2024/query?aggregate=count&group_by=month,permit_type`

### 10.1 Purpose

Show Planning's view of residential growth over time, split by permit type. The key insight — that infill and subdivision are roughly equal — should be immediately visible.

### 10.2 Chart type

Grouped bar chart (Chart.js). X axis: month (Jan–Nov 2024). Y axis: permit count. Two series: infill (blue) and subdivision (green).

### 10.3 Additional elements

- **Cumulative unit count line** on a secondary Y axis — total residential units approved month-to-date
- **Annotation line** at the month the development pause was announced, labelled "Pause announced"
- **Summary metrics row** above the chart:
  - Total permits YTD
  - Infill % of total
  - Total units YTD
  - Avg units per infill permit vs. per subdivision permit

### 10.4 Interactivity

- Click a bar to filter the ward map (if open in another tab) to that month's permits — implement via `localStorage` event if both pages are open, or as a standalone tooltip showing top 5 wards for that month
- Toggle to show by ward instead of by month (grouped bars, one group per ward)
- "Export CSV" button that serialises the current view's data

---

## 11. Visualisation: Public Health Heatmap

**File:** `viz_health.html`
**Datasets used:** `health-cases` (restricted — demo with `health_steward` role)
**Primary API calls:** `GET /datasets/health-cases/query`

### 11.1 Purpose

Show how health data looks when properly integrated — and demonstrate the access tier system by showing what happens when a lower-privileged role tries to access this view.

### 11.2 Layout

A grid heatmap. Rows = zones (5). Columns = weeks (12). Cell colour = case rate per 1000 population.

**Colour scale:**
- 0–2.0: `#EAF3DE` (green tint)
- 2.0–4.0: `#FAC775` (amber)
- 4.0–6.0: `#F09595` (red tint)
- 6.0+: `#E24B4A` (red)

### 11.3 Access gate demo

The page loads with role selector in the header:

```
Role: [ transit_staff ▼ ]
```

On load with `transit_staff`: show a 403 error state — grey cells with lock icons, and a message quoting the audit log denial reason. The audit log panel shows the blocked attempt.

On switch to `health_steward`: the grid populates with real data. This is the clearest single demonstration that access control is working.

### 11.4 Alert indicators

Cells where `alert: true` get a small triangle marker in the corner. Hovering shows the case count, rate, and the text "Steward alerted."

### 11.5 Cross-dataset context panel

Below the heatmap, a small panel shows — for the selected cell's zone — the water quality reading from `eng-pressure-zones` and the social vulnerability score from `social-demographics`. This is the cross-departmental value: the health analyst can see infrastructure and demographic context without leaving their view.

---

## 12. Visualisation: Transit Network Flow

**File:** `viz_transit.html`
**Datasets used:** `transit-gtfs-stops` (open), `plan-permits-2024` (internal)
**Primary API calls:** `GET /datasets/transit-gtfs-stops/query`, `POST /join`

### 12.1 Purpose

Show where ridership is high versus where housing growth is happening. Gaps — high permit activity, low transit service — are the actionable insight.

### 12.2 Network diagram

Render transit stops as nodes on a simplified Kitchener street grid (SVG). Node size = weekly boardings (scaled). Edges between stops on the same route, edge weight = shared route count.

Do not attempt to render real street geometry — use a schematic grid layout with approximate stop positions.

### 12.3 Overlay toggle

Toggle button: "Show housing growth overlay"

When active, fires `POST /join` between `transit-gtfs-stops` and `plan-permits-2024` on `civic_address` (zone-level approximation). Colours stop nodes by permit density in the surrounding zone:
- No nearby permits: default node colour
- Low permit density (<10 units in zone): light amber tint
- High permit density (>50 units in zone): red tint with a pulsing ring

### 12.4 Gap callout

Below the diagram, a computed callout:

> **Service gap detected:** Ward 6 has 184 infill units approved but the nearest iXpress stop averages only 620 weekly boardings. Regional average is 1,840.

This is computed from the join result — not hardcoded — so it reflects whatever is in the mock data.

### 12.5 Summary panel

| Metric | Value |
|---|---|
| Stops in high-growth zones | `<computed>` |
| Avg boardings, high-growth zones | `<computed>` |
| Avg boardings, low-growth zones | `<computed>` |
| Routes serving critical capacity zones | `<computed>` |

---

## 13. Visualisation: Social Services Demographic Breakdown

**File:** `viz_social.html`
**Datasets used:** `social-demographics` (internal), `climate-risk` (open)
**Primary API calls:** `GET /datasets/social-demographics/query`, `POST /join`

### 13.1 Purpose

Show population vulnerability by ward, and — via a cross-dataset join — which vulnerable populations overlap with high climate risk zones. This is the "climate adaptation + social services" use case from the problem statement.

### 13.2 Primary chart

Grouped bar chart. X axis: ward (all wards). Y axis: population count. Five stacked series per ward:
- Seniors 65+ (purple)
- Children 0–14 (teal)
- Low income households (amber)
- Residents with disability (coral)
- Newcomers (blue)

### 13.3 Climate risk overlay

Below the bar chart, a second row of bars (same x axis): one bar per ward, height = `composite_risk` score from `climate-risk`. Colour = risk tier (green / amber / red).

This is populated by a `POST /join` between `social-demographics` and `climate-risk` on `zone_id`.

### 13.4 Vulnerability × risk matrix

A 5×5 scatter plot where:
- X axis: composite climate risk score (0–100)
- Y axis: total households in need
- Each point is a ward
- Point size = total population
- Point colour = dominant vulnerable cohort

Wards in the top-right quadrant (high risk, high need) are highlighted and labelled — these are the priority adaptation investment zones.

### 13.5 Priority table

Below the scatter plot, a ranked list:

| Rank | Ward | Risk score | Households in need | Priority |
|---|---|---|---|---|
| 1 | Ward 6 | 74 | 412 | Critical |
| 2 | Ward 9 | 71 | 389 | Critical |

Computed from the join result, not hardcoded.

---

## 14. Visualisation: Climate Risk Overlay

**File:** `viz_climate.html`
**Datasets used:** `climate-risk` (open), `eng-pressure-zones` (internal), `social-demographics` (internal), `plan-permits-2024` (internal)
**Primary API calls:** Multiple — `GET /catalog`, then successive `POST /join` calls

### 14.1 Purpose

This is the most powerful visualisation — and the one only possible with integrated data. No single department has all four layers. Showing it being assembled live, one join at a time, demonstrates the value of the infrastructure most clearly.

### 14.2 Layer-by-layer assembly

The page builds the visualisation in four steps. Each step fires a new API call and animates the new layer onto the map.

**Step 1 — Base map (Flood risk)**
Load `climate-risk`. Colour zones by `flood_risk_score`. Grey out all zones without data.

**Step 2 — Add heat island**
Join `climate-risk` with itself is not needed — `heat_island_score` is already in the dataset. Render a second opacity layer showing heat island intensity. Zones with both high flood and high heat are visibly darker.

**Step 3 — Add vulnerable populations**
`POST /join` between `climate-risk` and `social-demographics` on `zone_id`. Show bubble overlays: bubble size = `households_in_need`. This layer answers: where do climate risks hit the most vulnerable people?

**Step 4 — Add housing growth pressure**
`POST /join` between the current result and `plan-permits-2024` on `zone_id`. Show permit density as a pattern overlay. This answers: where is development growing fastest in high-risk, high-vulnerability zones?

### 14.3 Layer controls

Checkboxes to toggle each layer independently. Each checkbox label shows the dataset it comes from and the department that owns it — making the cross-departmental nature explicit.

```
☑ Flood risk          (Engineering)
☑ Heat island         (Engineering)
☑ Vulnerable pop.     (Social Services)
☑ Housing growth      (Planning)
```

### 14.4 Composite priority score

For each zone, compute:

```
priority = (flood_risk × 0.3) + (heat_island × 0.2) + (vulnerable_pop_norm × 0.3) + (permit_growth_norm × 0.2)
```

Rank zones by priority and show a sidebar list. This is the answer to "where should the city spend its climate adaptation budget first?"

### 14.5 Data lineage trail

Below the map, a "How this was built" section showing the chain of joins that produced the view:

```
climate-risk (Engineering)
  → JOIN social-demographics on zone_id   [+Social Services]
  → JOIN plan-permits-2024 on zone_id     [+Planning]
  = composite priority map
```

This is the most important element for judges — it makes the infrastructure's value concrete in a single glance.

---

## 15. Shared Frontend Components

All visualisation pages share these components. Extract into a `shared.js` file.

### 15.1 API client

```javascript
const API_BASE = 'http://localhost:3000';
let currentRole = localStorage.getItem('demo_role') || 'eng_staff';

async function apiGet(path) {
  const res = await fetch(API_BASE + path, {
    headers: { 'Authorization': 'Bearer ' + currentRole }
  });
  if (!res.ok) {
    const err = await res.json();
    throw { status: res.status, ...err };
  }
  return res.json();
}

async function apiJoin(body) {
  const res = await fetch(API_BASE + '/join', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + currentRole,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const err = await res.json();
    throw { status: res.status, ...err };
  }
  return res.json();
}
```

### 15.2 Role switcher widget

A floating role switcher in the bottom-left corner of every page — critical for the access control demo.

```html
<div id="role-switcher">
  <label>Demo role:</label>
  <select onchange="setRole(this.value)">
    <option value="public">public</option>
    <option value="eng_staff" selected>eng_staff</option>
    <option value="plan_staff">plan_staff</option>
    <option value="health_staff">health_staff</option>
    <option value="transit_staff">transit_staff</option>
    <option value="health_steward">health_steward</option>
    <option value="cdo">cdo</option>
  </select>
</div>
```

Changing the role updates `localStorage` and re-fetches the current page's data.

### 15.3 Tier badge component

```javascript
function tierBadge(tier) {
  const config = {
    open:         { label: 'Open',         bg: '#EAF3DE', color: '#27500A' },
    internal:     { label: 'Internal',     bg: '#E6F1FB', color: '#0C447C' },
    restricted:   { label: 'Restricted',   bg: '#FAEEDA', color: '#633806' },
    confidential: { label: 'Confidential', bg: '#FCEBEB', color: '#791F1F' },
  };
  const c = config[tier] || config.open;
  return `<span style="background:${c.bg};color:${c.color};padding:2px 8px;border-radius:10px;font-size:11px;font-weight:500">${c.label}</span>`;
}
```

### 15.4 Quality score bar

```javascript
function qualityBar(score) {
  const pct = Math.round(score * 100);
  const color = score >= 0.95 ? '#639922' : score >= 0.85 ? '#BA7517' : '#A32D2D';
  return `
    <div style="display:flex;align-items:center;gap:8px;font-size:12px;">
      <div style="flex:1;height:6px;background:#eee;border-radius:3px;overflow:hidden;">
        <div style="width:${pct}%;height:100%;background:${color};border-radius:3px;"></div>
      </div>
      <span style="color:${color};font-weight:500;min-width:32px;">${pct}%</span>
    </div>`;
}
```

### 15.5 Error state component

Used when a 403 is returned — renders the access denied state with the denial reason.

```javascript
function renderAccessDenied(container, err) {
  container.innerHTML = `
    <div style="padding:24px;text-align:center;color:#A32D2D;">
      <div style="font-size:32px;margin-bottom:12px;">⊘</div>
      <div style="font-weight:500;margin-bottom:4px;">Access denied</div>
      <div style="font-size:13px;color:#555;">${err.denial_reason || 'Insufficient role permissions'}</div>
      <div style="font-size:11px;color:#888;margin-top:8px;">Logged to audit trail · Switch role to access this data</div>
    </div>`;
}
```

---

## 16. Server Startup and Project Structure

### 16.1 Project structure

```
/
├── server/
│   ├── index.js          (or main.py)
│   ├── routes/
│   │   ├── catalog.js
│   │   ├── datasets.js
│   │   ├── join.js
│   │   └── audit.js
│   ├── middleware/
│   │   └── access.js
│   └── lib/
│       ├── quality.js
│       └── audit.js
├── data/
│   ├── catalog.json
│   ├── eng_pressure_zones.json
│   ├── plan_permits_2024.json
│   ├── health_cases.json
│   ├── transit_gtfs_stops.json
│   ├── social_services_demographics.json
│   └── climate_risk.json
├── public/
│   ├── shared.js
│   ├── map.html
│   ├── catalog.html
│   ├── viz_planning.html
│   ├── viz_health.html
│   ├── viz_transit.html
│   ├── viz_social.html
│   └── viz_climate.html
└── README.md
```

### 16.2 Startup sequence

1. Load all JSON files from `/data` into memory
2. Run quality scoring across all datasets — cache results in `qualityCache`
3. Seed audit log with one pre-existing denied entry (see section 6.2)
4. Register routes
5. Serve `/public` as static files
6. Listen on port 3000

### 16.3 README requirements

The README must include:

- `npm install && npm start` (or `pip install -r requirements.txt && uvicorn main:app`)
- A table of all demo roles and what they can access
- The exact sequence of steps for the 3-minute demo
- `curl` examples for each of the four endpoints

---

*End of technical specification.*
