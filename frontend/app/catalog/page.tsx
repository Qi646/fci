import Link from "next/link";
import { resolveViewer } from "../../lib/viewer";
import CatalogBrowser from "./CatalogBrowser";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CatalogPage({ searchParams }: PageProps) {
  const viewer = await resolveViewer(searchParams, "engineering");

  return (
    <main className="sectionShell">
      <header className="sectionHeader">
        <div>
          <p className="sectionKicker">Data catalog</p>
          <h1>Browse, join, and audit</h1>
          <p className="sectionLead">
            Search all registered datasets, fire cross-department joins with one click,
            and watch the audit trail update in real time.
          </p>
        </div>
        <Link className="backLink" href="/">
          Back to views
        </Link>
      </header>

      <CatalogBrowser context={viewer.context} />
    </main>
  );
}
