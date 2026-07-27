-- ห้องสปาส่วนตัว +100฿ — บริการเสริมผูกกับบริการหลัก
-- room_fee เข้า net_amount (รายได้ร้าน เข้าแต้ม/เครดิต/งบอัตโนมัติ)
-- ต่างจาก request_fee ที่เป็นเงินส่งผ่านให้หมอ — ห้ามปนกัน
alter table public.sales add column room_fee numeric not null default 0;
alter table public.queue_entries add column private_room boolean not null default false;
