"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CatalogDataset } from "../lib/api";
import {
  accessModeLabel,
  classificationLabel,
  departmentLabel,
  normalizeIncludedDatasets,
  purposeLabel,
  shareModeLabel,
} from "../lib/viewer";
import {
  getDatasetViewSupport,
  getSupportedViewLabels,
  isRenderableSupport,
  OperationalViewId,
} from "../lib/views";

type ViewerSummary = {
  profileKey: string;
  label?: string;
  department?: string;
  role?: string;
  purpose: string;
  approvedPurposes: string[];
};

type Props = {
  viewer: ViewerSummary;
  viewId: OperationalViewId;
  title?: string;
  summary: string;
  datasets: CatalogDataset[];
  defaultIncludedIds: string[];
};

function restrictionNote(dataset: CatalogDataset) {
  if (!dataset.accessible) {
    return "Not currently available to this viewer.";
  }
  if (dataset.access_mode === "aggregate_only") {
    return "Only summary output is available for the current viewer.";
  }
  if (dataset.masked_fields.length > 0) {
    return `Masked fields: ${dataset.masked_fields.join(", ")}.`;
  }
  return "Available in full detail for the current viewer.";
}

function statusTone(status: "native" | "supplemental" | "unsupported") {
  if (status === "native") return "strong";
  if (status === "supplemental") return "warning";
  return "critical";
}

export default function GovernedViewPanel({
  viewer,
  viewId,
  title = "Workspace",
  summary,
  datasets,
  defaultIncludedIds,
}: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const accessibleIds = datasets
    .filter((dataset) => dataset.accessible)
    .map((dataset) => dataset.dataset_id);
  const includedIds = normalizeIncludedDatasets(
    searchParams.getAll("include"),
    accessibleIds,
    defaultIncludedIds,
  );

  const selected = datasets.filter((dataset) => includedIds.includes(dataset.dataset_id));
  const selectedRenderable = selected.filter((dataset) =>
    isRenderableSupport(getDatasetViewSupport(dataset, viewId).status),
  );
  const selectedDormant = selected.filter(
    (dataset) => !isRenderableSupport(getDatasetViewSupport(dataset, viewId).status),
  );
  const available = datasets.filter(
    (dataset) => dataset.accessible && !includedIds.includes(dataset.dataset_id),
  );
  const restricted = datasets.filter((dataset) => !dataset.accessible);

  function toggleDataset(datasetId: string) {
    const nextIncludedIds = includedIds.includes(datasetId)
      ? includedIds.filter((item) => item !== datasetId)
      : [...includedIds, datasetId];
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("include");
    nextIncludedIds.forEach((item) => nextParams.append("include", item));
    router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
  }

  function accessHref() {
    const params = new URLSearchParams(searchParams.toString());
    params.set("profile", viewer.profileKey);
    params.set("purpose", viewer.purpose);
    return `/access?${params.toString()}`;
  }

  return (
    <aside className="workspaceRail" aria-label="Dataset workspace">
      <div className="workspaceRailHeader">
        <div>
          <p className="sectionKicker">Workspace</p>
          <h2>{title}</h2>
          <p className="sectionLead compact">{summary}</p>
        </div>
        <div className="workspaceIdentity">
          <span className="datasetBadge strong">{departmentLabel(viewer.department)}</span>
          <span className="datasetBadge">{purposeLabel(viewer.purpose)}</span>
        </div>
      </div>

      <div className="workspaceContext">
        <div className="workspaceFact">
          <span>Viewer</span>
          <strong>{viewer.label}</strong>
        </div>
        <div className="workspaceFact">
          <span>Role</span>
          <strong>{departmentLabel(viewer.role)}</strong>
        </div>
        <div className="workspaceFact">
          <span>Selected</span>
          <strong>{selected.length}</strong>
        </div>
        <div className="workspaceFact">
          <span>Rendering</span>
          <strong>{selectedRenderable.length}</strong>
        </div>
      </div>

      <section className="workspaceSection">
        <div className="workspaceSectionHeader">
          <h3>Active in this view</h3>
          <span>{selectedRenderable.length}</span>
        </div>
        {selectedRenderable.length === 0 ? (
          <p className="workspaceEmpty">No selected datasets currently contribute to this view.</p>
        ) : null}
        {selectedRenderable.map((dataset) => {
          const support = getDatasetViewSupport(dataset, viewId);
          return (
            <article key={dataset.dataset_id} className="workspaceDatasetCard">
              <div className="workspaceDatasetTop">
                <div>
                  <strong>{dataset.name}</strong>
                  <p>{support.reason}</p>
                </div>
                <button type="button" className="workspaceToggle" onClick={() => toggleDataset(dataset.dataset_id)}>
                  Remove
                </button>
              </div>
              <div className="datasetBadges">
                <span className={`datasetBadge ${statusTone(support.status)}`}>
                  {support.status === "native" ? "Rendering" : "Supplemental"}
                </span>
                <span className="datasetBadge">{departmentLabel(dataset.owner_department)}</span>
                <span className="datasetBadge">{classificationLabel(dataset.classification)}</span>
                <span className="datasetBadge">{accessModeLabel(dataset.access_mode)}</span>
              </div>
            </article>
          );
        })}
      </section>

      <section className="workspaceSection">
        <div className="workspaceSectionHeader">
          <h3>Selected but not rendered here</h3>
          <span>{selectedDormant.length}</span>
        </div>
        {selectedDormant.length === 0 ? (
          <p className="workspaceEmpty">No selected datasets are being ignored by this view.</p>
        ) : null}
        {selectedDormant.map((dataset) => {
          const support = getDatasetViewSupport(dataset, viewId);
          const supportedViews = getSupportedViewLabels(dataset);
          return (
            <article key={dataset.dataset_id} className="workspaceDatasetCard dormant">
              <div className="workspaceDatasetTop">
                <div>
                  <strong>{dataset.name}</strong>
                  <p>{support.reason}</p>
                  {supportedViews.length > 0 ? (
                    <p className="workspaceSubnote">Supports: {supportedViews.join(", ")}.</p>
                  ) : null}
                </div>
                <button type="button" className="workspaceToggle" onClick={() => toggleDataset(dataset.dataset_id)}>
                  Remove
                </button>
              </div>
              <div className="datasetBadges">
                <span className="datasetBadge critical">Not rendered</span>
                <span className="datasetBadge">{departmentLabel(dataset.owner_department)}</span>
                <span className="datasetBadge">{classificationLabel(dataset.classification)}</span>
              </div>
            </article>
          );
        })}
      </section>

      <section className="workspaceSection">
        <div className="workspaceSectionHeader">
          <h3>Available to add</h3>
          <span>{available.length}</span>
        </div>
        {available.map((dataset) => {
          const support = getDatasetViewSupport(dataset, viewId);
          const supportedViews = getSupportedViewLabels(dataset);
          return (
            <article key={dataset.dataset_id} className="workspaceDatasetCard muted">
              <div className="workspaceDatasetTop">
                <div>
                  <strong>{dataset.name}</strong>
                  <p>{restrictionNote(dataset)}</p>
                  <p className="workspaceSubnote">{support.reason}</p>
                  {!isRenderableSupport(support.status) && supportedViews.length > 0 ? (
                    <p className="workspaceSubnote">Renders in: {supportedViews.join(", ")}.</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  className={`workspaceToggle ${isRenderableSupport(support.status) ? "strong" : ""}`}
                  onClick={() => toggleDataset(dataset.dataset_id)}
                >
                  Add
                </button>
              </div>
              <div className="datasetBadges">
                <span className={`datasetBadge ${statusTone(support.status)}`}>
                  {isRenderableSupport(support.status) ? "Compatible" : "Will not render"}
                </span>
                <span className="datasetBadge">{departmentLabel(dataset.owner_department)}</span>
                <span className="datasetBadge">{shareModeLabel(dataset.share_mode)}</span>
              </div>
            </article>
          );
        })}
      </section>

      <section className="workspaceSection">
        <div className="workspaceSectionHeader">
          <h3>Restricted</h3>
          <span>{restricted.length}</span>
        </div>
        {restricted.map((dataset) => (
          <article key={dataset.dataset_id} className="workspaceDatasetCard restricted">
            <div className="workspaceDatasetTop">
              <div>
                <strong>{dataset.name}</strong>
                <p>{restrictionNote(dataset)}</p>
              </div>
            </div>
            <div className="datasetBadges">
              <span className="datasetBadge critical">Restricted</span>
              <span className="datasetBadge">{departmentLabel(dataset.owner_department)}</span>
              <span className="datasetBadge">{classificationLabel(dataset.classification)}</span>
            </div>
          </article>
        ))}
        <Link className="workspaceManageLink" href={accessHref()}>
          Manage sharing defaults
        </Link>
      </section>
    </aside>
  );
}
