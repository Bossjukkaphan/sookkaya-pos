/**
 * ระบบสะสมแต้ม — กติกาเงินแต้มรวมไว้ที่เดียว
 * ดู docs/superpowers/specs/2026-07-25-line-points-design.md
 */

/** ทุก 100฿ ที่จ่ายจริง = 1 แต้ม (ปัดลง) */
export function pointsForBaht(baht: number): number {
  if (!Number.isFinite(baht) || baht <= 0) return 0
  return Math.floor(baht / 100)
}

/** แต้มที่ได้ปีนี้ใช้ได้ถึงสิ้นปีถัดไป */
export function pointExpiryDate(earnedDate: string): string {
  const year = Number(earnedDate.slice(0, 4))
  return `${year + 1}-12-31`
}

/** คูปองแลกแต้มอายุ 30 วันนับจากวันแลก */
export function couponExpiryDate(redeemedDate: string): string {
  const d = new Date(redeemedDate + "T00:00:00Z")
  d.setUTCDate(d.getUTCDate() + 30)
  return d.toISOString().slice(0, 10)
}

/** ตัวอักษรที่อ่านไม่สับสน — ตัด 0/O, 1/I/L ออก */
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

/** รหัสคูปอง 6 ตัว อ่านง่ายทางหน้าจอ/ปากเปล่า */
export function genCouponCode(): string {
  let code = ""
  for (let i = 0; i < 6; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
  }
  return code
}
