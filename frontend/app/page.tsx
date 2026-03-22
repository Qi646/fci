import Link from "next/link";
import DataControls from "../components/DataControls";
import { accessProfiles, API_BASE, fetchJson } from "../lib/api";

const cards = [
  {
    href: "/engineering",
    eyebrow: "Engineering",
    title: "Spatial map",
    tag: "Choropleth / markers",
    blurb: "Assets have location. Problems cluster spatially.",
    preview: "previewMap",
  },
  {
    href: "/planning",
    eyebrow: "Planning",
    title: "Timeline + trend",
    tag: "Line chart / forecast",
    blurb: "Growth unfolds over time. Forecasts drive decisions.",
    preview: "previewLine",
  },
  {
    href: "/public-health",
    eyebrow: "Public health",
    title: "Heatmap + alert",
    tag: "Heatmap / anomaly",
    blurb: "Clusters reveal outbreak patterns across geography + time.",
    preview: "previewHeat",
  },
  {
    href: "/transit",
    eyebrow: "Transit",
    title: "Flow / network",
    tag: "Network / ridership flow",
    blurb: "Demand moves between nodes. Line weight = volume.",
    preview: "previewTransit",
  },
  {
    href: "/social-services",
    eyebrow: "Social services",
    title: "Demographic breakdown",
    tag: "Bar chart / cohort view",
    blurb: "Populations segment by age, income, need. Bars clarify scale.",
    preview: "previewBars",
  },
  {
    href: "/climate",
    eyebrow: "Climate / environment",
    title: "Multi-layer overlay",
    tag: "Layered map / overlap",
    blurb: "Multiple risk types overlap. Intersections = highest priority.",
    preview: "previewOverlay",
  },
];

export default async function Home() {
  const health = await fetchJson<{ status: string }>("/health", accessProfiles.publicPortal);
  const apiReachable = Boolean(health?.status === "ok");

  return (
    <main className="launcherShell">
      <section className="launcherHeader">
        <div>
          <p className="sectionKicker">Municipal dashboard</p>
          <h1>Choose a municipal lens.</h1>
          <p className="sectionLead">
            Each domain gets its own visualization grammar. The home page is a launcher into the
            actual municipal views.
          </p>
          {!apiReachable ? (
            <div className="warningBanner">
              The frontend cannot reach the backend at <code>{API_BASE}</code>. Start the API or
              set <code>NEXT_PUBLIC_API_BASE_URL</code> to the correct port.
            </div>
          ) : null}
        </div>
      </section>

      <DataControls
        title="How To Use This Demo"
        summary="Choose a municipal view first. Use the Access page to define sharing defaults. Inside each view, the data shown already reflects those defaults, so people can focus on the analysis instead of policy language."
        datasets={[
          {
            name: "Set sharing on the Access page",
            defaultState: "Recommended",
            detail: "Owners and stewards decide which departments can use a dataset and whether shared views should default to raw, masked, or aggregate output.",
          },
          {
            name: "Open a department view",
            defaultState: "Recommended",
            detail: "Each page focuses on the data that department would typically use, with safe defaults already applied.",
          },
          {
            name: "Adjust page-level data choices",
            defaultState: "Coming next",
            detail: "Per-page controls should let users turn approved datasets and layers on or off without managing governance there.",
          },
        ]}
      />

      <section className="launcherGrid">
        {cards.map((card) => (
          <Link key={card.href} href={card.href} className="launcherCard">
            <div className="launcherText">
              <p>{card.eyebrow}</p>
              <h2>{card.title}</h2>
            </div>
            <div className={`previewFrame ${card.preview}`} />
            <div className="previewTag">{card.tag}</div>
            <p className="launcherBlurb">{card.blurb}</p>
          </Link>
        ))}
      </section>
    </main>
  );
}
