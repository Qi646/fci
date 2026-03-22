# Municipal Data Infrastructure
## Hackathon Build Specification
**12–24 hour scope · Region of Waterloo · Problem Statement #2**

---

## 1. Objective

Build a working prototype of a federated municipal data infrastructure — demonstrating how data from separate city departments can be securely integrated, queried, and visualised without requiring any department to replace their existing systems.

> **Anchor use case:** Show how integrating Planning's permit data with Engineering's water capacity model would have prevented the 2024 housing development pause — where infill permits (50% of all residential activity) were invisible to the capacity model.

---

## 2. What We Are Building

Three layers, each scoped to the minimum needed for a convincing demo.

### Layer 1 — Data ingestion (simulated)

In production this layer contains adapters for each department's source system. For the hackathon, replace it with static mock data files representing realistic departmental exports.

| File | Represents |
|---|---|
| `eng_pressure_zones.json` | Engineering: water pressure zone capacity by ward |
| `plan_permits_2024.json` | Planning: active residential permit register — type (infill / subdivision), units, civic address |
| `health_cases.json` | Public Health: aggregated case counts by zone and week (no PII) |
| `transit_gtfs_stops.json` | Transit: GTFS stop feed with ridership counts |

Each file must include a `civic_address` or `parcel_id` field — the shared spatial key that makes cross-departmental joins possible.

---

### Layer 2 — Data layer (the core build)

This is the novel contribution and the focus of the hackathon. Build a lightweight Node.js or Python API server with four endpoints.

#### 2.1 `GET /catalog`

Returns all registered datasets with metadata. Supports:
- `?q=` — keyword search across name, description, fields
- `?dept=` — filter by owning department
- `?tier=` — filter to caller's accessible tiers

Each entry returns: `dataset_id`, `name`, `owner_dept`, `access_tier`, `spatial_key` field name, `last_updated`, `quality_score`, available fields list.

> **Demo moment:** A judge searches "water capacity" and sees both the Engineering pressure zone dataset and the Planning permit register appear — with a note that they share the `civic_address` join key.

#### 2.2 `GET /datasets/:id/query`

Returns filtered rows from a single dataset. Supports:
- `parcel_id=` — filter to a specific parcel
- `bbox=` — bounding box (lat/lng min/max)
- `since=` — timestamp filter
- `fields=` — projection (only return named fields)
- `aggregate=` — count / sum / avg — automatically strips PII fields from response

#### 2.3 `POST /join` ← priority endpoint

Joins two datasets on their shared spatial key. Request body:

```json
{
  "left_dataset": "eng-pressure-zones",
  "right_dataset": "plan-permits-2024",
  "join_key": "civic_address",
  "left_fields": ["zone", "capacity_pct"],
  "right_fields": ["permit_type", "units"]
}
```

The server enforces access tier rules: if either dataset is restricted and the requester's role is not permitted, the join is blocked and logged.

> **The fix:** This is the single API call that would have caught the capacity problem 6 months earlier. Two lines of config. No department rewrites anything.

#### 2.4 Access control middleware

Every request passes through a role-check middleware before data is returned. Roles are passed via a mock `Authorization` header — no real auth implementation needed for the demo. The middleware enforces the four-tier model and writes every request (including denials) to an in-memory audit log.

| Tier | Access rule | Demo role |
|---|---|---|
| Open | No auth required | `public` |
| Internal | Any valid dept. token | `eng_staff`, `plan_staff` |
| Restricted | Named steward approval flag in token | `health_steward` |
| Confidential | Blocked at API — no programmatic access | none |

---

### Layer 3 — Visualisation (two views)

Build two views that consume the data layer API. Keep them simple — the API is the story, the UI is the evidence.

#### 3.1 Ward capacity map

A map of Kitchener wards coloured by water pressure zone utilisation (red / amber / green). Blue dot markers show infill permit locations pulled from the `/join` endpoint. Side panel shows the before/after — what the model showed with subdivision-only data vs. with integrated infill data.

#### 3.2 Data catalog browser

A search interface over `GET /catalog`. Shows dataset cards with tier badges and quality scores. A "Join with..." button fires `POST /join` and displays the result inline. An audit log panel updates in real time as queries are made, including showing a blocked access attempt in red.

---

## 3. Explicitly Out of Scope

The following are real production requirements, deliberately excluded to protect the timeline.

| Out of scope | Why / what we say instead |
|---|---|
| Real OAuth2 / identity provider | Mock tokens in `Authorization` header are sufficient for demo |
| Live database (Postgres / etc.) | JSON files loaded into memory at startup — same API contract |
| Real department system connectors | Ingestion layer is simulated; architecture doc covers production approach |
| Data retention enforcement | Retention policy is documented in the governance framework, not implemented |
| Privacy impact assessments | PIA template is a document — not enforced in code |
| Real-time streaming (`/stream` endpoint) | Describe it in the API spec; do not build it |
| Full governance org and Data Council | Covered in presentation — not a software deliverable |
| Visualisations beyond 2 views | Depth beats breadth for a hackathon demo |

---

## 4. Division of Labour

Recommended split for a team of 2–4 working in parallel.

| Track | Who | Deliverable |
|---|---|---|
| Data layer API | 1 backend dev | Node.js or Python server — 3 endpoints + middleware + mock data files |
| Visualisation | 1 frontend dev | Ward map + catalog browser consuming the live API |
| Architecture + governance | 1 generalist | Slide deck, architecture diagrams, governance doc |
| Integration + polish | Everyone (final 3 hrs) | Connect UI to live API, run demo end-to-end, rehearse pitch |

---

## 5. Build Timeline

Designed for a 20-hour window with a 4-hour buffer.

| Phase | Hours | Milestone |
|---|---|---|
| Phase 0 — Setup | 0–1 h | Repo initialised, mock data files created, API skeleton running on localhost |
| Phase 1 — Data layer core | 1–6 h | `GET /catalog` and `GET /datasets/:id/query` returning correct data; access middleware blocking wrong roles |
| Phase 2 — The join endpoint | 6–10 h | `POST /join` working end-to-end with access control; audit log writing; blocked request visible |
| Phase 3 — Visualisation | 6–14 h | Ward map rendering from live API; catalog browser showing datasets and firing joins |
| Phase 4 — Integration | 14–17 h | UI connected to API; demo flow rehearsed; no hardcoded data in the UI |
| Phase 5 — Pitch prep | 17–20 h | Architecture deck complete; governance doc exported; demo script written; 3-minute run-through done |

Phases 2 and 3 run in parallel. Freeze feature development at hour 17 regardless of state.

---

## 6. Demo Script (3 minutes)

Every sentence should be pointing at something live on screen.

### Beat 1 — The problem (45 seconds)

- Open the ward map. All zones look safe — green and amber. *"This is what Engineering saw in 2024."*
- *"The Region's water capacity model only counted subdivisions. But 50% of residential permits that year were infill — and infill was completely invisible to the model."*
- Point to the map: *"Two wards are actually at 93% and 97% capacity. A development pause was the result."*

### Beat 2 — The fix (90 seconds)

- Switch to the catalog browser. Search "water capacity". Two datasets appear with a note that they share a join key.
- *"Our infrastructure makes this connection explicit. Here's what one API call looks like."*
- Click "Join with Planning permits." The map updates — blue dots appear in Ward 6 and Ward 9. Capacity bars jump to 97% and 93%.
- *"That's POST /join. Two lines of config. No one rewrote a database. Engineering's system didn't change. Planning's system didn't change."*
- Show the audit log panel. The join request appeared, was approved, and was logged. Trigger a blocked request — it appears in red.
- *"Every access — including denials — is logged. Privacy is enforced at the data layer, not by asking departments to trust each other."*

### Beat 3 — The vision (45 seconds)

- *"This is one integration between two departments. The same infrastructure enables public health surveillance with water quality data, climate risk overlays across six departments, transit planning with housing growth data."*
- Show the architecture diagram: the four-layer stack with governance running alongside it.
- *"This is what water infrastructure looked like before municipalities built it — fragmented, manual, inconsistent. We're proposing the same investment, for data."*

---

## 7. Recommended Tech Stack

Chosen for speed of development and zero infrastructure setup time.

| Component | Tool |
|---|---|
| API server | Node.js + Express **or** Python + FastAPI — pick what the team knows |
| Data storage | JSON files in `/data`, loaded into memory at startup |
| Access control | Middleware function checking `Authorization` header against a role map |
| Audit log | In-memory array, exposed via `GET /audit` — no persistence needed |
| Ward map | Leaflet.js with GeoJSON ward polygons, or the SVG map from this session |
| Catalog browser | Vanilla JS or React — a single HTML file is fine |
| Architecture diagrams | Already built — export from this planning session |
| Slide deck | Google Slides or PowerPoint — 8 slides max |

---

## 8. Judging Criteria Alignment

The problem statement has five explicit requirements.

| Requirement | Where addressed in the build |
|---|---|
| Unified data architecture | `POST /join` + catalog schema + architecture diagram |
| Privacy and confidentiality by design | Access control middleware, four-tier model, audit log, blocked request in demo |
| Interoperability standards | Shared spatial key (`civic_address` / `parcel_id`), GTFS for transit, consistent field naming in catalog |
| Data governance framework | Governance doc: Data Council, steward roles, PIA triggers, conflict escalation, retention table |
| Practical implementation pathway | Phase diagram (pilot → 5 depts → full mesh), explicit out-of-scope list, incremental tech stack |

---

## 9. Files to Produce

| File / artifact | Owner | Done by |
|---|---|---|
| `index.js` or `main.py` (API server) | Backend dev | Hour 10 |
| `data/eng_pressure_zones.json` | Backend dev | Hour 1 |
| `data/plan_permits_2024.json` | Backend dev | Hour 1 |
| `data/health_cases.json` | Backend dev | Hour 2 |
| `data/transit_gtfs_stops.json` | Backend dev | Hour 2 |
| `map.html` (ward map UI) | Frontend dev | Hour 14 |
| `catalog.html` (catalog browser UI) | Frontend dev | Hour 14 |
| Architecture slide deck (8 slides) | Generalist | Hour 16 |
| Governance framework doc | Generalist | Hour 14 |
| `README.md` with demo instructions | Backend dev | Hour 18 |

---

## 10. Risk Register

| Risk | Likelihood | Mitigation |
|---|---|---|
| `POST /join` takes longer than expected | Medium | `GET /catalog` and `/query` alone are enough to demo the catalog concept if `/join` isn't ready |
| Ward GeoJSON for Kitchener wards is hard to source | Medium | Fall back to the SVG ward map from this planning session — it renders the same story |
| Team runs out of time on polish | High | Freeze feature development at hour 17 regardless — a rough demo with a clear story beats a polished demo that isn't finished |
| Judges ask about MFIPPA / privacy compliance | High | Governance doc + access control middleware + audit log are the answer — point to all three |
| Judges ask "why not just use Snowflake / Databricks?" | Medium | Those are data warehouses, not governance frameworks. We solved the who-owns-what and who-can-access-what problem, not the storage problem. |

---

*End of specification · Good luck.*
