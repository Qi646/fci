import Link from "next/link";
import { asRecords, fetchJson, QueryResult } from "../../lib/api";

function tone(capacity: number) {
  if (capacity >= 90) return "critical";
  if (capacity >= 75) return "warning";
  return "safe";
}

export default async function EngineeringPage() {
  const zones = asRecords(
    await fetchJson<QueryResult>("/datasets/eng-pressure-zones/query"),
  );
  const permits = asRecords(
    await fetchJson<QueryResult>("/datasets/plan-permits-2024/query"),
  );

  const hotspots = zones
    .map((zone) => ({
      zoneName: String(zone.zone_name),
      ward: Array.isArray(zone.wards) ? zone.wards.join(", ") : "",
      capacity: Number(zone.capacity_pct ?? 0),
      permits: permits.filter((permit) => permit.zone_id === zone.zone_id).length,
    }))
    .sort((a, b) => b.capacity - a.capacity);

  return (
    <main className="sectionShell">
      <header className="sectionHeader">
        <div>
          <p className="sectionKicker">Engineering</p>
          <h1>Spatial map</h1>
          <p className="sectionLead">
            Capacity stress appears spatially first. This view pairs zone health with permit
            concentration so overloaded areas stop looking benign.
          </p>
        </div>
        <Link className="backLink" href="/">
          Back to overview
        </Link>
      </header>

      <section className="twoUp">
        <article className="card">
          <h2>Capacity map</h2>
          <div className="mapFrame">
            <div className="mapShape mapZoneOne" />
            <div className="mapShape mapZoneTwo" />
            <div className="mapShape mapZoneThree" />
            <div className="mapShape mapZoneFour" />
            <div className="mapShape mapZoneFive" />
            <span className="mapDot mapDotA" />
            <span className="mapDot mapDotB" />
            <span className="mapDot mapDotC" />
          </div>
          <div className="metricRow">
            {hotspots.slice(0, 3).map((zone) => (
              <div key={zone.zoneName} className={`metricPill ${tone(zone.capacity)}`}>
                {zone.zoneName}: {zone.capacity}%
              </div>
            ))}
          </div>
        </article>

        <article className="card">
          <h2>Pressure hotspots</h2>
          <div className="stackList">
            {hotspots.map((zone) => (
              <div key={zone.zoneName} className="stackRow">
                <div>
                  <strong>{zone.zoneName}</strong>
                  <p>{zone.ward}</p>
                </div>
                <div className="stackMeta">
                  <span>{zone.permits} permits</span>
                  <strong>{zone.capacity}%</strong>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}
