# Municipal Data Infrastructure

Federated municipal data infrastructure for the Region of Waterloo — demonstrating secure integration, querying, and visualization of data across city departments.

## The Problem

In 2024, the Region paused housing development because their water capacity model only counted subdivisions. But **50% of residential permits were infill** — completely invisible to the model. This infrastructure makes that connection explicit.

## Quick Start

```bash
# Install dependencies
npm install

# Start the API server
npm start

# Open in browser
open map.html          # Ward capacity map
open catalog.html      # Data catalog browser
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Visualisation Layer                        │
│  ┌──────────────────┐    ┌──────────────────────────────┐   │
│  │  Ward Capacity   │    │    Data Catalog Browser       │   │
│  │  Map (map.html)  │    │    (catalog.html)             │   │
│  └────────┬─────────┘    └──────────────┬─────────────────┘   │
└───────────┼──────────────────────────────┼───────────────────┘
            │                              │
┌───────────▼──────────────────────────────▼───────────────────┐
│                     Data Layer API                            │
│  GET /catalog           GET /datasets/:id/query              │
│  POST /join             GET /audit                            │
└───────────┬─────────────────────────────────────────────────┘
            │
┌───────────▼─────────────────────────────────────────────────┐
│                    Data Ingestion Layer                      │
│  eng_pressure_zones.json    plan_permits_2024.json           │
│  health_cases.json          transit_gtfs_stops.json          │
└─────────────────────────────────────────────────────────────┘
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /catalog` | List all datasets with metadata. Supports `?q=`, `?dept=`, `?tier=` |
| `GET /datasets/:id/query` | Query dataset records. Supports `parcel_id`, `bbox`, `since`, `fields`, `aggregate` |
| `POST /join` | Join two datasets on a shared key |
| `GET /audit` | View access audit log |

### Example: Join Engineering and Planning Data

```bash
curl -X POST http://localhost:3000/join \
  -H "Authorization: Bearer eng_staff" \
  -H "Content-Type: application/json" \
  -d '{
    "left_dataset": "eng-pressure-zones",
    "right_dataset": "plan-permits-2024",
    "join_key": "civic_address",
    "left_fields": ["zone", "capacity_pct"],
    "right_fields": ["permit_type", "units"]
  }'
```

## Access Control

Four-tier model enforced at the data layer:

| Tier | Access | Demo Role |
|------|--------|-----------|
| Open | No auth required | `public` |
| Internal | Any dept. token | `eng_staff`, `plan_staff` |
| Restricted | Steward approval | `health_steward` |
| Confidential | Blocked at API | (none) |

Use the role selector in the UI or set the `Authorization: Bearer <role>` header.

## Demo Script

### Beat 1 — The Problem (45s)
1. Open `map.html`
2. Show wards 6 and 9 appear safe (green/amber)
3. *"This is what Engineering saw in 2024"*
4. Click "Show Infill Permits" — wards 6 and 9 turn red
5. *"50% of residential permits were infill — invisible to the model"*

### Beat 2 — The Fix (90s)
1. Open `catalog.html`
2. Search "water capacity" — both datasets appear with join hint
3. Click "Join with Planning Permits"
4. Show the joined results with capacity + permit data
5. Show the audit log showing the join was logged
6. Click "Demo Blocked Request" — shows restricted data blocked

### Beat 3 — The Vision (45s)
1. Explain this is one integration between two departments
2. Same infrastructure enables health + water, transit + housing, climate risk overlays
3. *"This is what water infrastructure looked like before municipalities built it — fragmented, manual, inconsistent. We're proposing the same investment, for data."*

## Files

```
├── server.js              # API server (Express)
├── package.json
├── data/
│   ├── eng_pressure_zones.json
│   ├── plan_permits_2024.json
│   ├── health_cases.json
│   └── transit_gtfs_stops.json
├── map.html               # Ward capacity map
├── catalog.html           # Data catalog browser
└── README.md
```

## Running the Demo

```bash
# Terminal 1: Start API
npm start

# Terminal 2: Or use any static file server for HTML
npx serve .
```

Open `http://localhost:3000` for the API, `http://localhost:3000/map.html` for the map, `http://localhost:3000/catalog.html` for the catalog.

## Technology

- **API**: Node.js + Express
- **Data**: JSON files loaded into memory
- **Access Control**: Middleware enforcing 4-tier model
- **Audit**: In-memory log exposed via `/audit`
- **Map**: Leaflet.js with Carto dark tiles
- **Catalog**: Vanilla JS
