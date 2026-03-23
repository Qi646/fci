import { resolveViewer } from "../../lib/viewer";
import TopologyDiagram from "./TopologyDiagram";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TopologyPage({ searchParams }: PageProps) {
  const viewer = await resolveViewer(searchParams, "engineering");

  return (
    <main className="sectionShell">
      <header className="pageHeader">
        <div>
          <p className="sectionKicker">Data mesh</p>
          <h1>Federation topology</h1>
          <p className="sectionLead">
            Departments as nodes, data connections as edges. When a cross-department
            query fires, the relevant edge lights up - an architecture diagram that is alive.
          </p>
        </div>
        <div className="pageHeaderMeta">
          <span className="panelMeta">Viewer</span>
          <strong>{viewer.profile.label}</strong>
        </div>
      </header>

      <section
        className="panelCard"
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
