import Link from "next/link";
import { asRecords, fetchJson, QueryResult } from "../../lib/api";

export default async function SocialServicesPage() {
  const records = asRecords(
    await fetchJson<QueryResult>("/datasets/social-services-demographics/query"),
  );
  const sortedRecords = [...records].sort(
    (a, b) => Number(b.population ?? 0) - Number(a.population ?? 0),
  );
  const maxPopulation = Math.max(...sortedRecords.map((record) => Number(record.population ?? 0)), 1);

  return (
    <main className="sectionShell">
      <header className="sectionHeader">
        <div>
          <p className="sectionKicker">Social services</p>
          <h1>Demographic breakdown</h1>
          <p className="sectionLead">
            Social need is clearer when cohorts sit side by side. This page prioritizes population,
            need, and active case load by cohort.
          </p>
        </div>
        <Link className="backLink" href="/">
          Back to overview
        </Link>
      </header>

      <section className="twoUp">
        <article className="card">
          <h2>Cohort view</h2>
          <div className="barChart">
            {sortedRecords.map((record) => {
              const population = Number(record.population ?? 0);
              return (
                <div key={`${record.ward}-${record.cohort}`} className="barGroup">
                  <div
                    className="barFill"
                    style={{ height: `${(population / maxPopulation) * 100}%` }}
                  />
                  <span>{String(record.cohort).replaceAll("_", " ")}</span>
                </div>
              );
            })}
          </div>
        </article>

        <article className="card">
          <h2>Need summary</h2>
          <div className="stackList">
            {sortedRecords.map((record) => (
              <div key={`${record.ward}-${record.cohort}`} className="stackRow">
                <div>
                  <strong>{String(record.cohort).replaceAll("_", " ")}</strong>
                  <p>{String(record.ward)}</p>
                </div>
                <div className="stackMeta">
                  <span>{String(record.households_in_need)} households</span>
                  <strong>{String(record.active_cases)} cases</strong>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}
