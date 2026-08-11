/**
 * จัดกลุ่มเครดิตคงเหลือของสมาชิกตามที่แดชบอร์ดเดิมของเจ้าของร้านใช้
 *
 * ที่นี่ไม่มีการคำนวณยอดเครดิตใหม่ — ยอดมาจาก view member_balances เท่านั้น
 * โมดูลนี้แค่บอกว่ายอดที่ได้มาตกอยู่ช่องไหนและรวมได้เท่าไหร่
 */

export type CreditBucket = "empty" | "expired" | "low" | "mid" | "ok"

export type MemberCredit = { balance: number }

/**
 * ขอบบนของ bucket "ใกล้หมด" — export ไว้ให้ผู้เรียกที่คัดกรองที่ฐานข้อมูลเอง
 * (เช่น overview/page.tsx query member_balances) ใช้ค่าเดียวกับ creditBucket() เป๊ะ
 * ไม่ต้องคัดลอกเลข 1500 ไปแยกไว้อีกที่แล้วลืมซิงก์กัน
 */
export const CREDIT_LOW_MAX = 1500

/**
 * ยอดติดลบเกิดไม่ได้อีกแล้วตั้งแต่ member_balances เปลี่ยนมาจัดสรรยอดใช้ลงก้อนแบบ FIFO
 * (2026-08-11) — ก้อนที่หมดอายุจะพาทั้งยอดที่ให้และยอดที่ใช้ของก้อนนั้นหายไปพร้อมกัน
 * ทำให้ยอดต่ำสุดที่เป็นไปได้ทางคณิตศาสตร์คือ 0 เสมอ ไม่ว่าจะใช้เกินก้อนที่มีหรือไม่เคย
 * เติมเงินมาก่อนเลยก็ตาม
 *
 * ผลคือการคีย์บิลผิดใบ (ตัดเครดิตของลูกค้าที่ไม่เคยเติมเงิน) จะมองไม่เห็นจากยอดคงเหลือ
 * อีกต่อไป ต้องไปดูที่การตรวจ orphan_credit_used ใน supabase/reconciliation.sql แทน
 *
 * เงื่อนไข balance <= 0 ด้านล่างยังคงไว้เป็นเกราะกันพลาด ไม่ใช่เพราะคาดว่าจะเจอค่าติดลบจริง
 *
 * expired = หมดอายุแล้ว ยอดยังอยู่แต่ใช้ไม่ได้จนกว่าจะเติมใหม่ ต้องแยกจาก empty
 * เพราะ "มีเงินแต่ใช้ไม่ได้" คือโอกาสขาย ส่วน "ไม่มีเงิน" คือคนละเรื่อง
 */
export function creditBucket(balance: number, expired = false): CreditBucket {
  if (balance <= 0) return "empty"
  if (expired) return "expired"
  if (balance <= CREDIT_LOW_MAX) return "low"
  if (balance <= 3000) return "mid"
  return "ok"
}

/**
 * เครดิตแช่แข็งไหม (หมดอายุแล้วแต่ยอดยังอยู่ ไม่ใช่ยอด 0) — จุดตัดสินใจเดียวที่ทุกหน้าจอ
 * (POS, หน้าลูกค้า, ตารางลูกค้า, การ์ดสมาชิก, โปรไฟล์ไลน์) เรียกใช้ก่อนโชว์ข้อความชวนเติม
 * แพ็กเกจ — ผลลัพธ์ต้องตรงกับ creditBucket(balance, expired) === "expired" เป๊ะเสมอ (สร้าง
 * มาจากสูตรเดียวกัน ไม่ใช่คัดลอกเงื่อนไขแยก) แต่ตั้งชื่อให้ผู้เรียกที่จุดแสดงผลไม่ต้องรู้จัก
 * bucket ทั้งชุด แค่ต้องการ true/false ตัวเดียว
 *
 * ต้องเช็คคู่กับ balance > 0 เสมอ (ไม่ใช่แค่เช็ค expired เฉยๆ) เพราะคอลัมน์ credit_expired ใน
 * member_balances เป็น true สำหรับลูกค้าทั่วไปที่ไม่เคยเป็นสมาชิกเลยด้วย (next_expiry เป็น
 * null ก็นับว่า "หมดอายุ") ถ้าลืมจับคู่กับยอด ลูกค้าที่ไม่เคยมีเครดิตจะถูกบอกว่า "เครดิตหมดอายุ"
 * ทั้งที่ไม่เคยมีอะไรให้หมดอายุตั้งแต่แรก
 */
export function isCreditFrozen(balance: number, expired: boolean): boolean {
  return creditBucket(balance, expired) === "expired"
}

export type CreditSpendInput = {
  /** วันหมดอายุของทั้งกระปุก (member_balances.next_expiry) — null = ไม่เคยเติมเงิน */
  expiry: string | null
  /** วันที่ของบิล ไม่ใช่วันนี้ — ร้านบันทึกย้อนหลังได้ บิลที่ให้บริการตอนเครดิตยังไม่หมดอายุต้องคีย์ได้ */
  onDate: string
  /** ยอดคงเหลือ รวมส่วนที่แช่แข็งด้วย */
  balance: number
  /** ยอดที่จะตัดครั้งนี้ */
  wanted: number
  /** ยอดที่บิลนี้เคยตัดไว้ (เฉพาะตอนแก้บิล) — ตัดเท่าเดิมหรือน้อยลงไม่ถือว่าใช้เครดิตใหม่ */
  alreadyUsedOnThisBill?: number
}

export type CreditSpendResult =
  | { ok: true }
  | { ok: false; reason: "expired" | "insufficient"; message: string }

/**
 * ตัวกันเดียวที่ตัดสินว่าตัดเครดิตได้ไหม — ทั้ง createSale และ updateSale ต้องเรียกตัวนี้
 *
 * ก่อนหน้านี้การกัน "หมดอายุแล้วห้ามใช้" ซ่อนอยู่ในตัวเลข (view คัดก้อนที่หมดอายุออกให้เอง)
 * ไม่ได้อยู่ในโค้ดเลยสักบรรทัด พอเปลี่ยนมาเป็นกระปุกเดียวที่ยอดรวมเครดิตแช่แข็งด้วย
 * ตัวกันต้องย้ายออกมาอยู่ตรงนี้ ไม่งั้นเครดิตที่หมดอายุจะใช้ได้ฟรีทั้งก้อน
 */
export function checkCreditSpend(input: CreditSpendInput): CreditSpendResult {
  const { expiry, onDate, balance, wanted } = input
  const previously = input.alreadyUsedOnThisBill ?? 0

  // วันหมดอายุวันนี้พอดียังใช้ได้ทั้งวัน จึงเทียบด้วย > ไม่ใช่ >=
  // เทียบสตริง YYYY-MM-DD ตรง ๆ ได้เพราะเรียงตามพจนานุกรมตรงกับเรียงตามเวลา
  const expired = expiry === null || onDate > expiry

  // เช็ค expired ก่อน insufficient เสมอ — ตั้งใจ ไม่ใช่ลำดับที่สลับได้ตามใจ
  // ถ้าทั้งสองเงื่อนไขเป็นจริงพร้อมกัน (หมดอายุ + ยอดไม่พอ) ต้องตอบ "expired"
  // เพราะสองเหตุผลนำไปสู่คำแนะนำหน้าเคาน์เตอร์คนละแบบ: "insufficient" จะชวนพนักงาน
  // ไปเก็บเงินเพิ่มจากลูกค้าเฉย ๆ ทั้งที่เครดิตแช่แข็งอยู่ ต้องซื้อแพ็กเกจใหม่ก่อนถึงจะปลดล็อกได้
  // ตัดเท่าเดิมหรือน้อยลงบนบิลที่เคยตัดไว้แล้ว ไม่ใช่การใช้เครดิตใหม่ — แก้บิลเก่าได้เสมอ
  if (expired && wanted > previously) {
    return {
      ok: false,
      reason: "expired",
      message:
        expiry === null
          ? "ลูกค้ายังไม่เคยซื้อแพ็กเกจสมาชิก จึงยังไม่มีเครดิตให้ตัด"
          : `เครดิตหมดอายุเมื่อ ${expiry} — ยอด ${balance} ฿ ยังอยู่ครบ เติมแพ็กเกจใหม่แล้วใช้ได้ทันที`,
    }
  }

  if (balance < wanted) {
    return {
      ok: false,
      reason: "insufficient",
      message: `เครดิตคงเหลือไม่พอ (มี ${balance} บาท ต้องใช้ ${wanted} บาท)`,
    }
  }

  return { ok: true }
}
