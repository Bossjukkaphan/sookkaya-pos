-- kind เดิม 3 ค่าไม่พอ ทำให้หน้า ROI พูดความเท็จ
-- 'internal' ถูกใช้ปนกันระหว่างของแถมเพื่อโปรโมท (ไม่มีรายรับเลย)
-- กับ Member (มีรายรับ 182,542) ซึ่งคนละเรื่องกันคนละทาง
-- แยก 'giveaway' ออกมา เพื่อให้แต่ละกลุ่มอธิบายตัวเองได้ตรงตามความจริง
alter table public.promotions drop constraint promotions_kind_check;

alter table public.promotions add constraint promotions_kind_check
  check (kind in ('promotion', 'channel', 'giveaway', 'internal'));

-- KOL และ ผู้ติดตาม = นวดฟรีให้ influencer และผู้ติดตาม ช่วง 5-8 พ.ค. (payment_method = 'KOL')
-- ถ่ายคอนเทนต์ / เทสนวด = นวดฟรีเพื่อถ่ายรูปและทดสอบเมนู
-- ทั้งสามกลุ่มร้านออกค่าใช้จ่ายเองเต็มจำนวน ไม่ได้คาดหวังรายรับ
update public.promotions set kind = 'giveaway'
where name in ('KOL', 'ผู้ติดตาม', 'ถ่ายคอนเทนต์ / เทสนวด');
