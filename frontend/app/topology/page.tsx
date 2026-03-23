import Link from "next/link";
import { resolveViewer } from "../../lib/viewer";
import TopologyDiagram from "./TopologyDiagram";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TopologyPage({ searchParams }: PageProps) {
  const viewer = await resolveViewer(searchParams, "engineering");

  return (
    <main className="sectionShell">
      <header className="sectionHeader">
        <div>
          <p className="sectionKicker">Data mesh</p>
          <h1>Federation topology</h1>
          <p className="sectionLead">
            Departments as nodes, data connections as edges. When a cross-department
            query fires, the relevant edge lights up - an architecture diagram that is alive.
          </p>
        </div>
        <Link className="backLink" href="/">
          Back to views
        </Link>
      </header>

      <section
        className="card"
        style={{
          padding: 0,
          overflow: "hidden",
          height: "min(72vh, 760px)",
          minHeight: 620,
        }}
      >
        <TopologyDiagram />
      </section>
    </main>
  );
}
