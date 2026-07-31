-- รายการชำระหลายวิธีต่อบิล (bill_payments) + สถานะค้างรับ
-- ฟีเจอร์ใหม่รองรับการแบ่งชำระหลายวิธีและการรับเงินเพิ่มเติม ทีหลังจากบิล
-- ประกอบด้วย: ตาราง bill_payments ที่บันทึกรายละเอียดการชำระจริง
-- + สถานะ payments_tracked ใน sales เพื่อแยก "บิลเก่า/เก่าGowabi/KOL" ออกจาก "บิลใหม่"
-- + views สังเคราะห์ข้อมูลชำระและยอดค้างรับต่อบิล

create table public.bill_payments (
  id            uuid primary key default gen_random_uuid(),
  -- กุญแจบิล: บิลชุดใช้ sales.bill_id · บิลเดี่ยวใช้ sales.id (= coalesce(bill_id, id))
  bill_key      uuid not null,
  method        text not null check (method in ('เงินสด','QR Code','บัตรเครดิต')),
  amount        numeric not null check (amount > 0),
  received_date date not null,          -- วันเงินเข้า (เวลาไทย) — รายงานเงินเข้าอิงวันนี้
  received_at   timestamptz not null default now(),
  note          text,
  created_by    text,
  created_at    timestamptz not null default now()
);
create index bill_payments_bill_key_idx on public.bill_payments (bill_key);
create index bill_payments_received_date_idx on public.bill_payments (received_date);

alter table public.sales add column payments_tracked boolean not null default false;

alter table public.bill_payments enable row level security;
create policy "authenticated read bill_payments" on public.bill_payments
  for select to authenticated using (true);
create policy "authenticated insert bill_payments" on public.bill_payments
  for insert to authenticated with check (true);
-- ลบได้เฉพาะหัวหน้า — แนวเดียวกับสิทธิ์ลบบิล (app_role() มาจาก migration สิทธิ์เดิม)
create policy "manager delete bill_payments" on public.bill_payments
  for delete to authenticated using (public.app_role() in ('admin','manager'));

-- ทุกบิลกลายเป็นบรรทัดชำระแบบเดียวกัน: บิลใหม่ = บรรทัดจริง · บิลเก่า/Gowabi/KOL = สังเคราะห์
create view public.v_bill_payments with (security_invoker = true) as
  select bill_key, method, amount, received_date from public.bill_payments
  union all
  select coalesce(s.bill_id, s.id), s.payment_method,
         sum(s.net_amount - coalesce(s.credit_used, 0)), s.sale_date
  from public.sales s
  where not s.payments_tracked
  group by coalesce(s.bill_id, s.id), s.payment_method, s.sale_date
  having sum(s.net_amount - coalesce(s.credit_used, 0)) > 0;

-- ยอดค้างรับต่อบิล (เฉพาะบิลที่ track): due = net รวม − เครดิตรวม − รับแล้ว
create view public.v_bill_due with (security_invoker = true) as
  select coalesce(s.bill_id, s.id) as bill_key,
         min(s.sale_date) as sale_date,
         sum(s.net_amount) as net_total,
         sum(coalesce(s.credit_used,0)) as credit_total,
         coalesce((select sum(p.amount) from public.bill_payments p
                   where p.bill_key = coalesce(s.bill_id, s.id)), 0) as paid_total,
         sum(s.net_amount) - sum(coalesce(s.credit_used,0))
           - coalesce((select sum(p.amount) from public.bill_payments p
                       where p.bill_key = coalesce(s.bill_id, s.id)), 0) as due
  from public.sales s
  where s.payments_tracked
  group by coalesce(s.bill_id, s.id);
