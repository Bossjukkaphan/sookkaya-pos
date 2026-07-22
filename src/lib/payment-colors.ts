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

/** ปุ่มช่องทางชำระตอนถูกเลือก (หน้า POS) — สีทึบของช่องทางนั้นแทนดำล้วน */
export const PAY_SELECTED: Record<string, string> = {
  "QR Code": "border-sky-600 bg-sky-600 text-white hover:bg-sky-600",
  "Member Credit": "border-violet-600 bg-violet-600 text-white hover:bg-violet-600",
  "บัตรเครดิต": "border-amber-500 bg-amber-500 text-white hover:bg-amber-500",
  "เงินสด": "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-600",
}
export const PAY_SELECTED_DEFAULT =
  "border-slate-700 bg-slate-700 text-white hover:bg-slate-700"
