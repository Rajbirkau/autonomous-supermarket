export const VIEWS = [
  { id: 'declaration', label: 'Model Declaration' },
  { id: 'report', label: '60-Day Report' },
  { id: 'findings', label: 'Findings' },
  { id: 'daily', label: 'Daily Reports' },
  { id: 'assurance', label: 'Commercial Assurance' },
  { id: 'runs', label: 'Runs' }
];

export default function Nav({ view, onSelect }) {
  return (
    <nav className="nav" aria-label="Report sections">
      {VIEWS.map((v) => (
        <button key={v.id} className={v.id === view ? 'nav-item active' : 'nav-item'} onClick={() => onSelect(v.id)}>
          {v.label}
        </button>
      ))}
    </nav>
  );
}
