with
params as (
    select
    date '2026-01-01' as report_start_date,
    date '2026-03-31' as report_date
    from dual
    
)

SELECT
case when r.repo_type in ('REPO') then '810400' else '930400' end  as GL,
r.repo_transaction_id,
r.repo_type,
i.instrument_name,
i.isin,
r.instrument_id,
c.customer_name,
r.currency,
round(
case when repo_type in ('REPO') then 1 else -1 end *
(r.maturity_cash_amount-r.start_cash_amount)/
(r.maturity_date-r.start_date)*
(least(r.maturity_date,p.report_date+1)-greatest(r.start_date,p.report_start_date)),2
) as PnL

FROM repo_transaction r
left join glf.instrument i on i.instrument_id=r.instrument_id
left join glf.customer c on c.customer_id=r.customer_id
cross join params p

where 1=1
and r.maturity_date >= p.report_start_date
and r.start_date<= p.report_date

order by
r.start_date
