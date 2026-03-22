

## Final Build Plan: Municipal Data Infrastructure Hackathon
48 hours · 3–4 people · Problem Statement #2 (with elements from #1 and #3)
This plan follows the original spec document structure exactly. Everything from the spec is
kept. Additions are marked with  ADDITION.
- Objective (unchanged from spec)
Build a working prototype of a federated municipal data infrastructure — demonstrating how
data from separate city departments can be securely integrated, queried, and visualised without
requiring any department to replace their existing systems.
Anchor use case (unchanged): Show how integrating Planning's permit data with Engineering's
water capacity model would have prevented the 2025–2026 housing development freeze —
where infill permits (~67% of all residential activity) were invisible to the capacity model.
 CONTEXT UPDATE: The spec says "2024" but the actual crisis hit in January 2026. The
Region froze all new development approvals on Jan 6, 2026. Use the real timeline — it makes
the story more urgent ("this happened two months ago").
- What we are building
Same three-layer architecture from the spec, with targeted upgrades to each layer plus two new
layers.
Layer 1 — Data ingestion (simulated) — UNCHANGED
Same 4 mock JSON files from the spec. We start with mock data; swap in real ArcGIS data later if
time allows.
FileRepresents
eng_pressure_zones.json
Engineering: water pressure zone capacity by ward
plan_permits_2024.json
Planning: active residential permit register (infill/subdivision, units,
civic address)
health_cases.json
Public Health: aggregated case counts by zone and week (no PII)
transit_gtfs_stops.json
Transit: GTFS stop feed with ridership counts
Each file includes civic_address or parcel_id — the shared spatial key.
 ADDITION — 2 extra mock data files:

FileRepresentsWhy
zoning_districts.json
Planning: zoning classification per parcel
(R1/R2/R4/C1/etc), permitted uses, max
height, max density
Ties in Problem Statement
#1 (zoning data). Enables a
"which zones allow infill?"
query
scorecard_metrics.json
FCI: Vision One Million scorecard
indicators across 5 pillars (housing,
transportation, healthcare, employment,
placemaking)
Ties in Problem Statement
#3. Shows the platform can
auto-compute regional
readiness
 ADDITION — realistic coordinates:
All mock data should use real Kitchener-Waterloo lat/lng coordinates (roughly 43.45°N,
80.49°W). Even with fake values, real coordinates mean the map renders in the right place and
looks instantly credible to judges. Use ward names like "Ward 1 – Forest Heights", "Ward 6 –
Bridgeport", etc.
Layer 2 — Data layer (the core build) — SPEC + UPGRADES
The spec defines 4 endpoints. We keep all 4 and add 2 more.
2.1 GET /catalog — UNCHANGED
Returns list of all registered datasets with metadata. Supports ?q= keyword search and ?tier=
filter. Each entry includes: dataset_id, name, owner_dept, access_tier, spatial_key field
name, last_updated, quality_score, and available fields.
2.2 GET /datasets/:id/query — UNCHANGED
Returns filtered rows from a single dataset. Supports parcel_id=, bbox=, since=, fields=,
aggregate= (auto-strips PII when aggregating).
2.3 POST /join — UNCHANGED (priority endpoint)
Joins two datasets on shared spatial key. Enforces access tier rules. This is the hero endpoint.
2.4 Access control middleware — UNCHANGED
Role-check middleware, 4-tier model (Open/Internal/Restricted/Confidential), in-memory audit
log.
 2.5 GET /scorecard — NEW ENDPOINT
Auto-computes Vision One Million scorecard metrics by querying across all loaded datasets.
Returns JSON with 5 pillars, each containing 3–5 indicators with current value, target, and status

(on-track / at-risk / behind). Example:
Demo moment: "The scorecard that updates itself. Instead of six months of manual data
collection, one API call computes regional readiness in real time."
 2.6 POST /query/natural — NEW ENDPOINT (AI-powered)
Accepts a plain English question, uses Claude API (Sonnet) to translate it into the correct /join
or /datasets/:id/query call, executes it, and returns results with the generated query shown.
## Example:
This is the technical complexity differentiator. It demonstrates that the data layer isn't just for
developers — any city planner can ask questions in English. Use a simple system prompt that
describes available datasets and their fields; Claude does the rest.
Implementation: ~50 lines of code. POST body → Claude API with dataset schema in system
prompt → Claude returns JSON query plan → server executes against the data layer → return
results. Keep it simple.
Layer 3 — Visualisation — SPEC + MAJOR UPGRADES
The spec defines 2 views. We keep both and add 2 more — for a total of 4 views in a tabbed
dashboard.
 UPGRADE: Frontend tech stack
json
## {
## "housing":{
## "score":42,
## "indicators":[
{"name":"Permits issued (YTD)","value":2847,"target":7000,"status":"be
{"name":"Infill share","value":0.67,"target":0.50,"status":"on-track"
{"name":"Water capacity headroom","value":-0.067,"target":0.20,"status"
## ]
## },
## "transportation":{ ... },
## "healthcare":{ ... },
## "employment":{ ... },
## "placemaking":{ ... }
## }
Input:  "Which wards have approved infill permits but are above 90% water
capacity?"
Output: { sql_equivalent: "...", results: [...], explanation: "..." }

Replace the spec's "Vanilla JS or React — single HTML file" with:
ComponentSpec saidWe're usingWhy
FrameworkVanilla JS /
## React
## Next.js 15 +
TypeScript
Fast scaffold, file-based routing, built-in API routes
## UI
components
## —shadcn/ui +
Tailwind CSS
Professional look in minutes, not hours
Charts—Tremor (by
## Vercel)
Beautiful KPI cards, bar charts, area charts,
sparklines out of the box
MapLeaflet.jsMapLibre GL JS
+ deck.gl
3D extruded polygons, hexagonal bins, animated
arcs, dark base map — 10x more visually impressive
than Leaflet
Data flow
diagram
—React FlowAnimated node-edge diagram showing department
connections
 DESIGN DIRECTION: "Dark command center"
Dark background (near-black
## #0a0a0f
## )
3 accent colors: cyan (
## #00D4FF
), amber (
## #FFB800
), red (
## #FF3366
## )
Monospace font for data values (JetBrains Mono), clean sans-serif for labels (Geist)
Subtle grid pattern background texture
All maps on dark base tiles (MapLibre Dark Matter style — free, no API key)
This looks like a NASA mission control / Bloomberg terminal hybrid. Judges remember this
aesthetic.
View 1: Ward Capacity Map — UPGRADED FROM SPEC
Spec version: Leaflet map, wards coloured red/amber/green, blue dots for permits, side panel
with before/after.
Our version (same story, better execution):
MapLibre GL JS dark base map centered on Kitchener-Waterloo
deck.gl PolygonLayer for wards — extruded in 3D based on capacity utilization (taller =
more stressed)
Color gradient: green → amber → red → pulsing red for critical (>90%)
deck.gl ScatterplotLayer for individual permits — blue dots sized by unit count

deck.gl HexagonLayer toggle — aggregate permits into 3D hexagonal bins showing
density hotspots
Side panel with Tremor KPI cards: total permits, total units, capacity %, water deficit (L/s)
Before/After toggle (the hero interaction from the spec): flip between "subdivision-only
view" (what Engineering saw) and "integrated view" (with infill). The ward colors shift
dramatically. Two wards jump from green to deep red.
FlyTo animation: clicking a ward zooms the camera smoothly into it
Demo moment is identical to spec — but now the visual impact is 10x stronger because of 3D
extrusion and color transitions.
View 2: Data Catalog Browser — UPGRADED FROM SPEC
Spec version: Search interface, dataset cards with tier badges, "Join with..." button, audit log
panel.
Our version (same functionality, polished UI):
shadcn/ui search bar + filter chips for access tier
Dataset cards using shadcn Card component — tier shown as colored badge
## (green/blue/orange/red)
Quality score shown as mini progress bar on each card
"Join with..." button opens a modal: select second dataset, pick join key, preview result in a
table
Live audit log panel (right sidebar): WebSocket-fed, new entries slide in with animation,
blocked requests glow red, approved requests glow green
 "Ask a question" input at the top — uses the POST /query/natural endpoint. Type
English, get results. Show the translated query below the results for transparency.
 View 3: Data Mesh Topology — NEW
A React Flow diagram showing departments as nodes and data connections as edges.
4 department nodes (Engineering, Planning, Public Health, Transit) + 1 central "Federation
Layer" node
Each department node shows: name, dataset count, access tier badge, last updated
Edges are animated (particles flowing along them) when queries are executing
Click an edge to see what join keys connect those two departments
When someone fires POST /join, the relevant edge lights up and a particle animation
shows data flowing through the federation layer
Below the diagram: a live counter "Cross-department queries executed: 47" (incrementing)

Why this matters: Judges who don't understand GraphQL or REST will instantly understand
this visual. It shows "data flowing between departments" in a way that's self-explanatory. This is
your "architecture diagram that's alive."
 View 4: Vision One Million Scorecard — NEW
A dashboard view showing regional readiness across the 5 pillars.
5 Tremor AreaChart components — one per pillar (housing, transportation, healthcare,
employment, placemaking)
Each pillar shows a gauge/radial chart (0–100 score) + 3–5 indicator rows with current vs.
target
Color-coded status: green (on-track), amber (at-risk), red (behind)
The housing pillar prominently shows the water capacity crisis indicator in red
Bottom section: "Data sources" — shows which departments feed each indicator, with React
Flow mini-diagram
Demo moment: "This is the Vision One Million Scorecard. Right now it takes six months to
update manually. Our platform computes it from live department data in one API call. Housing
score: 42 out of 100. And here's why — water capacity headroom is negative 6.7%. The platform
already knows."
- Explicitly out of scope — UNCHANGED + ADDITIONS
Everything from the spec stays out of scope. Adding:
Out of scopeWhy
Everything in the original spec's out-of-scope
table
Same reasons
 Real Claude API key management
Hardcode a key in .env for demo; never expose to
frontend
 Real ArcGIS API integrationMock data first; swap later. Architecture supports it
 Mobile responsive designDemo is on a laptop. Desktop-only is fine
 User authentication UIMock tokens in header, no login screen

- Division of labour — UPDATED FOR 4 PEOPLE
TrackWhoDeliverable
Data layer APIDev 1
## (backend)
FastAPI or Express server with 6 endpoints + middleware + mock
data files (6 JSON)
Map + 3D vizDev 2
## (frontend-viz)
Ward capacity map with MapLibre + deck.gl, before/after toggle,
HexagonLayer
## Dashboard +
catalog
## Dev 3
## (frontend-ui)
Next.js app shell, catalog browser, scorecard view, React Flow
topology, Tremor charts
AI + architecture
+ pitch
## Dev 4
## (generalist)
Natural language endpoint (Claude integration), architecture
diagrams, governance doc, slide deck, demo script, rehearsal
Key rule: Dev 2 and Dev 3 work on separate pages/components that get composed into one
Next.js app. They should agree on the design tokens (colors, fonts, spacing) in Hour 1 and not
touch each other's files.
- Build timeline — UPDATED FOR 48 HOURS
The spec had a 20-hour plan. We have 48 hours. This means more polish time (the thing that
actually wins hackathons).

PhaseHoursMilestoneOwner
## Phase 0 —
## Setup
0–2Repo init, Next.js scaffold, mock data files created, API
skeleton running, design tokens agreed (colors/fonts)
## All
Phase 1 — API
core
## 2–10
GET /catalog, GET /datasets/:id/query, access
middleware, audit log all working. Mock data loaded.
## Dev 1
## Phase 2 — The
join
## 10–16
POST /join working end-to-end with access control. Audit
log writing correctly. Blocked request visible.
## Dev 1
## Phase 2b —
Scorecard + NL
## 16–22
GET /scorecard computing from mock data. POST
/query/natural calling Claude and returning results.
## Dev 1 + Dev
## 4
Phase 3 — Map2–18MapLibre dark map rendering. deck.gl ward polygons +
permit dots. Before/after toggle working. 3D extrusion.
HexagonLayer.
## Dev 2
## Phase 4 —
Dashboard UI
2–18Next.js app shell with 4 tabs. Catalog browser with search +
join modal. React Flow topology diagram. Tremor scorecard
view.
## Dev 3
## Phase 5 —
## Integration
18–28All UI connected to live API. Demo flow runs end-to-end.
Animated edges in React Flow responding to real queries. NL
query input wired up.
## All
## Phase 6 —
## Polish
28–36Dark theme tuning, animations, loading states, transition
smoothness, number counters, audit log animation.
## FEATURE FREEZE AT HOUR 36.
## Dev 2 +
## Dev 3
## Phase 7 — Pitch
prep
36–42Architecture deck complete (8 slides). Governance doc
exported. Demo script written. 5+ rehearsals. Backup video
recorded.
## Dev 4 (all
support)
## Phase 8 —
## Buffer
42–48Bug fixes only. Final rehearsal. Rest. Present.All
Critical rule from the spec (still applies): Freeze feature development at Hour 36 regardless of
state. A rough demo with a clear story beats a polished demo that isn't finished.
- Demo script — UPGRADED FROM SPEC'S 3 BEATS TO 4 BEATS (4 minutes)
Beat 1 — The problem (50 seconds)
Open the ward capacity map. All zones look safe — green and amber. This is what

Engineering saw.
"In January 2026 — two months ago — the Region of Waterloo froze all housing
development. 70,000 planned homes. 25,000 jobs. Stopped."
"Why? Engineering's water capacity model couldn't see Planning's building permits. 67%
of new homes were infill — completely invisible to the model."
Point to the map: "Every ward looks fine. But watch what happens when we connect the
data."
Beat 2 — The fix (80 seconds)
Click the "Integrated View" toggle. The map transforms — two wards jump from green to
deep red. 3D columns shoot up. Blue permit dots flood in.
"Ward 6: 97% capacity. Ward 9: 93%. One toggle. One API call. Two departments
connected."
Switch to the catalog browser. Search "water capacity". Two datasets appear with a shared
join key badge.
Click "Join with Planning permits". Show the result table.
Switch to the React Flow topology. Animated particles flow along the Engineering ↔
Planning edge.
"Every query is logged." Show the audit log — green for approved, then trigger a blocked
request — it flashes red.
"Privacy isn't an afterthought. It's enforced at the data layer."
Beat 3 — The intelligence (50 seconds)  NEW BEAT
Switch to the natural language input. Type: "Which wards have approved infill permits but
are above 90% water capacity?"
Results appear. The generated query is shown below.
"Any city planner can ask this question in English. No SQL. No API docs. The platform
translates it."
Switch to the scorecard view. Housing score: 42. Water capacity indicator pulsing red.
"This is the Vision One Million Scorecard. It currently takes six months to update manually.
Our platform computes it in real time from department data."
Beat 4 — The vision (40 seconds)
"This is one integration between two departments. The same infrastructure enables public
health surveillance, climate risk overlays, transit planning with housing data."
Show the topology diagram — all 4 departments connected, all edges animated.
"Right now, city departments are blind to each other. We gave them sight."

"This is what water infrastructure looked like before municipalities built pipes —
fragmented, manual, invisible. We're proposing the same investment, for data."
- Tech stack — UPDATED FROM SPEC
ComponentSpec saidFinal choice
API serverNode.js + Express or Python +
FastAPI
Python + FastAPI (faster to prototype, native
async, auto-generates OpenAPI docs for free)
Data storage
JSON files in /data, loaded
into memory
Same — JSON files loaded at startup into Python
dicts
Access controlSimple middleware checking
Authorization header
Same — FastAPI dependency that checks X-
Role header against tier map
Audit log
In-memory array, GET
## /audit
Same + WebSocket broadcast for live UI updates
 NL query—
Claude API (Sonnet) via anthropic Python
SDK. ~50 lines.
MapLeaflet.js + hand-drawn ward
GeoJSON
MapLibre GL JS (free, no API key, dark base map)
+ deck.gl (3D layers)
Catalog browserVanilla JS or React — single
HTML file
Next.js 15 + shadcn/ui + Tremor
##  Topology
diagram
—React Flow with custom nodes + animated edges
## Architecture
diagrams
Export from sessionExcalidraw or Figma — export as SVG for slides
Slide deckGoogle Slides / PowerPoint — 8
slides max
## Same
- Judging criteria alignment — UPDATED FROM SPEC
The spec's 5 requirements are all still addressed in the same places, plus the additions strengthen
each one.

RequirementSpec's answer Additions strengthen it
Unified data
architecture
POST /join + catalog + arch
diagram
NL query endpoint shows the architecture is
accessible to non-technical users. Scorecard
endpoint shows it computes real policy metrics.
## Privacy &
confidentiality by
design
Access middleware, 4-tier
model, audit log, blocked
request in demo
Live animated audit log makes it viscerally
visible. Blocked requests glow red in real-time.
## Interoperability
standards
Shared spatial key, GTFS,
field naming conventions
Zoning data file adds land-use interop (Problem
Statement #1). Shared key works across 6
datasets, not just 4.
Data governance
framework
Governance doc, Data
Council, steward roles, PIA,
retention table
Unchanged — this is a document deliverable, not
code. Dev 4 writes it.
## Practical
implementation
pathway
Phase diagram, out-of-scope
list, incremental tech stack
Scorecard auto-computation demonstrates
immediate ROI for politicians ("you get a live
dashboard from day one").
- Files to produce — UPDATED FROM SPEC
File / artifactOwnerDone by
api/main.py (FastAPI server)
Dev 1Hour 22
data/eng_pressure_zones.json
Dev 1Hour 2
data/plan_permits_2024.json
Dev 1Hour 2
data/health_cases.json
Dev 1Hour 2
data/transit_gtfs_stops.json
Dev 1Hour 2
 data/zoning_districts.json
Dev 1Hour 2
 data/scorecard_metrics.json
Dev 4Hour 4
Ward capacity map (Next.js page)Dev 2Hour 18
Catalog browser (Next.js page)Dev 3Hour 18
 Topology diagram (Next.js page)Dev 3Hour 18

File / artifactOwnerDone by
 Scorecard view (Next.js page)Dev 3Hour 18
Architecture slide deck (8 slides)Dev 4Hour 38
Governance framework docDev 4Hour 36
README with demo instructionsDev 1Hour 40
- Risk register — SPEC + ADDITIONS
RiskLikelihoodMitigation
POST /join takes longer than
expected
MediumBuild GET /catalog and /query first — enough for catalog
demo alone
Ward map GeoJSON hard to
find
MediumUse simplified hand-drawn GeoJSON polygons with real
Kitchener coordinates — looks fine on dark base map
Team runs out of time on
polish
HighFeature freeze at Hour 36 regardless. Rough demo + clear
story > polished unfinished demo
Judges ask about MFIPPA
compliance
HighGovernance doc + access middleware + audit log — point
to all three
Judges ask "why not
Snowflake/Databricks"
Medium"Those are storage engines. We solved who-owns-what
and who-can-access-what — the governance layer that
sits above any storage."
 Claude API rate limit / key
issues
MediumPre-test the key. Have 2–3 hardcoded NL query examples
that return cached results as fallback. Never demo live AI
without a safety net.
 deck.gl 3D rendering
issues
LowFall back to flat MapLibre polygons (still looks great on
dark base map). deck.gl HexagonLayer is the most reliable
3D layer — start with that.
 React Flow is unfamiliarLowIt's ~30 lines for a basic animated graph. Start with the
React Flow quickstart template and customize nodes.
 WiFi fails during demoMediumRun everything locally (localhost API + localhost Next.js).
Pre-record a backup video of the full demo.

Summary: What changed from the spec
CategoryOriginal specWhat we added
Mock data4 JSON files6 JSON files (+zoning, +scorecard metrics)
API endpoints4 endpoints6 endpoints (+scorecard auto-compute, +natural language
query)
Frontend views2 views (map +
catalog)
4 views (+React Flow topology, +scorecard dashboard)
Map techLeaflet.js (2D, basic)MapLibre GL JS + deck.gl (3D, dark theme, hexagonal
bins, animated)
UI frameworkVanilla JS / single
## HTML
Next.js + shadcn/ui + Tremor (professional dashboard
feel)
AI integrationNoneClaude Sonnet for natural language → query translation
Audit logStatic GET endpointWebSocket-fed live animated panel
## Problem
statements
#2 only#2 + elements from #1 (zoning data) + #3 (scorecard)
Timeline20 hours48 hours (more polish, more rehearsal, more buffer)
DesignNo specified
aesthetic
Dark command center — dark base, neon accents, 3D,
monospace data
Everything from the original spec is preserved. The additions are targeted at three goals: visual
wow factor (deck.gl + dark theme + React Flow animations), technical impressiveness (Claude
NL queries + real-time WebSocket audit log + cross-problem-statement integration), and demo
storytelling (the 4th beat with scorecard + NL query gives you two "aha moments" instead of
one).