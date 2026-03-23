"use client";

import { useEffect, useState } from "react";
import {
  AccessContext,
  API_BASE,
  CatalogDataset,
  CatalogResponse,
} from "../../lib/api";
import { classificationLabel, departmentLabel, shareModeLabel } from "../../lib/viewer";

type JoinResult = {
  left_dataset: string;
  right_dataset: string;
  join_key: string;
  result_count: number;
  results: Array<Record<string, unknown>>;
};

type AuditEntry = {
  log_id: string;
  timestamp: string;
  requester_user_id: string;
  requester_department: string;
  endpoint: string;
  datasets: string[];
  outcome: string;
  denial_reason: string | null;
};

function buildHeaders(context: AccessContext) {
  return {
    Authorization: `Bearer ${context.userId}`,
    "X-User-Id": context.userId,
    "X-Purpose": context.purpose ?? "",
    "Content-Type": "application/json",
  };
}

export default function CatalogBrowser({ context }: { context: AccessContext }) {
  const [datasets, setDatasets] = useState<CatalogDataset[]>([]);
  const [search, setSearch] = useState("");
  const [joinLeft, setJoinLeft] = useState<string | null>(null);
  const [joinRight, setJoinRight] = useState<string | null>(null);
  const [joinKey, setJoinKey] = useState("zone_id");
  const [joinResult, setJoinResult] = useState<JoinResult | null>(null);
  const [joining, setJoining] = useState(false);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API_BASE}/catalog?include_unavailable=true`, {
          headers: buildHeaders(context),
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as CatalogResponse;
        setDatasets(data.datasets);
      } catch {
        setError("Cannot reach backend");
      }
    }
    void load();
  }, [context]);

  useEffect(() => {
    async function poll() {
      try {
        const adminCtx = { ...context, userId: "city_admin", purpose: "governance_oversight" };
        const res = await fetch(`${API_BASE}/audit`, {
          headers: buildHeaders(adminCtx),
          cache: "no-store",
        });
        if (res.ok) {
          const data = (await res.json()) as { entries: AuditEntry[] };
          setAuditLog(data.entries.slice(-20).reverse());
        }
      } catch {
        // Ignore polling errors for the side rail.
      }
    }

    void poll();
    const interval = setInterval(poll, 4000);
    return () => clearInterval(interval);
  }, [context]);

  async function fireJoin() {
    if (!joinLeft || !joinRight) return;
    setJoining(true);
    setJoinResult(null);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/join`, {
        method: "POST",
        headers: buildHeaders(context),
        body: JSON.stringify({
          left_dataset: joinLeft,
          right_dataset: joinRight,
          join_key: joinKey,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        setError(err?.detail?.reason ?? err?.detail?.error ?? `Join failed (HTTP ${res.status})`);
        setJoining(false);
        return;
      }
      const data = (await res.json()) as JoinResult;
      setJoinResult(data);
    } catch {
      setError("Join request failed");
    }
    setJoining(false);
  }

  const filtered = datasets.filter((d) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      d.name.toLowerCase().includes(s) ||
      d.dataset_id.toLowerCase().includes(s) ||
      d.fields.some((f) => f.toLowerCase().includes(s))
    );
  });

  const accessible = filtered.filter((d) => d.accessible);
  const restricted = filtered.filter((d) => !d.accessible);
  const leftDataset = datasets.find((dataset) => dataset.dataset_id === joinLeft) ?? null;
  const rightDataset = datasets.find((dataset) => dataset.dataset_id === joinRight) ?? null;

  return (
    <div className="catalogLayout">
      <section className="panelCard">
        <div className="panelHeading">
          <h2>Dataset browser</h2>
          <span className="panelMeta">explicit selection</span>
        </div>
        <label className="fieldGroup">
          <span>Search datasets</span>
          <input
            type="text"
            placeholder="Search by name, ID, or field"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>

        {error ? <div className="warningBanner">{error}</div> : null}

        <div className="catalogDatasetList">
          {accessible.map((dataset) => (
            <article key={dataset.dataset_id} className="catalogDatasetCard">
              <div className="catalogDatasetHeader">
                <div>
                  <strong>{dataset.name}</strong>
                  <p className="workspaceSubnote">{dataset.dataset_id}</p>
                </div>
                <div className="datasetBadges">
                  <span className="datasetBadge strong">Accessible</span>
                  <span className="datasetBadge">{Math.round(dataset.quality_score * 100)}% quality</span>
                </div>
              </div>

              <div className="datasetBadges">
                <span className="datasetBadge">{departmentLabel(dataset.owner_department)}</span>
                <span className="datasetBadge">{classificationLabel(dataset.classification)}</span>
                <span className="datasetBadge">{shareModeLabel(dataset.share_mode)}</span>
              </div>

              <p className="catalogDatasetCopy">
                Spatial key: {dataset.spatial_key}. Fields: {dataset.fields.slice(0, 5).join(", ")}
                {dataset.fields.length > 5 ? "..." : ""}.
              </p>

              <div className="catalogAssignRow">
                <button
                  type="button"
                  className={`workspaceToggle ${joinLeft === dataset.dataset_id ? "strong" : ""}`}
                  onClick={() => setJoinLeft(joinLeft === dataset.dataset_id ? null : dataset.dataset_id)}
                >
                  {joinLeft === dataset.dataset_id ? "Remove left" : "Use as left"}
                </button>
                <button
                  type="button"
                  className={`workspaceToggle ${joinRight === dataset.dataset_id ? "strong" : ""}`}
                  onClick={() => setJoinRight(joinRight === dataset.dataset_id ? null : dataset.dataset_id)}
                >
                  {joinRight === dataset.dataset_id ? "Remove right" : "Use as right"}
                </button>
              </div>
            </article>
          ))}
        </div>

        {restricted.length > 0 ? (
          <div className="catalogRestricted">
            <div className="panelHeading">
              <h2>Restricted</h2>
              <span className="panelMeta">{restricted.length}</span>
            </div>
            <div className="catalogDatasetList">
              {restricted.map((dataset) => (
                <article key={dataset.dataset_id} className="catalogDatasetCard restricted">
                  <div className="catalogDatasetHeader">
                    <div>
                      <strong>{dataset.name}</strong>
                      <p className="workspaceSubnote">{dataset.dataset_id}</p>
                    </div>
                    <span className="datasetBadge critical">Restricted</span>
                  </div>
                  <div className="datasetBadges">
                    <span className="datasetBadge">{departmentLabel(dataset.owner_department)}</span>
                    <span className="datasetBadge">{classificationLabel(dataset.classification)}</span>
                  </div>
                </article>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className="panelCard">
        <div className="panelHeading">
          <h2>Join composer</h2>
          <span className="panelMeta">POST /join</span>
        </div>
        <div className="joinSlotGrid">
          <div className="joinSlot">
            <span>Left dataset</span>
            <strong>{leftDataset?.name ?? "Unassigned"}</strong>
            <p>{leftDataset?.dataset_id ?? "Choose a dataset from the browser."}</p>
          </div>
          <div className="joinSlot">
            <span>Right dataset</span>
            <strong>{rightDataset?.name ?? "Unassigned"}</strong>
            <p>{rightDataset?.dataset_id ?? "Choose a second dataset from the browser."}</p>
          </div>
        </div>

        <label className="fieldGroup">
          <span>Join key</span>
          <input type="text" value={joinKey} onChange={(e) => setJoinKey(e.target.value)} />
        </label>

        <button
          type="button"
          className="saveButton"
          disabled={!joinLeft || !joinRight || joining}
          onClick={fireJoin}
        >
          {joining ? "Joining..." : "Execute join"}
        </button>

        {joinResult ? (
          <div className="joinResultBlock">
            <div className="panelHeading">
              <h2>Join result</h2>
              <span className="panelMeta">{joinResult.result_count} rows</span>
            </div>
            <div className="tableWrap">
              <table className="dataTable">
                <thead>
                  <tr>
                    <th>Join key</th>
                    <th>Left record</th>
                    <th>Right record</th>
                  </tr>
                </thead>
                <tbody>
                  {joinResult.results.slice(0, 20).map((row, i) => (
                    <tr key={i}>
                      <td>{String((row as Record<string, unknown>).join_value ?? "")}</td>
                      <td className="catalogJsonCell">
                        {JSON.stringify((row as Record<string, unknown>).left, null, 1)?.slice(0, 200)}
                      </td>
                      <td className="catalogJsonCell">
                        {JSON.stringify((row as Record<string, unknown>).right, null, 1)?.slice(0, 200)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>

      <aside className="panelCard catalogAuditRail">
        <div className="panelHeading">
          <h2>Audit trail</h2>
          <span className="panelMeta">last 20</span>
        </div>
        <div className="auditList">
          {auditLog.length === 0 ? (
            <p className="workspaceEmpty">Waiting for audit events.</p>
          ) : null}
          {auditLog.map((entry) => (
            <article key={entry.log_id} className={`auditItem ${entry.outcome === "denied" ? "critical" : ""}`}>
              <div className="auditItemTop">
                <strong>{entry.endpoint}</strong>
                <span className={`datasetBadge ${entry.outcome === "denied" ? "critical" : "strong"}`}>
                  {entry.outcome}
                </span>
              </div>
              <p className="workspaceSubnote">
                {departmentLabel(entry.requester_department)} · {entry.datasets.join(", ")}
              </p>
              {entry.denial_reason ? <p className="workspaceSubnote">{entry.denial_reason}</p> : null}
            </article>
          ))}
        </div>
      </aside>
    </div>
  );
}
