type Metric = {
  label: string;
  value: string | number;
  tone?: "default" | "warning" | "critical";
};

export default function MetricStrip({ metrics }: { metrics: Metric[] }) {
  return (
    <section className="metricStrip" aria-label="Key metrics">
      {metrics.map((metric) => (
        <article key={metric.label} className={`metricCard${metric.tone ? ` ${metric.tone}` : ""}`}>
          <span>{metric.label}</span>
          <strong>{metric.value}</strong>
        </article>
      ))}
    </section>
  );
}
