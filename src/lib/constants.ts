export const PAYMENT_METHODS = [
  "QR Code",
  "เงินสด",
  "บัตรเครดิต",
  "Gowabi",
  "KOL",
  "Member Credit",
] as const

export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

/** ช่องทางที่ตัดเครดิตสมาชิก — ต้องเลือกลูกค้าและเช็คยอดคงเหลือก่อนบันทึก */
export const MEMBER_CREDIT_METHOD: PaymentMethod = "Member Credit"

/** Gowabi เก็บโค้ดไว้ในช่อง coupon_promo และยอดรับจริงอาจต่างจากราคาปกติ */
export const GOWABI_METHOD: PaymentMethod = "Gowabi"

/**
 * credit = ยอดที่ใช้ได้จริงทั้งหมด (bonus รวมอยู่ในนี้แล้ว ไม่ใช่บวกเพิ่ม)
 * เช่น Silver จ่าย 5,000 ใช้ได้ 6,000 โดย 1,000 คือส่วนที่แถม
 */
export const MEMBER_TIERS = [
  { tier: "Silver", cash: 5000, credit: 6000, bonus: 1000, months: 6 },
  { tier: "Gold", cash: 10000, credit: 12000, bonus: 2000, months: 12 },
  { tier: "Platinum", cash: 20000, credit: 25000, bonus: 5000, months: 12 },
] as const

/** ประกันมือขั้นต่ำต่อวัน (ค่า default — ค่าจริงอ่านจาก settings) */
export const DEFAULT_MIN_COMMISSION = 500

/**
 * ค่ารีเควสหมอ — ราคาเดียวตายตัว ติ๊กแล้วระบบคิดให้เลย ไม่ให้พิมพ์เอง
 * (ตรวจบิลจริงทั้ง 200 ใบที่มีรีเควส = 40 บาททุกใบ · พนักงานขอให้ล็อกกันคีย์ผิด)
 */
export const REQUEST_FEE = 40

/**
 * ค่าห้องสปาส่วนตัว — บริการเสริมผูกกับบริการหลัก ราคาเดียวตายตัว ลูกค้าเป็นคนจ่าย
 * เข้า net_amount (รายได้ร้าน · เข้าแต้ม/ตัดเครดิต/งบอัตโนมัติ)
 * ต่างจาก REQUEST_FEE ที่ร้านจ่ายให้หมอเอง ลูกค้าไม่จ่าย — ห้ามปนกัน
 */
export const PRIVATE_ROOM_FEE = 100

export function formatBaht(amount: number): string {
  return new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)
}
