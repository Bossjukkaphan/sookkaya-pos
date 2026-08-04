# Daily Report เข้าไลน์จาก POS — Design

**วันที่:** 5 ส.ค. 2569
**สถานะ:** เจ้าของร้านอนุมัติ design แล้ว

## เป้าหมาย

ย้ายการ์ดสรุปยอดขายรายวันที่ส่งเข้ากลุ่มไลน์ "Sookkaya Management" ทุก 22:00 น.
จากเดิมที่ Google Apps Script อ่าน Google Sheet มาส่ง
ให้ POS เป็นคนคำนวณและยิงเอง แล้วเลิกใช้ Google Sheet ถาวร

หน้าตาการ์ด ช่องทางส่ง OA และกลุ่มปลายทาง ต้องเหมือนเดิม เจ้าของร้านไม่ต้องแก้อะไรในหลังบ้านไลน์

## ของเดิมที่กำลังถูกแทนที่

| | |
|---|---|
| ไฟล์ | `~/Documents/Claude/Projects/Sookkaya/LineDailyReport_v9_FLEX.gs` (22 มิ.ย. 2569) |
| แหล่งข้อมูล | Google Sheet `12XoaB08SBzZlUg9ifhefSxM1bbEleSB6NLzmq9eNKuE` แท็บ `สรุปยอดขายรายวัน`, `บันทึกขาย`, `💳 Member Topup`, `รายจ่าย` |
| OA | Sookkaya Assistant · basicId `@369wlnfe` · userId `Ufe5a1c1932cb10c90fc3dc7affd97490` |
| กลุ่มปลายทาง | `C20fece7eb07ca5b2f86ccf31e9c86dfd` (Sookkaya Management) |
| เวลาส่ง | trigger `everyDays(1).atHour(22)` timezone Asia/Bangkok |
| ปุ่มในการ์ด | ลิงก์ไป `https://bossjukkaphan.github.io/sookkaya-dashboard/` |

ตรวจแล้ว (5 ส.ค. 2569) token ของ OA ตัวนี้ยังใช้งานได้จริง — เรียก `GET /v2/bot/info` สำเร็จ

### ตัวเลขของสองระบบไม่ตรงกัน — POS คือตัวที่ถูก

เทียบการ์ดวันที่ 4 ส.ค. 2569 กับ POS วันเดียวกัน:

| ช่อง | การ์ดเดิม (ชีต) | POS | หมายเหตุ |
|---|---|---|---|
| NET REVENUE | 11,841 | 11,673.67 | |
| Cash In | 19,108 | 19,107 | ปัดเศษ |
| Sessions | 17 | 16 | |
| ลูกค้าไม่ซ้ำ | 14 | 14 | ตรง |
| ค่ามือรวม | 3,200 | 4,680 | ชีตนับค่ามือดิบ POS นับเงินที่จ่ายจริง |
| TOP หมอ | โจโจ้ 1,200 (3 sess) | โจโจ้ 1,160 (3 sess) | |
| Margin | 73.0% | 59.9% | ผลจากช่องค่ามือ |

ค่ามือของ POS สูงกว่าเพราะรวมประกันมือขั้นต่ำ 500 บาท/วัน และค่ารีเควส 40 บาท ซึ่งเป็นเงินที่ควักจ่ายจริง
ตรงกับยอดในกล่องยืนยันการจ่ายที่เจ้าของร้านรับรองไปแล้ว

**ผลที่ต้องสื่อสาร:** พอย้ายมา POS ตัวเลข Margin จะลดจาก ~73% เหลือ ~60% ไม่ใช่ระบบใหม่พัง แต่ของเดิมนับค่ามือขาด

## สถาปัตยกรรม

```
Vercel Cron (22:00 น. ไทย = 15:00 UTC)
        │  Authorization: Bearer CRON_SECRET
        ▼
/api/cron/daily-report/route.ts     ← ดึงข้อมูลอย่างเดียว ไม่มีสูตร
        │  createServiceClient() ข้าม RLS
        ▼
src/lib/daily-report.ts             ← สูตรล้วน ไม่แตะฐานข้อมูล มีเทสคุม
        │  buildDailyReport(input) → DailyReport
        ▼
src/lib/daily-report-flex.ts        ← ประกอบ Flex ตามโครงเดิม มีเทสคุม
        │  dailyReportFlex(report) → FlexMessage
        ▼
pushAssistantFlex()  ใน src/lib/line-assistant.ts
        ▼
LINE push API → กลุ่ม Sookkaya Management
```

เหตุผลที่แยกสามชั้น: สูตรกับการประกอบการ์ดเป็นฟังก์ชันบริสุทธิ์ เทสได้โดยไม่ต้องต่อฐานข้อมูลหรือยิงไลน์จริง
route เหลือหน้าที่แค่ query + ส่ง ตามแบบเดียวกับ `/api/cron/birthday-reminder` ที่มีอยู่

## นิยามตัวเลขทุกช่อง

ทุกช่องอิง **วันที่ตามเวลาไทย** ที่ cron ทำงาน (`todayInShopTz()`) เรียกว่า `today`

### จาก `v_daily_summary` (คีย์ `sale_date = today`)

| ช่อง | คอลัมน์ | หมายเหตุ |
|---|---|---|
| NET REVENUE | `net_revenue` | `sum(coalesce(revenue_recognize, net_amount))` — ตัดเครดิตแถมออกแล้ว |
| Cash In | `cash_in` | เงินรับจากบิล (ตาม `received_date`) + เงินเติมเครดิต |
| Sessions | `sessions` | `count(*) from sales` |

ถ้าไม่มีแถวของ `today` ให้ถือว่าทุกค่าเป็น 0 และเข้าโหมด "ไม่มีการขาย" (ดูหัวข้อกรณีพิเศษ)

### จาก `v_commission_daily` (คีย์ `work_date = today`)

| ช่อง | คอลัมน์ |
|---|---|
| ค่ามือรวม | `commission` = `sum(v_therapist_daily.total_income)` = ค่ามือหลังประกันมือ + ค่ารีเควส |

**ห้าม** `sum(sales.commission)` เอง จะขาดประกันมือและค่ารีเควส

### คำนวณต่อ

```
กำไรขั้นต้น = net_revenue − ค่ามือรวม
Margin      = net_revenue > 0 ? กำไรขั้นต้น / net_revenue × 100 : 0
```

ป้ายในการ์ดเปลี่ยนจาก `✨ กำไรสุทธิ` เป็น `✨ กำไรขั้นต้น` ให้ตรงกับสูตร
(เจ้าของร้านเลือกสูตรนี้เอง เพราะรายจ่ายก้อนใหญ่กระจุกเป็นวันๆ ถ้าหักด้วยจะติดลบทั้งที่ขายดี
และค่ามือหมอถูกบันทึกซ้ำในตาราง `expenses` ด้วย หักตรงๆ จะนับซ้ำ)

### ลูกค้าไม่ซ้ำ

```sql
select count(distinct customer_id) from sales
where sale_date = today and customer_id is not null
```

### vs avg 7d

```
prior = แถว v_daily_summary ที่ sale_date อยู่ใน [today−7, today−1] และ sessions > 0
เงื่อนไขแสดงผล: prior.length >= 3 และ avg > 0
avg   = sum(prior.net_revenue) / prior.length
delta = (net_revenue − avg) / avg × 100
ข้อความ = (delta >= 0 ? '▲ ' : '▼ ') + |delta|.toFixed(1) + '% vs avg 7d'
```

หารด้วยจำนวนวันที่มีข้อมูลจริง ไม่ใช่ 7 คงที่ — `v_daily_summary` ไม่มีแถวของวันที่ร้านปิด
ถ้าหารด้วย 7 วันหยุดจะกดค่าเฉลี่ยให้ต่ำเกินจริง

### TOP หมอ

```sql
select t.name, td.sessions, td.total_income
from v_therapist_daily td join therapists t on t.id = td.therapist_id
where td.work_date = today
order by td.total_income desc limit 1
```

แสดง `{ชื่อ} · ฿{total_income} ({sessions} sess)` — ถ้าไม่มีหมอทำงานเลย ซ่อนบรรทัดนี้

### MTD (ใหม่)

```
monthStart   = วันที่ 1 ของเดือน today
mtd          = sum(v_daily_summary.net_revenue) ที่ sale_date ใน [monthStart, today]
prevMonthDay = วันเดียวกันของเดือนที่แล้ว (ถ้าเดือนที่แล้วไม่มีวันนั้น ใช้วันสุดท้ายของเดือน)
mtdPrev      = sum(v_daily_summary.net_revenue) ที่ sale_date ใน [เดือนที่แล้ววันที่ 1, prevMonthDay]
mtdDelta     = mtdPrev > 0 ? (mtd − mtdPrev) / mtdPrev × 100 : null
```

แสดงเป็นแถว op: `📅 MTD` → `฿{mtd} · ▲{x}% vs เดือนที่แล้ว`
ถ้า `mtdPrev = 0` แสดงแค่ `฿{mtd}` ไม่แสดง %

ใช้ตัวเปรียบเทียบแบบ "ช่วงวันเท่ากัน" ให้ตรงหลักเดียวกับหน้าวิเคราะห์รายจ่ายที่มีอยู่

### คิวจองพรุ่งนี้ (ใหม่)

```sql
select count(*) from queue_entries
where queue_date = today + 1 and status not in ('cancelled','rejected')
```

แสดงเป็นแถว op: `🗓 คิวจองพรุ่งนี้` → `{n} คิว`
ถ้า `n = 0` ยังแสดง `0 คิว` (การไม่มีคิวคือข้อมูลที่เจ้าของร้านต้องรู้)

### Action alerts

นับจาก view `member_balances` โดย**นับใน SQL ไม่ดึงแถวมานับเอง** — view มีมากกว่า 1,000 แถว เกินเพดาน supabase-js

```
เครดิตหมด   = count(*) where credit_granted > 0 and credit_balance <= 0
เครดิตใกล้หมด = count(*) where credit_balance > 0 and credit_balance <= 1500
```

ค่า ณ 5 ส.ค. 2569: เครดิตหมด 2 คน · ใกล้หมด 18 คน · ไม่มีใครติดลบ

| # | เงื่อนไข | ข้อความ |
|---|---|---|
| 1 | เครดิตหมด > 0 | `🔴 Member {n} คน เครดิตหมด → เชียร์ขาย Top-up ใหม่` |
| 2 | ใกล้หมด > 0 | `🟠 Member {n} คน เครดิตใกล้หมด (≤฿1,500) → เตือนเติมต่อ` |
| 3 | prior.length >= 3 และ sessions < avgSessions × 0.7 | `📉 Sessions ต่ำกว่าค่าเฉลี่ย 7 วัน {n}% → ส่งโปร LINE OA พรุ่งนี้` |
| 4 | กำไรขั้นต้น < 0 | `⚠️ กำไรขั้นต้นติดลบ ฿{|กำไร|} → ตรวจค่ามือ/ส่วนลด` |

เรียงตามลำดับนี้แล้วตัดเหลือ 3 ข้อแรก เหมือนเดิม
`avgSessions = sum(prior.sessions) / prior.length`

## โครงสร้าง Flex Message

คงโครงเดิมทั้งหมด เปลี่ยนเฉพาะที่ระบุ

### สี

```
green '#2A4A3A'  gold '#C9A96E'  beige '#F4ECDE'  beigeDk '#E5E0D5'
text '#2A1F1D'   textSub '#786A5E'  textMuted '#9C8E80'
positive '#5F8A4F'  negative '#C0392B'
```

### Envelope

```
type 'flex'
altText '🌿 Sookkaya — {D M ปีพ.ศ.} · Net Revenue ฿{netRevenue}'
contents.type 'bubble' · size 'mega'
styles { body.backgroundColor '#FFFFFF', footer.backgroundColor '#FFFFFF' }
```

### Header — box vertical · backgroundColor green · paddingAll '18px' · spacing 'xs'

| ข้อความ | สี | size | อื่น |
|---|---|---|---|
| `🌿 SOOKKAYA` | beige | lg | bold · letterSpacing '0.1em' |
| `Daily Report` | gold | xs | letterSpacing '0.2em' |
| `วันพุธที่ 5 ส.ค. 2569` | beige | sm | margin 'sm' |

### Body — box vertical · paddingAll '18px' · spacing 'none'

1. **Hero** box vertical
   - box horizontal: `NET REVENUE · วันนี้` (textMuted, xxs, bold) + [ถ้ามี] ข้อความ vs avg 7d (xxs, bold, align 'end', สี positive/negative)
   - `฿{netRevenue}` (text, xxl, bold, margin 'xs')
2. separator margin 'lg' color beigeDk
3. **3 คอลัมน์** box horizontal · spacing 'md' · margin 'md' — แต่ละคอลัมน์ box vertical spacing 'xs' มี label (textMuted, xxs, bold) + value (sm, bold)
   - `💵 Cash In` → `฿{cashIn}` สี text
   - `✨ กำไรขั้นต้น` → `฿{grossProfit}` สี positive ถ้า ≥0 ไม่งั้น negative
   - `📊 Margin` → `{margin.toFixed(1)}%` สี text
4. separator margin 'lg' color beigeDk
5. **แถว op** box vertical · spacing 'sm' · margin 'md' — แต่ละแถว box horizontal มี label flex 4 (textSub, xs) + value flex 6 (xs, bold, align 'end', wrap true)
   - `👥 Sessions` → `{sessions} sessions · {customers} ลูกค้า` สี text
   - `💼 ค่ามือรวม` → `฿{commission}` สี gold
   - `🏆 TOP หมอ` → `{ชื่อ} · ฿{income} ({n} sess)` สี text — ซ่อนถ้าไม่มี
   - `📅 MTD` → `฿{mtd} · ▲{x}% vs เดือนที่แล้ว` สี text — **ใหม่**
   - `🗓 คิวจองพรุ่งนี้` → `{n} คิว` สี text — **ใหม่**
6. **Alerts** (ถ้ามี) separator → `⚠️ Action ที่ต้องทำวันนี้` (negative, sm, bold, margin 'md') → แต่ละข้อ `• {alert}` (text, xs, wrap true, margin 'sm')

### Footer — box vertical · paddingAll '14px' · paddingTop '0px'

- button style 'primary' · color green · height 'md'
  action uri label `📊 ดูยอดขายวันนี้` → `https://sookkaya-pos.vercel.app/today` ← **เปลี่ยนปลายทาง**
- text `รายละเอียดหมอแต่ละคน · สมาชิก · Top บริการ · MTD` (textMuted, xxs, align 'center', margin 'sm', wrap true)

### การจัดรูปแบบตัวเลข

```
fmt(n)  = Math.round(n).toLocaleString('th-TH')     ไม่มีทศนิยม
วันที่หัวการ์ด = 'วันพุธที่ 5 ส.ค. 2569'  (ปี พ.ศ. = ค.ศ. + 543)
altText       = '5 ส.ค. 2569'
```

## กรณีพิเศษและการกันพัง

| กรณี | พฤติกรรม |
|---|---|
| ไม่มีแถวใน `v_daily_summary` ของวันนี้ (ร้านปิด / ยังไม่มีบิล) | ส่งการ์ดแบบสั้น: header เหมือนเดิม + ข้อความ `วันนี้ยังไม่มีบิลในระบบ` + ปุ่ม ไม่ส่งเลข 0 ทุกช่องให้เข้าใจผิดว่าขายไม่ได้ |
| ไม่มีหมอทำงาน | ซ่อนแถว TOP หมอ ช่องค่ามือแสดง ฿0 |
| ข้อมูล 7 วันย้อนหลังไม่ถึง 3 วัน | ซ่อนข้อความ vs avg 7d และไม่ตรวจ alert ข้อ 3 |
| `LINE_ASSISTANT_CHANNEL_TOKEN` หรือ group id ไม่ได้ตั้ง | `pushAssistantFlex` คืน false เงียบๆ route ตอบ `{ ok: false, reason: "line_not_configured" }` ไม่ throw |
| LINE API ตอบไม่ใช่ 200 | `console.error` พร้อม status + body (ไม่ log token) route ตอบ `{ ok: false }` HTTP 200 เพื่อไม่ให้ Vercel retry ซ้ำจนสแปมกลุ่ม |
| query ฐานข้อมูลพัง | throw ให้ route จับแล้วตอบ `{ ok: false, error }` — ไม่ส่งการ์ดที่ตัวเลขไม่ครบเข้ากลุ่ม |
| cron ยิงซ้ำวันเดียวกัน | ยอมให้ส่งซ้ำ ไม่ทำ dedupe — Vercel cron ยิงวันละครั้ง ความซับซ้อนไม่คุ้ม |

## ความปลอดภัย

- route อยู่ใต้ `/api/cron` ซึ่ง `PUBLIC_ROUTES` ครอบไว้แล้ว **จึงต้องตรวจ `CRON_SECRET` เองในตัว route** ตามแบบ `birthday-reminder`:
  ```ts
  const auth = request.headers.get("authorization")
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) return 401
  ```
  ไม่ตั้ง `CRON_SECRET` = 401 เสมอ (fail closed)
- ใช้ `createServiceClient()` เพราะ cron ไม่มี session และ `expenses`/`member_balances` ถูก RLS คุมไว้
- ห้าม log ค่า token หรือ group id

## Environment variables

| ตัวแปร | สถานะ |
|---|---|
| `CRON_SECRET` | มีอยู่แล้ว |
| `LINE_ASSISTANT_CHANNEL_TOKEN` | มีอยู่แล้ว — **ต้องยืนยันตอนลงมือว่าเป็น OA `@369wlnfe` ตัวเดียวกับที่ส่ง Daily Report** โดยเรียก `GET /v2/bot/info` แล้วเทียบ `basicId` ถ้าคนละตัวต้องเพิ่มตัวแปรใหม่แยก |
| `LINE_MANAGEMENT_GROUP_ID` | **ใหม่** — `C20fece7eb07ca5b2f86ccf31e9c86dfd` แยกจาก `LINE_ASSISTANT_QUEUE_GROUP_ID` ที่เป็นกลุ่มทีมร้าน คนละกลุ่มกัน |

เพิ่มทั้งสองตัวใน `.env.example` ด้วย ตอนนี้ไฟล์นั้นมีแค่ 2 บรรทัด ไม่ครบ

## Cron

เพิ่มใน `vercel.json`:

```json
{ "path": "/api/cron/daily-report", "schedule": "0 15 * * *" }
```

`0 15 * * *` UTC = 22:00 น. เวลาไทย

ข้อควรระวัง: แผนฟรีของ Vercel จำกัดจำนวน cron และความถี่ (วันละครั้ง) โปรเจกต์นี้จะมี 2 ตัว
(เตือนวันเกิด 08:00 + daily report 22:00) — ตอนลงมือให้ยืนยันกับ deploy จริงว่า cron ตัวที่สองทำงาน
ถ้าแผนไม่รองรับ ให้ยุบเป็น route เดียวที่ดูเวลาแล้วเลือกงาน

เวลาส่งอาจคลาดเคลื่อนภายในชั่วโมงเดียวกัน เหมือนที่ Apps Script `atHour(22)` เป็นอยู่แล้ว

**ข้อจำกัดที่ยอมรับ:** รายงานสรุปยอด ณ 22:00 น. ถ้าร้านยังไม่ปิดและมีบิลหลังจากนั้น จะไม่อยู่ในการ์ด
ของเดิมก็เป็นแบบนี้ ถ้าอยากได้ยอดปิดวันจริงต้องเลื่อนเวลาส่ง

## การทดสอบ

เขียนเทสก่อนโค้ดจริง (TDD) ทั้งสองไฟล์ lib

**`daily-report.test.ts`** — ป้อนข้อมูลจำลอง ตรวจผลลัพธ์
- กำไรขั้นต้นและ margin จากตัวเลขจริงวันที่ 4 ส.ค. 2569: net 11,673.67 − ค่ามือ 4,680 = 6,993.67 · margin 59.9%
- vs avg 7d: มีข้อมูล 3 วันขึ้นไปถึงคำนวณ · น้อยกว่านั้นคืน null
- vs avg 7d หารด้วยจำนวนวันที่มีข้อมูล ไม่ใช่ 7 คงที่
- MTD เทียบช่วงวันเท่ากันของเดือนที่แล้ว · เดือนที่แล้วเป็น 0 คืน null
- MTD เดือนที่แล้วมีวันไม่ครบ (31 → 30) ใช้วันสุดท้ายของเดือน
- alert ครบทั้ง 4 เงื่อนไข และตัดเหลือ 3 ข้อเมื่อเข้าเงื่อนไขครบ
- ไม่มีหมอทำงาน → topTherapist เป็น null
- ไม่มีบิลเลย → โหมด `empty` เป็น true

**`daily-report-flex.test.ts`**
- โครง bubble มี header/body/footer ครบ · สีตรงตามที่กำหนด
- ปุ่มลิงก์ไป `/today`
- ซ่อนแถว TOP หมอ เมื่อไม่มีหมอ · ซ่อนบล็อก alert เมื่อไม่มี alert
- โหมด `empty` ได้การ์ดสั้น ไม่มีบล็อกตัวเลข
- altText มีวันที่และยอด

**ตรวจของจริงก่อนเปิดใช้:** เรียก route ด้วย `CRON_SECRET` จากเครื่อง แล้วเทียบตัวเลขทุกช่องกับหน้า `/today` ของวันเดียวกันด้วยตา ก่อนตั้ง cron

## ขั้นตอนตัดสวิตช์ (คนต้องทำเอง)

1. deploy แล้วยิง route ด้วยมือ ตรวจการ์ดที่เข้ากลุ่มว่าตัวเลขตรงกับ `/today`
2. **ปิด trigger 22:00 ของ Apps Script เดิม** — ไม่งั้นได้การ์ดวันละ 2 ใบ ตัวเลขไม่ตรงกัน สร้างความสับสน
3. แนะนำให้ออก channel access token ใหม่ให้ OA `@369wlnfe` แล้วอัปเดตใน Vercel — ตัวปัจจุบันเขียนเปลือยอยู่ในไฟล์ `.gs` บนเครื่องตั้งแต่ มิ.ย. 2569 · OA ตัวนี้คนละตัวกับ OA ลูกค้า จึงไม่กระทบ Slip2Go
4. เลิกกรอก Google Sheet ได้

## สิ่งที่ไม่ทำ (YAGNI)

- ไม่ทำบิลค้างรับในการ์ด — เจ้าของร้านตัดออก ปัจจุบันไม่มีบิลค้างเลย
- ไม่ทำหน้าตั้งค่าเวลาส่ง/เปิดปิดในเว็บ — แก้ `vercel.json` เอาก็พอ
- ไม่เก็บประวัติการ์ดที่ส่งลงฐานข้อมูล — ดูย้อนหลังในไลน์ได้อยู่แล้ว
- ไม่ทำ dedupe กันส่งซ้ำ
