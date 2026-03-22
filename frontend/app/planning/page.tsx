import Link from "next/link";
import { asRecords, fetchJson, QueryResult } from "../../lib/api";

function buildSeries(records: Array<Record<string, unknown>>) {
  const monthly = new Map<string, number>();
  for (const record of records) {
    const date = String(record.issued_date ?? "");
    const month = date.slice(0, 7);
    monthly.set(month, (monthly.get(month) ?? 0) + Number(record.units ?? 0));
  }
  return [...monthly.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function polyline(values: number[], width: number, height: number) {
  const max = Math.max(...values, 1);
  return values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * width;
      const y = height - (value / max) * height;
      return `${x},${y}`;
    })
    .join(" ");
}

export default async function PlanningPage() {
  const permits = asRecords(
    await fetchJson<QueryResult>("/datasets/plan-permits-2024/query"),
  );
  const series = buildSeries(permits);
  const monthlyUnits = series.map(([, value]) => value);
  const monthlyPermits = series.map(([month]) =>
    permits.filter((record) => String(record.issued_date ?? "").startsWith(month)).length,
  );
  const infillShare =
    permits.filter((record) => record.permit_type === "infill").length /
    Math.max(permits.length, 1);

  const unitPoints = polyline(monthlyUnits, 260, 90)
    .split(" ")
    .map((point) => {
      const [x, y] = point.split(",");
      return `${Number(x) + 20},${Number(y) + 20}`;
    })
    .join(" ");
  const permitPoints = polyline(monthlyPermits, 260, 90)
    .split(" ")
    .map((point) => {
      const [x, y] = point.split(",");
      return `${Number(x) + 20},${Number(y) + 20}`;
    })
    .join(" ");

  return (
    <main className="sectionShell">
      <header className="sectionHeader">
        <div>
          <p className="sectionKicker">Planning</p>
          <h1>Timeline + trend</h1>
          <p className="sectionLead">
            Permit growth is a time story. The trendline shows approvals accumulating into the
            infrastructure constraint that appears later in engineering.
          </p>
        </div>
        <Link className="backLink" href="/">
          Back to overview
        </Link>
      </header>

      <section className="twoUp">
        <article className="card">
          <h2>Permit unit trend</h2>
          <svg viewBox="0 0 320 140" className="chartSvg" aria-label="Permit trend line">
            <path d="M20 120 H300" className="axisLine" />
            <path d="M20 20 V120" className="axisLine" />
            <polyline fill="none" stroke="#2768c9" strokeWidth="4" points={unitPoints} />
            <polyline
              fill="none"
              stroke="#5b8f27"
              strokeDasharray="6 5"
              strokeWidth="3"
              points={permitPoints}
            />
          </svg>
          <div className="timelineLabels">
            {series.map(([month]) => (
              <span key={month}>{month.slice(5)}</span>
            ))}
          </div>
          <div className="metricRow">
            <div className="metricPill safe">Blue: units approved</div>
            <div className="metricPill warning">Dashed: permits issued</div>
          </div>
        </article>

        <article className="card">
          <h2>Pipeline summary</h2>
          <div className="summaryBlock">
            <div className="summaryStat">
              <span>Active permits</span>
              <strong>{permits.length}</strong>
            </div>
            <div className="summaryStat">
              <span>Infill share</span>
              <strong>{Math.round(infillShare * 100)}%</strong>
            </div>
            <div className="summaryStat">
              <span>Total units</span>
              <strong>{monthlyUnits.reduce((sum, value) => sum + value, 0)}</strong>
            </div>
          </div>
        </article>
      </section>
    </main>
  );
}
