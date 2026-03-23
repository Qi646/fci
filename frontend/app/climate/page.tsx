import GovernedViewPanel from "../../components/GovernedViewPanel";
import MetricStrip from "../../components/MetricStrip";
import { asRecords, CatalogResponse, fetchApi, QueryResult } from "../../lib/api";
import { resolveIncludedDatasetIds, resolveViewer } from "../../lib/viewer";
import { getDatasetViewSupport, isRenderableSupport } from "../../lib/views";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ClimatePage({ searchParams }: PageProps) {
  const viewer = await resolveViewer(searchParams, "climate");
  const catalogResult = await fetchApi<CatalogResponse>("/catalog?include_unavailable=true", viewer.context);
  const catalogDatasets = catalogResult.ok ? catalogResult.data.datasets : [];
  const includedIds = await resolveIncludedDatasetIds(
    searchParams,
    catalogDatasets.filter((dataset) => dataset.accessible).map((dataset) => dataset.dataset_id),
    ["climate-risk-overlays"],
  );
  const includeClimateOverlays = includedIds.includes("climate-risk-overlays");
  const overlaysResult = includeClimateOverlays
    ? await fetchApi<QueryResult>("/datasets/climate-risk-overlays/query", viewer.context)
    : ({ ok: true, status: 200, data: null } as const);
  const overlays = asRecords(overlaysResult.ok ? overlaysResult.data : null);
  const sortedOverlays = [...overlays].sort(
    (a, b) => Number(b.priority_score ?? 0) - Number(a.priority_score ?? 0),
  );
  const avgPriority = Math.round(
    sortedOverlays.reduce((sum, overlay) => sum + Number(overlay.priority_score ?? 0), 0) /
      Math.max(sortedOverlays.length, 1),
  );
  const selectedDormantWarnings = catalogDatasets
    .filter((dataset) => dataset.accessible && includedIds.includes(dataset.dataset_id))
    .filter((dataset) => !isRenderableSupport(getDatasetViewSupport(dataset, "climate").status))
    .map((dataset) => `${dataset.name} is selected but does not render in the climate view.`);

  return (
    <main className="sectionShell">
      <header className="pageHeader">
        <div>
          <p className="sectionKicker">Climate / environment</p>
          <h1>Risk priority matrix</h1>
          <p className="sectionLead">
            Flood risk is plotted on the x-axis, heat on the y-axis, and air quality is encoded in
            marker area. The table keeps the exact values accessible.
          </p>
        </div>
        <div className="pageHeaderMeta">
          <span className="panelMeta">Primary question</span>
          <strong>Which wards combine the highest overlapping risks?</strong>
        </div>
      </header>

      <MetricStrip
        metrics={[
          { label: "Priority zones", value: sortedOverlays.length },
          { label: "Average priority", value: avgPriority },
          { label: "Top risk ward", value: String(sortedOverlays[0]?.ward ?? "n/a"), tone: avgPriority >= 60 ? "warning" : "default" },
        ]}
      />

      <section className="workspaceLayout">
        <div className="workspaceMain">
          {!overlaysResult.ok ? (
            <div className="warningBanner">
              {overlaysResult.error?.reason ?? overlaysResult.error?.error ?? "The backend denied this dataset."}
            </div>
          ) : null}
          {!includeClimateOverlays ? (
            <div className="warningBanner">
              Climate risk overlays are not included in this workspace.
            </div>
          ) : null}
          {selectedDormantWarnings.map((warning) => (
            <div key={warning} className="warningBanner">
              {warning}
            </div>
          ))}

          {!includeClimateOverlays ? (
            <section className="panelCard">
              <div className="panelHeading">
                <h2>No renderable datasets selected</h2>
                <span className="panelMeta">workspace state</span>
              </div>
              <p className="sectionLead compact">
                Add the climate overlays dataset from the workspace rail to render this analysis.
              </p>
            </section>
          ) : (
            <section className="twoUp">
              <article className="panelCard">
                <div className="panelHeading">
                  <h2>Priority scatter</h2>
                  <span className="panelMeta">flood vs heat</span>
                </div>
                <svg viewBox="0 0 320 220" className="chartSvg" aria-label="Climate risk matrix">
                  <rect x="44" y="20" width="244" height="148" />
                  {[0, 20, 40, 60, 80].map((tick) => {
                    const x = 44 + (tick / 80) * 244;
                    const y = 168 - (tick / 80) * 148;
                    return (
                      <g key={tick}>
                        <line x1={x} y1="20" x2={x} y2="168" className="gridLine" />
                        <line x1="44" y1={y} x2="288" y2={y} className="gridLine" />
                        <text x={x} y="186" textAnchor="middle" className="axisText">
                          {tick}
                        </text>
                        <text x="34" y={y + 4} textAnchor="end" className="axisText">
                          {tick}
                        </text>
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
                        <circle cx={x} cy={y} r={6 + air / 12} fill="rgba(220, 38, 38, 0.1)" stroke="#dc2626" strokeWidth={1.4} />
                        <text x={x} y={y + 3} textAnchor="middle" className="svgLabel">
                          {String(overlay.ward).replace("Ward ", "W")}
                        </text>
                      </g>
                    );
                  })}
                  <text x="166" y="206" textAnchor="middle" className="axisText">
                    flood risk
                  </text>
                  <text x="12" y="96" transform="rotate(-90 12 96)" textAnchor="middle" className="axisText">
                    heat risk
                  </text>
                </svg>
                <p className="annotation">Marker area = air-quality risk.</p>
              </article>

              <article className="panelCard">
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
          viewId="climate"
          title="Climate workspace"
          summary="Climate overlays render natively here. Unsupported selections remain visible with explicit compatibility notes so an empty canvas is never unexplained."
          datasets={catalogDatasets}
          defaultIncludedIds={["climate-risk-overlays"]}
        />
      </section>
    </main>
  );
}
