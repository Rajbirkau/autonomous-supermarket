export default function HourChart({ customersByHour, salesByHour }) {
  const hours = [];
  for (let h = 6; h <= 21; h++) hours.push(h);
  const customers = Object.fromEntries(customersByHour.map((r) => [r.hour, r.customers]));
  const sales = Object.fromEntries(salesByHour.map((r) => [r.hour, r]));
  const width = 760;
  const height = 220;
  const left = 44;
  const right = 8;
  const top = 14;
  const bottom = 28;
  const innerW = width - left - right;
  const innerH = height - top - bottom;
  const peak = Math.max(1, ...hours.map((h) => customers[h] || 0));
  const tickStep = peak > 100 ? 50 : 20;
  const max = Math.ceil(peak / tickStep) * tickStep;
  const step = innerW / hours.length;
  const barW = step * 0.7;
  const y = (v) => top + innerH - (v / max) * innerH;
  const ticks = [];
  for (let v = 0; v <= max; v += tickStep) ticks.push(v);

  return (
    <svg className="chart" viewBox={'0 0 ' + width + ' ' + height} role="img" aria-label="Customers by arrival hour">
      {ticks.map((v) => (
        <g key={v}>
          <line x1={left} x2={width - right} y1={y(v)} y2={y(v)} className="grid-line" />
          <text x={left - 6} y={y(v) + 4} textAnchor="end" className="axis">{v}</text>
        </g>
      ))}
      {hours.map((h, i) => {
        const n = customers[h] || 0;
        const x = left + i * step + (step - barW) / 2;
        const t = sales[h] || { transactions: 0, revenueCents: 0 };
        return (
          <g key={h}>
            <rect x={x} y={y(n)} width={barW} height={top + innerH - y(n)} className="bar-weekday">
              <title>{h + ':00 - ' + n + ' customers, ' + t.transactions + ' transactions, A$' + (t.revenueCents / 100).toFixed(2)}</title>
            </rect>
            <text x={x + barW / 2} y={height - 10} textAnchor="middle" className="axis">{h}</text>
          </g>
        );
      })}
    </svg>
  );
}
