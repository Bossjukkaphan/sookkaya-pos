-- การ์ดคิวถือได้สองห้อง — เมนูที่ลูกค้าย้ายห้องกลางคัน
--
-- เมนู "นวดคลายเท้า & คอบ่าไหล่ 90/120 นาที" ลูกค้านวดเท้าบนโซฟาครึ่งแรก
-- แล้วย้ายไปคอบ่าไหล่บนเตียงไทยครึ่งหลัง เดิมเก็บได้ห้องเดียวต่อการ์ด ระบบจึง
-- ล็อกโซฟาเกินจริงจนคิวถัดไปจองไม่ได้ และมองไม่เห็นว่าเตียงไทยถูกใช้อยู่
-- (คิวเมนูนี้ 40 ใบในระบบ ลงเก้าอี้ 33 ใบ ลงเตียงศูนย์ใบ)
--
-- เมนู 60 นาทีไม่ตั้ง splits_room เพราะครึ่งหลังนวดคอบ่าไหล่บนโซฟาเดิม ไม่ย้ายห้อง
-- ลูกค้ารีเควสอยู่ห้องเดียวตลอดได้ ฟิลด์ bed_id_2 จึงว่างได้เสมอ = พฤติกรรมเดิม

alter table public.queue_entries
  add column if not exists bed_id_2 uuid references public.beds(id);

alter table public.services
  add column if not exists splits_room boolean not null default false;

comment on column public.queue_entries.bed_id_2 is
  'ห้องของช่วงครึ่งหลัง — null = อยู่ห้องเดียวตลอด · จุดแบ่งคือครึ่งหนึ่งของ duration_min';
comment on column public.services.splits_room is
  'เมนูนี้ย้ายห้องกลางคันเป็นค่าตั้งต้นไหม — หน้าจอใช้ตัดสินว่าจะขึ้นช่องเลือกห้องที่สองหรือไม่';

update public.services set splits_room = true where id in ('9868d7a5-0090-408e-b6a2-ea70032de4ae', '4857e8c4-524c-414a-aadb-ab0673be1962');
