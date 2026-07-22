/**
 * ที่มาของลูกค้า — ใช้ชุดเดียวกันทั้งบอร์ดคิวและหน้าบันทึกขาย
 * walk_in เดินเข้าร้าน · booking จองล่วงหน้า · agency มาจากตัวแทน (Gowabi/KOL)
 */
export const CUSTOMER_SOURCES = ["walk_in", "booking", "agency"] as const
export type CustomerSource = (typeof CUSTOMER_SOURCES)[number]

export const SOURCE_LABEL: Record<CustomerSource, string> = {
  walk_in: "Walk-in",
  booking: "จองล่วงหน้า",
  agency: "Agency",
}

/** badge เฉพาะ booking/agency — walk_in คือกรณีปกติ ไม่ต้องติดป้ายให้รก */
export const SOURCE_BADGE: Partial<Record<CustomerSource, string>> = {
  booking: "border-sky-200 bg-sky-100 text-sky-700",
  agency: "border-amber-300 bg-amber-100 text-amber-800",
}

export function isCustomerSource(v: string): v is CustomerSource {
  return (CUSTOMER_SOURCES as readonly string[]).includes(v)
}
