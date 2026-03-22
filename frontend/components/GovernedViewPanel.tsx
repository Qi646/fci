"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CatalogDataset } from "../lib/api";
import {
  accessModeLabel,
  classificationLabel,
  departmentLabel,
  purposeLabel,
  shareModeLabel,
} from "../lib/viewer";

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
  title?: string;
  summary: string;
  datasets: CatalogDataset[];
  defaultIncludedIds: string[];
};

function restrictionNote(dataset: CatalogDataset) {
  if (!dataset.accessible) {
    return "Not currently available to this department and purpose.";
  }
  if (dataset.access_mode === "aggregate_only") {
    return "This dataset is limited to aggregate output for the current viewer.";
  }
  if (dataset.masked_fields.length > 0) {
    return `Masked fields: ${dataset.masked_fields.join(", ")}.`;
  }
  return "Full detail is currently allowed for this viewer.";
}

export default function GovernedViewPanel({
  viewer,
  title = "Governed Workspace",
  summary,
  datasets,
  defaultIncludedIds,
}: Props) {
  const initialIncluded = useMemo(
    () => defaultIncludedIds.filter((datasetId) => datasets.some((dataset) => dataset.dataset_id === datasetId && dataset.accessible)),
    [datasets, defaultIncludedIds],
  );
  const [includedIds, setIncludedIds] = useState<string[]>(initialIncluded);

  useEffect(() => {
    setIncludedIds(initialIncluded);
  }, [initialIncluded]);

  const included = datasets.filter((dataset) => includedIds.includes(dataset.dataset_id));
  const available = datasets.filter(
    (dataset) => dataset.accessible && !includedIds.includes(dataset.dataset_id),
  );
  const restricted = datasets.filter((dataset) => !dataset.accessible);

  function toggleDataset(datasetId: string) {
    setIncludedIds((current) =>
      current.includes(datasetId)
        ? current.filter((item) => item !== datasetId)
        : [...current, datasetId],
    );
  }

  function accessHref() {
    const params = new URLSearchParams();
    params.set("profile", viewer.profileKey);
    params.set("purpose", viewer.purpose);
    return `/access?${params.toString()}`;
  }

  return (
    <section className="governedPanel" aria-label="Governed workspace controls">
      <div className="governedPanelHeader">
        <div>
          <p className="sectionKicker">Access Context</p>
          <h2>{title}</h2>
          <p className="dataControlsSummary">{summary}</p>
        </div>
        <div className="governedIdentity">
          <span className="policyBadge strong">{departmentLabel(viewer.department)}</span>
          <span className="policyBadge">{purposeLabel(viewer.purpose)}</span>
          <span className="policyBadge">{departmentLabel(viewer.role)}</span>
          <span className="policyBadge">Audit logged</span>
        </div>
      </div>

      <div className="viewerFacts">
        <div className="viewerFact">
          <span>Viewer</span>
          <strong>{viewer.label}</strong>
        </div>
        <div className="viewerFact">
          <span>Department</span>
          <strong>{departmentLabel(viewer.department)}</strong>
        </div>
        <div className="viewerFact">
          <span>Role</span>
          <strong>{departmentLabel(viewer.role)}</strong>
        </div>
        <div className="viewerFact">
          <span>Approved purposes</span>
          <strong>{viewer.approvedPurposes.map((item) => purposeLabel(item)).join(", ")}</strong>
        </div>
      </div>

      <div className="workspaceColumns">
        <section className="workspaceColumn">
          <div className="workspaceColumnHeader">
            <h3>Included in this view</h3>
            <span>{included.length}</span>
          </div>
          {included.map((dataset) => (
            <article key={dataset.dataset_id} className="governedDatasetCard">
              <div className="governedDatasetTop">
                <div>
                  <strong>{dataset.name}</strong>
                  <p>{restrictionNote(dataset)}</p>
                </div>
                <button type="button" className="workspaceToggle" onClick={() => toggleDataset(dataset.dataset_id)}>
                  Remove
                </button>
              </div>
              <div className="datasetBadges">
                <span className="datasetBadge">{departmentLabel(dataset.owner_department)}</span>
                <span className="datasetBadge">{classificationLabel(dataset.classification)}</span>
                <span className="datasetBadge">{shareModeLabel(dataset.share_mode)}</span>
                <span className="datasetBadge strong">{accessModeLabel(dataset.access_mode)}</span>
              </div>
            </article>
          ))}
          {included.length === 0 ? (
            <p className="workspaceEmpty">No approved datasets are currently included in this workspace.</p>
          ) : null}
        </section>

        <section className="workspaceColumn">
          <div className="workspaceColumnHeader">
            <h3>Available to add</h3>
            <span>{available.length}</span>
          </div>
          {available.map((dataset) => (
            <article key={dataset.dataset_id} className="governedDatasetCard">
              <div className="governedDatasetTop">
                <div>
                  <strong>{dataset.name}</strong>
                  <p>{restrictionNote(dataset)}</p>
                </div>
                <button type="button" className="workspaceToggle strong" onClick={() => toggleDataset(dataset.dataset_id)}>
                  Add
                </button>
              </div>
              <div className="datasetBadges">
                <span className="datasetBadge">{departmentLabel(dataset.owner_department)}</span>
                <span className="datasetBadge">{classificationLabel(dataset.classification)}</span>
                <span className="datasetBadge">{shareModeLabel(dataset.share_mode)}</span>
                <span className="datasetBadge strong">{accessModeLabel(dataset.access_mode)}</span>
              </div>
            </article>
          ))}
          {available.length === 0 ? (
            <p className="workspaceEmpty">No additional approved datasets are available for this purpose.</p>
          ) : null}
        </section>

        <section className="workspaceColumn">
          <div className="workspaceColumnHeader">
            <h3>Restricted or unavailable</h3>
            <span>{restricted.length}</span>
          </div>
          {restricted.map((dataset) => (
            <article key={dataset.dataset_id} className="governedDatasetCard restricted">
              <div className="governedDatasetTop">
                <div>
                  <strong>{dataset.name}</strong>
                  <p>{restrictionNote(dataset)}</p>
                </div>
              </div>
              <div className="datasetBadges">
                <span className="datasetBadge">{departmentLabel(dataset.owner_department)}</span>
                <span className="datasetBadge">{classificationLabel(dataset.classification)}</span>
                <span className="datasetBadge">{shareModeLabel(dataset.share_mode)}</span>
                <span className="datasetBadge critical">Denied</span>
              </div>
            </article>
          ))}
          <Link className="workspaceManageLink" href={accessHref()}>
            Manage outbound sharing
          </Link>
        </section>
      </div>
    </section>
  );
}
