import Link from "next/link";
import { asRecords, fetchJson, QueryResult } from "../../lib/api";

const edges = [
  ["KW-STOP-001", "KW-STOP-002"],
  ["KW-STOP-001", "KW-STOP-003"],
  ["KW-STOP-003", "KW-STOP-002"],
];

const positions: Record<string, { x: number; y: number; label: string }> = {
  "KW-STOP-001": { x: 60, y: 100, label: "A" },
  "KW-STOP-002": { x: 250, y: 100, label: "D" },
  "KW-STOP-003": { x: 150, y: 130, label: "C" },
};

export default async function TransitPage() {
  const stops = asRecords(
    await fetchJson<QueryResult>("/datasets/transit-stops/query", "public"),
  );

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
            {edges.map(([from, to]) => (
              <line
                key={`${from}-${to}`}
                x1={positions[from].x}
                y1={positions[from].y}
                x2={positions[to].x}
                y2={positions[to].y}
                stroke="#5f90d8"
                strokeWidth="4"
              />
            ))}
            {Object.entries(positions).map(([id, point]) => (
              <g key={id}>
                <circle cx={point.x} cy={point.y} r="16" fill="#e8f0ff" stroke="#2e6ec7" strokeWidth="2" />
                <text x={point.x} y={point.y + 4} textAnchor="middle" fontSize="12" fill="#2158a6">
                  {point.label}
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
