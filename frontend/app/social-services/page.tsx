import Link from "next/link";
import DataControls from "../../components/DataControls";
import { accessProfiles, asRecords, fetchJson, QueryResult } from "../../lib/api";

export default async function SocialServicesPage() {
  const records = asRecords(
    await fetchJson<QueryResult>(
      "/datasets/social-services-demographics/query",
      accessProfiles.socialServices,
    ),
  );
  const sortedRecords = [...records].sort((a, b) => Number(b.population ?? 0) - Number(a.population ?? 0));
  const maxPopulation = Math.max(...sortedRecords.map((record) => Number(record.population ?? 0)), 1);
  const totalPopulation = sortedRecords.reduce((sum, record) => sum + Number(record.population ?? 0), 0);
  const totalNeed = sortedRecords.reduce((sum, record) => sum + Number(record.households_in_need ?? 0), 0);
  const totalCases = sortedRecords.reduce((sum, record) => sum + Number(record.active_cases ?? 0), 0);

  return (
    <main className="sectionShell">
      <header className="sectionHeader">
        <div>
          <p className="sectionKicker">Social services</p>
          <h1>Cohort demand</h1>
          <p className="sectionLead">
            Population is shown as a restrained horizontal bar field, with need and active cases in
            the corresponding table.
          </p>
        </div>
        <Link className="backLink" href="/">
          Back to overview
        </Link>
      </header>

      <section className="summaryGrid">
        <article className="summaryCard">
          <span>Population tracked</span>
          <strong>{totalPopulation}</strong>
        </article>
        <article className="summaryCard">
          <span>Households in need</span>
          <strong>{totalNeed}</strong>
        </article>
        <article className="summaryCard">
          <span>Active cases</span>
          <strong>{totalCases}</strong>
        </article>
      </section>

      <DataControls
        summary="This page defaults to the confidential social-services dataset because the user task here is internal service demand planning."
        datasets={[
          {
            name: "Social Services Demographics",
            defaultState: "On, approved departments only",
            detail: "Confidential data for approved service programs. This should not appear in public-facing views.",
          },
        ]}
      />

      <section className="twoUp">
        <article className="card">
          <div className="panelHeading">
            <h2>Population by cohort</h2>
            <span className="panelMeta">horizontal index</span>
          </div>
          <div className="barList">
            {sortedRecords.map((record) => {
              const population = Number(record.population ?? 0);
              return (
                <div key={`${record.ward}-${record.cohort}`} className="barRow">
                  <span className="barLabel">{String(record.cohort).replaceAll("_", " ")}</span>
                  <div className="barTrack">
                    <div className="barValue" style={{ width: `${(population / maxPopulation) * 100}%` }} />
                  </div>
                  <span className="barMetric">{population}</span>
                </div>
              );
            })}
          </div>
        </article>

        <article className="card">
          <div className="panelHeading">
            <h2>Demand table</h2>
            <span className="panelMeta">need vs cases</span>
          </div>
          <div className="tableWrap">
            <table className="dataTable">
              <thead>
                <tr>
                  <th>Cohort</th>
                  <th>Ward</th>
                  <th>Population</th>
                  <th>Need</th>
                  <th>Active cases</th>
                </tr>
              </thead>
              <tbody>
                {sortedRecords.map((record) => (
                  <tr key={`${record.ward}-${record.cohort}`}>
                    <td>{String(record.cohort).replaceAll("_", " ")}</td>
                    <td>{String(record.ward)}</td>
                    <td>{String(record.population)}</td>
                    <td>{String(record.households_in_need)}</td>
                    <td>{String(record.active_cases)}</td>
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
