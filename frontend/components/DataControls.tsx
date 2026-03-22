type DatasetControl = {
  name: string;
  defaultState: string;
  detail: string;
};

type Props = {
  title?: string;
  summary: string;
  datasets: DatasetControl[];
};

export default function DataControls({
  title = "Data In This View",
  summary,
  datasets,
}: Props) {
  return (
    <section className="dataControls" aria-label="Data view controls">
      <div className="dataControlsHeader">
        <div>
          <p className="sectionKicker">View Controls</p>
          <h2>{title}</h2>
        </div>
        <span className="dataControlsHint">Defaults enforced</span>
      </div>
      <p className="dataControlsSummary">{summary}</p>
      <div className="dataControlsGrid">
        {datasets.map((dataset) => (
          <article key={dataset.name} className="dataControlCard">
            <div className="dataControlTop">
              <strong>{dataset.name}</strong>
              <span className="controlState">{dataset.defaultState}</span>
            </div>
            <p>{dataset.detail}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
