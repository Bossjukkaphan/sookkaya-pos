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
| vault secret `daily_report_cron_secret` | ⬜ ค้างอยู่ — ดูขั้น 2 |
| merge branch เข้า main + deploy (โค้ดกันการ์ดซ้ำ) | ⬜ ค้างอยู่ |

**ลำดับสำคัญ: ต้อง merge + deploy ก่อนใส่ `daily_report_cron_secret`**
ตราบใดที่ secret ยังไม่ครบ ฟังก์ชันจะจบเงียบด้วย warning — ระบบเดินแบบเดิม (Vercel cron ตัวเดียว)
แต่ถ้าใส่ secret ก่อนที่โค้ดกันซ้ำจะขึ้น production การ์ดจะเข้ากลุ่มคืนละ 2 ใบ

## ขั้นตอนที่เหลือ

> ทางลัด: `./scripts/setup-daily-report-cron.sh` ดึงค่าจาก Vercel แล้วเขียนไฟล์ SQL
> ที่เติมค่าพร้อมวางใน SQL Editor ให้เลย (ขั้น db push จะเป็น no-op เพราะ apply ไปแล้ว)

### 1. merge เข้า main ให้โค้ดกันการ์ดซ้ำขึ้น production

### 2. ใส่ CRON_SECRET ลง Vault

ฟังก์ชันอ่าน URL กับ `CRON_SECRET` จาก Vault ไม่ฝังไว้ในไฟล์ migration และไม่ฝังใน `cron.job.command`
(คอลัมน์นั้นเป็น text ธรรมดา ใครอ่านตารางได้ก็เห็น secret)

รันใน SQL Editor ของ Supabase — แทน `<CRON_SECRET>` ด้วยค่าจริงจาก Vercel env production:

```sql
select vault.create_secret('<CRON_SECRET>', 'daily_report_cron_secret');
```

ดึงค่า `CRON_SECRET` ปัจจุบันได้ด้วย:

```bash
npx vercel env pull /tmp/dr.env --environment=production --yes
grep '^CRON_SECRET=' /tmp/dr.env
rm -f /tmp/dr.env
```

> ยังไม่ใส่ secret = ฟังก์ชันไม่ยิงอะไรเลย ขึ้น `raise warning` ใน Postgres logs
> แล้วปล่อยให้ Vercel cron ตัวสำรองทำงานไปก่อน ระบบไม่พัง แค่ยังไม่ตรงเวลา

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
