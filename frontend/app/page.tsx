import Link from "next/link";
import DataControls from "../components/DataControls";
import { accessProfiles, API_BASE, fetchJson } from "../lib/api";

const cards = [
  {
    href: "/engineering",
    eyebrow: "Engineering",
    title: "Water capacity geospatial view",
    tag: "Map / capacity stress",
    blurb: "Pressure zones, permit load, and utilization hotspots on one operational map.",
    focus: "Critical zones and permit pressure",
    preview: "previewMap",
  },
  {
    href: "/planning",
    eyebrow: "Planning",
    title: "Permit issuance over time",
    tag: "Trend / monthly pipeline",
    blurb: "Approved units, permit counts, and ward allocation for growth tracking.",
    focus: "Permit volume and monthly peaks",
    preview: "previewLine",
  },
  {
    href: "/public-health",
    eyebrow: "Public health",
    title: "Case surveillance matrix",
    tag: "Matrix / alert status",
    blurb: "Ward-by-case rates with alert thresholds and raw surveillance records.",
    focus: "Alert wards and case type spikes",
    preview: "previewHeat",
  },
  {
    href: "/transit",
    eyebrow: "Transit",
    title: "Stop network / ridership",
    tag: "Network / stop demand",
    blurb: "Ridership-ranked corridor view backed by an explicit stop operations table.",
    focus: "Busiest stops and route load",
    preview: "previewTransit",
  },
  {
    href: "/social-services",
    eyebrow: "Social services",
    title: "Cohort demand",
    tag: "Bars / service demand",
    blurb: "Population, need, and active cases arranged for service planning review.",
    focus: "Need concentration by cohort",
    preview: "previewBars",
  },
  {
    href: "/climate",
    eyebrow: "Climate / environment",
    title: "Risk priority matrix",
    tag: "Scatter / composite risk",
    blurb: "Flood, heat, and air-quality risk combined into a ward-level priority view.",
    focus: "High-risk wards and overlap",
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
          <h1>Operational views, not demo cards.</h1>
          <p className="sectionLead">
            Each domain page exposes the primary operational signal, its supporting detail, and the
            governed datasets behind it. Start from the workload you need to review.
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
        title="Operating Model"
        summary="Access rules are set once on the Access page. Each operational view then renders the dataset mix and delivery defaults that its users are allowed to see, so the workflow stays focused on analysis rather than governance overhead."
        datasets={[
          {
            name: "Define sharing defaults",
            defaultState: "Access workspace",
            detail: "Dataset owners choose sharing policy, allowed departments, and default delivery level for downstream viewers.",
          },
          {
            name: "Open a department view",
            defaultState: "Operational",
            detail: "Each page is tuned to the primary question that department needs to answer, with only the relevant data surfaced first.",
          },
          {
            name: "Adjust page-level choices",
            defaultState: "Planned",
            detail: "Next step: local layer toggles and view filters without pushing governance decisions into the analysis workflow.",
          },
        ]}
      />

      <section className="launcherGrid">
        {cards.map((card) => (
          <Link key={card.href} href={card.href} className="launcherCard">
            <div className="launcherCardMain">
              <div className="launcherText">
                <p className="launcherEyebrow">{card.eyebrow}</p>
                <h2>{card.title}</h2>
                <p className="launcherBlurb">{card.blurb}</p>
              </div>
              <div className="launcherMeta">
                <span className="previewTag">{card.tag}</span>
                <span className="launcherFocus">Focus: {card.focus}</span>
              </div>
            </div>
            <div className={`previewFrame ${card.preview}`} />
          </Link>
        ))}
      </section>
    </main>
  );
}
