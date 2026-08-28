# glFlow website

Static glFlow website for GitHub Pages.

## SQL Playground v1.1

The browser playground uses DuckDB-Wasm and includes a compact version of the core GLF securities demo database.

Core browser tables:
- calendar
- customer
- instrument
- coupon
- security_transaction
- repo_transaction
- market_price
- fx_rate
- gl_account
- gl_account_mapping
- repo_gl_mapping
- gl_entry

The P&L reconciliation example is based on the tutorial reconciliation query and compares calculated repo P&L with booked GL entries at GL / instrument / ISIN / currency level.

The playground execution layer remains separated in `playground/engine.js`, so a later backend/API can replace DuckDB-Wasm without rebuilding the UI.


## v2.4 / SQL Playground v1.2
- Replaced the compact synthetic browser data with the full exported GLF demo dataset (15 tables).
- Added `glf.table` schema views while keeping unqualified table names available.
- Added Starting point / Final solution switching for tutorial queries.
- Current Coupon and Repo P&L starting points are based on the tutorial base SQL files.
- P&L reconciliation uses the real reconciliation query logic and the full GLF data.
- Database Explorer now shows the real GLF table row counts.
