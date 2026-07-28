-- ซ่อมการ์ดคิวที่จ่ายเงินแล้วแต่ไม่มีหมอ/เตียง (รันจริงบน production 28/7/2569)
--
-- ต้นเหตุ: ตอนกดชำระเงินจากการ์ดคิว createSale อัปเดตกลับไปที่การ์ดแค่ status กับ sale_id
-- ไม่ได้เขียน therapist_id กับ bed_id กลับด้วย ทั้งที่ฟอร์มเก็บมาและลงบิลเรียบร้อยแล้ว
-- พนักงานที่เลือกหมอตอนกดเก็บเงิน (ไม่ได้เลือกตอนสร้างการ์ด) จึงได้การ์ดค้างอยู่แถว
-- "ยังไม่ระบุหมอ" ทั้งที่บิลถูกต้อง — เกิดทุกวันตั้งแต่เริ่มใช้กระดานคิว 26/7/2569
--
-- เงินไม่เคยผิด: ค่ามือหมอเดินตามบิล ไม่ได้เดินตามการ์ด ที่ผิดคือผังงานบนกระดานอย่างเดียว
-- แก้โค้ดแล้วที่ src/app/(app)/sale-actions.ts · migration นี้ซ่อมของที่ค้างอยู่ 4 ใบ
-- (26/7 เบลล์-แจง · 27/7 ใบใบ-แพท · 27/7 pii-บีบี · 28/7 จิราพิชญ์-แจง)
--
-- coalesce ไม่ใช่การเขียนทับ — เติมเฉพาะช่องที่ว่าง ของที่การ์ดมีอยู่แล้วไม่ถูกแตะ

update queue_entries q
set therapist_id = coalesce(q.therapist_id, s.therapist_id),
    bed_id       = coalesce(q.bed_id, s.bed_id)
from sales s
where s.id = q.sale_id
  and q.status = 'paid'
  and ((q.therapist_id is null and s.therapist_id is not null)
    or (q.bed_id is null and s.bed_id is not null));
