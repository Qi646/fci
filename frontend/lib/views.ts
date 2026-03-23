import { CatalogDataset, accessProfiles } from "./api";

export type OperationalViewId =
  | "engineering"
  | "planning"
  | "public-health"
  | "transit"
  | "social-services"
  | "climate";

export type ViewSupportStatus = "native" | "supplemental" | "unsupported";

export type ViewSupport = {
  view_id: OperationalViewId;
  status: ViewSupportStatus;
  reason: string;
};

export type AppView = {
  id: OperationalViewId;
  href: string;
  navLabel: string;
  eyebrow: string;
  title: string;
  description: string;
  primaryQuestion: string;
  viewType: string;
  defaultIncludedIds: string[];
  defaultProfile: keyof typeof accessProfiles;
};

export const operationalViews: AppView[] = [
  {
    id: "engineering",
    href: "/engineering",
    navLabel: "Engineering",
    eyebrow: "Engineering",
    title: "Water capacity geospatial view",
    description: "Pressure zones and permit demand layered into one operating view.",
    primaryQuestion: "Where is new housing demand colliding with capacity stress?",
    viewType: "Map",
    defaultIncludedIds: ["eng-pressure-zones", "plan-permits-2024"],
    defaultProfile: "engineering",
  },
  {
    id: "planning",
    href: "/planning",
    navLabel: "Planning",
    eyebrow: "Planning",
    title: "Permit issuance over time",
    description: "Permit pipeline trend and ward allocation for planning review.",
    primaryQuestion: "How is the permit pipeline moving by month and ward?",
    viewType: "Trend",
    defaultIncludedIds: ["plan-permits-2024"],
    defaultProfile: "planning",
  },
  {
    id: "public-health",
    href: "/public-health",
    navLabel: "Public Health",
    eyebrow: "Public health",
    title: "Case surveillance matrix",
    description: "Ward-by-case monitoring with alert thresholds and raw surveillance rows.",
    primaryQuestion: "Which wards or case types are moving toward alert status?",
    viewType: "Matrix",
    defaultIncludedIds: ["health-cases"],
    defaultProfile: "publicHealth",
  },
  {
    id: "transit",
    href: "/transit",
    navLabel: "Transit",
    eyebrow: "Transit",
    title: "Stop network and ridership",
    description: "Stop-level corridor pattern and ridership totals in one frame.",
    primaryQuestion: "Which stops and corridors are carrying the most demand?",
    viewType: "Network",
    defaultIncludedIds: ["transit-stops"],
    defaultProfile: "transit",
  },
  {
    id: "social-services",
    href: "/social-services",
    navLabel: "Social Services",
    eyebrow: "Social services",
    title: "Cohort demand",
    description: "Population, need, and active cases for internal service planning.",
    primaryQuestion: "Which cohorts and wards show the highest service demand?",
    viewType: "Bars",
    defaultIncludedIds: ["social-services-demographics"],
    defaultProfile: "socialServices",
  },
  {
    id: "climate",
    href: "/climate",
    navLabel: "Climate",
    eyebrow: "Climate",
    title: "Risk priority matrix",
    description: "Flood, heat, and air-quality risk arranged into one priority matrix.",
    primaryQuestion: "Which wards combine the highest overlapping climate risks?",
    viewType: "Scatter",
    defaultIncludedIds: ["climate-risk-overlays"],
    defaultProfile: "climate",
  },
];

export const auxiliaryNav = [
  { href: "/catalog", label: "Catalog" },
  { href: "/topology", label: "Topology" },
  { href: "/access", label: "Access" },
];

export function getViewDefinition(viewId: OperationalViewId) {
  return operationalViews.find((view) => view.id === viewId);
}

export function getDatasetViewSupport(
  dataset: Pick<CatalogDataset, "view_support">,
  viewId: OperationalViewId,
): ViewSupport {
  return (
    dataset.view_support.find((item) => item.view_id === viewId) ?? {
      view_id: viewId,
      status: "unsupported",
      reason: "This dataset does not contribute to the active view.",
    }
  );
}

export function isRenderableSupport(status: ViewSupportStatus) {
  return status === "native" || status === "supplemental";
}

export function getSupportedViewLabels(dataset: Pick<CatalogDataset, "view_support">) {
  return dataset.view_support
    .filter((item) => isRenderableSupport(item.status))
    .map((item) => getViewDefinition(item.view_id)?.navLabel ?? item.view_id);
}
