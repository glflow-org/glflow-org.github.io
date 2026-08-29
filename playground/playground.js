import { BrowserSqlEngine } from './engine.js';

const EXAMPLES = {
  explore: {
    title: 'Explore instruments',
    start: `SELECT
    instrument_id,
    instrument_name,
    isin,
    instrument_type,
    currency,
    maturity_date
FROM instrument
ORDER BY instrument_id;`,
    solution: null
  },
  'current-coupon': {
    title: 'Select the current coupon',
    start: `SELECT
i.instrument_name,
i.isin,
c.period_start_date,
c.coupon_rate

FROM glf.coupon c
LEFT JOIN glf.instrument i
  ON i.instrument_id = c.instrument_id

WHERE 1=1;`,
    solution: `SELECT * FROM (
    SELECT
        ROW_NUMBER() OVER (
            PARTITION BY c.instrument_id
            ORDER BY c.period_start_date DESC
        ) AS rn,
        i.instrument_name,
        i.isin,
        c.period_start_date,
        c.coupon_rate
    FROM glf.coupon c
    LEFT JOIN glf.instrument i
      ON i.instrument_id = c.instrument_id
    WHERE 1=1
      -- Oracle tutorial equivalent: c.period_start_date < SYSDATE
      AND c.period_start_date < CURRENT_DATE
) x
WHERE rn = 1;`
  },
  'repo-pnl': {
    title: 'Calculate Repo P&L',
    start: `SELECT
CASE WHEN r.repo_type IN ('REPO') THEN '810400' ELSE '930400' END AS gl,
r.repo_transaction_id,
r.repo_type,
i.instrument_name,
i.isin,
r.instrument_id,
c.customer_name,
r.currency,
r.start_cash_amount,
r.maturity_cash_amount,
r.start_date,
r.maturity_date

FROM repo_transaction r
LEFT JOIN glf.instrument i
  ON i.instrument_id = r.instrument_id
LEFT JOIN glf.customer c
  ON c.customer_id = r.customer_id
WHERE 1=1;`,
    solution: `WITH params AS (
    SELECT
        DATE '2026-01-01' AS report_start_date,
        DATE '2026-03-31' AS report_date
)
SELECT
    CASE WHEN r.repo_type IN ('REPO') THEN '810400' ELSE '930400' END AS gl,
    r.repo_transaction_id,
    r.repo_type,
    i.instrument_name,
    i.isin,
    r.instrument_id,
    c.customer_name,
    r.currency,
    ROUND(
        CASE WHEN r.repo_type IN ('REPO') THEN 1 ELSE -1 END
        * (r.maturity_cash_amount - r.start_cash_amount)
        / (r.maturity_date - r.start_date)
        * (
            LEAST(r.maturity_date, p.report_date + 1)
            - GREATEST(r.start_date, p.report_start_date)
          ),
        2
    ) AS pnl
FROM repo_transaction r
LEFT JOIN glf.instrument i
  ON i.instrument_id = r.instrument_id
LEFT JOIN glf.customer c
  ON c.customer_id = r.customer_id
CROSS JOIN params p
WHERE 1=1
  AND r.maturity_date >= p.report_start_date
  AND r.start_date <= p.report_date
ORDER BY r.start_date;`
  },
  reconciliation: {
    title: 'P&L reconciliation',
    start: `-- Starting point: the analytical Repo P&L from the previous tutorial.
WITH params AS (
    SELECT
        DATE '2026-01-01' AS report_start_date,
        DATE '2026-03-31' AS report_date
)
SELECT
    CASE WHEN r.repo_type IN ('REPO') THEN '810400' ELSE '930400' END AS gl,
    r.repo_transaction_id,
    r.repo_type,
    i.instrument_name,
    i.isin,
    r.currency,
    ROUND(
        CASE WHEN r.repo_type IN ('REPO') THEN 1 ELSE -1 END
        * (r.maturity_cash_amount - r.start_cash_amount)
        / (r.maturity_date - r.start_date)
        * (
            LEAST(r.maturity_date, p.report_date + 1)
            - GREATEST(r.start_date, p.report_start_date)
          ),
        2
    ) AS pnl
FROM repo_transaction r
LEFT JOIN glf.instrument i
  ON i.instrument_id = r.instrument_id
CROSS JOIN params p
WHERE r.maturity_date >= p.report_start_date
  AND r.start_date <= p.report_date;`,
    solution: `WITH params AS (
    SELECT
        DATE '2026-01-01' AS report_start_date,
        DATE '2026-03-31' AS report_date
),
analytical_balance AS (
    SELECT
        'ANAL' AS type,
        CASE WHEN r.repo_type IN ('REPO') THEN '810400' ELSE '930400' END AS gl,
        i.instrument_name,
        i.isin,
        r.currency,
        COALESCE(SUM(
            CASE WHEN r.repo_type IN ('REPO') THEN 1 ELSE -1 END
            * ROUND(
                (r.maturity_cash_amount - r.start_cash_amount)
                / (r.maturity_date - r.start_date)
                * (
                    LEAST(r.maturity_date, p.report_date + 1)
                    - GREATEST(r.start_date, p.report_start_date)
                  ),
                2
              )
        ), 0) AS pnl
    FROM repo_transaction r
    LEFT JOIN glf.instrument i
      ON i.instrument_id = r.instrument_id
    LEFT JOIN glf.customer c
      ON c.customer_id = r.customer_id
    CROSS JOIN params p
    WHERE 1=1
      AND r.maturity_date >= p.report_start_date
      AND r.start_date <= p.report_date
    GROUP BY
        CASE WHEN r.repo_type IN ('REPO') THEN '810400' ELSE '930400' END,
        i.instrument_name,
        i.isin,
        r.currency
),
booked_balance AS (
    SELECT
        'BOOKED' AS type,
        e.gl_account AS gl,
        i.instrument_name,
        i.isin,
        e.currency,
        COALESCE(SUM(
            CASE WHEN e.debit_credit = 'D'
                 THEN e.amount_fcy
                 ELSE -e.amount_fcy END
        ), 0) AS pnl
    FROM glf.gl_entry e
    LEFT JOIN glf.instrument i
      ON i.instrument_id = e.instrument_id
    CROSS JOIN params p
    WHERE 1=1
      AND e.gl_account IN ('810400','930400')
      AND e.posting_date >= p.report_start_date
      AND e.posting_date <= p.report_date
    GROUP BY
        e.gl_account,
        i.instrument_name,
        i.isin,
        e.currency
),
recon AS (
    SELECT * FROM analytical_balance
    UNION ALL
    SELECT * FROM booked_balance
)
SELECT
    gl,
    instrument_name,
    isin,
    currency,
    COALESCE(SUM(CASE WHEN type = 'ANAL' THEN pnl END), 0) AS anal,
    COALESCE(SUM(CASE WHEN type = 'BOOKED' THEN pnl END), 0) AS booked,
    COALESCE(SUM(CASE WHEN type = 'ANAL' THEN pnl END), 0)
      - COALESCE(SUM(CASE WHEN type = 'BOOKED' THEN pnl END), 0) AS diff
FROM recon
GROUP BY
    gl,
    instrument_name,
    isin,
    currency
ORDER BY
    gl,
    instrument_name,
    isin,
    currency;`
  }
};

const editor = document.getElementById('sql-editor');
const runButton = document.getElementById('run-button');
const resetButton = document.getElementById('reset-button');
const resultContainer = document.getElementById('result-container');
const resultMeta = document.getElementById('result-meta');
const resultBadge = document.getElementById('result-badge');
const messageBox = document.getElementById('message-box');
const engineStatus = document.getElementById('engine-status');
const engineDot = document.getElementById('engine-dot');
const exampleTitle = document.getElementById('example-title');
const lineNumbers = document.getElementById('line-numbers');
const modeToggle = document.getElementById('query-mode-toggle');
const startButton = document.getElementById('starting-point-button');
const solutionButton = document.getElementById('final-solution-button');
const engine = new BrowserSqlEngine();
let activeExample = 'explore';
let activeMode = 'start';

function trackEvent(eventName, params = {}) {
  if (typeof window.gtag === 'function') {
    window.gtag('event', eventName, params);
  }
}  

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}
function formatCell(value, columnName = '') {
  if (value === null || value === undefined) return '<span class="sql-null">NULL</span>';
  if (value instanceof Date) return value.toISOString().slice(0,10);
  const columnLooksLikeDate = /(^|_)date$/i.test(columnName);
  if (columnLooksLikeDate && (typeof value === 'number' || typeof value === 'bigint')) {
    const millis = Number(value);
    if (Number.isFinite(millis)) return new Date(millis).toISOString().slice(0,10);
  }
  if (typeof value === 'bigint') return value.toString();
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) return escapeHtml(text.slice(0,10));
  return escapeHtml(text);
}
function updateLineNumbers() {
  const count = Math.max(1, editor.value.split('\n').length);
  lineNumbers.textContent = Array.from({length:count}, (_,i)=>i+1).join('\n');
}
function setMessage(text, type='error') {
  if (!text) { messageBox.hidden = true; return; }
  messageBox.hidden = false;
  messageBox.className = `query-message ${type}`;
  messageBox.textContent = text;
}
function clearResults(message = 'Run this query to see the result') {
  resultContainer.innerHTML = `<div class="empty-results"><strong>Query loaded.</strong><span>${escapeHtml(message)}</span></div>`;
  resultMeta.textContent = 'Run a query to see the result';
  resultBadge.textContent = 'Ready';
  resultBadge.className = 'result-badge';
}
function currentSql(example) {
  if (activeMode === 'solution' && example.solution) return example.solution;
  return example.start;
}
function updateModeUi(example) {
  const hasSolution = Boolean(example.solution);
  modeToggle.hidden = !hasSolution;
  startButton.classList.toggle('active', activeMode === 'start');
  solutionButton.classList.toggle('active', activeMode === 'solution');
  startButton.setAttribute('aria-pressed', String(activeMode === 'start'));
  solutionButton.setAttribute('aria-pressed', String(activeMode === 'solution'));
}
function setMode(mode) {
  const example = EXAMPLES[activeExample];
  if (!example || !example.solution) return;
  activeMode = mode === 'solution' ? 'solution' : 'start';
  editor.value = currentSql(example);
  updateModeUi(example);
  updateLineNumbers();
  setMessage('');
  clearResults(activeMode === 'start' ? 'Starting point loaded — build the query from here.' : 'Final solution loaded — run it or compare it with your code.');

  if (activeMode === 'solution') {
    trackEvent('playground_solution_view', {
      example: activeExample
    });
  }

  editor.focus();
}
function selectExample(key, updateUrl=true) {
  const example = EXAMPLES[key] || EXAMPLES.explore;
  activeExample = EXAMPLES[key] ? key : 'explore';
  activeMode = example.solution ? 'start' : 'start';
  editor.value = currentSql(example);
  exampleTitle.textContent = example.title;
  updateModeUi(example);
  updateLineNumbers();
  document.querySelectorAll('.example-button').forEach(btn => btn.classList.toggle('active', btn.dataset.example === activeExample));
  if (updateUrl) {
  history.replaceState(null,'',`?example=${encodeURIComponent(activeExample)}`);

  trackEvent('playground_example_select', {
    example: activeExample
  });
}
  setMessage('');
  clearResults(example.solution ? `${example.title} starting point is ready.` : `${example.title} is ready to run.`);
  editor.focus();
}
function loadTable(table) {
  activeExample = '';
  activeMode = 'start';
  editor.value = `SELECT *\nFROM ${table}\nLIMIT 50;`;
  exampleTitle.textContent = `Explore ${table}`;
  modeToggle.hidden = true;
  updateLineNumbers();
  document.querySelectorAll('.example-button').forEach(b=>b.classList.remove('active'));
  history.replaceState(null,'','./');
  setMessage('');
  setMessage('');
  clearResults(`Explore ${table} is ready to run.`);

  trackEvent('playground_table_select', {
    table_name: table
  });

  editor.focus();
}
function renderResult({columns, rows, elapsedMs}) {
  if (!columns.length) {
    resultContainer.innerHTML = '<div class="empty-results"><strong>Query completed.</strong><span>No result columns were returned.</span></div>';
  } else if (!rows.length) {
    resultContainer.innerHTML = '<div class="empty-results"><strong>0 rows returned.</strong><span>The query ran successfully but did not match any rows.</span></div>';
  } else {
    const head = columns.map(c => `<th>${escapeHtml(c)}</th>`).join('');
    const body = rows.map(row => `<tr>${row.map((v,i)=>`<td>${formatCell(v, columns[i])}</td>`).join('')}</tr>`).join('');
    resultContainer.innerHTML = `<table class="result-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
  }
  resultMeta.textContent = `${rows.length} row${rows.length===1?'':'s'} · ${elapsedMs.toFixed(1)} ms`;
  resultBadge.textContent = 'Success';
  resultBadge.className = 'result-badge success';
}
async function runQuery() {
  setMessage('');

  trackEvent('playground_query_run', {
    example: activeExample || 'table',
    mode: activeMode
  });

  runButton.disabled = true;
  runButton.textContent = 'Running…';
  resultBadge.textContent = 'Running'; resultBadge.className = 'result-badge running';
  const started=performance.now();
  try {
    const result = await engine.execute(editor.value);
    renderResult(result);
  } catch(err) {
    resultMeta.textContent = `Query stopped · ${(performance.now()-started).toFixed(1)} ms`;
    resultBadge.textContent = 'Error'; resultBadge.className = 'result-badge error';
    setMessage(err?.message || String(err));
  } finally {
    runButton.disabled = false; runButton.textContent = '▶ Run Query';
  }
}

editor.addEventListener('input', updateLineNumbers);
editor.addEventListener('scroll', ()=>{ lineNumbers.scrollTop = editor.scrollTop; });
editor.addEventListener('keydown', e=>{ if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();runQuery();} if(e.key==='Tab'){e.preventDefault();const s=editor.selectionStart,end=editor.selectionEnd;editor.value=editor.value.slice(0,s)+'    '+editor.value.slice(end);editor.selectionStart=editor.selectionEnd=s+4;updateLineNumbers();} });
runButton.addEventListener('click', runQuery);
startButton.addEventListener('click', ()=>setMode('start'));
solutionButton.addEventListener('click', ()=>setMode('solution'));
resetButton.addEventListener('click', ()=>selectExample(activeExample || 'explore', false));
document.querySelectorAll('.example-button').forEach(btn=>btn.addEventListener('click',()=>selectExample(btn.dataset.example)));
document.querySelectorAll('.table-button').forEach(btn=>btn.addEventListener('click',()=>loadTable(btn.dataset.table)));

const params=new URLSearchParams(location.search);
selectExample(params.get('example') || 'explore', false);

(async()=>{
  try {
    runButton.disabled = true;
    await engine.init((message)=>{ engineStatus.textContent = message; });
    engineStatus.textContent='GLF database ready';
    engineDot.classList.add('ready');
    runButton.disabled=false;
    resultBadge.textContent='Ready';
  } catch(err) {
    engineStatus.textContent='Could not load GLF database';
    engineDot.classList.add('error');
    resultBadge.textContent='Offline'; resultBadge.className='result-badge error';
    setMessage('The browser SQL engine or GLF data could not load. Check your connection and open the playground over HTTP/HTTPS.');
    console.error(err);
  }
})();
