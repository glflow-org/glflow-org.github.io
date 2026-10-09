-- glFlow Repo P&L Reconciliation
-- Final Solution from the glFlow SQL Playground
WITH params AS (
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
    ROUND(COALESCE(SUM(CASE WHEN type = 'ANAL' THEN pnl END), 0),2) AS anal,
    ROUND(COALESCE(SUM(CASE WHEN type = 'BOOKED' THEN pnl END), 0),2) AS booked,
    ROUND(COALESCE(SUM(CASE WHEN type = 'ANAL' THEN pnl END), 0)
      - COALESCE(SUM(CASE WHEN type = 'BOOKED' THEN pnl END), 0),2) AS diff
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
    currency;
