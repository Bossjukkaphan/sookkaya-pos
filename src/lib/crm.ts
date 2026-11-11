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

/** อวยพรวันเกิด — ข้อความจาก Boss 2026-08-02 */
export function msgBirthday(name: string | null | undefined): string {
  return (
    `สุขสันต์วันเกิดนะคะคุณ ${who(name)} 🎂🥳🎉\n\n` +
    `SOOKKAYA ขอให้เป็นปีที่เต็มไปด้วยความสุข สุขภาพร่างกายแข็งแรง ` +
    `และมีรอยยิ้มกว้างๆ ในทุกๆ วันเลยนะคะ ✨\n\n` +
    `สำหรับเดือนเกิดนี้ ถ้ามีโอกาสอย่าลืมแวะมาให้รางวัลตัวเอง` +
    `ด้วยการนวดผ่อนคลายสบายๆ กับเรานะค้า 💆‍♀️🍃\n\n` +
    `จองคิวความฟินได้เลยที่: ${BOOKING_LINK}`
  )
}

/** ชวนลูกค้าที่หายไปนานกลับมา — ข้อความจาก Boss 2026-08-02 */
export function msgWinback(name: string | null | undefined): string {
  return (
    `สวัสดีค่ะคุณ ${who(name)} 🌿 จาก SOOKKAYA ค่ะ ` +
    `เราไม่ได้พบกันนานเลย ทางร้านคิดถึงเสมอนะคะ\n\n` +
    `ช่วงนี้หากร่างกายเริ่มมีอาการตึงเครียดหรืออ่อนล้า ` +
    `ทางเราขอเรียนเชิญแวะมาผ่อนคลายกล้ามเนื้อ` +
    `กับโปรแกรมพิเศษที่เราคัดสรรมาไว้บริการนะคะ 💆‍♀️✨\n\n` +
    `สามารถจองคิวล่วงหน้าเพื่อความสะดวกได้ที่: ${BOOKING_LINK} ค่ะ`
  )
}

/** ตามผลลูกค้าใหม่หลังมาครั้งแรก — ข้อความจาก Boss 2026-08-02 */
export function msgNewFollow(name: string | null | undefined): string {
  return (
    `สวัสดีค่ะคุณ ${who(name)} 🙏 ขอขอบพระคุณเป็นอย่างยิ่ง` +
    `ที่ให้เกียรติมาใช้บริการที่ SOOKKAYA ในรอบที่ผ่านมานะคะ 💚\n\n` +
    `ไม่ทราบว่าอาการปวดเมื่อยดีขึ้นและรู้สึกผ่อนคลายสบายตัวขึ้นไหมคะ ` +
    `ทางเราหวังเป็นอย่างยิ่งว่าคุณ ${who(name)} จะประทับใจกับการบริการของเราค่ะ 😊\n\n` +
    `โอกาสหน้าเชิญแวะมาให้เราดูแลอีกนะคะ สามารถจองคิวได้ที่: ${BOOKING_LINK} ค่ะ`
  )
}

/** เชิญมาใช้เครดิตก่อนหมดอายุ — มี detail = ระบุยอด/วันจริงของลูกค้าคนนั้น (ลิสต์หน้า /crm
 *  ส่ง detail มาเสมอ เวอร์ชันไม่มี detail เป็น fallback ของ dispatcher เท่านั้น) */
export function msgCreditExpiry(
  name: string | null | undefined,
  detail?: { amountBaht: string; expiryThai: string; daysLeft: number }
): string {
  const line = detail
    ? `เครดิตสมาชิกของคุณยังคงเหลือ ${detail.amountBaht} บาท และจะหมดอายุ` +
      (detail.daysLeft <= 0
        ? `วันนี้ (${detail.expiryThai}) เป็นวันสุดท้าย`
        : `วันที่ ${detail.expiryThai} นี้ (อีก ${detail.daysLeft} วัน)`) +
      ` นะคะ`
    : `เครดิตสมาชิกของคุณกำลังจะหมดอายุเร็วๆ นี้นะคะ`
  return (
    `สวัสดีค่ะคุณ ${who(name)} 🌿 จาก SOOKKAYA ค่ะ\n\n` +
    `ขออนุญาตแจ้งว่า${line}\n\n` +
    `อย่าลืมแวะมาผ่อนคลายใช้เครดิตให้คุ้มก่อนหมดอายุนะคะ 💆‍♀️✨ ` +
    `จองคิวล่วงหน้าได้เลยที่: ${BOOKING_LINK} ค่ะ`
  )
}

export type CrmListType = "birthday" | "winback" | "new_follow" | "credit_expiry"

/** เลือกเทมเพลตตามประเภทลิสต์ — ที่เดียว ใช้ทั้งปุ่มคัดลอกและปุ่มส่งไลน์
 *  (credit_expiry ปกติใช้ข้อความเฉพาะรายที่หน้า /crm เตรียมให้แทน — ดู CrmRow.message) */
export function crmMessage(
  listType: CrmListType,
  name: string | null | undefined
): string {
  return listType === "birthday"
    ? msgBirthday(name)
    : listType === "winback"
      ? msgWinback(name)
      : listType === "credit_expiry"
        ? msgCreditExpiry(name)
        : msgNewFollow(name)
}

/** เตือนทีมร้านตอนเช้าว่าวันนี้มีลูกค้าวันเกิด — ส่งเข้ากลุ่มไลน์ทีมร้านผ่าน OA ผู้ช่วย */
export function msgBirthdayReminder(names: string[]): string {
  return (
    `🎂 วันนี้วันเกิดลูกค้า ${names.length} คน: ` +
    names.map((n) => `คุณ${n}`).join(" · ") +
    `\nเปิดเมนู "ดูแลลูกค้า" เพื่อส่งคำอวยพรได้เลย → https://sookkaya-pos.vercel.app/crm`
  )
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
