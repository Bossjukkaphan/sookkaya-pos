-- รหัสประจำการกดบันทึกคิวแต่ละครั้ง — กันกดรัว/เน็ตหน่วง retry แบบแม่นยำ
-- แทนการเดาจากข้อมูล (เมนู+เวลา+ชื่อ) ที่เคยกลืนคิว walk-in ไม่ระบุหมอ 2 ใบติดกัน
alter table public.queue_entries add column client_key text;
create index queue_entries_client_key_idx on public.queue_entries (client_key)
  where client_key is not null;
