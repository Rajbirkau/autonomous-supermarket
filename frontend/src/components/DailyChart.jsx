import { dayNames } from '../format.js';

export default function DailyChart({ daily, onOpenDay }) {
  const width = 760;
  const height = 250;
  const left = 44;
  const right = 8;
  const top = 18;
  const bottom = 28;
  const innerW = width - left - right;
  const innerH = height - top - bottom;
  const max = Math.ceil(Math.max(...daily.map((d) => d.customers)) / 100) * 100;
  const step = innerW / daily.length;
  const barW = step * 0.78;
  const xOf = (i) => left + i * step + (step - barW) / 2;
  const y = (v) => top + innerH - (v / max) * innerH;
  const ticks = [];
  for (let v = 0; v <= max; v += 100) ticks.push(v);

  return (
    <svg className="chart" viewBox={'0 0 ' + width + ' ' + height} role="img" aria-label="Customers per day over the 60 simulated days">
      {ticks.map((v) => (
        <g key={v}>
          <line x1={left} x2={width - right} y1={y(v)} y2={y(v)} className="grid-line" />
          <text x={left - 6} y={y(v) + 4} textAnchor="end" className="axis">{v}</text>
        </g>
      ))}
      {daily.map((d, i) => {
        const weekend = d.weekday === 0 || d.weekday === 6;
        const cls = d.eventName ? 'bar bar-event' : weekend ? 'bar bar-weekend' : 'bar bar-weekday';
        const label = 'Day ' + d.day + ' (' + dayNames[d.weekday] + '), ' + d.weather + ': ' + d.customers + ' customers' + (d.eventName ? ' - ' + d.eventName : '') + '. Click to open this Daily Report.';
        return (
          <g key={d.day}>
            <rect x={xOf(i)} y={y(d.customers)} width={barW} height={top + innerH - y(d.customers)} className={cls} onClick={() => onOpenDay(d.day)}>
              <title>{label}</title>
            </rect>
            {(d.day === 1 || d.day % 10 === 0) && (
              <text x={xOf(i) + barW / 2} y={height - 10} textAnchor="middle" className="axis">{d.day}</text>
            )}
          </g>
        );
      })}
      {daily.map((d, i) =>
        d.eventName ? (
          <text key={'event-' + d.day} x={xOf(i) + barW / 2} y={y(d.customers) - 6} textAnchor="middle" className="axis axis-event">Event</text>
        ) : null
      )}
    </svg>
  );
}
