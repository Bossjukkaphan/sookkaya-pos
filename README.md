# สุขกายา POS

ระบบบันทึกขายและจัดการร้านนวดสุขกายา — แทนที่ Google Sheets เดิม

🌐 **ใช้งานจริง: https://sookkaya-pos.vercel.app**

## Tech Stack

| Layer    | Tech                                   |
| -------- | -------------------------------------- |
| Database | Supabase (PostgreSQL) — `sookkaya-pos` |
| Frontend | Next.js 16 (App Router) + TypeScript   |
| UI       | shadcn/ui + Tailwind CSS v4            |
| Auth     | Supabase Auth (email/password)         |

## เริ่มใช้งาน

Node.js ติดตั้งผ่าน nvm (ไม่ได้อยู่ใน PATH โดยอัตโนมัติ) ต้อง export ก่อน:

```bash
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
npm run dev
```

เปิด http://localhost:3000

## Supabase

- Project ref: `jrioyrmicioqammeevgh` (region `ap-southeast-1` / สิงคโปร์)
- Dashboard: https://supabase.com/dashboard/project/jrioyrmicioqammeevgh
- ค่า env อยู่ใน `.env.local` (anon key เปิดเผยได้ ปลอดภัยเพราะมี RLS คุม)

### สร้างบัญชีผู้ใช้ (ต้องทำ 2 ขั้น)

ระบบใช้ **allowlist** — คนที่ไม่อยู่ในรายชื่อจะสมัครได้แต่**ไม่เห็นข้อมูลอะไรเลย**
(ไม่มี profile → `app_role()` เป็น NULL → RLS ปฏิเสธทุกตาราง)

**ขั้นที่ 1** เพิ่มอีเมลลงรายชื่อที่อนุมัติ — ทำในแอปได้เลยที่ **ตั้งค่า → ผู้ใช้**
(หรือถ้าถนัด SQL ก็ insert ลง `public.allowed_users` ตรงๆ)

**ขั้นที่ 2** สร้าง user ใน Dashboard → **Authentication → Users → Add user**
ด้วยอีเมลเดียวกัน — profile และ role จะถูกสร้างให้อัตโนมัติ

หน้าตั้งค่าจะบอกด้วยว่าใคร "สมัครแล้ว" / "ยังไม่ได้สมัคร"

> ลำดับสำคัญ: ถ้าสร้าง user ก่อนใส่ allowlist จะไม่ได้ profile
> แก้โดยเพิ่มลง `allowed_users` แล้วลบ user ออกสร้างใหม่

**ทำไมต้องมี allowlist:** ถ้าเปิด self-signup ไว้ (ค่า default ของ Supabase)
ใครที่เจอ URL ก็สมัครเองได้ ของเดิมจะได้ role `staff` ทันที = เห็นข้อมูลลูกค้า 996 คน
พร้อมเบอร์โทร allowlist ปิดช่องนี้ที่ระดับฐานข้อมูล ไม่ต้องพึ่งการตั้งค่าใน Dashboard

## สิทธิ์การใช้งาน (RLS)

| ตาราง                        | staff          | manager | admin |
| ---------------------------- | -------------- | ------- | ----- |
| `sales`, `customers`         | อ่าน/เขียน     | ✔       | ✔     |
| `therapists`, `services`     | อ่านอย่างเดียว | ✔       | ✔     |
| `expenses`                   | ✘              | ✔       | ✔     |
| `member_topups`              | อ่านอย่างเดียว | ✔       | ✔     |
| `therapist_daily_commission` | อ่านอย่างเดียว | ✔       | ✔     |
| `settings`                   | อ่านอย่างเดียว | อ่าน    | ✔     |

## Business Logic ที่อยู่ในฐานข้อมูลแล้ว

- **เลขที่ใบเสร็จ** `SK-YYYYMMDD-NNN` — สร้างอัตโนมัติผ่าน trigger บน `sales`
  รีเซ็ตทุกวัน และกันเลขซ้ำเมื่อพนักงานหลายคนบันทึกพร้อมกัน (atomic upsert)
- **ยอด Credit สมาชิก** — view `member_balances` คำนวณ credit/bonus คงเหลือ
  โดยไม่นับ topup ที่หมดอายุแล้ว
- **ประกันมือ 500 บาท/วัน** — `MAX(sum(commission), 500)` ในหน้าค่ามือ
  อ่านค่าขั้นต่ำจาก `settings.min_commission_guarantee`
  **สำคัญ:** ประกันใช้เฉพาะวันที่หมอเข้างานจริง (มีอย่างน้อย 1 เซสชัน)
  หมอที่ไม่ได้เข้างานจะไม่ได้ประกัน
- **เวลาไทย** — `src/lib/datetime.ts` คำนวณ "วันนี้" จาก `Asia/Bangkok` เสมอ
  เพราะ server รันที่ UTC ถ้าใช้ `current_date` ตรงๆ ยอดขายหลัง 00:00 UTC (07:00 ไทย)
  จะไปลงผิดวัน

## สถานะ

- [x] **Phase 1** — Supabase + Next.js + shadcn/ui + Auth + schema + seed
- [x] **Phase 2** — หน้า POS, Dashboard วันนี้, ค่ามือรายวัน
- [x] **Phase 3** — CRM ลูกค้า (เพิ่ม/แก้ไข), ระบบ Member topup/ledger
- [x] **Phase 4** — รายจ่าย, รายงานรายเดือน, export CSV
- [x] **Import ข้อมูลเก่า** — ลูกค้า 995, ยอดขาย 2,254, รายจ่าย 169, Topup 50
- [ ] ถัดไป — deploy ขึ้น Vercel

## หน้าที่มีแล้ว

| URL              | หน้า                                                       |
| ---------------- | ---------------------------------------------------------- |
| `/pos`           | บันทึกขาย — เลือกหมอ/เมนู/ช่องทางจ่าย, ส่วนลด, รีเควส      |
| `/`              | ยอดวันนี้ — ยอดรวม, แยกช่องทาง, ค่ามือ, รายการ (ลบได้)     |
| `/commission`    | ค่ามือรายวัน — ประกันมือ, ค่ารีเควส, ทำเครื่องหมายจ่าย     |
| `/customers`     | ค้นหา/เพิ่ม/แก้ไขลูกค้า + ประวัติและเครดิตคงเหลือ          |
| `/members`       | เติมเงินสมาชิก, รายชื่อสมาชิก, ประวัติการเติม              |
| `/expenses`      | บันทึกรายจ่าย + สรุปรายเดือนแยกหมวดหมู่                    |
| `/reports`       | รายงานรายเดือน — กำไรหยาบ, เมนูขายดี, ค่ามือรายหมอ         |
| `/settings`      | หมอนวด · เมนูและราคา · ผู้ใช้ (admin) · ค่าประกันมือ       |
| `/api/export`    | ดาวน์โหลด CSV (`?type=sales\|expenses&month=YYYY-MM`)      |

## กฎบัญชีที่ต้องรู้ (สำคัญ — เคยพลาดมาแล้ว)

**1. Bonus รวมอยู่ใน Credit แล้ว ไม่ใช่บวกเพิ่ม**
Silver จ่าย 5,000 → ใช้ได้ **6,000** (ในนั้นเป็นโบนัส 1,000) ไม่ใช่ 7,000
ยืนยันจาก Member Ledger เดิม: Credit ออกไป 318,000 − ใช้แล้ว 209,410 = คงเหลือ 108,590
ถ้าบวกโบนัสซ้ำ สมาชิก 44 คนจะได้เครดิตเกินรวม 53,000 บาท

**2. รายจ่ายหมวด `HR / payroll` คือค่ามือที่จ่ายจริง — ห้ามหักซ้ำ**
หน้ารายงานคำนวณค่ามือจากยอดขายอยู่แล้ว ถ้าเอารายจ่ายหมวดนี้มาหักอีกจะนับซ้ำ
ตัวอย่าง มิ.ย. 69: กำไรจริง +113,144 แต่ถ้านับซ้ำจะกลายเป็น −38,106

**3. ค่ามือคิดประกันรายวันต่อคน** ไม่ใช่รวมทั้งเดือนแล้วเทียบทีเดียว
และประกันใช้เฉพาะวันที่หมอเข้างานจริง (มีอย่างน้อย 1 เซสชัน)

## ข้อมูลที่ import มาแล้ว

| ตาราง | จำนวน | หมายเหตุ |
| ----- | ----- | -------- |
| `customers` | 996 | รวม 'กล้วย' ที่มีในชีท Topup แต่ไม่มีในชีทลูกค้า |
| `sales` | 2,255 | 8 มี.ค. – 20 ก.ค. 69 · เก็บเลขใบเสร็จเดิม (`#89320-929`) |
| `expenses` | 169 | |
| `member_topups` | 50 | ยอดคงเหลือตรงกับ Ledger เดิมครบทั้ง 43 คน |
| `therapists` | 11 | 6 active + 5 resigned (ไล, หยง, เกด, อ้อย, ไข่) |

ข้อจำกัดที่ทราบ (ไม่ใช่บั๊ก — ข้อมูลต้นทางไม่สมบูรณ์):
- 1 รายการไม่มีวันที่ → ข้ามไป
- 11 รายการไม่มีช่องทางชำระ → บันทึกเป็น `ไม่ระบุ`
- 1 รายการ Member Credit 790 บาท ไม่มีชื่อลูกค้า → ผูกกับสมาชิกไม่ได้
- เวลาขายในไฟล์เก่าปนกันหลายรูปแบบ (11.46, 1515) → เก็บเฉพาะที่ตีความได้แน่ชัด

สคริปต์แปลงข้อมูลอยู่ที่ `import-scripts/gen_csv.py`

## ที่ควรทำก่อนเปิดใช้จริง

1. **ตั้งรหัสผ่านขั้นต่ำ 12 ตัว + บังคับประเภทตัวอักษร**
   ที่ [Auth Providers → Email](https://supabase.com/dashboard/project/jrioyrmicioqammeevgh/auth/providers?provider=Email)
   (Leaked Password Protection ต้องใช้ Pro Plan — org นี้อยู่ Free จึงเปิดไม่ได้)
2. **ปิด "Allow new users to sign up"** ในหน้าเดียวกัน
   — allowlist กันไว้อีกชั้นแล้ว แต่ปิดด้วยจะดีที่สุด
3. เพิ่ม ดา / นก / เค้ก ลง `allowed_users` แล้วสร้าง user (ดูวิธีด้านบน)
4. ~~Deploy ขึ้น Vercel~~ ✅ เสร็จแล้ว

## Deploy

Vercel project: `jukkaphans-projects/sookkaya-pos` · env vars ตั้งครบทั้ง 3 environment แล้ว

Deploy เวอร์ชันใหม่:

```bash
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
cd "/Users/jw/Desktop/Claude Code/sookkaya-pos-v2"
npx vercel deploy --prod
```
