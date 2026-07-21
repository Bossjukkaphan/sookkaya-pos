# วิธีสำรองข้อมูลก่อน migration

ฐานข้อมูลนี้เป็นตัวจริงที่ร้านใช้บันทึกขายอยู่ ไม่มี staging แยก
(Supabase database branch ต้องใช้ Pro plan — org นี้อยู่ Free)

## ก่อนอื่น: migration ที่นี่ทำผ่าน MCP

ทุก migration ยิงผ่าน **Supabase MCP** เข้าโปรเจกต์จริงโดยตรง ไม่ได้ใช้ Supabase CLI
ประวัติตัวจริงอยู่ที่ `supabase_migrations.schema_migrations` ในฐานข้อมูล
ส่วน `supabase/migrations/` เก็บสำเนาไว้ให้อ่านและ diff — เขียน migration เสร็จแล้ว
**ต้องเก็บไฟล์สำเนาลงโฟลเดอร์นั้นด้วย** ไม่งั้นคนที่มาทีหลังจะไม่รู้ว่าเกิดอะไรขึ้น

**ห้ามรัน `supabase db push` / `supabase db reset` ใส่ environment จริงก่อนถามเจ้าของร้าน**
โปรเจกต์ไม่เคยเดินสาย CLI สถานะฝั่ง CLI จึงไม่ตรงกับของจริง

> **ระวัง trigger บน `sales`** — ตอนนี้ `sales` มี trigger `BEFORE UPDATE` ที่ขยับ `updated_at`
> ทุกครั้งที่มีการแก้แถว การ backfill ยกชุดที่แตะ `sales` จึงไปขยับ `updated_at` ของทุกแถวที่โดน
> ใครที่เปิดกล่องแก้ไขค้างไว้ตอนนั้น พอกดบันทึกจะโดนระบบบอกว่า "ข้อมูลเก่าแล้ว" ทั้งที่ไม่มีใครแก้จริง
> ให้รัน backfill ยกชุดนอกเวลาร้านเปิด หรือครอบด้วย
> `alter table public.sales disable trigger sales_set_updated_at_trg; … enable …`

## หลักการ

สำรองเป็น **ตารางสำเนาในฐานข้อมูลเดียวกัน** ก่อนทุก migration ที่เขียนทับข้อมูลเดิม
— เร็ว ไม่ต้องส่งข้อมูลออกนอกฐาน และกู้คืนได้ด้วย UPDATE คำสั่งเดียว

```sql
-- ก่อน migration ที่แก้ข้อมูล
create table backup_<ตาราง>_<เรื่อง>_20260720 as
select id, <คอลัมน์ที่จะถูกแก้> from public.<ตาราง>;
```

## ตารางสำรองที่ต้องสร้าง

| ก่อน Task | คำสั่ง |
| --------- | ------ |
| 5 (cost_type) | `create table backup_expenses_costtype_20260720 as select id, category, item, cost_type from public.expenses;` |
| 6 (sale_time) | `create table backup_sales_time_20260720 as select id, receipt_no, sale_time from public.sales;` |
| 7 (material_cost) | `create table backup_services_cost_20260720 as select id, name, material_cost from public.services;` |

Task 4 และ 8 ไม่ต้องสำรอง — เพิ่มคอลัมน์/สร้าง view อย่างเดียว ไม่แตะข้อมูลเดิม

## วิธีกู้คืน

```sql
-- ตัวอย่าง: กู้ sale_time กลับ
update public.sales s
set sale_time = b.sale_time
from backup_sales_time_20260720 b
where b.id = s.id;
```

## ลบตารางสำรองเมื่อไหร่

หลังจาก `supabase/reconciliation.sql` ผ่านครบทุกข้อ และเจ้าของร้านใช้งานจริงแล้ว 1 สัปดาห์
โดยไม่พบปัญหา จึงค่อยลบ:

```sql
drop table if exists backup_expenses_costtype_20260720;
drop table if exists backup_sales_time_20260720;
drop table if exists backup_services_cost_20260720;
```

**ห้ามลบก่อนตรวจตัวเลขผ่าน** — ตารางพวกนี้กินพื้นที่ไม่กี่ร้อย KB ไม่รีบลบ
