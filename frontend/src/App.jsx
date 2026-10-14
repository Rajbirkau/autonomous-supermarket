import { useEffect, useState } from 'react';
import { getJson, postJson } from './api/client.js';
import { dayNames } from './format.js';
import { Loading, ErrorBox } from './components/Status.jsx';
import Nav from './components/Nav.jsx';
import Declaration from './components/Declaration.jsx';
import Report from './components/Report.jsx';
import Findings from './components/Findings.jsx';
import DailyReport from './components/DailyReport.jsx';
import Assurance from './components/Assurance.jsx';
import Runs from './components/Runs.jsx';
import TransactionList from './components/TransactionList.jsx';
import TracePanel from './components/TracePanel.jsx';

const DAYS = 60;
const PAGE_SIZE = 50;
const LOADING = { key: null, status: 'loading', payload: null, error: null };

function endpoints(view, runId, day) {
  const base = '/api/runs/' + runId;
  if (view === 'declaration') return { config: base + '/config', products: base + '/products' };
  if (view === 'report') return { report: base + '/report' };
  if (view === 'findings') return { findings: base + '/findings' };
  if (view === 'daily') return { day: base + '/days/' + day };
  if (view === 'runs') return { runs: '/api/runs' };
  return { assurance: base + '/assurance' };
}

export default function App() {
  const [header, setHeader] = useState({ status: 'loading', run: null, submittedId: null, error: null });
  const [selectedId, setSelectedId] = useState(null);
  const [view, setView] = useState('report');
  const [day, setDay] = useState(1);
  const [txOffset, setTxOffset] = useState(0);
  const [drill, setDrill] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [create, setCreate] = useState({ status: 'idle', error: null });
  const [data, setData] = useState(LOADING);
  const [txPage, setTxPage] = useState(LOADING);
  const [drillData, setDrillData] = useState(LOADING);

  useEffect(() => {
    let cancelled = false;
    setHeader({ status: 'loading', run: null, submittedId: null, error: null });
    getJson('/api/submitted')
      .then((s) => {
        const id = selectedId === null ? s.runId : selectedId;
        const run = id === null ? Promise.resolve(null) : getJson('/api/runs/' + id);
        return run.then((r) => ({ run: r, submittedId: s.runId }));
      })
      .then(({ run, submittedId }) => {
        if (!cancelled) setHeader({ status: 'ready', run, submittedId, error: null });
      })
      .catch((err) => {
        if (!cancelled) setHeader({ status: 'error', run: null, submittedId: null, error: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey, selectedId]);

  const runId = header.run ? header.run.run_id : null;
  const dataKey = view + ':' + runId + ':' + (view === 'daily' ? day : '');
  const txKey = runId + ':' + day + ':' + txOffset;
  const drillKey = drill === null ? '' : runId + ':' + drill.kind + ':' + drill.id;

  useEffect(() => {
    if (runId === null) return undefined;
    let cancelled = false;
    setData({ key: dataKey, status: 'loading', payload: null, error: null });
    const wanted = endpoints(view, runId, day);
    const names = Object.keys(wanted);
    Promise.all(names.map((name) => getJson(wanted[name])))
      .then((results) => {
        if (cancelled) return;
        const payload = names.length === 1 ? results[0] : Object.fromEntries(names.map((n, i) => [n, results[i]]));
        setData({ key: dataKey, status: 'ready', payload, error: null });
      })
      .catch((err) => {
        if (!cancelled) setData({ key: dataKey, status: 'error', payload: null, error: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, [runId, view, day, reloadKey]);

  useEffect(() => {
    if (runId === null || view !== 'daily') return undefined;
    let cancelled = false;
    setTxPage({ key: txKey, status: 'loading', payload: null, error: null });
    getJson('/api/runs/' + runId + '/days/' + day + '/transactions?limit=' + PAGE_SIZE + '&offset=' + txOffset)
      .then((payload) => {
        if (!cancelled) setTxPage({ key: txKey, status: 'ready', payload, error: null });
      })
      .catch((err) => {
        if (!cancelled) setTxPage({ key: txKey, status: 'error', payload: null, error: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, [runId, view, day, txOffset, reloadKey]);

  useEffect(() => {
    if (runId === null || drill === null) return undefined;
    let cancelled = false;
    setDrillData({ key: drillKey, status: 'loading', payload: null, error: null });
    const path = drill.kind === 'product'
      ? '/api/runs/' + runId + '/products/' + encodeURIComponent(drill.id)
      : '/api/runs/' + runId + '/transactions/' + drill.id;
    getJson(path)
      .then((payload) => {
        if (!cancelled) setDrillData({ key: drillKey, status: 'ready', payload, error: null });
      })
      .catch((err) => {
        if (!cancelled) setDrillData({ key: drillKey, status: 'error', payload: null, error: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, [runId, drill, reloadKey]);

  const retry = () => setReloadKey((k) => k + 1);
  const changeDay = (d) => {
    setDay(d);
    setTxOffset(0);
  };
  const openDay = (d) => {
    changeDay(d);
    setView('daily');
    setDrill(null);
    window.scrollTo({ top: 0 });
  };
  const openProduct = (id) => {
    setDrill({ kind: 'product', id });
    window.scrollTo({ top: 0 });
  };
  const openTransaction = (id) => {
    setDrill({ kind: 'transaction', id });
    window.scrollTo({ top: 0 });
  };
  const selectRun = (id) => {
    setSelectedId(id);
    setDrill(null);
    setDay(1);
    setTxOffset(0);
    setView('report');
    window.scrollTo({ top: 0 });
  };
  const createRun = async (label, seed) => {
    setCreate({ status: 'running', error: null });
    try {
      const result = await postJson('/api/runs', { label, seed });
      setCreate({ status: 'idle', error: null });
      selectRun(result.runId);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setCreate({ status: 'error', error: err.message });
    }
  };

  if (header.status === 'loading') return <div className="app"><Loading what="the run" /></div>;
  if (header.status === 'error') return <div className="app"><ErrorBox message={header.error} onRetry={retry} /></div>;
  if (header.run === null) {
    return <div className="app"><div className="status">No Submitted Run has been selected yet.</div></div>;
  }

  const run = header.run;
  const isSubmitted = run.run_id === header.submittedId;
  const shown = data.key === dataKey ? data : LOADING;
  const txShown = txPage.key === txKey ? txPage : LOADING;
  const drillShown = drillData.key === drillKey ? drillData : LOADING;

  return (
    <div className="app">
      <header className="header">
        <h1>Autonomous Supermarket</h1>
        {isSubmitted ? (
          <span className="badge">Submitted Run {run.run_id}</span>
        ) : (
          <span className="badge badge-warn">Run {run.run_id} (not the Submitted Run)</span>
        )}
        <span className="sub">{run.label} - {run.daysRetained} of {run.simulation_days} days retained</span>
        {!isSubmitted && header.submittedId !== null && (
          <button className="link" onClick={() => selectRun(null)}>Back to the Submitted Run</button>
        )}
      </header>
      <Nav view={view} onSelect={setView} />
      {drill !== null && (
        <TracePanel drill={drill} state={drillShown} onClose={() => setDrill(null)} onOpenDay={openDay} onOpenProduct={openProduct} onRetry={retry} />
      )}
      {view === 'daily' && (
        <div className="toolbar">
          <button onClick={() => changeDay(Math.max(1, day - 1))} disabled={day === 1}>Previous day</button>
          <select value={day} onChange={(e) => changeDay(Number(e.target.value))} aria-label="Select a day">
            {Array.from({ length: DAYS }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>Day {d} ({dayNames[d % 7]})</option>
            ))}
          </select>
          <button onClick={() => changeDay(Math.min(DAYS, day + 1))} disabled={day === DAYS}>Next day</button>
        </div>
      )}
      {shown.status === 'loading' && <Loading what={view === 'daily' ? 'Day ' + day : 'this view'} />}
      {shown.status === 'error' && <ErrorBox message={shown.error} onRetry={retry} />}
      {shown.status === 'ready' && view === 'declaration' && <Declaration config={shown.payload.config} products={shown.payload.products} />}
      {shown.status === 'ready' && view === 'report' && <Report report={shown.payload} onOpenDay={openDay} onOpenProduct={openProduct} />}
      {shown.status === 'ready' && view === 'findings' && <Findings result={shown.payload} />}
      {shown.status === 'ready' && view === 'daily' && <DailyReport report={shown.payload} onOpenProduct={openProduct} />}
      {shown.status === 'ready' && view === 'daily' && (
        <TransactionList day={day} state={txShown} offset={txOffset} pageSize={PAGE_SIZE} onPage={setTxOffset} onOpenTransaction={openTransaction} onRetry={retry} />
      )}
      {shown.status === 'ready' && view === 'assurance' && <Assurance result={shown.payload} />}
      {shown.status === 'ready' && view === 'runs' && (
        <Runs runs={shown.payload} submittedId={header.submittedId} currentId={run.run_id} create={create} onCreate={createRun} onSelect={selectRun} />
      )}
    </div>
  );
}
