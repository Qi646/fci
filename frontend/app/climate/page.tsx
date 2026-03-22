import Link from "next/link";
import { asRecords, fetchJson, QueryResult } from "../../lib/api";

export default async function ClimatePage() {
  const overlays = asRecords(
    await fetchJson<QueryResult>("/datasets/climate-risk-overlays/query", "public"),
  );
  const sortedOverlays = [...overlays].sort(
    (a, b) => Number(b.priority_score ?? 0) - Number(a.priority_score ?? 0),
  );

  return (
    <main className="sectionShell">
      <header className="sectionHeader">
        <div>
          <p className="sectionKicker">Climate / environment</p>
          <h1>Multi-layer overlay</h1>
          <p className="sectionLead">
            Climate risk becomes useful when layers intersect. Flood, heat, and air-quality
            pressures need a combined priority view rather than separate maps.
          </p>
        </div>
        <Link className="backLink" href="/">
          Back to overview
        </Link>
      </header>

      <section className="twoUp">
        <article className="card">
          <h2>Risk overlap</h2>
          <svg viewBox="0 0 320 220" className="chartSvg" aria-label="Climate risk overlay">
            <rect x="0" y="0" width="320" height="220" rx="16" fill="#dfeaf6" />
            {sortedOverlays.map((overlay, index) => {
              const flood = Number(overlay.flood_risk ?? 0);
              const heat = Number(overlay.heat_risk ?? 0);
              const air = Number(overlay.air_quality_risk ?? 0);
              const x = 78 + index * 82;
              const y = 110 - index * 6;
              return (
                <g key={String(overlay.overlay_id)}>
                  <circle cx={x - 18} cy={y} r={flood / 2.8} fill="rgba(94, 152, 230, 0.34)" />
                  <circle cx={x + 24} cy={y - 6} r={heat / 3} fill="rgba(242, 190, 88, 0.34)" />
                  <circle cx={x + 4} cy={y + 18} r={air / 3.2} fill="rgba(231, 116, 116, 0.38)" />
                  <text x={x + 4} y={y + 4} textAnchor="middle" className="svgLabel">
                    {String(overlay.ward).replace("Ward ", "W")}
                  </text>
                </g>
              );
            })}
          </svg>
        </article>

        <article className="card">
          <h2>Priority areas</h2>
          <div className="stackList">
            {sortedOverlays.map((overlay) => (
              <div key={String(overlay.overlay_id)} className="stackRow">
                <div>
                  <strong>{String(overlay.ward)}</strong>
                  <p>{String(overlay.recommended_action)}</p>
                </div>
                <div className="stackMeta">
                  <span>Priority</span>
                  <strong>{String(overlay.priority_score)}</strong>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}
