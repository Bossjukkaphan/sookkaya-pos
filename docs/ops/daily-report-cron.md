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

## สองประตูตรวจสิทธิ์ — ทำไมไม่ต้อง sync secret

สองตัวจับเวลาถือ secret คนละที่ และไม่มีทางแก้ให้ตรงกันแบบอัตโนมัติ
(Vercel env แก้ได้จากเครื่องเจ้าของร้านเท่านั้น) route จึงเปิดสองประตู:

| ตัวจับเวลา | secret อยู่ที่ | route ตรวจด้วย |
|---|---|---|
| Vercel cron | env `CRON_SECRET` (Vercel ใส่ header ให้เอง) | เทียบ env ตรงๆ แบบเดิม |
| pg_cron | Supabase Vault `daily_report_cron_secret` | RPC `cron_secret_matches` (migration `20260808181713`) |

secret ฝั่ง Vault ถูก gen ในตัว Postgres (`gen_random_bytes(32)` → hex 64 ตัว)
ไม่เคยออกนอกฐานข้อมูล — หมุนใหม่เมื่อไหร่ก็ได้โดยไม่กระทบ Vercel:

```sql
select vault.update_secret(
  (select id from vault.secrets where name = 'daily_report_cron_secret'),
  encode(extensions.gen_random_bytes(32), 'hex')
);
```

## สถานะติดตั้ง (8/8/2569)

| ขั้น | สถานะ |
|---|---|
| migration `20260808175641` — extensions + ตาราง + ฟังก์ชัน + cron job | ✅ job `daily-report-2200-ict` active |
| migration `20260808181713` — RPC ตรวจ secret จาก Vault | ✅ |
| vault `daily_report_url` + `daily_report_cron_secret` | ✅ |
| merge เข้า main + deploy โค้ดกันซ้ำและสองประตู | ✅ |

## ยืนยันว่าทั้งเส้นตรงกัน — ไม่ส่งการ์ดจริง

`?dry=1` จบทันทีหลังผ่านด่านตรวจสิทธิ์ ใช้พิสูจน์ secret โดยไม่ยิง LINE และไม่แตะด่านกันซ้ำ
วิธี: ชี้ URL ใน Vault ไปแบบ dry ชั่วคราว → ยิง → ดูผล → ชี้กลับ (รันใน SQL Editor)

```sql
select vault.update_secret(
  (select id from vault.secrets where name = 'daily_report_url'),
  'https://sookkaya-pos.vercel.app/api/cron/daily-report?source=pg_cron&dry=1'
);
select public.trigger_daily_report();
-- รอ ~5 วินาที
select status_code, left(content, 120) from net._http_response order by id desc limit 1;
-- ต้องได้ 200 กับ {"ok":true,"dry":true,"source":"pg_cron"} แล้วชี้ URL กลับ:
select vault.update_secret(
  (select id from vault.secrets where name = 'daily_report_url'),
  'https://sookkaya-pos.vercel.app/api/cron/daily-report?source=pg_cron'
);
```

## ยิงมือดูการ์ดจริง (ไม่ต้องรอถึง 22:00)

**ระวัง: การ์ดจะเข้ากลุ่มจริง และแถวกันซ้ำของ "วันนี้" จะถูกจอง** — ถ้ายิงเล่นก่อน 22:00
การ์ดรอบจริงของคืนนั้นจะโดนข้าม ต้องลบแถวทิ้งก่อน: `delete from daily_report_sends where report_date = current_date;`

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
