const KINDS = ['Problem', 'Trade-off', 'Limitation'];

const STEPS = [
  ['observation', 'Observation'],
  ['evidence', 'Evidence'],
  ['diagnosis', 'Diagnosis'],
  ['implication', 'Business implication'],
  ['recommendation', 'Recommendation']
];

function Step({ label, children }) {
  return (
    <div className="finding-step">
      <div className="finding-label">{label}</div>
      <div>{children}</div>
    </div>
  );
}

export default function Findings({ result }) {
  return (
    <>
      <h2 className="part">Part 3 - What should the client consider next?</h2>
      {result.note && <div className="note">{result.note}</div>}
      {result.findings === null ? (
        <section className="card">
          <p>Written findings could not be produced for this run.</p>
        </section>
      ) : (
        result.findings.map((f, i) => (
          <section className="card" key={f.title}>
            <h2>
              <span className="tag">{KINDS[i] || 'Finding'}</span> Finding {i + 1}: {f.title}
            </h2>
            {STEPS.map(([key, label]) => (
              <Step key={key} label={label}>
                {Array.isArray(f[key]) ? (
                  <ul>
                    {f[key].map((line, j) => (
                      <li key={j}>{line}</li>
                    ))}
                  </ul>
                ) : (
                  f[key]
                )}
              </Step>
            ))}
            <Step label="Model limitation">
              <span className="muted">{f.limitation}</span>
            </Step>
          </section>
        ))
      )}
      <p className="muted">
        Every figure in these findings is computed from the stored history of the run. The wording is an interpretation of that evidence, and real operating data would be needed to validate it.
      </p>
    </>
  );
}
