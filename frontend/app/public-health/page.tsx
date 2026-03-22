import Link from "next/link";
import { asRecords, fetchJson, QueryResult } from "../../lib/api";

export default async function PublicHealthPage() {
  const records = asRecords(await fetchJson<QueryResult>("/datasets/health-cases/query", "health_steward"));
  const wards = [...new Set(records.map((record) => String(record.ward)))];
  const caseTypes = [...new Set(records.map((record) => String(record.case_type)))];
  const alertCount = records.filter((record) => Boolean(record.alert)).length;
  const avgRate = (
    records.reduce((sum, record) => sum + Number(record.rate_per_1000 ?? 0), 0) /
    Math.max(records.length, 1)
  ).toFixed(1);

  function lookup(ward: string, caseType: string) {
    return records.find((record) => String(record.ward) === ward && String(record.case_type) === caseType);
  }

  return (
    <main className="sectionShell">
      <header className="sectionHeader">
        <div>
          <p className="sectionKicker">Public health</p>
          <h1>Case surveillance matrix</h1>
          <p className="sectionLead">
            Rates are displayed in a ward-by-case-type matrix with alert status preserved in the
            adjacent surveillance table.
          </p>
        </div>
        <Link className="backLink" href="/">
          Back to overview
        </Link>
      </header>

      <section className="summaryGrid">
        <article className="summaryCard">
          <span>Records</span>
          <strong>{records.length}</strong>
        </article>
        <article className="summaryCard">
          <span>Alerts</span>
          <strong>{alertCount}</strong>
        </article>
        <article className="summaryCard">
          <span>Average rate / 1000</span>
          <strong>{avgRate}</strong>
        </article>
      </section>

      <section className="twoUp">
        <article className="card">
          <div className="panelHeading">
            <h2>Ward matrix</h2>
            <span className="panelMeta">rate per 1,000</span>
          </div>
          <div className="tableWrap">
            <table className="dataTable heatTable">
              <thead>
                <tr>
                  <th>Ward</th>
                  {caseTypes.map((caseType) => (
                    <th key={caseType}>{caseType}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {wards.map((ward) => (
                  <tr key={ward}>
                    <td>{ward}</td>
                    {caseTypes.map((caseType) => {
                      const item = lookup(ward, caseType);
                      const level = Number(item?.rate_per_1000 ?? 0);
                      const className = level >= 7 ? "heatHigh" : level >= 4 ? "heatMid" : "heatLow";
                      return (
                        <td key={`${ward}-${caseType}`}>
                          <span className={`heatPill ${className}`}>{item ? level.toFixed(1) : "—"}</span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="legendRow">
            <span><i className="legendSwatch safe" /> low</span>
            <span><i className="legendSwatch warning" /> elevated</span>
            <span><i className="legendSwatch critical" /> alert threshold</span>
          </div>
        </article>

        <article className="card">
          <div className="panelHeading">
            <h2>Surveillance table</h2>
            <span className="panelMeta">latest records</span>
          </div>
          <div className="tableWrap">
            <table className="dataTable">
              <thead>
                <tr>
                  <th>Ward</th>
                  <th>Type</th>
                  <th>Week</th>
                  <th>Cases</th>
                  <th>Rate</th>
                  <th>Flag</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={String(record.record_id)}>
                    <td>{String(record.ward)}</td>
                    <td>{String(record.case_type)}</td>
                    <td>{String(record.week_start)}</td>
                    <td>{String(record.case_count)}</td>
                    <td>{Number(record.rate_per_1000 ?? 0).toFixed(1)}</td>
                    <td>{record.alert ? <span className="statusBadge critical">alert</span> : <span className="statusBadge safe">stable</span>}</td>
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
