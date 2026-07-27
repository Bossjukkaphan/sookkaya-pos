-- ค่ามือรายวันรวมทุกหมอ — หน้าวิเคราะห์รายจ่ายต้องใช้ค่ามือที่ "เกิดจากงานจริง"
-- ไม่ใช่ยอดที่จ่ายออกเป็นงวด (ยอดจ่ายขึ้นกับว่างวดไหนตกวันไหน ไม่ได้บอกเรื่องต้นทุน)
--
-- ทำไมต้องมี view: v_therapist_daily มี 1 แถวต่อหมอต่อวัน (~900 แถวใน 4 เดือน)
-- PostgREST คืนได้สูงสุด 1,000 แถว ถ้าร้านโตจะเกินลิมิตแล้วตัวเลขหายเงียบโดยไม่ error
--
-- security_invoker = true บังคับเสมอ — ชุดตรวจ reconciliation ข้อ
-- views_without_security_invoker ต้องเป็น 0 ไม่งั้นพนักงานยิง REST API อ่านได้เกินสิทธิ์
create view public.v_commission_daily
with (security_invoker = true) as
select work_date,
       sum(total_income) as commission
from public.v_therapist_daily
where work_date is not null
group by work_date;
