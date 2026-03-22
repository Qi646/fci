import Link from "next/link";
import { asRecords, fetchJson, QueryResult } from "../../lib/api";

function tone(capacity: number) {
  if (capacity >= 90) return "critical";
  if (capacity >= 75) return "warning";
  return "safe";
}

function toneColor(capacity: number) {
  if (capacity >= 90) return "#b42318";
  if (capacity >= 75) return "#b88217";
  return "#2f6b52";
}

function scalePoint(
  lat: number,
  lng: number,
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number },
) {
  const x = 52 + ((lng - bounds.minLng) / Math.max(bounds.maxLng - bounds.minLng, 0.001)) * 228;
  const y = 176 - ((lat - bounds.minLat) / Math.max(bounds.maxLat - bounds.minLat, 0.001)) * 122;
  return { x, y };
}

function axisTicks(min: number, max: number, count: number) {
  return Array.from({ length: count }, (_, index) => {
    const ratio = index / Math.max(count - 1, 1);
    return min + (max - min) * ratio;
  });
}

export default async function EngineeringPage() {
  const zones = asRecords(await fetchJson<QueryResult>("/datasets/eng-pressure-zones/query"));
  const permits = asRecords(await fetchJson<QueryResult>("/datasets/plan-permits-2024/query"));

  const hotspots = zones
    .map((zone) => ({
      zoneName: String(zone.zone_name),
      ward: Array.isArray(zone.wards) ? zone.wards.join(", ") : "",
      capacity: Number(zone.capacity_pct ?? 0),
      permits: permits.filter((permit) => permit.zone_id === zone.zone_id).length,
      zoneId: String(zone.zone_id),
    }))
    .sort((a, b) => b.capacity - a.capacity);

  const lats = [...zones.map((zone) => Number(zone.centroid_lat ?? 0)), ...permits.map((permit) => Number(permit.lat ?? 0))];
  const lngs = [...zones.map((zone) => Number(zone.centroid_lng ?? 0)), ...permits.map((permit) => Number(permit.lng ?? 0))];
  const bounds = {
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
    minLng: Math.min(...lngs),
    maxLng: Math.max(...lngs),
  };
  const criticalZones = hotspots.filter((zone) => zone.capacity >= 90);
  const permitLoadInCritical = criticalZones.reduce((sum, zone) => sum + zone.permits, 0);
  const avgCapacity = Math.round(hotspots.reduce((sum, zone) => sum + zone.capacity, 0) / Math.max(hotspots.length, 1));

  return (
    <main className="sectionShell">
      <header className="sectionHeader">
        <div>
          <p className="sectionKicker">Engineering</p>
          <h1>Water capacity geospatial view</h1>
          <p className="sectionLead">
            Zone centroids and permit coordinates are plotted in actual latitude and longitude
            space. Bubble area tracks utilization. Blue dots are permit footprints.
          </p>
        </div>
        <Link className="backLink" href="/">
          Back to overview
        </Link>
      </header>

      <section className="summaryGrid">
        <article className="summaryCard">
          <span>Critical zones</span>
          <strong>{criticalZones.length}</strong>
        </article>
        <article className="summaryCard">
          <span>Permits in critical zones</span>
          <strong>{permitLoadInCritical}</strong>
        </article>
        <article className="summaryCard">
          <span>Average utilization</span>
          <strong>{avgCapacity}%</strong>
        </article>
      </section>

      <section className="twoUp">
        <article className="card">
          <div className="panelHeading">
            <h2>Coordinate plot</h2>
            <span className="panelMeta">Kitchener-Waterloo extent</span>
          </div>
          <svg viewBox="0 0 320 220" className="chartSvg" aria-label="Engineering geospatial plot">
            <rect x="36" y="20" width="252" height="162" fill="#fafafa" stroke="#d7d7d2" />
            {axisTicks(bounds.minLng, bounds.maxLng, 5).map((tick, index) => {
              const x = 52 + (index / 4) * 228;
              return (
                <g key={`lng-${tick}`}>
                  <line x1={x} y1={20} x2={x} y2={182} className="gridLine" />
                  <text x={x} y={198} textAnchor="middle" className="axisText">
                    {tick.toFixed(3)}
                  </text>
                </g>
              );
            })}
            {axisTicks(bounds.minLat, bounds.maxLat, 4).map((tick, index) => {
              const y = 182 - (index / 3) * 162;
              return (
                <g key={`lat-${tick}`}>
                  <line x1={36} y1={y} x2={288} y2={y} className="gridLine" />
                  <text x={30} y={y + 4} textAnchor="end" className="axisText">
                    {tick.toFixed(3)}
                  </text>
                </g>
              );
            })}
            {zones.map((zone) => {
              const point = scalePoint(Number(zone.centroid_lat ?? 0), Number(zone.centroid_lng ?? 0), bounds);
              const capacity = Number(zone.capacity_pct ?? 0);
              return (
                <g key={String(zone.zone_id)}>
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={14 + (capacity / 100) * 16}
                    fill={toneColor(capacity)}
                    fillOpacity="0.12"
                    stroke={toneColor(capacity)}
                    strokeWidth="1.8"
                  />
                  <text x={point.x} y={point.y + 3} textAnchor="middle" className="svgLabel">
                    {String(zone.zone_id).slice(-2)}
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
                  r={2.4 + Number(permit.units ?? 0) / 20}
                  fill="#1d4ed8"
                />
              );
            })}
            <text x="281" y="34" className="axisText">N</text>
            <line x1="281" y1="42" x2="281" y2="58" stroke="#111111" strokeWidth="1.4" />
          </svg>
          <div className="legendRow">
            <span><i className="legendSwatch safe" /> under 75%</span>
            <span><i className="legendSwatch warning" /> 75 to 89%</span>
            <span><i className="legendSwatch critical" /> 90%+</span>
            <span><i className="legendDot" /> permit units</span>
          </div>
        </article>

        <article className="card">
          <div className="panelHeading">
            <h2>Zone operating table</h2>
            <span className="panelMeta">sorted by utilization</span>
          </div>
          <div className="tableWrap">
            <table className="dataTable">
              <thead>
                <tr>
                  <th>Zone</th>
                  <th>Wards</th>
                  <th>Permits</th>
                  <th>Capacity</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {hotspots.map((zone) => (
                  <tr key={zone.zoneId}>
                    <td>{zone.zoneName}</td>
                    <td>{zone.ward}</td>
                    <td>{zone.permits}</td>
                    <td>{zone.capacity}%</td>
                    <td><span className={`statusBadge ${tone(zone.capacity)}`}>{tone(zone.capacity)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </main>
  );
}
