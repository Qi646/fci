import Link from "next/link";
import GovernedViewPanel from "../../components/GovernedViewPanel";
import {
  asRecords,
  CatalogResponse,
  fetchApi,
  QueryResult,
} from "../../lib/api";
import { resolveIncludedDatasetIds, resolveViewer } from "../../lib/viewer";
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

  return (
    <main className="sectionShell">
      <header className="sectionHeader">
        <div>
          <p className="sectionKicker">Engineering</p>
          <h1>Water capacity geospatial view</h1>
          <p className="sectionLead">
            Zone centroids and permit coordinates are plotted in actual latitude and longitude
            space. Bubble area tracks utilization. Blue dots are permit footprints.
          </p>
        </div>
        <Link className="backLink" href="/">
          Back to overview
        </Link>
      </header>

      <section className="summaryGrid">
        <article className="summaryCard">
          <span>Critical zones</span>
          <strong>{criticalZones.length}</strong>
        </article>
        <article className="summaryCard">
          <span>Permits in critical zones</span>
          <strong>{permitLoadInCritical}</strong>
        </article>
        <article className="summaryCard">
          <span>Average utilization</span>
          <strong>{avgCapacity}%</strong>
        </article>
      </section>

      <GovernedViewPanel
        viewer={{
          profileKey: viewer.profileKey,
          label: viewer.profile.label,
          department: viewer.profile.department,
          role: viewer.profile.role,
          purpose: viewer.purpose,
          approvedPurposes: viewer.profile.approvedPurposes ?? [],
        }}
        title="Engineering workspace"
        summary="This view defaults to engineering pressure zones plus planning permits because that is the common operational question here: where new housing demand meets water-capacity constraints."
        datasets={catalogDatasets}
        defaultIncludedIds={["eng-pressure-zones", "plan-permits-2024"]}
      />

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

      {includedIds.length === 0 ? (
        <section className="card">
          <div className="panelHeading">
            <h2>No datasets selected</h2>
            <span className="panelMeta">workspace state</span>
          </div>
          <p className="sectionLead compact">
            Add at least one approved dataset above to render the engineering analysis view.
          </p>
        </section>
      ) : (
      <section className="twoUp">
        <article className="card">
          <div className="panelHeading">
            <h2>Basemap</h2>
            <span className="panelMeta">MapLibre / real coordinates</span>
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

        <article className="card">
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
    </main>
  );
}
