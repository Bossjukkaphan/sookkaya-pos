/**
 * ศูนย์ดูแลลูกค้า /crm — กติกาลิสต์ + เทมเพลตข้อความ
 * ดู docs/superpowers/specs/2026-07-26-crm-care-hub-design.md
 */

const BOOKING_LINK = "https://liff.line.me/2010834662-8ao9hODH"

const DAY_MS = 24 * 60 * 60 * 1000

/** อีกกี่วันถึงวันเกิดรอบถัดไป (0 = วันนี้) — เทียบเฉพาะเดือน-วัน ข้ามปีได้ */
export function daysUntilBirthday(birthday: string, todayIso: string): number {
  const [, m, d] = birthday.split("-").map(Number)
  const today = new Date(todayIso + "T00:00:00Z")
  let next = new Date(Date.UTC(today.getUTCFullYear(), m - 1, d))
  if (next.getTime() < today.getTime()) {
    next = new Date(Date.UTC(today.getUTCFullYear() + 1, m - 1, d))
  }
  return Math.round((next.getTime() - today.getTime()) / DAY_MS)
}

/** วันเกิดตกในช่วง N วันข้างหน้า (รวมวันนี้) ไหม */
export function birthdayWithinDays(
  birthday: string,
  todayIso: string,
  days: number
): boolean {
  return daysUntilBirthday(birthday, todayIso) <= days - 1
}

const who = (name: string | null | undefined) => name?.trim() || "คุณลูกค้า"

/** อวยพรวันเกิด — คัดลอกไปวางในไลน์/SMS */
export function msgBirthday(name: string | null | undefined): string {
  return (
    `สุขสันต์วันเกิดค่ะคุณ${who(name)} 🎂🌿\n` +
    `SOOKKAYA ขอให้สุขภาพแข็งแรง มีความสุขมากๆ นะคะ\n` +
    `เดือนเกิดทั้งที แวะมาผ่อนคลายให้รางวัลตัวเองหน่อยนะคะ ` +
    `จองคิวได้เลยที่ ${BOOKING_LINK} ค่ะ`
  )
}

/** ชวนลูกค้าที่หายไปนานกลับมา */
export function msgWinback(name: string | null | undefined): string {
  return (
    `สวัสดีค่ะคุณ${who(name)} 🌿 SOOKKAYA คิดถึงนะคะ\n` +
    `ไม่ได้เจอกันนานเลย ช่วงนี้มีโปรดีๆ หลายตัว ` +
    `แวะมาคลายเมื่อยกันหน่อยนะคะ\n` +
    `จองคิวล่วงหน้าได้เลยที่ ${BOOKING_LINK} ค่ะ`
  )
}

/** ตามผลลูกค้าใหม่หลังมาครั้งแรก */
export function msgNewFollow(name: string | null | undefined): string {
  return (
    `สวัสดีค่ะคุณ${who(name)} 🙏 ขอบคุณที่มาใช้บริการ SOOKKAYA นะคะ\n` +
    `นวดครั้งที่แล้วเป็นยังไงบ้างคะ อาการเมื่อยดีขึ้นไหมคะ\n` +
    `ถ้าถูกใจ แวะมาอีกได้เสมอนะคะ จองคิวได้ที่ ${BOOKING_LINK} ค่ะ`
  )
}

export type CrmListType = "birthday" | "winback" | "new_follow"

/** เลือกเทมเพลตตามประเภทลิสต์ — ที่เดียว ใช้ทั้งปุ่มคัดลอกและปุ่มส่งไลน์ */
export function crmMessage(
  listType: CrmListType,
  name: string | null | undefined
): string {
  return listType === "birthday"
    ? msgBirthday(name)
    : listType === "winback"
      ? msgWinback(name)
      : msgNewFollow(name)
}

/** เพดานความยาวข้อความส่งไลน์ — LINE รับ 5,000 แต่กันเผลอวางยาว */
export const LINE_MESSAGE_MAX = 500

/** ตรวจข้อความก่อนส่งไลน์: trim แล้วต้องไม่ว่างและไม่ยาวเกิน */
export function validateCrmLineText(
  text: string
): { ok: true; text: string } | { ok: false; error: string } {
  const t = text.trim()
  if (!t) return { ok: false, error: "ข้อความว่าง — พิมพ์ก่อนส่งนะคะ" }
  if (t.length > LINE_MESSAGE_MAX)
    return { ok: false, error: `ข้อความยาวเกิน ${LINE_MESSAGE_MAX} ตัวอักษร` }
  return { ok: true, text: t }
}
