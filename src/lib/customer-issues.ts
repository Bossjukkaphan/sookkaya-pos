import type { Tables } from "@/types/database"

/**
 * ป้ายบอกปัญหาข้อมูลลูกค้า — ที่เดียวของความจริงเรื่องชื่อป้าย สี และลำดับ
 *
 * เงื่อนไขว่าอะไรคือปัญหาอยู่ใน view v_customer_issues ฝั่งฐานข้อมูล (ที่เดียวเหมือนกัน)
 * ไฟล์นี้ทำหน้าที่แค่แปลงธงบูลีนจาก view เป็นป้ายที่คนอ่านรู้เรื่อง
 * ห้ามเขียนเงื่อนไขซ้ำที่นี่ — ถ้าเขียนสองที่ เดี๋ยวก็เพี้ยนออกจากกันเหมือนที่เคยเจอมาแล้ว
 *
 * ห้ามใส่ "use client" — หน้าที่เรียกใช้เป็น server component
 */

export type CustomerIssueRow = Tables<"v_customer_issues">

export type IssueKey =
  | "dup_phone"
  | "no_phone"
  | "bad_phone"
  | "negative_credit"
  | "negative_points"

/** identity = ระบบระบุตัวลูกค้าผิดคนได้ · money = ตัวเลขเงินไม่ตรง */
export type IssueTone = "identity" | "money"

export type IssueDef = {
  key: IssueKey
  label: string
  tone: IssueTone
  /** ทำไมถึงเป็นปัญหา — โชว์ตอนชี้ที่ชิพ ให้คนที่ไม่ได้อยู่ตอนคุยกันเข้าใจได้เอง */
  why: string
}

/** ลำดับในนี้คือลำดับที่แสดงทั้งบนแถวชิพและบนป้ายในตาราง — เรียงจากที่เจอบ่อยไปหายาก */
export const ISSUES: IssueDef[] = [
  {
    key: "dup_phone",
    label: "เบอร์ซ้ำ",
    tone: "identity",
    why: "มีลูกค้าคนอื่นใช้เบอร์นี้ด้วย เวลาคีย์ชื่อ+เบอร์ บิลหรือเครดิตอาจไปลงผิดคน",
  },
  {
    key: "no_phone",
    label: "ไม่มีเบอร์",
    tone: "identity",
    why: "ผูกแต้มไม่ได้ และครั้งหน้าที่มาจะกลายเป็นลูกค้าใหม่ ประวัติขาดตอน",
  },
  {
    key: "bad_phone",
    label: "เบอร์ผิดรูป",
    tone: "identity",
    why: "ไม่ใช่เบอร์ไทยที่ถูกต้อง (0 ตามด้วยตัวเลข 8-9 หลัก) ค้นหาไม่เจอ เท่ากับไม่มีเบอร์",
  },
  {
    key: "negative_credit",
    label: "เครดิตติดลบ",
    tone: "money",
    why: "ใช้เครดิตเกินที่ซื้อไว้ มักแปลว่าลูกค้าคนนี้มีอีกระเบียนที่ถือแพ็กอยู่",
  },
  {
    key: "negative_points",
    label: "แต้มติดลบ",
    tone: "money",
    why: "แลกแต้มไปเกินที่มี ต้องตรวจว่าคูปองไหนถูกใช้ผิด",
  },
]

/** แถวจาก v_customer_issues → รายการป้ายที่ต้องแสดง เรียงตาม ISSUES เสมอ
 *
 *  รับ Pick<CustomerIssueRow, IssueKey> ไม่ใช่ Partial<Record<...>> โดยตั้งใจ
 *  เพราะ Pick บังคับให้คีย์ทั้งห้าต้องมีอยู่จริงใน view — ถ้าวันหน้ามีคนเปลี่ยนชื่อ
 *  หรือลบคอลัมน์ธง tsc จะแดงตรงนี้ทันที แทนที่จะปล่อยให้ป้ายหายจากหน้าเว็บเงียบๆ
 */
export function issuesOf(row: Pick<CustomerIssueRow, IssueKey>): IssueDef[] {
  return ISSUES.filter((issue) => row[issue.key] === true)
}

/** สีป้ายตามกลุ่ม — เหลือง = ปัญหาตัวตน · แดง = ปัญหาเงิน (ต้องรีบกว่า) */
export function issueBadgeClass(tone: IssueTone): string {
  return tone === "money"
    ? "border-red-200 bg-red-50 text-red-700"
    : "border-amber-200 bg-amber-50 text-amber-700"
}
