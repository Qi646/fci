import Link from "next/link";
import DataControls from "../../components/DataControls";
import { accessProfiles, asRecords, fetchJson, QueryResult } from "../../lib/api";
import EngineeringMap from "./EngineeringMap";

function tone(capacity: number) {
  if (capacity >= 90) return "critical";
  if (capacity >= 75) return "warning";
  return "safe";
}

export default async function EngineeringPage() {
  const zones = asRecords(
    await fetchJson<QueryResult>("/datasets/eng-pressure-zones/query", accessProfiles.engineering),
  );
  const permits = asRecords(
    await fetchJson<QueryResult>("/datasets/plan-permits-2024/query", accessProfiles.engineering),
  );

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
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
    minLng: Math.min(...lngs),
    maxLng: Math.max(...lngs),
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

      <DataControls
        summary="This view defaults to engineering pressure zones plus planning permits because that is the common operational question here: where new housing demand meets water-capacity constraints."
        datasets={[
          {
            name: "Engineering Pressure Zones",
            defaultState: "On",
            detail: "Primary layer for this page. Capacity markers and zone table are based on engineering-owned data.",
          },
          {
            name: "Planning Residential Permits",
            defaultState: "On, hidden personal fields",
            detail: "Shared in by default because permit activity is the main driver of capacity stress. Personal fields stay hidden when engineering views it.",
          },
        ]}
      />

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
    </main>
  );
}
