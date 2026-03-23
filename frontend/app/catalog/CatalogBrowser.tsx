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

  // Poll audit log
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
      } catch { /* ignore */ }
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

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Search bar */}
      <div style={{ display: "grid", gap: 8 }}>
        <input
          type="text"
          placeholder="Search datasets by name, ID, or field..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: "100%",
            minHeight: 44,
            padding: "0 16px",
            border: "1px solid var(--border)",
            borderRadius: 2,
            background: "var(--surface-strong)",
            color: "var(--text)",
            font: "inherit",
            fontSize: "0.95rem",
          }}
        />
      </div>

      {error && <div className="warningBanner">{error}</div>}

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "1fr 380px" }}>
        {/* LEFT: Dataset cards + join */}
        <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
          {/* Dataset cards */}
          <div className="panelHeading">
            <h2>Accessible datasets ({accessible.length})</h2>
            <span className="panelMeta">click to select for join</span>
          </div>

          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
            {accessible.map((d) => {
              const isLeft = joinLeft === d.dataset_id;
              const isRight = joinRight === d.dataset_id;
              const selected = isLeft || isRight;
              return (
                <button
                  key={d.dataset_id}
                  type="button"
                  onClick={() => {
                    if (isLeft) { setJoinLeft(null); return; }
                    if (isRight) { setJoinRight(null); return; }
                    if (!joinLeft) { setJoinLeft(d.dataset_id); return; }
                    setJoinRight(d.dataset_id);
                  }}
                  style={{
                    display: "grid",
                    gap: 10,
                    padding: 14,
                    border: `1px solid ${selected ? "var(--cyan)" : "var(--border)"}`,
                    borderRadius: 2,
                    background: selected ? "rgba(0, 212, 255, 0.04)" : "var(--surface-strong)",
                    color: "var(--text)",
                    textAlign: "left" as const,
                    cursor: "pointer",
                    transition: "border-color 0.15s",
                    font: "inherit",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <strong style={{ fontSize: "0.92rem" }}>{d.name}</strong>
                      <div style={{ color: "var(--muted)", fontFamily: "var(--font-mono)", fontSize: 10, marginTop: 4 }}>
                        {d.dataset_id}
                      </div>
                    </div>
                    {selected && (
                      <span style={{
                        padding: "2px 8px",
                        border: "1px solid var(--cyan)",
                        borderRadius: 2,
                        fontFamily: "var(--font-mono)",
                        fontSize: 9,
                        fontWeight: 600,
                        color: "var(--cyan)",
                      }}>
                        {isLeft ? "LEFT" : "RIGHT"}
                      </span>
                    )}
                  </div>
                  <div className="datasetBadges">
                    <span className="datasetBadge">{departmentLabel(d.owner_department)}</span>
                    <span className="datasetBadge">{classificationLabel(d.classification)}</span>
                    <span className="datasetBadge">{shareModeLabel(d.share_mode)}</span>
                  </div>
                  <div style={{ color: "var(--muted)", fontFamily: "var(--font-mono)", fontSize: 10 }}>
                    Key: {d.spatial_key} | Quality: {Math.round(d.quality_score * 100)}%
                    {d.masked_fields.length > 0 && ` | Masked: ${d.masked_fields.join(", ")}`}
                  </div>
                </button>
              );
            })}
          </div>

          {restricted.length > 0 && (
            <>
              <div className="panelHeading" style={{ marginTop: 8 }}>
                <h2>Restricted ({restricted.length})</h2>
                <span className="panelMeta">access denied</span>
              </div>
              <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
                {restricted.map((d) => (
                  <div
                    key={d.dataset_id}
                    style={{
                      padding: 14,
                      border: "1px solid var(--border)",
                      borderRadius: 2,
                      background: "var(--surface)",
                      opacity: 0.6,
                    }}
                  >
                    <strong style={{ fontSize: "0.92rem" }}>{d.name}</strong>
                    <div className="datasetBadges" style={{ marginTop: 8 }}>
                      <span className="datasetBadge">{departmentLabel(d.owner_department)}</span>
                      <span className="datasetBadge critical">Denied</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Join panel */}
          {(joinLeft || joinRight) && (
            <div className="card" style={{ borderColor: "rgba(0, 212, 255, 0.2)" }}>
              <div className="panelHeading">
                <h2>Cross-department join</h2>
                <span className="panelMeta">POST /join</span>
              </div>
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--cyan)" }}>
                    {joinLeft ?? "select left"} + {joinRight ?? "select right"}
                  </span>
                  <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--muted)", letterSpacing: "0.1em", textTransform: "uppercase" as const }}>
                      Join key
                    </span>
                    <input
                      type="text"
                      value={joinKey}
                      onChange={(e) => setJoinKey(e.target.value)}
                      style={{
                        minHeight: 32,
                        padding: "0 10px",
                        border: "1px solid var(--border)",
                        borderRadius: 2,
                        background: "var(--surface-muted)",
                        color: "var(--text)",
                        fontFamily: "var(--font-mono)",
                        fontSize: 12,
                        width: 140,
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    className="saveButton"
                    disabled={!joinLeft || !joinRight || joining}
                    onClick={fireJoin}
                  >
                    {joining ? "Joining..." : "Execute join"}
                  </button>
                </div>

                {joinResult && (
                  <div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--cyan)", marginBottom: 8 }}>
                      {joinResult.result_count} rows returned
                    </div>
                    <div className="tableWrap" style={{ maxHeight: 300, overflow: "auto" }}>
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
                              <td style={{ whiteSpace: "pre-wrap", maxWidth: 300 }}>
                                {JSON.stringify((row as Record<string, unknown>).left, null, 1)?.slice(0, 200)}
                              </td>
                              <td style={{ whiteSpace: "pre-wrap", maxWidth: 300 }}>
                                {JSON.stringify((row as Record<string, unknown>).right, null, 1)?.slice(0, 200)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: Audit log panel */}
        <div className="card" style={{ alignSelf: "start", position: "sticky", top: 80 }}>
          <div className="panelHeading">
            <h2>Audit trail</h2>
            <span className="liveIndicator">live / last 20</span>
          </div>
          <div style={{ display: "grid", gap: 4, maxHeight: 600, overflow: "auto" }}>
            {auditLog.length === 0 && (
              <p style={{ color: "var(--muted)", fontSize: "0.85rem", margin: 0 }}>
                Waiting for audit events...
              </p>
            )}
            {auditLog.map((entry) => (
              <div
                key={entry.log_id}
                style={{
                  display: "grid",
                  gap: 4,
                  padding: "8px 10px",
                  border: `1px solid ${entry.outcome === "denied" ? "rgba(255, 51, 102, 0.15)" : "var(--border)"}`,
                  borderRadius: 2,
                  background: entry.outcome === "denied" ? "rgba(255, 51, 102, 0.04)" : "transparent",
                  animation: "slide-in 0.3s ease",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    fontWeight: 600,
                    color: entry.outcome === "denied" ? "var(--red)" : "var(--cyan)",
                    letterSpacing: "0.1em",
                    textTransform: "uppercase" as const,
                  }}>
                    {entry.outcome}
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--muted)" }}>
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--muted-strong)" }}>
                  {entry.endpoint}
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--muted)" }}>
                  {entry.requester_user_id} / {entry.requester_department}
                  {entry.datasets.length > 0 && ` → ${entry.datasets.join(", ")}`}
                </div>
                {entry.denial_reason && (
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--red)" }}>
                    {entry.denial_reason}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
