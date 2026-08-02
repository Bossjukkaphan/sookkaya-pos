/**
 * สีประจำระดับสมาชิก — ใช้ชุดเดียวกันทุกหน้า (รายชื่อสมาชิก ประวัติเติมเงิน หน้าลูกค้า)
 * ให้เห็น badge แล้วรู้ระดับได้โดยไม่ต้องอ่าน · ระดับที่ไม่รู้จัก → เทา (default กันพัง)
 */

/** ระดับที่ไม่ใช่แพ็กเกจสมาชิก — เงินที่ลูกค้าจ่ายล่วงหน้าไว้แล้วใช้บริการไม่ครบ
 *  (ค่าเดียวกับ LEFTOVER_CREDIT_TIER ใน overpay-credit.ts และ constraint ของ member_topups) */
export const LEFTOVER_TIER = "เครดิตคงเหลือ"

export const TIER_COLOR: Record<string, string> = {
  Silver: "border-slate-300 bg-slate-100 text-slate-700",
  Gold: "border-amber-300 bg-amber-100 text-amber-800",
  Platinum: "border-violet-300 bg-violet-100 text-violet-800",
  // ฟ้า + เส้นประ = ไม่ใช่แพ็กเกจสมาชิก แยกจาก Silver/Gold/Platinum ที่เป็นเส้นทึบ
  // เส้นประคือสัญลักษณ์หลัก (คนตาบอดสีก็ยังแยกออก) สีฟ้าเป็นตัวช่วยอีกชั้น
  [LEFTOVER_TIER]: "border-dashed border-sky-400 bg-sky-50 text-sky-700",
}
export const TIER_COLOR_DEFAULT = "border-slate-200 bg-slate-50 text-slate-500"

/** ข้อความบนป้าย — ระดับสมาชิกใช้ชื่อระดับตรงๆ ส่วนเครดิตคงเหลือเขียนให้ชัดว่าไม่ใช่สมาชิก
 *  (เก็บค่าในฐานข้อมูลเป็น "เครดิตคงเหลือ" เหมือนเดิม เปลี่ยนแค่ที่แสดงผล) */
export function tierLabel(tier: string): string {
  return tier === LEFTOVER_TIER ? "◇ ลูกค้าทั่วไปมีเครดิตเหลือ" : tier
}
