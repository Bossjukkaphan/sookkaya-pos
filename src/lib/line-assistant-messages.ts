/** ข้อความแจ้งกลุ่มไลน์ทีมร้าน (ผ่าน OA ผู้ช่วย) — บรรทัดเดียวอ่านจบ ตาม spec
 *  แยกจาก line-assistant.ts (server-only) เพื่อให้ unit test ได้ — แบบเดียวกับคู่ line.ts / line-messages.ts */
export type ShopBookingInfo = {
  name: string
  dateLabel: string
  time: string
  services: string[]
  phone?: string | null
}

const menu = (services: string[]) =>
  services.length > 1
    ? `${services.join(" / ")} (รวม ${services.length} ท่าน)`
    : services[0]

export const msgShopNewBooking = (b: ShopBookingInfo) =>
  `🔔 คิวจองใหม่ · ${b.name} · ${b.dateLabel} ${b.time} · ${menu(b.services)}` +
  (b.phone ? ` · โทร ${b.phone}` : "")

export const msgShopCancelled = (
  b: ShopBookingInfo & {
    /** ลูกค้ายกเลิกหลังร้านกดรับไปแล้ว — ทีมต้องรู้เพราะอาจกันคิว/เตียงไว้แล้ว */
    afterConfirm?: boolean
  }
) =>
  `❌ ลูกค้ายกเลิกคิว${b.afterConfirm ? " (ร้านรับคิวไปแล้ว)" : ""} · ${b.name} · ${b.dateLabel} ${b.time} · ${menu(b.services)}`

/** ต่อท้าย "โดย ..." เมื่อรู้ว่าพนักงานคนไหนกด — กลุ่มเห็นว่าใครจัดการ */
const by = (staffName?: string | null) => (staffName ? ` · โดย ${staffName}` : "")

export const msgShopConfirmed = (
  b: ShopBookingInfo & { staffName?: string | null }
) =>
  `✅ รับคิวแล้ว · ${b.name} · ${b.dateLabel} ${b.time} · ${menu(b.services)}` +
  by(b.staffName)

export const msgShopRejected = (
  b: ShopBookingInfo & { reason: string; staffName?: string | null }
) =>
  `🚫 ปฏิเสธคิว · ${b.name} · ${b.dateLabel} ${b.time} · ${menu(b.services)} · เหตุผล: ${b.reason}` +
  by(b.staffName)

export const msgShopStaffCancelled = (
  b: ShopBookingInfo & { staffName?: string | null }
) =>
  `🗑 พนักงานยกเลิกคิวไลน์ · ${b.name} · ${b.dateLabel} ${b.time} · ${menu(b.services)}` +
  by(b.staffName)
