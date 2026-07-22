/**
 * สีประจำระดับสมาชิก — ใช้ชุดเดียวกันทุกหน้า (รายชื่อสมาชิก ประวัติเติมเงิน หน้าลูกค้า)
 * ให้เห็น badge แล้วรู้ระดับได้โดยไม่ต้องอ่าน · ระดับที่ไม่รู้จัก → เทา (default กันพัง)
 */
export const TIER_COLOR: Record<string, string> = {
  Silver: "border-slate-300 bg-slate-100 text-slate-700",
  Gold: "border-amber-300 bg-amber-100 text-amber-800",
  Platinum: "border-violet-300 bg-violet-100 text-violet-800",
}
export const TIER_COLOR_DEFAULT = "border-slate-200 bg-slate-50 text-slate-500"
