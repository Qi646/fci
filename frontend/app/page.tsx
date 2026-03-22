type CatalogDataset = {
  dataset_id: string;
  name: string;
  owner_dept: string;
  access_tier: string;
  quality_score: number;
  spatial_key: string;
  fields: string[];
};

type QueryResult = {
  dataset_id: string;
  result_count: number;
  results: Array<Record<string, unknown>>;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      headers: { Authorization: "Bearer eng_staff" },
      cache: "no-store",
    });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function statusTone(capacity: number) {
  if (capacity >= 90) return "critical";
  if (capacity >= 75) return "warning";
  return "safe";
}

export default async function Home() {
  const catalog = await fetchJson<{ datasets: CatalogDataset[] }>("/catalog");
  const zones = await fetchJson<QueryResult>("/datasets/eng-pressure-zones/query");
  const permits = await fetchJson<QueryResult>("/datasets/plan-permits-2024/query");
  const audit = await fetchJson<{ entries: Array<{ action: string; role: string; details: Record<string, unknown> }> }>("/audit");
  const apiReachable = Boolean(catalog && zones && permits && audit);

  const zoneRecords = (zones?.results ?? []) as Array<Record<string, unknown>>;
  const permitRecords = (permits?.results ?? []) as Array<Record<string, unknown>>;

  const totalUnits = permitRecords.reduce((sum, record) => sum + Number(record.units ?? 0), 0);
  const criticalZones = zoneRecords.filter((record) => Number(record.capacity_pct ?? 0) >= 90).length;

  return (
    <main className="pageShell">
      <section className="heroPanel">
        <div>
          <p className="eyebrow">Municipal Data Infrastructure</p>
          <h1>Data access layer first. Clear operational picture second.</h1>
          <p className="lede">
            This prototype loads departmental datasets into a shared API, enforces access tiers,
            and makes the planning-versus-capacity conflict visible in one dashboard.
          </p>
          {!apiReachable ? (
            <div className="warningBanner">
              The dashboard cannot reach the backend at <code>{API_BASE}</code>. Start the API or
              set <code>NEXT_PUBLIC_API_BASE_URL</code> to the correct port before loading the page.
            </div>
          ) : null}
        </div>
        <div className="heroStats">
          <article>
            <span>Datasets</span>
            <strong>{catalog?.datasets.length ?? 0}</strong>
          </article>
          <article>
            <span>Tracked Permit Units</span>
            <strong>{totalUnits}</strong>
          </article>
          <article>
            <span>Critical Zones</span>
            <strong>{criticalZones}</strong>
          </article>
        </div>
      </section>

      <section className="grid">
        <div className="panel">
          <div className="panelHeader">
            <div>
              <p className="eyebrow">View 1</p>
              <h2>Ward Capacity Snapshot</h2>
            </div>
          </div>
          <div className="zoneList">
            {zoneRecords.map((zone) => {
              const capacity = Number(zone.capacity_pct ?? 0);
              return (
                <article key={String(zone.zone_id)} className={`zoneCard ${statusTone(capacity)}`}>
                  <div className="zoneMeta">
                    <h3>{String(zone.zone_name)}</h3>
                    <span>{String((zone.wards as string[]).join(", "))}</span>
                  </div>
                  <strong>{capacity}%</strong>
                </article>
              );
            })}
          </div>
        </div>

        <div className="panel">
          <div className="panelHeader">
            <div>
              <p className="eyebrow">View 2</p>
              <h2>Permit Feed</h2>
            </div>
          </div>
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Permit</th>
                  <th>Ward</th>
                  <th>Type</th>
                  <th>Units</th>
                  <th>Zone</th>
                </tr>
              </thead>
              <tbody>
                {permitRecords.map((record) => (
                  <tr key={String(record.permit_id)}>
                    <td>{String(record.permit_id)}</td>
                    <td>{String(record.ward)}</td>
                    <td>{String(record.permit_type)}</td>
                    <td>{String(record.units)}</td>
                    <td>{String(record.zone_id)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <div className="panelHeader">
            <div>
              <p className="eyebrow">Catalog</p>
              <h2>Dataset Registry</h2>
            </div>
          </div>
          <div className="catalogList">
            {(catalog?.datasets ?? []).map((dataset) => (
              <article key={dataset.dataset_id} className="catalogCard">
                <div className="catalogTopline">
                  <h3>{dataset.name}</h3>
                  <span className="badge">{dataset.access_tier}</span>
                </div>
                <p>{dataset.owner_dept}</p>
                <p>Join key: {dataset.spatial_key}</p>
                <p>Quality: {dataset.quality_score}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panelHeader">
            <div>
              <p className="eyebrow">Audit</p>
              <h2>Recent Requests</h2>
            </div>
          </div>
          <div className="auditList">
            {(audit?.entries ?? []).slice(-8).reverse().map((entry, index) => (
              <article key={`${entry.action}-${index}`} className="auditCard">
                <div className="catalogTopline">
                  <strong>{entry.action}</strong>
                  <span>{entry.role}</span>
                </div>
                <pre>{JSON.stringify(entry.details, null, 2)}</pre>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
