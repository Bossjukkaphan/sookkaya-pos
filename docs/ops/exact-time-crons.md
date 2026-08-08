# Cron ยิงตรงเวลา — daily-report 22:00 · birthday-reminder 08:00

**ปัญหาที่แก้:** Vercel Cron แผน Hobby ยิงแบบ best-effort **ภายในชั่วโมงเดียวกัน** ไม่ใช่ตรงนาที
(8/8/2569 การ์ด Daily Report เข้ากลุ่มตอน 22:54 ทั้งที่ตั้ง 22:00)

**วิธีแก้:** ตัวจับเวลาหลักอยู่ที่ pg_cron ของ Supabase ซึ่งรันในตัว Postgres ตรงนาที
คง cron ของ Vercel ไว้เป็นตัวสำรอง แล้วกันข้อความซ้ำด้วยตาราง `cron_sends`

## โครง

```
pg_cron ตรงเวลา ────┐
                    ├──→ GET /api/cron/<job> ──→ จองแถวใน cron_sends (job, run_date)
Vercel cron ±1 ชม. ─┘                             ใครจองได้ = คนส่ง · อีกตัวจบเงียบ
```

| job | pg_cron (ตัวหลัก) | Vercel cron (ตัวสำรอง) | ส่งอะไร |
|---|---|---|---|
| `daily-report-2200-ict` | 15:00 UTC = **22:00 ไทย** | `0 15 * * *` | การ์ด Flex เข้ากลุ่ม Sookkaya Management |
| `birthday-reminder-0800-ict` | 01:00 UTC = **08:00 ไทย** | `0 1 * * *` | ข้อความวันเกิดเข้ากลุ่มทีมร้าน (มีวันเกิดถึงส่ง) |

- ทั้งสอง job เรียก `public.trigger_cron_route('<ชื่อ vault entry ของ URL>')` ตัวเดียวกัน
- จองแถว **ก่อน** ยิง LINE — ยิงไม่สำเร็จแล้วลบแถวคืน ให้ตัวสำรองลองใหม่ได้
- birthday-reminder วันที่ไม่มีวันเกิด **ไม่จองแถวเลย** — สองตัวเจอศูนย์แล้วจบเงียบเหมือนกัน

## สองประตูตรวจสิทธิ์ — ทำไมไม่ต้อง sync secret

สองตัวจับเวลาถือ secret คนละที่ และไม่มีทางแก้ให้ตรงกันแบบอัตโนมัติ
(Vercel env แก้ได้จากเครื่องเจ้าของร้านเท่านั้น) ทุก cron route จึงเปิดสองประตู
ผ่าน `cronRequestAuthorized` ใน `src/lib/cron-auth.ts`:

| ตัวจับเวลา | secret อยู่ที่ | route ตรวจด้วย |
|---|---|---|
| Vercel cron | env `CRON_SECRET` (Vercel ใส่ header ให้เอง) | เทียบ env ตรงๆ |
| pg_cron | Vault `pos_cron_secret` (ใช้ร่วมทุก job) | RPC `cron_secret_matches` |

secret ฝั่ง Vault ถูก gen ในตัว Postgres (`gen_random_bytes(32)` → hex 64 ตัว)
ไม่เคยออกนอกฐานข้อมูล — หมุนใหม่เมื่อไหร่ก็ได้โดยไม่กระทบ Vercel:

```sql
select vault.update_secret(
  (select id from vault.secrets where name = 'pos_cron_secret'),
  encode(extensions.gen_random_bytes(32), 'hex')
);
```

## Vault entries

| ชื่อ | เก็บอะไร |
|---|---|
| `pos_cron_secret` | secret ร่วมของทุก cron route (hex 64) |
| `daily_report_url` | `https://sookkaya-pos.vercel.app/api/cron/daily-report?source=pg_cron` |
| `birthday_reminder_url` | `https://sookkaya-pos.vercel.app/api/cron/birthday-reminder?source=pg_cron` |

## สถานะติดตั้ง (9/8/2569)

| ขั้น | สถานะ |
|---|---|
| migrations `20260808175641` `20260808181713` `20260808185232` | ✅ apply แล้ว |
| vault ทั้งสามรายการ | ✅ |
| cron job ทั้งสองตัว active | ✅ |
| deploy โค้ดสองประตู + กันซ้ำของทั้งสอง route | ✅ |
| พิสูจน์ dry ทั้งเส้น (pg_cron → Vault → pg_net → route) | ✅ ทั้งสอง route ได้ `{"ok":true,"dry":true,"source":"pg_cron"}` |

## ยืนยันทั้งเส้นโดยไม่ส่งข้อความจริง

`?dry=1` จบทันทีหลังผ่านด่านตรวจสิทธิ์ — ไม่ยิง LINE ไม่แตะด่านกันซ้ำ
วิธี: ชี้ URL ใน Vault ไปแบบ dry ชั่วคราว → ยิง → ดูผล → ชี้กลับ (รันใน SQL Editor
เปลี่ยน `<job>` เป็น `daily_report_url` หรือ `birthday_reminder_url`):

```sql
select vault.update_secret(
  (select id from vault.secrets where name = '<job>'),
  '<URL เดิมตามตารางข้างบน>&dry=1'
);
select public.trigger_cron_route('<job>');
-- รอ ~5 วินาที
select status_code, left(content, 120) from net._http_response order by id desc limit 1;
-- ต้องได้ 200 กับ {"ok":true,"dry":true,"source":"pg_cron"} แล้วชี้ URL กลับเป็นค่าเดิม
```

## ยิงมือส่งจริง (ไม่ต้องรอเวลา)

**ระวัง: ข้อความเข้ากลุ่มจริง และแถวกันซ้ำของ "วันนี้" จะถูกจอง** — รอบจริงของวันเดียวกัน
จะโดนข้าม ต้องลบแถวทิ้งก่อน: `delete from cron_sends where job = '<job>' and run_date = current_date;`

```sql
select public.trigger_cron_route('daily_report_url');       -- หรือ birthday_reminder_url
-- รอ ~5 วินาที แล้วดูคำตอบ
select status_code, content from net._http_response order by id desc limit 1;
```

`{"ok":true,"skipped":"already-sent"}` = วันนี้ส่งไปแล้ว — ปกติ ไม่ใช่ error
ยิงผ่าน curl ด้วย env `CRON_SECRET` ฝั่ง Vercel ก็ได้ ใส่ `?source=manual&force=1` เพื่อข้ามด่านกันซ้ำ

## ตรวจหลังใช้งานจริง

```sql
select * from cron_sends order by run_date desc, job limit 14;
```

- `source = 'pg_cron'` = ตรงเวลาตามที่ตั้งใจ ✅
- `source = 'vercel_cron'` = pg_cron ไม่ทำงาน ตัวสำรองรับช่วงแทน → ดู `raise warning`
  ใน Postgres logs กับ `net._http_response` ว่าติดตรงไหน
- birthday-reminder ไม่มีแถว = วันนั้นไม่มีลูกค้าวันเกิด (ปกติ)

## ถ้าจะเลิกใช้ pg_cron

```sql
select cron.unschedule('daily-report-2200-ict');
select cron.unschedule('birthday-reminder-0800-ict');
```

cron ของ Vercel ยังทำงานต่อเหมือนเดิม (แค่กลับไปคลาดเคลื่อนภายในชั่วโมง)
