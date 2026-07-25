import { describe, expect, it } from "vitest"
import { promoKey } from "./promo"

describe("promoKey", () => {
  it("ยุบ Happy Hours ทุกแบบที่พนักงานเคยพิมพ์ให้เป็นคีย์เดียว", () => {
    expect(promoKey("Happy Hours")).toBe("happyhours")
    expect(promoKey("Happy hours")).toBe("happyhours")
    expect(promoKey("HappyHours")).toBe("happyhours")
    expect(promoKey("hApPy hOuRS")).toBe("happyhours")
    expect(promoKey("  happy   hours  ")).toBe("happyhours")
  })

  it("ยุบรหัสจอง Gowabi ทุกเลขให้เป็น gowabi เดียว", () => {
    expect(promoKey("Gowabi 517620293")).toBe("gowabi")
    expect(promoKey("Gowabi224653839")).toBe("gowabi")
    expect(promoKey("Gowabi    810131039")).toBe("gowabi")
  })

  it("ไม่ยุบชื่อที่ต่างกันจริง — happyhour กับ 1แถม1 ต้องคนละคีย์", () => {
    expect(promoKey("1 แถม 1")).toBe("1แถม1")
    expect(promoKey("1 แถม 1 (คูปอง)")).toBe("1แถม1(คูปอง)")
    expect(promoKey("60แถม30 member")).toBe("60แถม30member")
  })

  it("ค่าว่างและ null ให้คีย์ว่าง", () => {
    expect(promoKey(null)).toBe("")
    expect(promoKey("")).toBe("")
    expect(promoKey("   ")).toBe("")
  })
})

/**
 * คู่ข้อความจริงจากฐานข้อมูล พร้อมคีย์ที่ฟังก์ชัน SQL `public.promo_key()` คืนจริง
 * ถ้าเทสนี้ตก แปลว่า TS กับ SQL ไม่ตรงกันแล้ว — หน้าตั้งค่าจะจัดกลุ่มคนละแบบกับรายงาน
 * ถ้าตั้งใจแก้ฟังก์ชัน ต้องแก้ทั้งสองฝั่งแล้วรันใหม่เพื่ออัปเดตคู่ข้างล่างนี้
 */
const SQL_PAIRS: [string, string][] = [
  ["1 แถม 1 (คูปอง)", "1แถม1(คูปอง)"],
  ["1 แถม 1 (โบรชัวร์)", "1แถม1(โบรชัวร์)"],
  ["1แถม1", "1แถม1"],
  ["60แถม30 member", "60แถม30member"],
  ["add balm 100", "addbalm100"],
  ["Gowabi    810131039", "gowabi"],
  ["Gowabi 517620293", "gowabi"],
  ["Gowabi224653839", "gowabi"],
  ["happy hour", "happyhour"],
  ["Happy Hour", "happyhour"],
  ["hApPy hOuRS", "happyhours"],
  ["hAPpY hOUrS", "happyhours"],
  ["Happy hours", "happyhours"],
  ["Happy Hours", "happyhours"],
  ["HappyHours", "happyhours"],
  ["kOL", "kol"],
  ["May กิตติยา0936166365", "mayกิตติยา0936166365"],
  ["Member พนง.พันธ์ุไทย", "memberพนง.พันธ์ุไทย"],
  ["Member ไม่เอาพี่โจ", "memberไม่เอาพี่โจ"],
  ["test ก่อนถ่ายทำ", "testก่อนถ่ายทำ"],
  ["จรัญ 0659389463", "จรัญ0659389463"],
  ["ซื้อGold Member", "ซื้อgoldmember"],
  ["ซื้อSliver member", "ซื้อslivermember"],
  ["ซื้อSliver Member", "ซื้อslivermember"],
  ["เทสนวดหัว 60นาที", "เทสนวดหัว60นาที"],
  ["ไม่เอาพี่ลัย ไม่เอายาหม่องทั้งสองท่าน", "ไม่เอาพี่ลัยไม่เอายาหม่องทั้งสองท่าน"],
  ["ลด 10%", "ลด10%"],
  ["ลด 15%", "ลด15%"],
  ["โปรโบวชัวร์ 1 แถม1", "โปรโบวชัวร์1แถม1"],
  ["ส่วนต่างหักที่Member", "ส่วนต่างหักที่member"],
  ["ให้ทริปน้องเค้ก 100 บาท", "ให้ทริปน้องเค้ก100บาท"],
  ["แอ้ม ตรีมุข 0905674782", "แอ้มตรีมุข0905674782"],
]

describe("promoKey ตรงกับฟังก์ชัน SQL", () => {
  it.each(SQL_PAIRS)("promoKey(%j) = %j", (raw, expected) => {
    expect(promoKey(raw)).toBe(expected)
  })
})

import { promoDiscountBaht } from "./promo"

describe("promoDiscountBaht", () => {
  it("คำนวณส่วนลดจาก % ตรงตัวเมื่อหารลงตัว", () => {
    expect(promoDiscountBaht(500, 15)).toBe(75)
    expect(promoDiscountBaht(500, 20)).toBe(100)
    expect(promoDiscountBaht(1000, 15)).toBe(150)
  })

  it("ปัดเศษเป็นบาทเต็ม (เศษสตางค์ทำให้กดชำระไม่ได้)", () => {
    expect(promoDiscountBaht(550, 15)).toBe(83) // 82.5 → 83
    expect(promoDiscountBaht(590, 15)).toBe(89) // 88.5 → 89
    expect(promoDiscountBaht(333, 20)).toBe(67) // 66.6 → 67
  })

  it("ไม่เกินราคาขาย และกันค่าประหลาด", () => {
    expect(promoDiscountBaht(100, 100)).toBe(100)
    expect(promoDiscountBaht(100, 150)).toBe(100)
    expect(promoDiscountBaht(0, 15)).toBe(0)
    expect(promoDiscountBaht(-50, 15)).toBe(0)
    expect(promoDiscountBaht(500, 0)).toBe(0)
    expect(promoDiscountBaht(500, -5)).toBe(0)
    expect(promoDiscountBaht(NaN, 15)).toBe(0)
    expect(promoDiscountBaht(500, NaN)).toBe(0)
  })
})

import { happyHourDiscountBaht } from "./promo"

const HH_SERVICES = [
  { name: "นวดแผนไทย 60 นาที", price: 390 },
  { name: "นวดแผนไทย 90 นาที", price: 550 },
  { name: "นวดคลายเท้า & คอบ่าไหล่ 60 นาที", price: 490 },
  { name: "นวดคลายเท้า & คอบ่าไหล่ 90 นาที", price: 690 },
  { name: "ทรีตเมนต์ขัดผิว + นวดน้ำมัน 60 นาที", price: 690 },
  { name: "ทรีตเมนต์ขัดผิว + นวดน้ำมัน 90 นาที", price: 990 },
  { name: "นวดคอ บ่า ไหล่ 60 นาที", price: 590 },
  { name: "นวดศีรษะดั้งเดิม 90 นาที", price: 990 }, // ไม่มีตัว 60 ในลิสต์นี้
]

describe("happyHourDiscountBaht (นวด 90 จ่ายราคา 60)", () => {
  it("เมนูนวด 90 นาที → ส่วนลด = ราคา 90 − ราคา 60 ของเมนูเดียวกัน", () => {
    expect(happyHourDiscountBaht({ name: "นวดแผนไทย 90 นาที", price: 550 }, HH_SERVICES)).toBe(160)
    expect(
      happyHourDiscountBaht({ name: "นวดคลายเท้า & คอบ่าไหล่ 90 นาที", price: 690 }, HH_SERVICES)
    ).toBe(200)
  })

  it("เมนูที่ไม่เข้าร่วม → null (ทรีตเมนต์ / คอบ่าไหล่)", () => {
    expect(
      happyHourDiscountBaht({ name: "ทรีตเมนต์ขัดผิว + นวดน้ำมัน 90 นาที", price: 990 }, HH_SERVICES)
    ).toBeNull()
    expect(happyHourDiscountBaht({ name: "นวดคอ บ่า ไหล่ 60 นาที", price: 590 }, HH_SERVICES)).toBeNull()
  })

  it("ไม่ใช่เมนู 90 นาที หรือไม่มีคู่ 60 นาที → null", () => {
    expect(happyHourDiscountBaht({ name: "นวดแผนไทย 60 นาที", price: 390 }, HH_SERVICES)).toBeNull()
    expect(happyHourDiscountBaht({ name: "นวดแผนไทย 120 นาที", price: 650 }, HH_SERVICES)).toBeNull()
    expect(happyHourDiscountBaht({ name: "นวดศีรษะดั้งเดิม 90 นาที", price: 990 }, HH_SERVICES)).toBeNull()
  })
})
