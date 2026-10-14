/** เบอร์ใกล้เคียง — เตือนก่อนที่พนักงานจะสร้างลูกค้าซ้ำเพราะพิมพ์เบอร์ผิดไปตัวเดียว
 *
 *  ทำไมต้องมีไฟล์นี้: ช่องค้นหาลูกค้าใช้ ilike %คำค้น% ซึ่ง "เจอ" ก็ต่อเมื่อเบอร์ตรงเป๊ะเป็นช่วง
 *  พิมพ์สลับเลขแค่สองตัวก็ไม่เด้งอะไรเลย พนักงานอ่านว่า "ลูกค้าใหม่" แล้วสร้างระเบียนซ้ำ
 *  ผลคือเครดิตสมาชิก/แต้ม/ประวัติแตกเป็นสองคน แล้วต้องมานั่งรวมย้อนหลังทีหลัง
 *  (เคสจริง 13-14/10/2569: ต้าร์ 0643206632 vs 0643026632 · เฟิร์ส · ทอฝัน — สลับเลขทั้งสามเคส)
 *
 *  ฟังก์ชันทุกตัวบริสุทธิ์ ไม่แตะฐานข้อมูล — ฝั่งเรียกใช้ดึงผู้สมัครที่หัว/ท้ายเบอร์ตรงกัน
 *  (phoneLikeKeys) มาก่อน แล้วค่อยให้ไฟล์นี้ตัดสินว่าใกล้เคียงจริงไหมและใกล้แบบไหน */

/** ความยาวน้อยสุดที่ยอมเดา — สั้นกว่านี้ "ใกล้เคียง" กว้างเกินจะมีประโยชน์
 *  เบอร์บ้านไทย 9 หลัก มือถือ 10 หลัก · 8 หลักเผื่อคนพิมพ์ยังไม่ครบ */
const MIN_DIGITS = 8

export type PhoneDiffKind = "เบอร์เดียวกัน" | "สลับเลข" | "ต่างกัน 1 ตัว" | "ขาด/เกิน 1 ตัว"

/** เรียงจากที่น่าจะเป็นคนเดียวกันที่สุด — สลับเลขมาก่อนเพราะเป็นความผิดพลาดที่เจอจริงบ่อยสุด */
const SEVERITY: Record<PhoneDiffKind, number> = {
  "เบอร์เดียวกัน": 0,
  "สลับเลข": 1,
  "ต่างกัน 1 ตัว": 2,
  "ขาด/เกิน 1 ตัว": 3,
}

/** เหลือแต่ตัวเลข และแปลงรูปแบบสากลให้เป็นเบอร์ที่ร้านบันทึก (+66 64... → 064...) */
export function phoneDigits(value: string | null | undefined): string {
  let d = (value ?? "").replace(/\D/g, "")
  if (d.startsWith("00")) d = d.slice(2)
  // 66 + 9 หลัก = เบอร์ไทยแบบสากล · เบอร์ 066xxxxxxx ของจริงยาว 10 จึงไม่โดนแปลงผิด
  if (d.startsWith("66") && d.length === 11) d = "0" + d.slice(2)
  return d
}

/** คำค้นนี้เป็น "เบอร์" หรือเปล่า — มีตัวอักษรปนถือว่าเขากำลังค้นด้วยชื่อ ไม่ต้องเดาเบอร์ */
export function looksLikePhone(term: string): boolean {
  const t = term.trim()
  if (!t || !/^[\d\s\-()+]+$/.test(t)) return false
  return phoneDigits(t).length >= MIN_DIGITS
}

/** เทียบเบอร์สองตัวว่าต่างกันแบบ "น่าจะพิมพ์ผิด" หรือต่างกันจริง (null = คนละเบอร์) */
export function phoneDiff(
  typed: string,
  candidate: string | null | undefined
): PhoneDiffKind | null {
  const a = phoneDigits(typed)
  const b = phoneDigits(candidate)
  if (a.length < MIN_DIGITS || b.length < 6) return null
  if (a === b) return "เบอร์เดียวกัน"

  if (a.length === b.length) {
    const diff: number[] = []
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
        diff.push(i)
        if (diff.length > 2) return null
      }
    }
    if (diff.length === 1) return "ต่างกัน 1 ตัว"
    const [i, j] = diff
    return a[i] === b[j] && a[j] === b[i] ? "สลับเลข" : null
  }

  if (Math.abs(a.length - b.length) === 1) {
    return oneInsertionApart(a, b) ? "ขาด/เกิน 1 ตัว" : null
  }
  return null
}

/** ตัวที่สั้นกว่าเท่ากับตัวที่ยาวกว่าเมื่อลบตัวเลขออกหนึ่งตัวใช่ไหม */
function oneInsertionApart(x: string, y: string): boolean {
  const [short, long] = x.length < y.length ? [x, y] : [y, x]
  let i = 0
  let skipped = false
  for (let j = 0; j < long.length; j++) {
    if (short[i] === long[j]) {
      i++
      continue
    }
    if (skipped) return false
    skipped = true
  }
  return i === short.length
}

/** หัว 4 ตัวและท้าย 4 ตัวของเบอร์ที่พิมพ์ — ใช้แคบวงก่อนดึงผู้สมัครจากฐานข้อมูล
 *
 *  พิมพ์ผิดหนึ่งที่จะทำลายได้แค่ด้านเดียวเสมอ (เบอร์ยาว ≥ 8 หัวกับท้ายไม่ทับกัน)
 *  จึงดึงด้วยเงื่อนไข "หัวตรง หรือ ท้ายตรง" แล้วค่อยกรองด้วย phoneDiff
 *  ข้อจำกัดที่ยอมรับ: สลับเลขข้ามหัว-ท้าย (เช่นตัวที่ 3 กับตัวที่ 9) จะไม่ถูกดึงมา */
export function phoneLikeKeys(term: string): { head: string; tail: string } | null {
  if (!looksLikePhone(term)) return null
  const d = phoneDigits(term)
  return { head: d.slice(0, 4), tail: d.slice(-4) }
}

export type PhoneCandidate = {
  id: string
  name: string
  nickname?: string | null
  phone: string | null
}

export type SimilarPhone<T> = T & { reason: PhoneDiffKind }

/**
 * คัดเฉพาะลูกค้าที่เบอร์ใกล้เคียงกับที่พิมพ์ เรียงจากที่น่าจะเป็นคนเดียวกันที่สุด
 *
 * ตัดคนที่ช่องค้นหาปกติเจอเองอยู่แล้วออก (เบอร์ที่เก็บไว้มีคำค้นเป็นช่วงอยู่ข้างใน)
 * — ไม่งั้นจะเตือน "มีเบอร์ใกล้เคียง" ทั้งที่รายชื่อข้างบนก็เด้งคนนั้นอยู่
 */
export function rankSimilarPhones<T extends PhoneCandidate>(
  term: string,
  rows: T[],
  limit = 3
): SimilarPhone<T>[] {
  if (!looksLikePhone(term)) return []
  const typed = term.trim()

  return rows
    .flatMap((row) => {
      if (row.phone?.includes(typed)) return []
      const reason = phoneDiff(typed, row.phone)
      return reason ? [{ ...row, reason }] : []
    })
    .sort(
      (a, b) => SEVERITY[a.reason] - SEVERITY[b.reason] || a.name.localeCompare(b.name)
    )
    .slice(0, limit)
}
