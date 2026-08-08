# Daily Report — ทำให้ยิงตรง 22:00 น.

**ปัญหาที่แก้:** 8/8/2569 การ์ดเข้ากลุ่มตอน 22:54 ทั้งที่ `vercel.json` ตั้ง `0 15 * * *` (= 22:00 น. ไทย)
Vercel Cron แผน Hobby ยิงแบบ best-effort **ภายในชั่วโมงเดียวกัน** ไม่ใช่ตรงนาที

**วิธีแก้:** ย้ายตัวจับเวลาหลักไปที่ pg_cron ของ Supabase ซึ่งรันในตัว Postgres ตรงนาที
คง cron ของ Vercel ไว้เป็นตัวสำรอง แล้วกันการ์ดซ้ำด้วยตาราง `daily_report_sends`

## โครงหลังแก้

```
pg_cron 22:00:00 ตรง ──┐
                       ├──→ GET /api/cron/daily-report ──→ จองแถวใน daily_report_sends
Vercel cron 22:00-22:59┘                                    ใครจองได้ = คนส่ง · อีกตัวจบเงียบ
```

- จองแถว **ก่อน** ยิง LINE — ถ้าจองทีหลังจะมีช่องให้สองตัวส่งพร้อมกัน
- ยิง LINE ไม่สำเร็จ → ลบแถวที่จองทิ้ง ให้ตัวสำรองมีสิทธิ์ลองใหม่
- ตัวสำรองมีไว้กันเคส pg_cron หรือ pg_net ล่ม การ์ดจะมาช้าหน่อยแต่ไม่เงียบหายทั้งคืน

## สถานะติดตั้ง (8/8/2569)

| ขั้น | สถานะ |
|---|---|
| migration (`20260808175641`) — extensions + ตาราง + ฟังก์ชัน + cron job | ✅ apply แล้วผ่าน Supabase MCP · job `daily-report-2200-ict` active |
| vault secret `daily_report_url` | ✅ ใส่แล้ว |
| vault secret `daily_report_cron_secret` | ✅ หมุนใหม่ gen ใน Postgres (`gen_random_bytes(32)` hex 64 ตัว) |
| merge เข้า main + deploy (โค้ดกันการ์ดซ้ำ) | ✅ merge `d278069` — Vercel deploy อัตโนมัติ |
| ทดสอบท่อ pg_cron → Vault → pg_net → route | ✅ ได้ 401 ตามคาด (Vercel ยังถือ secret เก่า) |
| sync CRON_SECRET ฝั่ง Vercel ให้ตรงกับ Vault | ⬜ ขั้นเดียวที่เหลือ — ดูข้างล่าง |

## ขั้นที่เหลือ: sync CRON_SECRET ฝั่ง Vercel

secret ตัวใหม่ถูก gen ในตัว Postgres ตรงเข้า Vault (ไม่เคยอยู่ในแชทหรือไฟล์ไหน)
ระหว่างที่ยังไม่ sync: pg_cron ยิงแล้วได้ 401 ทุกคืน → ไม่มีการ์ดจาก pg_cron ไม่มีการ์ดซ้ำ
Vercel cron ตัวเดิมยังส่งการ์ดตามปกติ (ช้าได้ถึงชั่วโมงแบบเดิม) — ระบบไม่มีทางพัง แค่ยังไม่ตรงเวลา

1. อ่านค่าใน SQL Editor ของ Supabase:

```sql
select decrypted_secret from vault.decrypted_secrets
where name = 'daily_report_cron_secret';
```

2. เอาค่าไปทับ env เดิมแล้ว deploy ใหม่ (env ใหม่มีผลต่อเมื่อ deploy):

```bash
cd sookkaya-pos-v2
npx vercel env rm CRON_SECRET production -y
printf '<ค่าจากข้อ 1>' | npx vercel env add CRON_SECRET production
npx vercel deploy --prod --yes
```

3. ยืนยันว่าตรงกันแล้ว — รันใน SQL Editor:

```sql
select public.trigger_daily_report();
-- รอ ~5 วินาที
select status_code, left(content, 120) from net._http_response order by id desc limit 1;
```

ต้องได้ `status_code = 200` — ถ้า content เป็น `{"ok":true,...}` การ์ดเข้ากลุ่มแล้ว
ถ้าเป็น `{"ok":true,"skipped":"already-sent"}` แปลว่าการ์ดวันนี้ถูกส่งไปก่อนแล้ว ปกติเช่นกัน

### 3. ยิงมือดูการ์ดจริง (ไม่ต้องรอถึง 22:00)

```sql
select public.trigger_daily_report();
```

รอ ~5 วินาที แล้วดูผลที่ pg_net เก็บไว้:

```sql
select id, status_code, content from net._http_response order by id desc limit 1;
```

ต้องได้ `status_code = 200` และ content เป็น `{"ok":true,...,"source":"pg_cron"}`
ถ้าได้ `{"ok":true,"skipped":"already-sent"}` แปลว่าการ์ดของวันนั้นถูกส่งไปแล้ว — ปกติ ไม่ใช่ error

## ตรวจหลังใช้งานจริง

คืนถัดไปดูว่าการ์ดเข้ากลุ่มกี่โมง แล้วเทียบกับ:

```sql
select * from public.daily_report_sends order by report_date desc limit 7;
```

- `source = 'pg_cron'` = ตรงเวลาตามที่ตั้งใจ ✅
- `source = 'vercel_cron'` = pg_cron ไม่ทำงาน ตัวสำรองรับช่วงแทน → ไปดู `raise warning` ใน Postgres logs
  กับ `net._http_response` ว่าติดตรงไหน

## ยิงมือตอนตรวจตัวเลข

ด่านกันซ้ำจะบล็อกการยิงมือรอบสองของวันเดียวกัน ใช้ `?force=1` ข้ามด่าน:

```bash
curl -s -H "Authorization: Bearer <CRON_SECRET>" \
  "https://sookkaya-pos.vercel.app/api/cron/daily-report?source=manual&force=1"
```

## ถ้าจะเลิกใช้ pg_cron

```sql
select cron.unschedule('daily-report-2200-ict');
```

cron ของ Vercel ยังทำงานต่อเหมือนเดิม (แค่กลับไปคลาดเคลื่อนภายในชั่วโมง)

## หมายเหตุ

- `birthday-reminder` (08:00 น.) ยังใช้ Vercel cron อย่างเดียว จึงยังคลาดเคลื่อนได้ถึง 1 ชม.
  ยังไม่ย้ายเพราะเวลาไม่คริติคัลเท่า Daily Report — ถ้าอยากให้ตรงด้วย ทำซ้ำแพตเทิร์นเดียวกันได้
- อีกทางที่ไม่ต้องแตะฐานข้อมูลเลยคืออัป Vercel เป็นแผน Pro (~$20/เดือน) ซึ่งยิงตรงนาที
  เลือกทาง pg_cron เพราะฟรีและได้ตัวสำรองแถมมาด้วย
