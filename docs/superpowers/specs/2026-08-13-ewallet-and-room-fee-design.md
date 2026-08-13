# ช่องทาง E-Wallet และการแยกรายรับค่าห้องสปา

**วันที่:** 2026-08-13
**สถานะ:** อนุมัติแล้ว รอเขียนแผน

## ที่มา

เทียบยอดช่วง 1–10 ส.ค. 2026 ระหว่าง POS ของร้านกับ ThaiHand แล้วเจอส่วนต่างฝั่งบัตรเครดิต
3,710 บาท ซึ่งไล่จนได้ต้นตอครบทั้งสองใบ:

| ใบ | ระบบเราบันทึก | ThaiHand บันทึก | สาเหตุ |
|---|---|---|---|
| บิล อาลี 9 ส.ค. 1,290 ฿ | บัตรเครดิต | E-Wallet (WeChat) | **ระบบไม่มีช่องทาง E-Wallet ให้เลือก** |
| เติมเงิน โบว36 10 ส.ค. 5,000 ฿ | QR Code | บัตรเครดิต | พนักงานกดผิด และ**หน้าประวัติไม่แสดงช่องทางให้เห็น** |

ระหว่างตรวจยังพบว่าบรรทัด "มูลค่าเต็มตามเมนู" ในการ์ดรายรับกลืนค่าห้องสปาเข้าไปด้วยอย่างเงียบ ๆ
(140,830 = ราคาเมนูจริง 140,730 + ค่าห้อง 100) ทำให้แจกแจงไม่ได้ว่ารายได้มาจากอะไร

สเปกนี้แก้ทั้งสามเรื่อง

## ขอบเขต

**ทำ**

1. เพิ่มช่องทางชำระเงิน `E-Wallet` ให้ครบทุกจุดที่ระบบรู้จักช่องทาง
2. แยกรายรับค่าห้องสปาออกจากค่าบริการนวด แสดงในหน้า **ยอดวันนี้** และ **รายงาน**
3. หน้าประวัติการเติมเงินสมาชิก: แสดงช่องทางชำระเงิน และแก้ช่องทางได้

**ไม่ทำ**

- ไม่แก้ข้อมูลเก่าสองรายการในตารางข้างบน — จะรายงานให้ Boss ตัดสินใจหลังระบบพร้อม
- ไม่แยก E-Wallet เป็นรายยี่ห้อ (TrueMoney / WeChat / Alipay) — ThaiHand รายงานเป็นก้อนเดียว
  ถ้าอยากรู้ยี่ห้อให้พิมพ์ในช่องหมายเหตุ
- ไม่เปิดให้แก้จำนวนเงินของใบเติมเงิน (เหตุผลในส่วนที่ 3)
- เคสนิกกี้และทิวลิปพนักงานแก้เองเรียบร้อยแล้วเมื่อ 13 ส.ค. ไม่ต้องทำอะไรเพิ่ม

## Global Constraints

- ชื่อช่องทางใหม่สะกดว่า `E-Wallet` เป๊ะ ๆ ทุกที่ (ตรงกับที่ ThaiHand ใช้)
- ยอด `ยอดรับจริง (Volume)` และ `รายรับที่รับรู้` **ห้ามเปลี่ยนแม้แต่บาทเดียว** จากงานนี้
- ยอดรวมของหน้ารายงานต้องมาจาก view เท่านั้น ห้ามบวกจากแถวดิบ (เพดาน 1,000 แถวของ PostgREST)
- `create or replace view` ต้องระบุ `security_invoker = true` ซ้ำทุกครั้ง
- วันที่ทุกที่ใช้เขตเวลากรุงเทพ `(now() at time zone 'Asia/Bangkok')::date` ห้ามใช้ `current_date`
- สูตรเงินของบิลอยู่ที่ `src/lib/sale-math.ts` ที่เดียว ห้ามคำนวณซ้ำที่อื่น

---

## ส่วนที่ 1 — ช่องทาง E-Wallet

### ปัญหาเชิงโครงสร้าง

หน้าจอทุกหน้าเรนเดอร์ปุ่มช่องทางจากตัวแปรกลางอยู่แล้ว ไม่มีที่ไหน hardcode
แต่ตัวแปรกลางถูกก๊อปไว้ **3 ชุดที่มีเนื้อเหมือนกันเป๊ะ**:

| ชุด | ที่อยู่ | เนื้อ |
|---|---|---|
| `PAYMENT_LINE_METHODS` | `src/lib/payments.ts:4` | เงินสด · QR Code · บัตรเครดิต |
| `POINT_EARNING_METHODS` | `src/lib/points.ts:16` | เงินสด · QR Code · บัตรเครดิต |
| `TOPUP_PAYMENTS` | `src/app/(app)/members/topup-form.tsx:19` | QR Code · เงินสด · บัตรเครดิต |

ทั้งสามคือแนวคิดเดียวกัน — "ช่องทางเงินจริงที่ลูกค้าจ่ายตรงกับร้าน" การมีสามชุดคือเหตุผลที่
การเพิ่มช่องทางใหม่มีโอกาสลืมบางจุด

### ทางแก้

ประกาศชุดกลางชุดเดียวใน `src/lib/constants.ts`:

```ts
/**
 * ช่องทางเงินจริงที่ลูกค้าจ่ายตรงกับร้าน — ได้แต้ม · แบ่งจ่ายได้ · เติมเงินสมาชิกได้
 * ต่างจาก Gowabi/KOL (เงินผ่านคนกลาง) และ Member Credit (จ่ายไปแล้วตอนเติม)
 */
export const REAL_MONEY_METHODS = [
  "เงินสด",
  "QR Code",
  "บัตรเครดิต",
  "E-Wallet",
] as const
```

แล้วให้ทั้งสามชื่อเดิมชี้มาที่ชุดนี้ — คงชื่อเดิมไว้เพื่อให้อ่านโค้ดแล้วรู้เจตนา และเผื่อวันหนึ่ง
ต้องแยกออกจากกันจริง ๆ จะได้แก้เป็นจุด ๆ ไม่ใช่รื้อทั้งระบบ

**ลำดับในอาร์เรย์สำคัญ** เพราะหน้าจอเรนเดอร์ปุ่มตามลำดับนี้ และ `collect-due-dialog.tsx:33`
ใช้ตัวแรกเป็นค่าตั้งต้น ลำดับที่กำหนดคือ `เงินสด · QR Code · บัตรเครดิต · E-Wallet`
ตรงกับ `PAYMENT_LINE_METHODS` และ `POINT_EARNING_METHODS` เดิมเป๊ะ ทั้งสองจุดจึงไม่มีอะไรเปลี่ยน

ผลข้างเคียงที่ยอมรับ: ฟอร์มเติมเงินสมาชิกเดิมเรียง `QR Code` ไว้ปุ่มแรก หลังแก้จะกลายเป็น
`เงินสด` ปุ่มแรก — ปุ่มครบเหมือนเดิม แค่สลับตำแหน่ง ไม่มีค่าตั้งต้นที่ถูกเลือกอัตโนมัติในฟอร์มนี้

### รายการที่ต้องแก้

| # | ไฟล์ | แก้อะไร |
|---|---|---|
| 1 | `src/lib/constants.ts` | เพิ่ม `REAL_MONEY_METHODS` · เพิ่ม `"E-Wallet"` ใน `PAYMENT_METHODS` ต่อจาก `"บัตรเครดิต"` |
| 2 | `src/lib/payments.ts` | `PAYMENT_LINE_METHODS = REAL_MONEY_METHODS` · แก้ข้อความ error บรรทัด 31 |
| 3 | `src/lib/points.ts` | `POINT_EARNING_METHODS = REAL_MONEY_METHODS` |
| 4 | `src/lib/payment-colors.ts` | เพิ่ม `E-Wallet` ใน `PAY_COLOR` · `PAY_DOT` · `PAY_SELECTED` |
| 5 | `src/app/(app)/members/topup-form.tsx` | ลบ `TOPUP_PAYMENTS` ใช้ `REAL_MONEY_METHODS` แทน |
| 6 | `src/app/(app)/members/member-actions.ts` | บรรทัด 24 ใช้ `REAL_MONEY_METHODS` แทนอาร์เรย์ที่เขียนสด |
| 7 | `src/app/(app)/payment-actions.ts` | แก้ข้อความ error บรรทัด 14 |
| 8 | `src/app/book/points-actions.ts` | เพิ่ม `"E-Wallet": "E-Wallet"` ใน `PAY_LABEL` |
| 9 | migration ใหม่ | ปลด check constraint 3 ตัว (ข้างล่าง) |
| 10 | `src/types/database.ts` | generate ใหม่หลัง migration |

**ข้อความ error ทั้งสองจุดห้ามไล่ชื่อช่องทางด้วยมือ** ให้ประกอบจาก `REAL_MONEY_METHODS.join(" / ")`
ไม่งั้นครั้งหน้าที่เพิ่มช่องทางจะลืมอีก

### สีประจำช่องทาง

ใช้ **fuchsia** — ไม่ชนกับที่ใช้อยู่ (sky = QR Code · violet = Member Credit ·
amber = บัตรเครดิต · emerald = เงินสด) และไม่ชน rose ที่ระบบใช้สื่อตัวเลขติดลบ

```ts
PAY_COLOR:    "E-Wallet": "bg-fuchsia-100 text-fuchsia-700"
PAY_DOT:      "E-Wallet": "bg-fuchsia-500"
PAY_SELECTED: "E-Wallet": "border-fuchsia-600 bg-fuchsia-600 text-white hover:bg-fuchsia-600"
```

### Migration — check constraint

ปลดล็อกทั้งสามตาราง ค่าที่มีอยู่เดิมต้องคงไว้ครบ ห้ามตัดออก:

```sql
alter table sales drop constraint sales_payment_method_check;
alter table sales add constraint sales_payment_method_check
  check (payment_method in
    ('QR Code','บัตรเครดิต','E-Wallet','Gowabi','KOL','Member Credit','เงินสด','ไม่ระบุ'));

alter table bill_payments drop constraint bill_payments_method_check;
alter table bill_payments add constraint bill_payments_method_check
  check (method in ('เงินสด','QR Code','บัตรเครดิต','E-Wallet'));

alter table member_topups drop constraint member_topups_payment_method_check;
alter table member_topups add constraint member_topups_payment_method_check
  check (payment_method in ('QR Code','เงินสด','บัตรเครดิต','E-Wallet'));
```

### กติกาของ E-Wallet

- **ได้แต้มสะสมปกติ** — เป็นเงินจริงที่ลูกค้าจ่ายตรงกับร้าน เกณฑ์เดียวกับ QR/เงินสด/บัตร
- **เติมเงินสมาชิกได้** — ลูกค้าต่างชาติซื้อแพ็กเกจด้วย WeChat/Alipay ได้
- **ใช้ในบรรทัดแบ่งจ่ายได้** — บิลเดียวจ่าย E-Wallet บางส่วน QR บางส่วนได้

### สิ่งที่ไม่ต้องแก้

หน้า **ยอดวันนี้** และ **รายงาน** ไม่ต้องแตะ — การ์ดช่องทางชำระเงินไล่จากข้อมูลจริงแบบไดนามิก
(`byPayment: Record<string, number>` ใน `today/page.tsx:299`) พอมีบิล E-Wallet ใบแรกจะโผล่เอง
พร้อมสีที่เพิ่งเพิ่มไป

---

## ส่วนที่ 2 — แยกรายรับค่าห้องสปา

### สภาพปัจจุบัน

`sales.room_fee` มีอยู่แล้วและทำงานถูกต้อง (`PRIVATE_ROOM_FEE = 100`) ตรวจช่วง 1–10 ส.ค. แล้ว
สมการ `ราคาเมนู + ค่าห้อง − ส่วนลด = ยอดรับจริง` ลงตัวพอดีทั้ง 185 แถว

แต่ `v_daily_summary` ไม่มีคอลัมน์นี้ และหน้า `/reports` ไม่ได้อ่านเลย ทั้งสองหน้าคำนวณ
`มูลค่าเต็มตามเมนู = volume + ส่วนลด` ซึ่งกลืนค่าห้องเข้าไปด้วย

### Migration — เพิ่มคอลัมน์เข้า view

เพิ่ม `room_fee_total` เข้า CTE `sales_day` ของ `v_daily_summary`:

```sql
sum(coalesce(sales.room_fee, 0)) as room_fee_total
```

และ `coalesce(s.room_fee_total, 0::numeric) as room_fee_total` ในระดับ SELECT นอกสุด
(วันที่มีแต่รายการเติมเงินไม่มีบิลขาย `s` จะเป็น null ทั้งแถว)

`create or replace view` ต้องเขียนนิยามเดิม**ทั้งก้อน**ใหม่ ไม่ใช่เขียนแค่ส่วนที่เพิ่ม —
ดึงนิยามปัจจุบันจาก `pg_views` มาเป็นฐานแล้วเติมสองบรรทัดข้างบน คอลัมน์เดิมทั้งหกตัว
(`sale_date`, `sessions`, `volume`, `net_revenue`, `discount_total`, `cash_in`) ต้องอยู่ครบ
ลำดับเดิม และต้องมี `with (security_invoker = true)` เสมอ

### waterfall ใหม่

ใช้เหมือนกันทั้งสองหน้า:

```
  มูลค่าเต็มตามเมนู      140,730     ← volume + ส่วนลด − ค่าห้องสปา
  + ค่าห้องสปา               100     ← บรรทัดใหม่ (ซ่อนเมื่อเป็น 0)
  − ส่วนลดที่ให้           −5,618
  = ยอดรับจริง (Volume)   135,212     ← เท่าเดิมเป๊ะ
```

*(ตัวเลขตัวอย่างจากช่วง 1–10 ส.ค. ณ 12 ส.ค. ก่อนพนักงานคีย์บิลนิกกี้เพิ่ม)*

สูตร:

```
grossTotal   = volumeTotal + discountTotal − roomFeeTotal
ยอดรับจริง    = grossTotal + roomFeeTotal − discountTotal = volumeTotal   (ลงตัวเสมอ)
```

**วันที่ไม่มีค่าห้องซ่อนบรรทัดนี้ไป** ไม่โชว์ 0 ให้รก — การ์ดหน้าตาเหมือนเดิมทุกประการ
และสมการ `มูลค่าเต็มตามเมนู − ส่วนลด = ยอดรับจริง` ยังคงอ่านได้ตรง ๆ

### รายการที่ต้องแก้

| # | ไฟล์ | แก้อะไร |
|---|---|---|
| 1 | migration ใหม่ | `v_daily_summary` เพิ่ม `room_fee_total` |
| 2 | `src/app/(app)/today/page.tsx` | อ่าน `room_fee_total` จาก `summaryRows` · แก้ `totalGross` (บรรทัด 293) · เพิ่มบรรทัดในการ์ด |
| 3 | `src/app/(app)/reports/page.tsx` | อ่าน `room_fee_total` · แก้ `grossTotal` (บรรทัด 192) · เพิ่มบรรทัดในการ์ด (หลังบรรทัด 462) |
| 4 | `src/types/database.ts` | generate ใหม่ |

### ข้อความ InfoDot

บรรทัด "มูลค่าเต็มตามเมนู" ปัจจุบันเขียนว่า *"ยอดถ้าทุกบิลจ่ายราคาเต็มตามเมนู ไม่หักส่วนลดใด ๆ"*
เพิ่มว่า **ไม่รวมค่าห้องสปาซึ่งแยกบรรทัดข้างล่าง**

บรรทัดใหม่ "+ ค่าห้องสปา" ได้ InfoDot ของตัวเอง:
*"ค่าห้องสปาส่วนตัว 100 บาท/ครั้ง ลูกค้าจ่ายเพิ่มจากค่าบริการนวด ส่วนลดไม่แตะยอดนี้
— รวมเป็นรายรับทางบัญชีเหมือนกัน แค่แยกให้เห็นว่ามาจากไหน"*

---

## ส่วนที่ 3 — ประวัติการเติมเงินสมาชิก

### ปัญหา

หน้าประวัติเติมเงินไม่แสดงช่องทางชำระเงินเลยสักที่ — `TopupRow` มีแค่ ชื่อ · แพ็กเกจ · วันที่ ·
วันหมดอายุ · ยอดเครดิต · เงินที่รับ พนักงานที่กดผิดจึงไม่มีทางเห็นความผิดพลาดของตัวเอง
นี่คือรากของเคสโบว36 และตอนนี้แก้ไม่ได้เลย มีแค่ `deleteTopup`

### ทำไมแก้ได้แค่ช่องทาง ไม่ให้แก้จำนวนเงิน

1. **ช่องทางเป็นป้ายกำกับล้วน ๆ** ไม่มีสูตรไหนอ่านไปคำนวณเครดิต — `credit_added`,
   `bonus_added`, `expiry_date` ไม่เกี่ยวกับช่องทาง แก้แล้วยอดเครดิตลูกค้านิ่งสนิท
2. **จำนวนเงินผูกกันเป็นลูกโซ่** `cash_received` → แต้มใน `point_transactions` ·
   `credit_added` → ยอดในกระปุก · `tier` → `expiry_date` → วันหมดอายุของทั้งกระปุก (ใช้ MAX)
3. **ทางแก้จำนวนเงินมีอยู่แล้วและปลอดภัยกว่า** = ลบใบเดิมแล้วเติมใหม่ ซึ่ง `deleteTopup`
   บังคับผ่านกันชน 3 ชั้นก่อนเสมอ: เดือนปิดงบแล้วห้ามลบ · เครดิตถูกใช้ไปแล้วห้ามลบ ·
   ลบแล้ววันหมดอายุถอยต้องยืนยันซ้ำ ปุ่ม "แก้ยอด" จะเป็นประตูหลังที่ข้ามกันชนทั้งสามชั้น

### รายการที่ต้องแก้

| # | ไฟล์ | แก้อะไร |
|---|---|---|
| 1 | migration ใหม่ | `member_topups` เพิ่ม `edited_by text` · `edited_at timestamptz` |
| 2 | `src/app/(app)/members/member-actions.ts` | เพิ่ม `updateTopupPaymentMethod(id, method)` |
| 3 | `src/app/(app)/members/page.tsx` | ดึง `payment_method` มาใส่ `TopupRow` |
| 4 | `src/app/(app)/members/topup-history-list.tsx` | แสดงป้ายช่องทาง + ปุ่มแก้ |
| 5 | `src/types/database.ts` | generate ใหม่ |

### `updateTopupPaymentMethod`

```
รับ: id, method
ตรวจ: method ต้องอยู่ใน REAL_MONEY_METHODS  → ไม่งั้นคืน error
      ต้องมีใบเติมเงิน id นี้จริง            → ไม่งั้นคืน "ไม่พบใบเติมเงินนี้"
เขียน: payment_method
       edited_by = (await getMyProfile())?.full_name ?? null   (แบบเดียวกับ payment-actions.ts:30)
       edited_at = now()
       ห้ามแตะคอลัมน์อื่นเด็ดขาด
revalidate: /members, /today, /reports, /customers/<customer_id>
```

**ไม่ล็อกเดือน** ต่างจาก `deleteTopup` เพราะช่องทางไม่ทำให้ยอดรวมขยับสักบาท มีแต่ทำให้เดือนที่
ปิดไปแล้ว*ถูกต้องขึ้น* ถ้าล็อกไว้ เคสที่เจอย้อนหลัง (แบบโบว36) จะแก้ไม่ได้ตลอดกาล — และ
`edited_by`/`edited_at` คือสิ่งที่ทำให้ยังตามรอยได้ว่าใครแก้เมื่อไหร่

### หน้าจอ

- ป้ายช่องทางแสดงข้างยอดเงินของทุกรายการ ใช้ `PAY_COLOR` ชุดเดียวกับหน้าอื่น
- ปุ่ม "แก้ช่องทาง" กางปุ่มเลือก 4 ช่องทางจาก `REAL_MONEY_METHODS` กดแล้วเปลี่ยนทันที
  ไม่ต้องยืนยันสองจังหวะเหมือนปุ่มลบ (แก้ผิดกดใหม่ได้ ไม่มีอะไรเสียหาย)
- ข้อความท้ายรายการเดิมคงไว้ และเสริมว่า **ช่องทางชำระเงินแก้ได้เลยโดยไม่ต้องลบใบ**

---

## การทดสอบ

**E-Wallet**

- `earnsPoints("E-Wallet")` เป็น `true`
- `parsePaymentLines` รับ `E-Wallet` และคำนวณยอดรวมถูก
- `createSale` / `updateSale` บันทึกบิล `E-Wallet` ได้ และคิดแต้มให้
- `createTopup` รับ `E-Wallet` ได้
- ข้อความ error ของ `parsePaymentLines` และ `addBillPayment` ต้องมีคำว่า `E-Wallet` อยู่
  (พิสูจน์ว่าประกอบจาก `REAL_MONEY_METHODS` จริง ไม่ได้เขียนชื่อด้วยมือ)

**ค่าห้องสปา**

- บิลไม่มีค่าห้อง: `grossTotal + roomFeeTotal − discountTotal === volumeTotal`
- บิลมีค่าห้อง: สมการเดียวกันยังลงตัว และ `grossTotal` น้อยกว่าเดิมเท่ากับค่าห้องพอดี
- `roomFeeTotal = 0` แล้วบรรทัดต้องไม่ถูกเรนเดอร์

**ประวัติเติมเงิน**

- `updateTopupPaymentMethod` เปลี่ยนเฉพาะ `payment_method` — อ่านแถวก่อนและหลัง แล้ว
  ยืนยันว่า `cash_received`, `credit_added`, `bonus_added`, `expiry_date`, `tier`,
  `topup_date` เท่าเดิมทุกตัว
- ยอดเครดิตของลูกค้าใน `member_balances` ต้องเท่าเดิมหลังแก้ช่องทาง
- ส่ง method ที่ไม่รู้จักต้องได้ error ไม่ใช่เขียนลงฐานข้อมูล
- แก้ใบของเดือนก่อนได้ (ยืนยันว่าไม่ล็อกเดือน)

**เพิ่มข้อตรวจใน `supabase/reconciliation.sql`**

- `room_fee_total` ใน `v_daily_summary` ต้องเท่ากับ `sum(room_fee)` ในตาราง `sales` ทุกวัน

## ขึ้น production

`git fetch && git rebase origin/main && git push` ก่อน `vercel deploy --prod` เสมอ
(เคยโดนเซสชันอื่น push แล้วแย่ง alias ไป)

## หลังทำเสร็จ — ข้อมูลค้างที่ต้องถาม Boss

รายงานให้ Boss ตัดสินใจ **ห้ามแก้เอง**:

| รายการ | ตอนนี้ | ควรเป็น |
|---|---|---|
| บิล อาลี 9 ส.ค. `SK-20260809-014` 1,290 ฿ | บัตรเครดิต | E-Wallet |
| เติมเงิน โบว36 10 ส.ค. 5,000 ฿ | QR Code | บัตรเครดิต |

แก้ทั้งสองใบแล้วยอดบัตรเครดิตช่วง 1–10 ส.ค. จะเป็น 35,540 บาท เท่ากับ ThaiHand พอดี

## เกี่ยวข้อง

- `docs/superpowers/specs/2026-08-10-thaihand-total-design.md` — บรรทัดยอดรวมเทียบ ThaiHand
- `docs/superpowers/specs/2026-08-11-member-credit-single-expiry-design.md` — กติกาเครดิตกระปุกเดียว
- `supabase/migrations/20260727150000_private_room_fee.sql` — ที่มาของ `room_fee`
