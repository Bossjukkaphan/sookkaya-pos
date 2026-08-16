-- สอง view ของหน้า "จัดกำลังหมอ" (/insights/staffing)
--
-- v_staffing_daily: หนึ่งแถวต่อวันที่มีการเช็คอิน — จำนวนหมอ ยอด peak การใช้หมอพร้อมกัน
-- v_staffing_monthly: สรุปรายเดือนของเกณฑ์ตัดสินจ้างคนที่ 8 ทั้ง 4 ข้อ
--
-- เส้นแบ่งข้อมูลสำคัญ: attendance ก่อน 27 ก.ค. 2569 เติมย้อนหลังจากบิล
-- (created_by = 'ประมาณจากบิลย้อนหลัง') หมอที่มาแต่ไม่มีบิลไม่มีแถวในช่วงนั้น
-- คอลัมน์ is_estimated มีไว้ให้หน้าจอกรอง — idle_therapists ของช่วงประมาณเป็น 0 เทียมเสมอ

create or replace view public.v_staffing_daily
with (security_invoker = true) as
with att as (
  select work_date,
         count(*) as therapists_checked_in,
         bool_or(created_by = 'ประมาณจากบิลย้อนหลัง') as is_estimated
  from public.attendance
  where therapist_id is not null
  group by work_date
),
sal as (
  select sale_date, count(*) as bills, sum(net_amount) as revenue
  from public.sales
  where therapist_id is not null
  group by sale_date
),
shortfall as (
  -- นับจาก v_therapist_daily เพื่อใช้กติกาการันตีตัวเดียวกับหน้า /commission
  select work_date, count(*) as guarantee_shortfall_count
  from public.v_therapist_daily
  where total_commission < guarantee_amount
  group by work_date
),
idle as (
  -- หมอที่เช็คอินแต่ทั้งวันไม่มีบิลสักใบ — สัญญาณจ้างเกิน (มีความหมายเฉพาะเช็คอินจริง)
  select a.work_date, count(*) as idle_therapists
  from public.attendance a
  where a.therapist_id is not null
    and not exists (
      select 1 from public.sales s
      where s.sale_date = a.work_date and s.therapist_id = a.therapist_id)
  group by a.work_date
),
ta as (
  select queue_date, count(*) as turn_away_count
  from public.turn_aways
  group by queue_date
),
q as (
  -- เวลาเริ่มครองคิว: ตรรกะเดียวกับ bedStartMin() — เริ่มจริง (started_at เขตไทย) ถ้ามี
  -- ไม่งั้นเวลาจอง · ช่วงครองคือ [start, start + duration)
  select queue_date, therapist_id,
    (extract(hour from coalesce(started_at at time zone 'Asia/Bangkok',
                                queue_date + start_time)) * 60
     + extract(minute from coalesce(started_at at time zone 'Asia/Bangkok',
                                    queue_date + start_time)))::int as start_min,
    duration_min
  from public.queue_entries
  where status not in ('cancelled', 'rejected') and therapist_id is not null
),
peak as (
  -- จุดสูงสุดของ "หมอไม่ซ้ำที่ติดคิวพร้อมกัน" ในวัน — จุดวัดคือเวลาเริ่มของแต่ละคิว
  -- (ระหว่างสองเวลาเริ่ม จำนวนคิวที่ทับกันไม่เพิ่ม จึงเช็คเฉพาะจุดเริ่มพอ)
  select queue_date, max(cnt) as peak_concurrent_therapists
  from (
    select a.queue_date,
      (select count(distinct b.therapist_id) from q b
        where b.queue_date = a.queue_date
          and b.start_min <= a.start_min
          and b.start_min + b.duration_min > a.start_min) as cnt
    from q a
  ) z
  group by queue_date
)
select
  att.work_date,
  case when extract(isodow from att.work_date) between 1 and 4 then 'mon_thu'
       when extract(isodow from att.work_date) = 5 then 'fri'
       else 'weekend' end                                   as day_class,
  att.therapists_checked_in,
  att.is_estimated,
  coalesce(sal.bills, 0)                                    as bills,
  coalesce(sal.revenue, 0)                                  as revenue,
  round(sal.revenue / nullif(att.therapists_checked_in, 0)) as revenue_per_therapist,
  coalesce(shortfall.guarantee_shortfall_count, 0)          as guarantee_shortfall_count,
  coalesce(idle.idle_therapists, 0)                         as idle_therapists,
  coalesce(ta.turn_away_count, 0)                           as turn_away_count,
  coalesce(peak.peak_concurrent_therapists, 0)              as peak_concurrent_therapists
from att
left join sal       on sal.sale_date  = att.work_date
left join shortfall on shortfall.work_date = att.work_date
left join idle      on idle.work_date = att.work_date
left join ta        on ta.queue_date  = att.work_date
left join peak      on peak.queue_date = att.work_date;

create or replace view public.v_staffing_monthly
with (security_invoker = true) as
select
  to_char(work_date, 'YYYY-MM')                             as month,
  count(*) filter (where day_class = 'weekend')             as weekend_days,
  count(*) filter (where day_class = 'weekend'
    and peak_concurrent_therapists >= therapists_checked_in) as weekend_full_days,
  round(100.0 * count(*) filter (where day_class = 'weekend'
      and peak_concurrent_therapists >= therapists_checked_in)
    / nullif(count(*) filter (where day_class = 'weekend'), 0), 1)
                                                            as weekend_full_pct,
  round(avg(revenue_per_therapist)
    filter (where day_class in ('fri', 'weekend')))         as fri_sun_revenue_per_therapist,
  sum(turn_away_count)                                      as turn_away_total,
  sum(therapists_checked_in)                                as therapist_days,
  sum(guarantee_shortfall_count)                            as guarantee_shortfall_total,
  round(100.0 * sum(guarantee_shortfall_count)
    / nullif(sum(therapists_checked_in), 0), 1)             as guarantee_shortfall_pct,
  count(*) filter (where is_estimated)                      as estimated_days
from public.v_staffing_daily
group by to_char(work_date, 'YYYY-MM');
