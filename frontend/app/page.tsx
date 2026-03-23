import Link from "next/link";
import { API_BASE, accessProfiles, fetchJson } from "../lib/api";
import { resolveViewer } from "../lib/viewer";
import { operationalViews } from "../lib/views";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Home({ searchParams }: PageProps) {
  const viewer = await resolveViewer(searchParams, "publicPortal");
  const health = await fetchJson<{ status: string }>("/health", accessProfiles.publicPortal);
  const apiReachable = Boolean(health?.status === "ok");
  const activeParams = new URLSearchParams();
  activeParams.set("profile", viewer.profileKey);
  activeParams.set("purpose", viewer.purpose);

  return (
    <main className="sectionShell">
      <header className="pageHeader">
        <div>
          <p className="sectionKicker">Views index</p>
          <h1>Choose the operational question first.</h1>
          <p className="sectionLead">
            Each view has one primary job, one default dataset set, and one analysis frame. The
            workspace rail inside each view handles add/remove decisions and compatibility warnings.
          </p>
        </div>
        <div className="pageHeaderMeta">
          <span className="panelMeta">Default viewer</span>
          <strong>{viewer.profile.label}</strong>
        </div>
      </header>

      {!apiReachable ? (
        <div className="warningBanner">
          The frontend cannot reach the backend at <code>{API_BASE}</code>. Start the API or set{" "}
          <code>NEXT_PUBLIC_API_BASE_URL</code> correctly.
        </div>
      ) : null}

      <section className="indexPanel">
        <div className="indexPanelHeader">
          <h2>Operational views</h2>
          <span className="panelMeta">dense routing table</span>
        </div>
        <div className="viewIndexTableWrap">
          <table className="viewIndexTable">
            <thead>
              <tr>
                <th>Domain</th>
                <th>View</th>
                <th>Primary question</th>
                <th>Default datasets</th>
                <th>Type</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {operationalViews.map((view) => (
                <tr key={view.id}>
                  <td>{view.eyebrow}</td>
                  <td>
                    <strong>{view.title}</strong>
                    <div className="tableSubcopy">{view.description}</div>
                  </td>
                  <td>{view.primaryQuestion}</td>
                  <td>{view.defaultIncludedIds.join(", ")}</td>
                  <td>{view.viewType}</td>
                  <td className="tableActionCell">
                    <Link href={`${view.href}?${activeParams.toString()}`} className="tableActionLink">
                      Open view
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
