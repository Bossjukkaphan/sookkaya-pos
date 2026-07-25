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

export const msgShopCancelled = (b: ShopBookingInfo) =>
  `❌ ลูกค้ายกเลิกคิว · ${b.name} · ${b.dateLabel} ${b.time} · ${menu(b.services)}`
