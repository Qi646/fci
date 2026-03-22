import Link from "next/link";
import { asRecords, fetchJson, QueryResult } from "../../lib/api";

export default async function PublicHealthPage() {
  const cases = asRecords(
    await fetchJson<QueryResult>("/datasets/health-cases/query", "health_steward"),
  );

  return (
    <main className="sectionShell">
      <header className="sectionHeader">
        <div>
          <p className="sectionKicker">Public health</p>
          <h1>Heatmap + alert</h1>
          <p className="sectionLead">
            Health data should read as pattern detection, not row inspection. Case intensity and
            anomaly flags sit together here.
          </p>
        </div>
        <Link className="backLink" href="/">
          Back to overview
        </Link>
      </header>

      <section className="twoUp">
        <article className="card">
          <h2>Case intensity grid</h2>
          <div className="heatGrid">
            {cases.map((record) => {
              const level = Number(record.rate_per_1000 ?? 0);
              const tone =
                level >= 7 ? "heatHigh" : level >= 4 ? "heatMid" : "heatLow";
              return (
                <div key={String(record.record_id)} className={`heatCell ${tone}`}>
                  <span>{String(record.ward).replace("Ward ", "W")}</span>
                </div>
              );
            })}
          </div>
        </article>

        <article className="card">
          <h2>Alerts</h2>
          <div className="stackList">
            {cases.map((record) => (
              <div key={String(record.record_id)} className="stackRow">
                <div>
                  <strong>{String(record.ward)}</strong>
                  <p>{String(record.case_type)} week of {String(record.week_start)}</p>
                </div>
                <div className="stackMeta">
                  <span>{String(record.case_count)} cases</span>
                  {record.alert ? <strong className="alertBadge">Alert</strong> : <span>Stable</span>}
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}
