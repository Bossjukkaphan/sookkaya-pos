-- ซ่อมการ์ดคิวที่จ่ายเงินแล้วแต่ค่าไม่ตรงกับบิล (รันจริงบน production 28/7/2569)
--
-- ต่างจาก migration 20260728120000 ที่ซ่อม "ช่องว่าง" (การ์ดไม่มีหมอ/เตียงเลย)
-- รอบนี้คือ "ค่าไม่ตรง" — การ์ดมีค่าอยู่แล้วแต่เป็นคนละค่ากับบิล coalesce เดิมจึงไม่แตะ
--
-- ต้นเหตุ: รายชื่อฟิลด์ที่การ์ดมิเรอร์จากบิลเคยเขียนไว้สองที่แล้วเพี้ยนออกจากกัน
--   · กดชำระจากการ์ด เขียนหมอ+เตียง แต่ไม่เขียนเมนู
--   · แก้บิล เขียนเมนู+หมอ แต่ไม่เขียนเตียง
-- แก้ที่รากแล้วด้วย queueMirrorFromSale() ใน src/lib/queue.ts (ที่เดียว ใช้ทั้งสองทาง)
--
-- ของที่ค้างอยู่ 3 ใบ:
--   · ชวน 25/7 สองใบ — บิลแก้เป็น 120 นาที ตอน 15:53 น. การ์ดค้าง 90
--     (โค้ด sync ตอนแก้บิลขึ้นตอน 16:03 น. ช้าไป 10 นาทีพอดี)
--   · ใบใบ 27/7 — บิลอยู่ห้องสปา 2 การ์ดอยู่ห้องสปา 3
--     ทุกห้องมีเตียงชื่อ "เตียง 1" หน้าจอเลยดูเหมือนตรงกัน ไม่มีใครทันสังเกต
--
-- เงินไม่เคยผิด: ค่ามือและยอดขายเดินตามบิล ที่ผิดคือผังงานบนกระดานอย่างเดียว
--
-- coalesce ที่เตียงกับหมอ = บิลที่ไม่ได้ระบุไว้ ห้ามไปลบของที่การ์ดมี
-- ส่วนเมนูเอาจากบิลตรงๆ เพราะบิลต้องมีเมนูเสมอ (createSale บังคับ)

update queue_entries q
set service_id   = s.service_id,
    service_name = s.service_name,
    duration_min = coalesce(sv.duration_min, q.duration_min),
    bed_id       = coalesce(s.bed_id, q.bed_id),
    therapist_id = coalesce(s.therapist_id, q.therapist_id),
    updated_at   = now()
from sales s
left join services sv on sv.id = s.service_id
where s.id = q.sale_id
  and q.status = 'paid'
  and (q.service_id   is distinct from s.service_id
    or q.bed_id       is distinct from coalesce(s.bed_id, q.bed_id)
    or q.therapist_id is distinct from coalesce(s.therapist_id, q.therapist_id));
