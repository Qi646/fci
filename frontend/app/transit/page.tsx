import GovernedViewPanel from "../../components/GovernedViewPanel";
import MetricStrip from "../../components/MetricStrip";
import { asRecords, CatalogResponse, fetchApi, QueryResult } from "../../lib/api";
import { resolveIncludedDatasetIds, resolveViewer } from "../../lib/viewer";
import { getDatasetViewSupport, isRenderableSupport } from "../../lib/views";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function scalePoint(value: number, min: number, max: number, start: number, size: number) {
  return start + ((value - min) / Math.max(max - min, 0.001)) * size;
}

export default async function TransitPage({ searchParams }: PageProps) {
  const viewer = await resolveViewer(searchParams, "transit");
  const catalogResult = await fetchApi<CatalogResponse>("/catalog?include_unavailable=true", viewer.context);
  const catalogDatasets = catalogResult.ok ? catalogResult.data.datasets : [];
  const includedIds = await resolveIncludedDatasetIds(
    searchParams,
    catalogDatasets.filter((dataset) => dataset.accessible).map((dataset) => dataset.dataset_id),
    ["transit-stops"],
  );
  const includeTransitStops = includedIds.includes("transit-stops");
  const stopsResult = includeTransitStops
    ? await fetchApi<QueryResult>("/datasets/transit-stops/query", viewer.context)
    : ({ ok: true, status: 200, data: null } as const);
  const stops = asRecords(stopsResult.ok ? stopsResult.data : null);
  const sortedByBoardings = [...stops].sort(
    (a, b) => Number(b.weekly_boardings ?? 0) - Number(a.weekly_boardings ?? 0),
  );
  const lats = stops.map((stop) => Number(stop.lat ?? 0));
  const lngs = stops.map((stop) => Number(stop.lng ?? 0));
  const minLat = Math.min(...(lats.length ? lats : [0]));
  const maxLat = Math.max(...(lats.length ? lats : [0]));
  const minLng = Math.min(...(lngs.length ? lngs : [0]));
  const maxLng = Math.max(...(lngs.length ? lngs : [0]));
  const totalBoardings = sortedByBoardings.reduce(
    (sum, stop) => sum + Number(stop.weekly_boardings ?? 0),
    0,
  );
  const selectedDormantWarnings = catalogDatasets
    .filter((dataset) => dataset.accessible && includedIds.includes(dataset.dataset_id))
    .filter((dataset) => !isRenderableSupport(getDatasetViewSupport(dataset, "transit").status))
    .map((dataset) => `${dataset.name} is selected but does not render in the transit view.`);

  return (
    <main className="sectionShell">
      <header className="pageHeader">
        <div>
          <p className="sectionKicker">Transit</p>
          <h1>Stop network / ridership</h1>
          <p className="sectionLead">
            Stops are plotted in geographic order with node area linked to weekly boardings. The
            companion table keeps the operational numbers explicit.
          </p>
        </div>
        <div className="pageHeaderMeta">
          <span className="panelMeta">Primary question</span>
          <strong>Which stops and corridors carry the highest load?</strong>
        </div>
      </header>

      <MetricStrip
        metrics={[
          { label: "Stops tracked", value: stops.length },
          { label: "Total weekly boardings", value: totalBoardings },
          { label: "Busiest stop", value: String(sortedByBoardings[0]?.stop_name ?? "n/a") },
        ]}
      />

      <section className="workspaceLayout">
        <div className="workspaceMain">
          {!stopsResult.ok ? (
            <div className="warningBanner">
              {stopsResult.error?.reason ?? stopsResult.error?.error ?? "The backend denied this dataset."}
            </div>
          ) : null}
          {!includeTransitStops ? (
            <div className="warningBanner">
              Transit stops and ridership are not included in this workspace.
            </div>
          ) : null}
          {selectedDormantWarnings.map((warning) => (
            <div key={warning} className="warningBanner">
              {warning}
            </div>
          ))}

          {!includeTransitStops ? (
            <section className="panelCard">
              <div className="panelHeading">
                <h2>No renderable datasets selected</h2>
                <span className="panelMeta">workspace state</span>
              </div>
              <p className="sectionLead compact">
                Add the transit dataset from the workspace rail to render this analysis.
              </p>
            </section>
          ) : (
            <section className="twoUp">
              <article className="panelCard">
                <div className="panelHeading">
                  <h2>Spatial corridor plot</h2>
                  <span className="panelMeta">lat/lng projected</span>
                </div>
                <svg viewBox="0 0 320 220" className="chartSvg" aria-label="Transit spatial plot">
                  <rect x="36" y="20" width="252" height="162" />
                  {[0, 1, 2, 3].map((idx) => {
                    const y = 20 + idx * 54;
                    return <line key={`gy-${idx}`} x1="36" y1={y} x2="288" y2={y} className="gridLine" />;
                  })}
                  {[0, 1, 2, 3, 4].map((idx) => {
                    const x = 36 + idx * 63;
                    return <line key={`gx-${idx}`} x1={x} y1="20" x2={x} y2="182" className="gridLine" />;
                  })}
                  {sortedByBoardings.map((stop, index) => {
                    const x = scalePoint(Number(stop.lng ?? 0), minLng, maxLng, 36, 252);
                    const y = 182 - scalePoint(Number(stop.lat ?? 0), minLat, maxLat, 0, 162);
                    const next = sortedByBoardings[index + 1];
                    const nextX = next
                      ? scalePoint(Number(next.lng ?? 0), minLng, maxLng, 36, 252)
                      : null;
                    const nextY = next
                      ? 182 - scalePoint(Number(next.lat ?? 0), minLat, maxLat, 0, 162)
                      : null;
                    return (
                      <g key={String(stop.stop_id)}>
                        {next ? <line x1={x} y1={y} x2={nextX ?? x} y2={nextY ?? y} className="routeLine" /> : null}
                        <circle cx={x} cy={y} r={4 + Number(stop.weekly_boardings ?? 0) / 900} className="routeNode" />
                        <text x={x} y={y - 10} textAnchor="middle" className="svgLabel">
                          {String(stop.stop_id).slice(-3)}
                        </text>
                      </g>
                    );
                  })}
                </svg>
                <p className="annotation">
                  Node area = boardings. Sequence follows ridership rank, not route timetable.
                </p>
              </article>

              <article className="panelCard">
                <div className="panelHeading">
                  <h2>Ridership table</h2>
                  <span className="panelMeta">descending boardings</span>
                </div>
                <div className="tableWrap">
                  <table className="dataTable">
                    <thead>
                      <tr>
                        <th>Stop</th>
                        <th>Ward</th>
                        <th>Routes</th>
                        <th>Weekly boardings</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedByBoardings.map((stop) => (
                        <tr key={String(stop.stop_id)}>
                          <td>{String(stop.stop_name)}</td>
                          <td>{String(stop.ward)}</td>
                          <td>{Array.isArray(stop.routes) ? stop.routes.join(", ") : ""}</td>
                          <td>{String(stop.weekly_boardings)}</td>
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
          viewId="transit"
          title="Transit workspace"
          summary="Transit stops render natively here. Unsupported selections stay visible in the workspace rail so the user can see why nothing appears instead of guessing."
          datasets={catalogDatasets}
          defaultIncludedIds={["transit-stops"]}
        />
      </section>
    </main>
  );
}
