/** ตำแหน่งของทีมงาน (ไม่ใช่หมอนวด) — รายการตัวเลือกที่งอกเองได้จากข้อมูลจริง
 *
 *  ทำไมไม่ฮาร์ดโค้ดอย่างเดียว: ร้านจ้างตำแหน่งใหม่เมื่อไหร่ก็ได้ ถ้าลิสต์อยู่ในโค้ด
 *  อย่างเดียวจะต้องรอคนแก้โค้ดทุกครั้ง (ของจริง: "พนักงานต้อนรับ" ไม่มีในลิสต์
 *  ทั้งที่ร้านมีสองคน ทั้งคู่เลยถูกบันทึกเป็น "อื่นๆ" ไปหลายเดือน)
 *
 *  กติกา: ตำแหน่งพื้นฐานมาก่อนตามลำดับที่กำหนด · ตำแหน่งที่ร้านพิมพ์เองต่อท้าย
 *  · "อื่นๆ" อยู่ท้ายสุดเสมอ เพราะเป็นถังรวมของที่ยังไม่มีชื่อเรียก */

export const OTHER_ROLE = "อื่นๆ"

/** ค่าที่ช่องเลือกตำแหน่งส่งมาเมื่อผู้ใช้อยากพิมพ์ตำแหน่งใหม่เอง
 *  (อยู่ที่นี่ไม่ใช่ใน settings-actions.ts เพราะไฟล์ "use server" export ได้แต่ async function) */
export const NEW_ROLE_VALUE = "__new__"

export const BASE_STAFF_ROLES = [
  "ผู้จัดการ",
  "ผู้ช่วยผู้จัดการ",
  "พนักงานต้อนรับ",
  "พ่อบ้าน",
  "แม่บ้าน",
  OTHER_ROLE,
] as const

/** รวมตำแหน่งพื้นฐานกับตำแหน่งที่มีอยู่จริงในข้อมูล ให้เป็นลิสต์เดียวที่ไม่ซ้ำ */
export function staffRoleOptions(existing: (string | null | undefined)[]): string[] {
  const seen = new Set<string>(BASE_STAFF_ROLES)
  const extra: string[] = []

  for (const raw of existing) {
    const role = raw?.trim()
    if (!role || seen.has(role)) continue
    seen.add(role)
    extra.push(role)
  }

  extra.sort((a, b) => a.localeCompare(b, "th"))
  const base = BASE_STAFF_ROLES.filter((r) => r !== OTHER_ROLE)
  return [...base, ...extra, OTHER_ROLE]
}
