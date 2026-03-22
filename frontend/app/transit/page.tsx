import Link from "next/link";
import { asRecords, fetchJson, QueryResult } from "../../lib/api";

function scalePoint(value: number, min: number, max: number, start: number, size: number) {
  return start + ((value - min) / Math.max(max - min, 0.001)) * size;
}

export default async function TransitPage() {
  const stops = asRecords(await fetchJson<QueryResult>("/datasets/transit-stops/query", "public"));
  const sortedByBoardings = [...stops].sort((a, b) => Number(b.weekly_boardings ?? 0) - Number(a.weekly_boardings ?? 0));
  const lats = stops.map((stop) => Number(stop.lat ?? 0));
  const lngs = stops.map((stop) => Number(stop.lng ?? 0));
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const totalBoardings = sortedByBoardings.reduce((sum, stop) => sum + Number(stop.weekly_boardings ?? 0), 0);

  return (
    <main className="sectionShell">
      <header className="sectionHeader">
        <div>
          <p className="sectionKicker">Transit</p>
          <h1>Stop network / ridership</h1>
          <p className="sectionLead">
            Stops are plotted in geographic order with node area linked to weekly boardings. The
            companion table keeps the operational numbers explicit.
          </p>
        </div>
        <Link className="backLink" href="/">
          Back to overview
        </Link>
      </header>

      <section className="summaryGrid">
        <article className="summaryCard">
          <span>Stops tracked</span>
          <strong>{stops.length}</strong>
        </article>
        <article className="summaryCard">
          <span>Total weekly boardings</span>
          <strong>{totalBoardings}</strong>
        </article>
        <article className="summaryCard">
          <span>Busiest stop</span>
          <strong>{String(sortedByBoardings[0]?.stop_name ?? "n/a")}</strong>
        </article>
      </section>

      <section className="twoUp">
        <article className="card">
          <div className="panelHeading">
            <h2>Spatial corridor plot</h2>
            <span className="panelMeta">lat/lng projected</span>
          </div>
          <svg viewBox="0 0 320 220" className="chartSvg" aria-label="Transit spatial plot">
            <rect x="36" y="20" width="252" height="162" fill="#fafafa" stroke="#d7d7d2" />
            {[0, 1, 2, 3].map((idx) => {
              const y = 20 + idx * 54;
              return <line key={`gy-${idx}`} x1="36" y1={y} x2="288" y2={y} className="gridLine" />;
            })}
            {[0, 1, 2, 3, 4].map((idx) => {
              const x = 36 + idx * 63;
              return <line key={`gx-${idx}`} x1={x} y1="20" x2={x} y2="182" className="gridLine" />;
            })}
            {sortedByBoardings.map((stop, index) => {
              const x = scalePoint(Number(stop.lng ?? 0), minLng, maxLng, 36, 252);
              const y = 182 - scalePoint(Number(stop.lat ?? 0), minLat, maxLat, 0, 162);
              const next = sortedByBoardings[index + 1];
              const nextX = next ? scalePoint(Number(next.lng ?? 0), minLng, maxLng, 36, 252) : null;
              const nextY = next ? 182 - scalePoint(Number(next.lat ?? 0), minLat, maxLat, 0, 162) : null;
              return (
                <g key={String(stop.stop_id)}>
                  {next ? <line x1={x} y1={y} x2={nextX ?? x} y2={nextY ?? y} className="routeLine" /> : null}
                  <circle cx={x} cy={y} r={4 + Number(stop.weekly_boardings ?? 0) / 900} className="routeNode" />
                  <text x={x} y={y - 10} textAnchor="middle" className="svgLabel">
                    {String(stop.stop_id).slice(-3)}
                  </text>
                </g>
              );
            })}
          </svg>
          <p className="annotation">Node area = boardings. Sequence follows ridership rank, not route timetable.</p>
        </article>

        <article className="card">
          <div className="panelHeading">
            <h2>Ridership table</h2>
            <span className="panelMeta">descending boardings</span>
          </div>
          <div className="tableWrap">
            <table className="dataTable">
              <thead>
                <tr>
                  <th>Stop</th>
                  <th>Ward</th>
                  <th>Routes</th>
                  <th>Weekly boardings</th>
                </tr>
              </thead>
              <tbody>
                {sortedByBoardings.map((stop) => (
                  <tr key={String(stop.stop_id)}>
                    <td>{String(stop.stop_name)}</td>
                    <td>{String(stop.ward)}</td>
                    <td>{Array.isArray(stop.routes) ? stop.routes.join(", ") : ""}</td>
                    <td>{String(stop.weekly_boardings)}</td>
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
