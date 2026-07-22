/**
 * สีประจำช่องทางชำระเงิน — ใช้ชุดเดียวกันทุกหน้า จะได้จำสีแล้วอ่านออกทันที
 * ช่องทางที่ไม่ได้กำหนด (Gowabi · KOL · อื่นๆ) → เทา เป็น default กันพัง
 */
export const PAY_COLOR: Record<string, string> = {
  "QR Code": "bg-sky-100 text-sky-700",
  "Member Credit": "bg-violet-100 text-violet-700",
  "บัตรเครดิต": "bg-amber-100 text-amber-700",
  "เงินสด": "bg-emerald-100 text-emerald-700",
}
export const PAY_COLOR_DEFAULT = "bg-slate-100 text-slate-600"

/** จุดสีทึบของช่องทางเดียวกัน — ใช้นำหน้าชื่อในรายการสรุป */
export const PAY_DOT: Record<string, string> = {
  "QR Code": "bg-sky-500",
  "Member Credit": "bg-violet-500",
  "บัตรเครดิต": "bg-amber-400",
  "เงินสด": "bg-emerald-500",
}
export const PAY_DOT_DEFAULT = "bg-slate-400"
