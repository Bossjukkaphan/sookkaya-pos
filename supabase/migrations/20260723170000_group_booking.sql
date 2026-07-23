-- ลูกค้ามาเป็นครอบครัว/กลุ่ม: จองทีเดียวหลายคน + เก็บเงินทั้งกลุ่มในจอเดียว
-- โครงเงินไม่เปลี่ยน — ยังคง 1 บิล = 1 คน (ค่ามือ/รายงาน/reconciliation ไม่กระทบ)
-- group_id เป็นแค่ตัวผูกว่าคิว/บิลไหนมาด้วยกัน
alter table public.queue_entries add column group_id uuid;
alter table public.sales add column group_id uuid;

-- บอร์ดคิวถามบ่อยว่า "การ์ดนี้มีเพื่อนร่วมกลุ่มไหม" — index เฉพาะแถวที่มีกลุ่มพอ
create index queue_entries_group_idx on public.queue_entries (group_id)
  where group_id is not null;
