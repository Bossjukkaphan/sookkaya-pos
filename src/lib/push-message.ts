import { formatThaiDate } from "./datetime"

/** ข้อความที่ service worker เอาไปแสดงบนหน้าจอล็อกของพนักงาน
 *  (public/sw.js อ่านโครงนี้ตรงๆ — เปลี่ยนชื่อฟิลด์ต้องแก้ทั้งสองที่) */
export type PushPayload = {
  title: string
  body: string
  /** แตะการแจ้งเตือนแล้วเปิดหน้านี้ */
  url: string
  /** เรื่องเดียวกันเตือนซ้ำไม่กองซ้อนบนหน้าจอ */
  tag?: string
}

/** คิวจองใหม่จากไลน์ — พนักงานต้องตัดสินใจได้จากหน้าจอล็อกโดยไม่ต้องปลดล็อก
 *  จึงยัดชื่อ/วัน/เวลา/เมนู/รีเควสหมอ ให้ครบในบรรทัดเดียว */
export function bookingPushPayload(input: {
  customerName: string
  queueDate: string
  startTime: string
  services: string[]
  therapistNote: string | null
  tag?: string
}): PushPayload {
  const name = input.customerName.trim() || "ลูกค้า LINE"
  const seats = input.services.length > 1 ? ` · ${input.services.length} ท่าน` : ""
  const req = input.therapistNote ? ` · ${input.therapistNote}` : ""
  return {
    title: "มีคิวจองใหม่จากไลน์ 🌿",
    body: `${name} · ${formatThaiDate(input.queueDate)} ${input.startTime} น.${seats} · ${input.services.join(" + ")}${req}`,
    url: `/queue?date=${input.queueDate}`,
    tag: input.tag,
  }
}

/** เตือนซ้ำคำขอที่ยังไม่มีใครกดรับ/ปฏิเสธ — ตาข่ายกันคิวหลุดเมื่อการเตือนครั้งแรกตกหล่น
 *  ไม่มีคำขอค้าง = null (ตัวเรียกจะได้ไม่ส่งอะไรเลย ไม่ใช่ส่งข้อความว่าง) */
export function pendingReminderPayload(
  pending: {
    customerName: string
    queueDate: string
    startTime: string
    /** ค้างมากี่นาทีแล้ว */
    waitedMin: number
  }[]
): PushPayload | null {
  if (pending.length === 0) return null
  // ใบที่ค้างนานสุดคือใบที่เร่งที่สุด — พาไปวันของใบนั้น
  const oldest = pending.reduce((a, b) => (b.waitedMin > a.waitedMin ? b : a))
  const name = oldest.customerName.trim() || "ลูกค้า LINE"
  const more =
    pending.length > 1 ? ` (ค้างทั้งหมด ${pending.length} รายการ)` : ""
  return {
    title: "⏳ คิวจองยังไม่ได้ตอบ",
    body: `${name} · ${formatThaiDate(oldest.queueDate)} ${oldest.startTime} น. · รอมา ${oldest.waitedMin} นาที${more}`,
    url: `/queue?date=${oldest.queueDate}`,
    // เตือนซ้ำทับอันเดิมเสมอ ไม่กองเป็นตับบนหน้าจอ
    tag: "pending-queue",
  }
}

/** วันเกิดลูกค้าวันนี้ — เตือนพนักงานตอนเช้าให้ทักก่อนร้านวุ่น
 *  ไม่มีใครวันเกิด = null (ตัวเรียกจะได้ไม่ส่งอะไรเลย ไม่ใช่ส่งข้อความว่าง) */
export function birthdayPushPayload(names: string[]): PushPayload | null {
  if (names.length === 0) return null
  const count = names.length > 1 ? ` (${names.length} คน)` : ""
  return {
    title: "🎂 วันเกิดลูกค้าวันนี้",
    body: `${names.join(" · ")}${count} — แตะเพื่อเปิดหน้าดูแลลูกค้า ส่งคำอวยพรได้เลย`,
    url: "/crm",
    // วันเดียวกันเตือนซ้ำทับอันเดิมเสมอ
    tag: "birthday-today",
  }
}
