/**
 * ทำข้อความโปรโมชั่นที่พนักงานพิมพ์มือให้เป็นคีย์เดียวกัน
 *
 * ต้องให้ผลตรงกับฟังก์ชัน SQL `public.promo_key()` ทุกกรณี — ถ้าสองฝั่งไม่ตรง
 * หน้าตั้งค่าจะแสดงกลุ่มหนึ่งแต่รายงาน ROI จะนับอีกกลุ่ม
 *
 * รหัสจอง Gowabi ยุบเป็นคำเดียว เพราะเลขจองไม่ซ้ำกันเลยสักรายการ
 * ถ้าไม่ยุบจะกลายเป็นโปรโมชั่น 55 ตัวที่ใช้ตัวละ 1 ครั้ง
 */
export function promoKey(text: string | null | undefined): string {
  const key = (text ?? "").toLowerCase().replace(/\s+/g, "")
  return key.startsWith("gowabi") ? "gowabi" : key
}

/**
 * แปลงโปรส่วนลด % เป็นจำนวนเงินบาทเต็ม — ปัดเศษแบบคณิต (82.50 → 83)
 * ช่องส่วนลดใน POS ต้องเป็นจำนวนเต็มเสมอ ไม่งั้นเบราว์เซอร์บล็อกปุ่มชำระ
 */
export function promoDiscountBaht(price: number, pct: number): number {
  if (!Number.isFinite(price) || !Number.isFinite(pct)) return 0
  if (price <= 0 || pct <= 0) return 0
  return Math.min(Math.round((price * pct) / 100), Math.round(price))
}
