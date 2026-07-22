# SOOKKAYA POS — Phase A: ข้อมูลบิลละเอียด (ห้อง/เตียง · เวลาเริ่มจริง · ช่องทางจองย่อย · หมายเหตุ+audit)

วันที่: 2026-07-22
สถานะ: รออนุมัติ
ที่มา: เทียบเท่า Thai Hand POS (แผนรวม 5 เฟส — นี่คือเฟสแรก ผู้ใช้เลือกเอง)

## ข้อมูลจริงจากผู้ใช้ (ถามแล้ว)

- **เตียง 10 เตียง**: ห้องนวดไทย 5 เตียง · ห้องสปา 1 (2 เตียง) · ห้องสปา 2 (2 เตียง) · ห้องสปา 3 (1 เตียง)
- **ทิป/ค่าชาร์จ**: ไม่มี — ตัดออกจากขอบเขต
- **ช่องทางจองย่อย** (ของประเภท "จองล่วงหน้า"): ไลน์ · โทรศัพท์ · Facebook

## หลักการ

ทั้งเฟสเป็น **metadata ของบิล/คิว ไม่แตะสูตรเงินแม้แต่ช่องเดียว** — reconciliation ต้องผ่าน 21/21 เท่าเดิม
ทุก field ใหม่เป็น optional — พนักงานรีบก็ข้ามได้ บิลยังบันทึกได้เสมอ

## ฐานข้อมูล (migration เดียว)

```sql
-- เตียงในร้าน — จัดกลุ่มด้วยชื่อห้อง
create table public.beds (
  id        uuid primary key default gen_random_uuid(),
  room      text not null,
  name      text not null,
  sort      int  not null,
  is_active boolean not null default true
);
-- RLS: authenticated อ่านได้ (แก้ผ่าน SQL ไปก่อน — หน้า admin เตียงยังไม่ทำ, YAGNI)
-- seed 10 แถว: ห้องนวดไทย เตียง 1-5 · ห้องสปา 1 เตียง 1-2 · ห้องสปา 2 เตียง 1-2 · ห้องสปา 3 เตียง 1

alter table public.queue_entries add column bed_id uuid references public.beds(id);
alter table public.queue_entries add column started_at timestamptz;  -- เวลากดเริ่มนวดจริง
alter table public.queue_entries add column booking_channel text
  check (booking_channel is null or booking_channel in ('line','phone','facebook'));
alter table public.queue_entries add column notes text;

alter table public.sales add column bed_id uuid references public.beds(id);
alter table public.sales add column booking_channel text
  check (booking_channel is null or booking_channel in ('line','phone','facebook'));
alter table public.sales add column notes text;
alter table public.sales add column edited_by text;  -- created_by มีอยู่แล้ว
```

## lib

- `src/lib/customer-source.ts` เพิ่ม `BOOKING_CHANNELS`, `CHANNEL_LABEL` (ไลน์/โทรศัพท์/Facebook), `isBookingChannel`
- `src/lib/queue.ts` เพิ่ม `busyBedIds(entries, startMin, durationMin, excludeId?)` — เตียงที่มีคิว (ไม่นับยกเลิก) คร่อมช่วงเวลานั้น · **TDD**

## บอร์ดคิว

- **dialog เพิ่มคิว**:
  - เลือก "จองล่วงหน้า" → โผล่แถวปุ่มช่องทาง ไลน์/โทรศัพท์/Facebook (ไม่บังคับ)
  - ปุ่มเลือกเตียง จัดกลุ่มตามห้อง (ไม่บังคับ) — เตียงที่ถูกจองคร่อมเวลาที่เลือกอยู่ขึ้นจาง + ป้าย "ไม่ว่าง" แต่ยังกดได้ (ไม่บล็อก เผื่อตั้งใจ)
  - ช่องหมายเหตุ (ไม่บังคับ)
- **กด "เริ่มนวด"** → บันทึก `started_at = now()` (ใน setQueueStatus เมื่อเปลี่ยนเป็น in_service ครั้งแรก — ถ้ามีค่าแล้วไม่ทับ)
- **การ์ดคิว**: โชว์ชื่อเตียงย่อ (เช่น "ไทย·3") ต่อท้ายบรรทัดลูกค้า
- **dialog รายละเอียดการ์ด**: เตียง · ช่องทางจอง · จอง HH:MM / เริ่มจริง HH:MM (ถ้ามี) · หมายเหตุ

## หน้า POS

- แถวปุ่มช่องทางจองย่อยโผล่เมื่อเลือก "จองล่วงหน้า" (mirror จากคิว)
- ปุ่มเลือกเตียง (ไม่บังคับ, กลุ่มตามห้อง)
- ช่องหมายเหตุ (ไม่บังคับ)
- **เก็บเงินจากคิว**: bed_id + booking_channel + notes ถูก prefill จากคิวทั้งหมด
- `createSale` บันทึกทั้งสาม field ลง sales

## แก้บิล (/today)

- `updateSale` (edit-sale ที่มีอยู่) stamp `edited_by` = ชื่อผู้แก้ (แบบเดียวกับ created_by)
- dialog แก้บิลเพิ่มช่องหมายเหตุ
- รายการขายใน /today: ถ้ามี notes โชว์บรรทัดเล็กสีเทา · บรรทัดรายละเอียดโชว์เตียงถ้ามี

## ไฟล์

| ไฟล์ | งาน |
| ---- | --- |
| `supabase/migrations/…_beds_and_bill_detail.sql` | ตาราง beds + seed + คอลัมน์ใหม่ทั้งหมด |
| `src/types/database.ts` | beds + คอลัมน์ใหม่ queue_entries/sales |
| `src/lib/customer-source.ts` | BOOKING_CHANNELS + labels |
| `src/lib/queue.ts` + `queue.test.ts` | busyBedIds (TDD) |
| `queue/add-queue-dialog.tsx` | ช่องทางจองย่อย + เลือกเตียง + หมายเหตุ |
| `queue/queue-actions.ts` | รับ field ใหม่ + stamp started_at |
| `queue/queue-card.tsx` | โชว์เตียง + รายละเอียดเพิ่ม |
| `queue/queue-board.tsx` + `page.tsx` | โหลด beds ส่งให้ dialog |
| `pos/pos-form.tsx` + `pos/page.tsx` | เตียง + ช่องทางย่อย + หมายเหตุ + prefill |
| `sale-actions.ts` | createSale บันทึก field ใหม่ · updateSale stamp edited_by |
| `today/page.tsx` + edit dialog | โชว์ notes/เตียง + ช่องแก้หมายเหตุ |

## นอกขอบเขต

ทิป/ชาร์จ (ร้านไม่มี) · หน้า admin จัดการเตียง (แก้ผ่าน SQL ไปก่อน) · รายงานที่ใช้ข้อมูลใหม่ (เป็นของ Phase C/D) · บังคับกรอก field ใหม่ใดๆ

## การทดสอบ

- busyBedIds เขียนเทสก่อน · เทสเดิม 111 ข้อผ่าน
- eslint + build ผ่าน · reconciliation 21/21 (metadata ล้วน)
- ตรวจภาพจริงผ่าน /preview + mock: dialog เพิ่มคิว (ปุ่มเตียงจัดกลุ่ม+ไม่ว่างจาง · ช่องทางย่อยโผล่เมื่อเลือกจอง) · การ์ดโชว์เตียง · POS โชว์ครบ+prefill
