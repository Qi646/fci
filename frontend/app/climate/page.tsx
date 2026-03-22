import Link from "next/link";
import { asRecords, fetchJson, QueryResult } from "../../lib/api";

export default async function ClimatePage() {
  const overlays = asRecords(await fetchJson<QueryResult>("/datasets/climate-risk-overlays/query", "public"));
  const sortedOverlays = [...overlays].sort((a, b) => Number(b.priority_score ?? 0) - Number(a.priority_score ?? 0));
  const avgPriority = Math.round(
    sortedOverlays.reduce((sum, overlay) => sum + Number(overlay.priority_score ?? 0), 0) /
      Math.max(sortedOverlays.length, 1),
  );

  return (
    <main className="sectionShell">
      <header className="sectionHeader">
        <div>
          <p className="sectionKicker">Climate / environment</p>
          <h1>Risk priority matrix</h1>
          <p className="sectionLead">
            Flood risk is plotted on the x-axis, heat on the y-axis, and air quality is encoded in
            marker area. The table keeps the exact values accessible.
          </p>
        </div>
        <Link className="backLink" href="/">
          Back to overview
        </Link>
      </header>

      <section className="summaryGrid">
        <article className="summaryCard">
          <span>Priority zones</span>
          <strong>{sortedOverlays.length}</strong>
        </article>
        <article className="summaryCard">
          <span>Average priority</span>
          <strong>{avgPriority}</strong>
        </article>
        <article className="summaryCard">
          <span>Top risk ward</span>
          <strong>{String(sortedOverlays[0]?.ward ?? "n/a")}</strong>
        </article>
      </section>

      <section className="twoUp">
        <article className="card">
          <div className="panelHeading">
            <h2>Priority scatter</h2>
            <span className="panelMeta">flood vs heat</span>
          </div>
          <svg viewBox="0 0 320 220" className="chartSvg" aria-label="Climate risk matrix">
            <rect x="44" y="20" width="244" height="148" fill="#fafafa" stroke="#d7d7d2" />
            {[0, 20, 40, 60, 80].map((tick) => {
              const x = 44 + (tick / 80) * 244;
              const y = 168 - (tick / 80) * 148;
              return (
                <g key={tick}>
                  <line x1={x} y1="20" x2={x} y2="168" className="gridLine" />
                  <line x1="44" y1={y} x2="288" y2={y} className="gridLine" />
                  <text x={x} y="186" textAnchor="middle" className="axisText">{tick}</text>
                  <text x="34" y={y + 4} textAnchor="end" className="axisText">{tick}</text>
                </g>
              );
            })}
            {sortedOverlays.map((overlay) => {
              const flood = Number(overlay.flood_risk ?? 0);
              const heat = Number(overlay.heat_risk ?? 0);
              const air = Number(overlay.air_quality_risk ?? 0);
              const x = 44 + (flood / 80) * 244;
              const y = 168 - (heat / 80) * 148;
              return (
                <g key={String(overlay.overlay_id)}>
                  <circle cx={x} cy={y} r={6 + air / 12} fill="rgba(180, 35, 24, 0.14)" stroke="#b42318" />
                  <text x={x} y={y + 3} textAnchor="middle" className="svgLabel">
                    {String(overlay.ward).replace("Ward ", "W")}
                  </text>
                </g>
              );
            })}
            <text x="166" y="206" textAnchor="middle" className="axisText">flood risk</text>
            <text x="12" y="96" transform="rotate(-90 12 96)" textAnchor="middle" className="axisText">heat risk</text>
          </svg>
          <p className="annotation">Marker area = air-quality risk.</p>
        </article>

        <article className="card">
          <div className="panelHeading">
            <h2>Risk table</h2>
            <span className="panelMeta">ward scores</span>
          </div>
          <div className="tableWrap">
            <table className="dataTable">
              <thead>
                <tr>
                  <th>Ward</th>
                  <th>Flood</th>
                  <th>Heat</th>
                  <th>Air</th>
                  <th>Priority</th>
                </tr>
              </thead>
              <tbody>
                {sortedOverlays.map((overlay) => (
                  <tr key={String(overlay.overlay_id)}>
                    <td>{String(overlay.ward)}</td>
                    <td>{String(overlay.flood_risk)}</td>
                    <td>{String(overlay.heat_risk)}</td>
                    <td>{String(overlay.air_quality_risk)}</td>
                    <td>{String(overlay.priority_score)}</td>
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
