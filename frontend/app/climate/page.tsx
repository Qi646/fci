import Link from "next/link";
import { asRecords, fetchJson, QueryResult } from "../../lib/api";

export default async function ClimatePage() {
  const overlays = asRecords(
    await fetchJson<QueryResult>("/datasets/climate-risk-overlays/query", "public"),
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
          <h2>Overlay sketch</h2>
          <div className="overlayFrame">
            <div className="overlayCircle flood">Flood</div>
            <div className="overlayCircle risk">Risk</div>
            <div className="overlayCircle heat">Heat</div>
          </div>
        </article>

        <article className="card">
          <h2>Priority areas</h2>
          <div className="stackList">
            {overlays.map((overlay) => (
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
