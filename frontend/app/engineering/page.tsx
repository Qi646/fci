import GovernedViewPanel from "../../components/GovernedViewPanel";
import MetricStrip from "../../components/MetricStrip";
import {
  asRecords,
  CatalogResponse,
  fetchApi,
  QueryResult,
} from "../../lib/api";
import { resolveIncludedDatasetIds, resolveViewer } from "../../lib/viewer";
import { getDatasetViewSupport, isRenderableSupport } from "../../lib/views";
import EngineeringMap from "./EngineeringMap";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function tone(capacity: number) {
  if (capacity >= 90) return "critical";
  if (capacity >= 75) return "warning";
  return "safe";
}

export default async function EngineeringPage({ searchParams }: PageProps) {
  const viewer = await resolveViewer(searchParams, "engineering");
  const catalogResult = await fetchApi<CatalogResponse>("/catalog?include_unavailable=true", viewer.context);
  const catalogDatasets = catalogResult.ok ? catalogResult.data.datasets : [];
  const includedIds = await resolveIncludedDatasetIds(
    searchParams,
    catalogDatasets.filter((dataset) => dataset.accessible).map((dataset) => dataset.dataset_id),
    ["eng-pressure-zones", "plan-permits-2024"],
  );
  const includeZones = includedIds.includes("eng-pressure-zones");
  const includePermits = includedIds.includes("plan-permits-2024");
  const [zonesResult, permitsResult] = await Promise.all([
    includeZones
      ? fetchApi<QueryResult>("/datasets/eng-pressure-zones/query", viewer.context)
      : Promise.resolve({ ok: true, status: 200, data: null } as const),
    includePermits
      ? fetchApi<QueryResult>("/datasets/plan-permits-2024/query", viewer.context)
      : Promise.resolve({ ok: true, status: 200, data: null } as const),
  ]);

  const zones = asRecords(zonesResult.ok ? zonesResult.data : null);
  const permits = asRecords(permitsResult.ok ? permitsResult.data : null);
  const accessWarnings = [zonesResult, permitsResult]
    .filter((result) => !result.ok)
    .map((result) => result.error?.reason ?? result.error?.error ?? "The backend denied this dataset.");
  const selectedDormantWarnings = catalogDatasets
    .filter((dataset) => dataset.accessible && includedIds.includes(dataset.dataset_id))
    .filter((dataset) => !isRenderableSupport(getDatasetViewSupport(dataset, "engineering").status))
    .map((dataset) => `${dataset.name} is selected but does not render in the engineering view.`);
  const selectionWarnings = [
    !includeZones ? "Engineering pressure zones are not included in this workspace." : null,
    !includePermits ? "Planning permit overlays are not included in this workspace." : null,
  ].filter((item): item is string => Boolean(item));

  const hotspots = zones
    .map((zone) => ({
      zoneName: String(zone.zone_name),
      ward: Array.isArray(zone.wards) ? zone.wards.join(", ") : "",
      capacity: Number(zone.capacity_pct ?? 0),
      permits: permits.filter((permit) => permit.zone_id === zone.zone_id).length,
      zoneId: String(zone.zone_id),
    }))
    .sort((a, b) => b.capacity - a.capacity);

  const lats = [
    ...zones.map((zone) => Number(zone.centroid_lat ?? 0)),
    ...permits.map((permit) => Number(permit.lat ?? 0)),
  ];
  const lngs = [
    ...zones.map((zone) => Number(zone.centroid_lng ?? 0)),
    ...permits.map((permit) => Number(permit.lng ?? 0)),
  ];
  const bounds = {
    minLat: Math.min(...(lats.length ? lats : [0])),
    maxLat: Math.max(...(lats.length ? lats : [0])),
    minLng: Math.min(...(lngs.length ? lngs : [0])),
    maxLng: Math.max(...(lngs.length ? lngs : [0])),
  };
  const criticalZones = hotspots.filter((zone) => zone.capacity >= 90);
  const permitLoadInCritical = criticalZones.reduce((sum, zone) => sum + zone.permits, 0);
  const avgCapacity = Math.round(hotspots.reduce((sum, zone) => sum + zone.capacity, 0) / Math.max(hotspots.length, 1));
  const renderableSelectionCount = Number(includeZones) + Number(includePermits);

  return (
    <main className="sectionShell">
      <header className="pageHeader">
        <div>
          <p className="sectionKicker">Engineering</p>
          <h1>Water capacity geospatial view</h1>
          <p className="sectionLead">
            Zone centroids and permit coordinates are plotted in actual latitude and longitude
            space. Bubble area tracks utilization, permit overlays show incremental demand.
          </p>
        </div>
        <div className="pageHeaderMeta">
          <span className="panelMeta">Primary question</span>
          <strong>Where do permit loads meet stressed zones?</strong>
        </div>
      </header>

      <MetricStrip
        metrics={[
          { label: "Critical zones", value: criticalZones.length, tone: criticalZones.length > 0 ? "critical" : "default" },
          { label: "Permits in critical zones", value: permitLoadInCritical, tone: permitLoadInCritical > 0 ? "warning" : "default" },
          { label: "Average utilization", value: `${avgCapacity}%`, tone: avgCapacity >= 90 ? "critical" : avgCapacity >= 75 ? "warning" : "default" },
        ]}
      />

      <section className="workspaceLayout">
        <div className="workspaceMain">
          {accessWarnings.map((warning) => (
            <div key={warning} className="warningBanner">
              {warning}
            </div>
          ))}
          {selectionWarnings.map((warning) => (
            <div key={warning} className="warningBanner">
              {warning}
            </div>
          ))}
          {selectedDormantWarnings.map((warning) => (
            <div key={warning} className="warningBanner">
              {warning}
            </div>
          ))}

          {renderableSelectionCount === 0 ? (
            <section className="panelCard">
              <div className="panelHeading">
                <h2>No renderable datasets selected</h2>
                <span className="panelMeta">workspace state</span>
              </div>
              <p className="sectionLead compact">
                Add engineering pressure zones or planning permits from the workspace rail to
                render this analysis.
              </p>
            </section>
          ) : (
            <section className="twoUp">
              <article className="panelCard">
          <div className="panelHeading">
            <h2>Basemap</h2>
            <span className="panelMeta">live coordinates</span>
          </div>
          <EngineeringMap
            zones={zones.map((zone) => ({
              zone_id: String(zone.zone_id),
              zone_name: String(zone.zone_name),
              capacity_pct: Number(zone.capacity_pct ?? 0),
              centroid_lat: Number(zone.centroid_lat ?? 0),
              centroid_lng: Number(zone.centroid_lng ?? 0),
            }))}
            permits={permits.map((permit) => ({
              permit_id: String(permit.permit_id),
              permit_type: String(permit.permit_type ?? "unknown"),
              units: Number(permit.units ?? 0),
              lat: Number(permit.lat ?? 0),
              lng: Number(permit.lng ?? 0),
            }))}
          />
          <div className="legendRow">
            <span><i className="legendSwatch safe" /> under 75%</span>
            <span><i className="legendSwatch warning" /> 75 to 89%</span>
            <span><i className="legendSwatch critical" /> 90%+</span>
            <span><i className="legendDot" /> permit units</span>
          </div>
          <p className="annotation">Bubble area = capacity utilization. Blue dots = active permits.</p>
              </article>

              <article className="panelCard">
          <div className="panelHeading">
            <h2>Zone operating table</h2>
            <span className="panelMeta">sorted by utilization</span>
          </div>
          <div className="tableWrap">
            <table className="dataTable">
              <thead>
                <tr>
                  <th>Zone</th>
                  <th>Wards</th>
                  <th>Permits</th>
                  <th>Capacity</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {hotspots.map((zone) => (
                  <tr key={zone.zoneId}>
                    <td>{zone.zoneName}</td>
                    <td>{zone.ward}</td>
                    <td>{zone.permits}</td>
                    <td>{zone.capacity}%</td>
                    <td><span className={`statusBadge ${tone(zone.capacity)}`}>{tone(zone.capacity)}</span></td>
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
          viewId="engineering"
          title="Engineering workspace"
          summary="Engineering capacity zones render natively here. Planning permits add demand overlays. Other datasets can still be selected, but the rail will warn when they do not contribute to this view."
          datasets={catalogDatasets}
          defaultIncludedIds={["eng-pressure-zones", "plan-permits-2024"]}
        />
      </section>
    </main>
  );
}
