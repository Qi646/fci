import Link from "next/link";
import { asRecords, fetchJson, QueryResult } from "../../lib/api";

function tone(capacity: number) {
  if (capacity >= 90) return "critical";
  if (capacity >= 75) return "warning";
  return "safe";
}

function toneColor(capacity: number) {
  if (capacity >= 90) return "#dc6a6a";
  if (capacity >= 75) return "#efc168";
  return "#8dd0af";
}

function scalePoint(
  lat: number,
  lng: number,
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number },
) {
  const x = 36 + ((lng - bounds.minLng) / Math.max(bounds.maxLng - bounds.minLng, 0.001)) * 248;
  const y = 176 - ((lat - bounds.minLat) / Math.max(bounds.maxLat - bounds.minLat, 0.001)) * 128;
  return { x, y };
}

export default async function EngineeringPage() {
  const zones = asRecords(
    await fetchJson<QueryResult>("/datasets/eng-pressure-zones/query"),
  );
  const permits = asRecords(
    await fetchJson<QueryResult>("/datasets/plan-permits-2024/query"),
  );

  const hotspots = zones
    .map((zone) => ({
      zoneName: String(zone.zone_name),
      ward: Array.isArray(zone.wards) ? zone.wards.join(", ") : "",
      capacity: Number(zone.capacity_pct ?? 0),
      permits: permits.filter((permit) => permit.zone_id === zone.zone_id).length,
    }))
    .sort((a, b) => b.capacity - a.capacity);

  const lats = [
    ...zones.map((zone) => Number(zone.centroid_lat ?? 0)),
    ...permits.map((permit) => Number(permit.lat ?? 0)),
  ];
  const lngs = [
    ...zones.map((zone) => Number(zone.centroid_lng ?? 0)),
    ...permits.map((permit) => Number(permit.lng ?? 0)),
  ];
  const bounds = {
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
    minLng: Math.min(...lngs),
    maxLng: Math.max(...lngs),
  };

  return (
    <main className="sectionShell">
      <header className="sectionHeader">
        <div>
          <p className="sectionKicker">Engineering</p>
          <h1>Spatial map</h1>
          <p className="sectionLead">
            Capacity stress appears spatially first. This view pairs zone health with permit
            concentration so overloaded areas stop looking benign.
          </p>
        </div>
        <Link className="backLink" href="/">
          Back to overview
        </Link>
      </header>

      <section className="twoUp">
        <article className="card">
          <h2>Capacity map</h2>
          <svg viewBox="0 0 320 220" className="chartSvg mapSvg" aria-label="Engineering capacity map">
            <rect x="0" y="0" width="320" height="220" rx="16" fill="#dfeaf6" />
            {zones.map((zone) => {
              const lat = Number(zone.centroid_lat ?? 0);
              const lng = Number(zone.centroid_lng ?? 0);
              const point = scalePoint(lat, lng, bounds);
              const capacity = Number(zone.capacity_pct ?? 0);
              const radius = 20 + (capacity / 100) * 22;
              return (
                <g key={String(zone.zone_id)}>
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={radius}
                    fill={toneColor(capacity)}
                    fillOpacity="0.58"
                    stroke={toneColor(capacity)}
                    strokeWidth="2"
                  />
                  <text x={point.x} y={point.y + 4} textAnchor="middle" className="svgLabel">
                    {String(zone.zone_id).slice(-3)}
                  </text>
                </g>
              );
            })}
            {permits.map((permit) => {
              const point = scalePoint(Number(permit.lat ?? 0), Number(permit.lng ?? 0), bounds);
              return (
                <circle
                  key={String(permit.permit_id)}
                  cx={point.x}
                  cy={point.y}
                  r={5 + Number(permit.units ?? 0) / 12}
                  fill="#2e6ec7"
                  stroke="#ffffff"
                  strokeWidth="2"
                />
              );
            })}
          </svg>
          <div className="metricRow">
            {hotspots.slice(0, 3).map((zone) => (
              <div key={zone.zoneName} className={`metricPill ${tone(zone.capacity)}`}>
                {zone.zoneName}: {zone.capacity}%
              </div>
            ))}
          </div>
        </article>

        <article className="card">
          <h2>Pressure hotspots</h2>
          <div className="stackList">
            {hotspots.map((zone) => (
              <div key={zone.zoneName} className="stackRow">
                <div>
                  <strong>{zone.zoneName}</strong>
                  <p>{zone.ward}</p>
                </div>
                <div className="stackMeta">
                  <span>{zone.permits} permits</span>
                  <strong>{zone.capacity}%</strong>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}
