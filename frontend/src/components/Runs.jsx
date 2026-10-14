import { useEffect, useState } from 'react';
import { getJson } from '../api/client.js';

export default function Runs({ runs, submittedId, currentId, create, onCreate, onSelect }) {
  const [label, setLabel] = useState('Test run');
  const [seed, setSeed] = useState('7');
  const [formError, setFormError] = useState(null);
  const running = create.status === 'running';
  const [readOnly, setReadOnly] = useState(null);

  useEffect(() => {
    getJson('/api/config').then((c) => setReadOnly(c.readOnly)).catch(() => setReadOnly(false));
  }, []);

  const submit = (e) => {
    e.preventDefault();
    const trimmed = label.trim();
    if (trimmed === '' || trimmed.length > 100) {
      setFormError('The label must be 1 to 100 characters.');
      return;
    }
    if (!/^[0-9]+$/.test(seed) || Number(seed) > 4294967295) {
      setFormError('The seed must be a whole number from 0 to 4294967295.');
      return;
    }
    setFormError(null);
    onCreate(trimmed, Number(seed));
  };

  return (
    <>
      <h2 className="part">Simulation runs</h2>

      {readOnly === true && (
        <section className="card">
          <h2>Read-only demo</h2>
          <p>This public demo shows the Submitted Run and lets you explore every screen. Starting new runs is switched off here. To create runs, clone the project and run it locally, as described in the README.</p>
        </section>
      )}
      {readOnly === false && (
      <section className="card">
        <h2>Start a new 60-day run</h2>
        <p>
          A run is one complete 60-day operating history. Starting a run uses the current model and Store Brain rules, takes a few seconds, and is stored separately.
          The Submitted Run and every earlier run are never changed. A different seed gives different customers and weather, so results will differ from the Submitted Run.
        </p>
        <form className="run-form" onSubmit={submit}>
          <label>
            Label
            <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={100} disabled={running} />
          </label>
          <label>
            Seed
            <input value={seed} onChange={(e) => setSeed(e.target.value)} inputMode="numeric" disabled={running} />
          </label>
          <button type="submit" disabled={running}>{running ? 'Running...' : 'Start run'}</button>
        </form>
        {running && (
          <div className="status" role="status">
            <span className="spinner" />
            Simulating 60 days. This takes a few seconds.
          </div>
        )}
        {formError && <p className="fail">{formError}</p>}
        {create.status === 'error' && <p className="fail">The run could not be created: {create.error}</p>}
      </section>
      )}

      <section className="card">
        <h2>Runs in this database</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr><th className="num">Run</th><th>Label</th><th>Status</th><th className="num">Seed</th><th>Created</th><th>Role</th><th></th></tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.run_id}>
                  <td className="num">{r.run_id}</td>
                  <td>{r.label}</td>
                  <td>{r.status}</td>
                  <td className="num">{r.seed}</td>
                  <td>{r.created_at}</td>
                  <td>{r.run_id === submittedId ? 'Submitted Run' : 'Additional run'}</td>
                  <td>
                    {r.run_id === currentId ? (
                      <span className="muted">Viewing</span>
                    ) : r.status === 'COMPLETED' ? (
                      <button className="link" onClick={() => onSelect(r.run_id)}>View this run</button>
                    ) : (
                      <span className="muted">Not complete</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted">Runs cannot be edited or deleted. Each stored run adds several megabytes to the database file.</p>
      </section>
    </>
  );
}
