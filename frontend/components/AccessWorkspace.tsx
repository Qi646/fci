"use client";

import { useEffect, useMemo, useState } from "react";
import {
  accessProfiles,
  AccessConfigDataset,
  AccessConfigResponse,
  API_BASE,
  sendJson,
} from "../lib/api";

type State = {
  sharing_policy: string;
  allowed_departments: string[];
  default_delivery: string;
  viewer_note: string;
};

const deliveryLabels: Record<string, string> = {
  full_detail: "Full detail",
  hidden_personal_fields: "Hidden personal fields",
  summary_only: "Summary only",
};

function titleCase(value: string) {
  return value.replaceAll("_", " ");
}

function initialState(dataset: AccessConfigDataset): State {
  return {
    sharing_policy: dataset.sharing_policy,
    allowed_departments: dataset.allowed_departments,
    default_delivery: dataset.default_delivery,
    viewer_note: dataset.viewer_note,
  };
}

export default function AccessWorkspace() {
  const [response, setResponse] = useState<AccessConfigResponse | null>(null);
  const [drafts, setDrafts] = useState<Record<string, State>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    async function loadConfig() {
      try {
        const result = await fetch(`${API_BASE}/access-config`, {
          headers: {
            Authorization: `Bearer ${accessProfiles.admin.userId}`,
            "X-User-Id": accessProfiles.admin.userId,
            "X-Purpose": accessProfiles.admin.purpose ?? "",
          },
          cache: "no-store",
        });
        if (!result.ok) {
          setMessage("Could not load access settings from the backend.");
          return;
        }
        const payload = (await result.json()) as AccessConfigResponse;
        setResponse(payload);
        setDrafts(
          Object.fromEntries(
            payload.datasets.map((dataset) => [dataset.dataset_id, initialState(dataset)]),
          ),
        );
      } catch {
        setMessage("Could not load access settings from the backend.");
      }
    }

    void loadConfig();
  }, []);

  const glossary = useMemo(
    () => [
      {
        label: "Anyone can use this data",
        detail: "Suitable for public dashboards and broad municipal use.",
      },
      {
        label: "Any municipal staff user can use this data",
        detail: "Not public, but available across the municipality.",
      },
      {
        label: "Only the selected departments can use this data",
        detail: "Use this when sharing should be limited to specific teams.",
      },
      {
        label: "Selected departments can use this data with personal fields hidden",
        detail: "Use this for cross-department work where names or personal fields should stay hidden.",
      },
      {
        label: "Selected departments only get summary-level output",
        detail: "Use this when another department should only see totals, trends, or counts.",
      },
    ],
    [],
  );

  function updateDraft(datasetId: string, patch: Partial<State>) {
    setDrafts((current) => ({
      ...current,
      [datasetId]: { ...current[datasetId], ...patch },
    }));
  }

  function toggleDepartment(datasetId: string, department: string) {
    const draft = drafts[datasetId];
    const exists = draft.allowed_departments.includes(department);
    updateDraft(datasetId, {
      allowed_departments: exists
        ? draft.allowed_departments.filter((item) => item !== department)
        : [...draft.allowed_departments, department],
    });
  }

  async function saveDataset(datasetId: string) {
    const draft = drafts[datasetId];
    setSavingId(datasetId);
    setMessage("");
    const payload = await sendJson<{ dataset: AccessConfigDataset }>(
      `/access-config/${datasetId}`,
      accessProfiles.admin,
      "PUT",
      draft,
    );
    setSavingId(null);
    if (!payload) {
      setMessage("Save failed. The backend rejected the change or could not be reached.");
      return;
    }

    setResponse((current) =>
      current
        ? {
            ...current,
            datasets: current.datasets.map((dataset) =>
              dataset.dataset_id === datasetId ? payload.dataset : dataset,
            ),
          }
        : current,
    );
    setDrafts((current) => ({
      ...current,
      [datasetId]: initialState(payload.dataset),
    }));
    setMessage(`Saved access settings for ${payload.dataset.dataset_name}.`);
  }

  if (!response) {
    return (
      <div className="accessWorkspace">
        <section className="card">
          <div className="panelHeading">
            <h2>Loading access settings</h2>
            <span className="panelMeta">backend-backed configuration</span>
          </div>
          <p className="sectionLead compact">
            {message || "Fetching current sharing rules and default viewer behavior."}
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="accessWorkspace">
      <section className="card">
        <div className="panelHeading">
          <h2>What These Choices Mean</h2>
          <span className="panelMeta">plain-language policy guide</span>
        </div>
        <div className="dataControlsGrid">
          {glossary.map((item) => (
            <article key={item.label} className="dataControlCard">
              <strong>{item.label}</strong>
              <p>{item.detail}</p>
            </article>
          ))}
        </div>
      </section>

      {message ? <p className="accessStatus">{message}</p> : null}

      <section className="accessWorkspaceGrid">
        {response.datasets.map((dataset) => {
          const draft = drafts[dataset.dataset_id];
          return (
            <article key={dataset.dataset_id} className="accessEditorCard">
              <div className="accessEditorHeader">
                <div>
                  <p className="sectionKicker">{titleCase(dataset.owner_department)}</p>
                  <h2>{dataset.dataset_name}</h2>
                </div>
                <span className="controlState">{titleCase(dataset.classification)}</span>
              </div>

              <label className="fieldGroup">
                <span>Who should be able to use this data?</span>
                <select
                  value={draft.sharing_policy}
                  onChange={(event) =>
                    updateDraft(dataset.dataset_id, { sharing_policy: event.target.value })
                  }
                >
                  {Object.entries(response.sharing_policy_options).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="fieldGroup">
                <span>Which departments should get access?</span>
                <div className="checkboxGrid">
                  {Object.entries(response.department_options)
                    .filter(([key]) => key !== "city_manager")
                    .map(([value, label]) => {
                      const checked = draft.allowed_departments.includes(value);
                      const disabled =
                        draft.sharing_policy === "public" ||
                        draft.sharing_policy === "municipal_internal";
                      return (
                        <label key={value} className={`checkboxCard${checked ? " checked" : ""}`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={disabled}
                            onChange={() => toggleDepartment(dataset.dataset_id, value)}
                          />
                          <span>{label}</span>
                        </label>
                      );
                    })}
                </div>
              </div>

              <label className="fieldGroup">
                <span>What should other dashboards show by default?</span>
                <select
                  value={draft.default_delivery}
                  onChange={(event) =>
                    updateDraft(dataset.dataset_id, { default_delivery: event.target.value })
                  }
                >
                  {Object.entries(response.delivery_options).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="fieldGroup">
                <span>Viewer note</span>
                <textarea
                  value={draft.viewer_note}
                  rows={3}
                  onChange={(event) =>
                    updateDraft(dataset.dataset_id, { viewer_note: event.target.value })
                  }
                />
              </label>

              <div className="accessSummaryStrip">
                <span>
                  Default for viewers:{" "}
                  <strong>{deliveryLabels[draft.default_delivery] ?? titleCase(draft.default_delivery)}</strong>
                </span>
                <button
                  type="button"
                  className="saveButton"
                  disabled={savingId === dataset.dataset_id}
                  onClick={() => void saveDataset(dataset.dataset_id)}
                >
                  {savingId === dataset.dataset_id ? "Saving..." : "Save"}
                </button>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
