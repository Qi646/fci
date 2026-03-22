import Link from "next/link";
import { asRecords, fetchJson, QueryResult } from "../../lib/api";

export default async function TransitPage() {
  const stops = asRecords(
    await fetchJson<QueryResult>("/datasets/transit-stops/query", "public"),
  );
  const orderedStops = [...stops].sort(
    (a, b) => Number(a.lng ?? 0) - Number(b.lng ?? 0),
  );
  type PositionedStop = Record<string, unknown> & { x: number; y: number };
  const lats = orderedStops.map((stop) => Number(stop.lat ?? 0));
  const lngs = orderedStops.map((stop) => Number(stop.lng ?? 0));
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const positionedStops: PositionedStop[] = orderedStops.map((stop) => {
    const x = 44 + ((Number(stop.lng ?? 0) - minLng) / Math.max(maxLng - minLng, 0.001)) * 232;
    const y = 144 - ((Number(stop.lat ?? 0) - minLat) / Math.max(maxLat - minLat, 0.001)) * 86;
    return { ...stop, x, y };
  });
  const edges = positionedStops.slice(1).map((stop, index) => {
    const previous = positionedStops[index];
    const weight = (Number(stop.weekly_boardings ?? 0) + Number(previous.weekly_boardings ?? 0)) / 2200;
    return { from: previous, to: stop, weight };
  });

  return (
    <main className="sectionShell">
      <header className="sectionHeader">
        <div>
          <p className="sectionKicker">Transit</p>
          <h1>Flow / network</h1>
          <p className="sectionLead">
            Transit should be viewed as movement between nodes. Ridership intensity and corridor
            connectivity matter more than isolated stop records.
          </p>
        </div>
        <Link className="backLink" href="/">
          Back to overview
        </Link>
      </header>

      <section className="twoUp">
        <article className="card">
          <h2>Network view</h2>
          <svg viewBox="0 0 320 180" className="chartSvg" aria-label="Transit network">
            {edges.map((edge) => (
              <line
                key={`${String(edge.from.stop_id)}-${String(edge.to.stop_id)}`}
                x1={edge.from.x}
                y1={edge.from.y}
                x2={edge.to.x}
                y2={edge.to.y}
                stroke="#5f90d8"
                strokeWidth={Math.max(2, edge.weight)}
              />
            ))}
            {positionedStops.map((stop, index) => (
              <g key={String(stop.stop_id)}>
                <circle
                  cx={stop.x}
                  cy={stop.y}
                  r={10 + Number(stop.weekly_boardings ?? 0) / 800}
                  fill="#e8f0ff"
                  stroke="#2e6ec7"
                  strokeWidth="2"
                />
                <text x={stop.x} y={stop.y + 4} textAnchor="middle" fontSize="12" fill="#2158a6">
                  {String.fromCharCode(65 + index)}
                </text>
              </g>
            ))}
          </svg>
        </article>

        <article className="card">
          <h2>Ridership</h2>
          <div className="stackList">
            {stops.map((stop) => (
              <div key={String(stop.stop_id)} className="stackRow">
                <div>
                  <strong>{String(stop.stop_name)}</strong>
                  <p>{Array.isArray(stop.routes) ? stop.routes.join(", ") : ""}</p>
                </div>
                <div className="stackMeta">
                  <span>{String(stop.ward)}</span>
                  <strong>{String(stop.weekly_boardings)}</strong>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}
