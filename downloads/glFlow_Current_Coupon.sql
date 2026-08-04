SELECT * FROM (

    select
    row_number() over(partition by c.instrument_id order by c.period_start_date desc) rn,
    i.instrument_name,
    i.isin,
    c.period_start_date,
    c.coupon_rate
    
    FROM glf.coupon c
    left join glf.instrument i on i.instrument_id=c.instrument_id
    
    Where 1=1
    --and c.instrument_id in ('584')
    and c.period_start_date < sysdate
) where rn=1