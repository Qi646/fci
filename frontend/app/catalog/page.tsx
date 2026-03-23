import { resolveViewer } from "../../lib/viewer";
import CatalogBrowser from "./CatalogBrowser";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CatalogPage({ searchParams }: PageProps) {
  const viewer = await resolveViewer(searchParams, "engineering");

  return (
    <main className="sectionShell">
      <header className="pageHeader">
        <div>
          <p className="sectionKicker">Data catalog</p>
          <h1>Browse, join, and audit</h1>
          <p className="sectionLead">
            Search all registered datasets, assign explicit join roles, and watch the audit trail
            update in real time.
          </p>
        </div>
        <div className="pageHeaderMeta">
          <span className="panelMeta">Viewer</span>
          <strong>{viewer.profile.label}</strong>
        </div>
      </header>

      <CatalogBrowser context={viewer.context} />
    </main>
  );
}
