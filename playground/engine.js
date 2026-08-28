import * as duckdb from "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.30.0/+esm";

/*
  glFlow browser SQL engine — full GLF demo database
  --------------------------------------------------
  The UI talks only to this execution layer. V1 loads the exported GLF demo
  tables into DuckDB-Wasm. A later backend version can replace this class while
  keeping the playground interface and tutorial links unchanged.
*/

const TABLES = [
  ['calendar', 'calendar.csv'],
  ['coupon', 'coupon.csv'],
  ['customer', 'customer.csv'],
  ['fx_rate', 'fx_rate.csv'],
  ['gl_account', 'gl_account.csv'],
  ['gl_account_mapping', 'gl_account_mapping.csv'],
  ['gl_entry', 'gl_entry.csv'],
  ['instrument', 'instrument.csv'],
  ['market_price', 'market_price.csv'],
  ['repo_gl_mapping', 'repo_gl_mapping.csv'],
  ['repo_transaction', 'repo_transaction.csv'],
  ['security_transaction', 'security_transaction.csv'],
  ['seed_currency', 'seed_currency.csv'],
  ['seed_issuer', 'seed_issuer.csv'],
  ['seed_market', 'seed_market.csv']
];

export class BrowserSqlEngine {
  constructor() { this.db = null; this.conn = null; }

  async init(onProgress = null) {
    const progress = (message) => { if (onProgress) onProgress(message); };
    progress('Starting SQL engine…');
    const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles());
    const workerUrl = URL.createObjectURL(new Blob([
      `importScripts("${bundle.mainWorker}");`
    ], { type: 'text/javascript' }));
    const worker = new Worker(workerUrl);
    this.db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(), worker);
    await this.db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    URL.revokeObjectURL(workerUrl);
    this.conn = await this.db.connect();

    await this.conn.query(`CREATE SCHEMA IF NOT EXISTS glf;`);

    for (let i = 0; i < TABLES.length; i++) {
      const [table, file] = TABLES[i];
      progress(`Loading GLF database… ${i + 1}/${TABLES.length}`);
      if (table === 'market_price') {
        // The Oracle demo table is currently empty; preserve its real structure.
        await this.conn.query(`CREATE OR REPLACE TABLE market_price (
          price_date DATE,
          instrument_id BIGINT,
          market_price DECIMAL(18,6)
        );`);
      } else {
        const url = new URL(`./data/${file}`, import.meta.url);
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Could not load ${file} (${response.status}).`);
        const bytes = new Uint8Array(await response.arrayBuffer());
        const virtualName = `glf_${file}`;
        await this.db.registerFileBuffer(virtualName, bytes);
        await this.conn.query(`CREATE OR REPLACE TABLE ${table} AS
          SELECT * FROM read_csv_auto('${virtualName}', header = true, sample_size = -1, nullstr = '');`);
      }
      await this.conn.query(`CREATE OR REPLACE VIEW glf.${table} AS SELECT * FROM main.${table};`);
    }
    progress('GLF database ready');
  }

  validate(sql) {
    const cleaned = sql.trim().replace(/--.*$/gm, '').trim();
    if (!cleaned) throw new Error('Enter a SQL query first.');
    const statements = cleaned.split(';').map(s => s.trim()).filter(Boolean);
    if (statements.length > 1) throw new Error('Run one SQL statement at a time.');
    const first = statements[0].match(/^([a-zA-Z]+)/)?.[1]?.toUpperCase();
    const allowed = new Set(['SELECT','WITH','SHOW','DESCRIBE','DESC','EXPLAIN']);
    if (!allowed.has(first)) throw new Error('This learning playground is read-only. Use SELECT, WITH, SHOW, DESCRIBE or EXPLAIN.');
    return statements[0];
  }

  async execute(sql) {
    const query = this.validate(sql);
    const started = performance.now();
    const result = await this.conn.query(query);
    const elapsedMs = performance.now() - started;
    const columns = result.schema.fields.map(field => field.name);
    const rows = result.toArray().map(row => columns.map(col => row[col]));
    return { columns, rows, elapsedMs };
  }

  async reset(onProgress = null) {
    if (this.conn) await this.conn.close();
    if (this.db) await this.db.terminate();
    this.db = null; this.conn = null;
    await this.init(onProgress);
  }
}
