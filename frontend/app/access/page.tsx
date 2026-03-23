import AccessWorkspace from "../../components/AccessWorkspace";
import { resolveViewer } from "../../lib/viewer";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AccessPage({ searchParams }: PageProps) {
  const viewer = await resolveViewer(searchParams, "admin");

  return (
    <main className="sectionShell">
      <header className="pageHeader">
        <div>
          <p className="sectionKicker">Access</p>
          <h1>Sharing and default access</h1>
          <p className="sectionLead">
            This is where dataset owners and stewards decide who can use a dataset and whether
            other departments should see full detail, hidden personal fields, or summary-only
            views by default.
          </p>
        </div>
        <div className="pageHeaderMeta">
          <span className="panelMeta">Viewer</span>
          <strong>{viewer.profile.label}</strong>
        </div>
      </header>

      <AccessWorkspace context={viewer.context} />
    </main>
  );
}
