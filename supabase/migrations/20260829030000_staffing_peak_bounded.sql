-- peak CTE ใน v_staffing_daily: เปลี่ยน correlated subquery (สแกน q ทั้งประวัติต่อทุกแถว
-- O(n²) — 57ms ที่คิว 705 แถว และโตยกกำลังสอง) เป็น self-join ด้วย queue_date ให้ Postgres
-- hash join แบ่งงานเป็นรายวัน — งานต่อวันถูก bound ด้วยความจุร้าน ไม่ใช่ความยาวประวัติ (7.5ms)
-- ความหมายเดิมเป๊ะ: จุดวัด = เวลาเริ่มของแต่ละคิว นับหมอไม่ซ้ำที่ครองช่วงเวลานั้น
-- ตรวจแล้วผลตรงกับตัวเดิมครบทั้ง 38 วันของข้อมูลจริง (29 ส.ค. 2569)
--
-- ส่วนอื่นของ view คงเดิมทุกบรรทัด (create or replace ต้องส่งทั้งตัว)

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
  -- join ด้วย queue_date เพื่อให้แต่ละวันเทียบเฉพาะคิวของวันตัวเอง
  select queue_date, max(cnt) as peak_concurrent_therapists
  from (
    select a.queue_date, a.start_min, count(distinct b.therapist_id) as cnt
    from (select distinct queue_date, start_min from q) a
    join q b on b.queue_date = a.queue_date
            and b.start_min <= a.start_min
            and b.start_min + b.duration_min > a.start_min
    group by a.queue_date, a.start_min
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
  round(coalesce(sal.revenue, 0) / nullif(att.therapists_checked_in, 0)) as revenue_per_therapist,
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
