import GovernedViewPanel from "../../components/GovernedViewPanel";
import MetricStrip from "../../components/MetricStrip";
import { asRecords, CatalogResponse, fetchApi, QueryResult } from "../../lib/api";
import { resolveIncludedDatasetIds, resolveViewer } from "../../lib/viewer";
import { getDatasetViewSupport, isRenderableSupport } from "../../lib/views";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function buildSeries(records: Array<Record<string, unknown>>) {
  const monthly = new Map<string, { units: number; permits: number }>();
  for (const record of records) {
    const month = String(record.issued_date ?? "").slice(0, 7);
    const current = monthly.get(month) ?? { units: 0, permits: 0 };
    current.units += Number(record.units ?? 0);
    current.permits += 1;
    monthly.set(month, current);
  }
  return [...monthly.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function linePoints(values: number[], width: number, height: number) {
  const max = Math.max(...values, 1);
  return values
    .map((value, index) => {
      const x = 48 + (index / Math.max(values.length - 1, 1)) * width;
      const y = 168 - (value / max) * height;
      return `${x},${y}`;
    })
    .join(" ");
}

export default async function PlanningPage({ searchParams }: PageProps) {
  const viewer = await resolveViewer(searchParams, "planning");
  const catalogResult = await fetchApi<CatalogResponse>("/catalog?include_unavailable=true", viewer.context);
  const catalogDatasets = catalogResult.ok ? catalogResult.data.datasets : [];
  const includedIds = await resolveIncludedDatasetIds(
    searchParams,
    catalogDatasets.filter((dataset) => dataset.accessible).map((dataset) => dataset.dataset_id),
    ["plan-permits-2024"],
  );
  const includePermits = includedIds.includes("plan-permits-2024");
  const permitsResult = includePermits
    ? await fetchApi<QueryResult>("/datasets/plan-permits-2024/query", viewer.context)
    : ({ ok: true, status: 200, data: null } as const);
  const permits = asRecords(permitsResult.ok ? permitsResult.data : null);
  const series = buildSeries(permits);
  const unitValues = series.map(([, value]) => value.units);
  const permitValues = series.map(([, value]) => value.permits);
  const totalUnits = unitValues.reduce((sum, value) => sum + value, 0);
  const infillShare =
    permits.filter((record) => record.permit_type === "infill").length / Math.max(permits.length, 1);
  const topMonth = series.reduce(
    (best, current) => (current[1].units > best[1].units ? current : best),
    series[0] ?? ["n/a", { units: 0, permits: 0 }],
  );
  const wardRows = Object.entries(
    permits.reduce<Record<string, number>>((acc, permit) => {
      const ward = String(permit.ward ?? "Unknown");
      acc[ward] = (acc[ward] ?? 0) + Number(permit.units ?? 0);
      return acc;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);
  const maxUnits = Math.max(...unitValues, 1);
  const selectedDormantWarnings = catalogDatasets
    .filter((dataset) => dataset.accessible && includedIds.includes(dataset.dataset_id))
    .filter((dataset) => !isRenderableSupport(getDatasetViewSupport(dataset, "planning").status))
    .map((dataset) => `${dataset.name} is selected but does not render in the planning view.`);

  return (
    <main className="sectionShell">
      <header className="pageHeader">
        <div>
          <p className="sectionKicker">Planning</p>
          <h1>Permit issuance over time</h1>
          <p className="sectionLead">
            Monthly permit units and permit counts are charted on the same frame with explicit
            legend and y-axis scaling.
          </p>
        </div>
        <div className="pageHeaderMeta">
          <span className="panelMeta">Primary question</span>
          <strong>How is the permit pipeline moving over time?</strong>
        </div>
      </header>

      <MetricStrip
        metrics={[
          { label: "Total permits", value: permits.length },
          { label: "Total approved units", value: totalUnits },
          { label: "Peak month", value: topMonth[0] },
        ]}
      />

      <section className="workspaceLayout">
        <div className="workspaceMain">
          {!permitsResult.ok ? (
            <div className="warningBanner">
              {permitsResult.error?.reason ?? permitsResult.error?.error ?? "The backend denied this dataset."}
            </div>
          ) : null}
          {!includePermits ? (
            <div className="warningBanner">
              Planning permits are not included in this workspace.
            </div>
          ) : null}
          {selectedDormantWarnings.map((warning) => (
            <div key={warning} className="warningBanner">
              {warning}
            </div>
          ))}

          {!includePermits ? (
            <section className="panelCard">
              <div className="panelHeading">
                <h2>No renderable datasets selected</h2>
                <span className="panelMeta">workspace state</span>
              </div>
              <p className="sectionLead compact">
                Add the planning permits dataset from the workspace rail to render this analysis.
              </p>
            </section>
          ) : (
            <section className="twoUp">
              <article className="panelCard">
                <div className="panelHeading">
                  <h2>Monthly trend</h2>
                  <span className="panelMeta">2024 permit pipeline</span>
                </div>
                <svg viewBox="0 0 320 220" className="chartSvg" aria-label="Planning trend chart">
                  <rect x="44" y="20" width="244" height="148" />
                  {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                    const y = 168 - ratio * 148;
                    const label = Math.round(maxUnits * ratio);
                    return (
                      <g key={ratio}>
                        <line x1="44" y1={y} x2="288" y2={y} className="gridLine" />
                        <text x="36" y={y + 4} textAnchor="end" className="axisText">
                          {label}
                        </text>
                      </g>
                    );
                  })}
                  <polyline className="seriesPrimary" points={linePoints(unitValues, 228, 148)} />
                  <polyline className="seriesSecondary" points={linePoints(permitValues, 228, 148)} />
                  {series.map(([month], index) => {
                    const x = 48 + (index / Math.max(series.length - 1, 1)) * 228;
                    return (
                      <text key={month} x={x} y="186" textAnchor="middle" className="axisText">
                        {month.slice(5)}
                      </text>
                    );
                  })}
                </svg>
                <div className="legendRow">
                  <span><i className="legendLine primary" /> units approved</span>
                  <span><i className="legendLine secondary" /> permits issued</span>
                </div>
                <p className="annotation">Infill share: {Math.round(infillShare * 100)}%</p>
              </article>

              <article className="panelCard">
                <div className="panelHeading">
                  <h2>Ward allocation</h2>
                  <span className="panelMeta">share of approved units</span>
                </div>
                <div className="tableWrap">
                  <table className="dataTable">
                    <thead>
                      <tr>
                        <th>Ward</th>
                        <th>Units</th>
                        <th>Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {wardRows.map(([ward, units]) => (
                        <tr key={ward}>
                          <td>{ward}</td>
                          <td>{units}</td>
                          <td>{Math.round((units / Math.max(totalUnits, 1)) * 100)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            </section>
          )}
        </div>

        <GovernedViewPanel
          viewer={{
            profileKey: viewer.profileKey,
            label: viewer.profile.label,
            department: viewer.profile.department,
            role: viewer.profile.role,
            purpose: viewer.purpose,
            approvedPurposes: viewer.profile.approvedPurposes ?? [],
          }}
          viewId="planning"
          title="Planning workspace"
          summary="This view renders the planning permit dataset natively. Unsupported selections remain visible with explicit warnings so the user can see why they are not contributing here."
          datasets={catalogDatasets}
          defaultIncludedIds={["plan-permits-2024"]}
        />
      </section>
    </main>
  );
}
