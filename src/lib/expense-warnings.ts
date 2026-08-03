/**
 * คำเตือนก่อนบันทึกรายจ่าย — เตือนแล้วให้ยืนยันผ่านได้ ไม่บล็อก
 *
 * ทำไมไม่บล็อก: ร้านมีรายจ่ายที่ยอดเท่ากันจริงหลายรายการ (ค่าเช่า ค่าน้ำ ค่าไฟ)
 * ถ้าห้ามเด็ดขาดพนักงานจะบันทึกของจริงไม่ได้ แต่ถ้าไม่เตือนเลยก็เกิดเรื่องแบบ 3/8/2569
 * ที่คีย์ค่ามือหมอซ้ำ 92,025 บาท โดยไม่มีอะไรทัก
 *
 * ทำไมเกณฑ์ต้องแคบ: ถ้าเตือนพร่ำเพรื่อ พนักงานจะกดผ่านโดยไม่อ่าน ซึ่งแย่กว่าไม่มีเลย
 */

export type ExpenseWarningKind = "duplicate" | "category_mismatch"

export type ExpenseWarning = {
  kind: ExpenseWarningKind
  message: string
}

/** รายจ่ายเดิมที่เอามาเทียบ — เอาเฉพาะช่องที่ใช้ตัดสิน */
export type NearbyExpense = {
  item: string
  amount: number
  category: string
  expense_date: string
}

export type ExpenseCandidate = {
  amount: number
  category: string
  expense_date: string
}

/**
 * ช่วงเวลาที่ถือว่า "อาจซ้ำ" — 45 วัน
 *
 * เลือก 45 เพราะครอบคลุมค่ามือหมอสองงวดที่ติดกัน (งวดละ 10-11 วัน) และเผื่อคีย์ช้า
 * แต่ไม่ถึง 60 วันซึ่งจะไปชนค่าเช่า/ค่าน้ำค่าไฟที่จ่ายเท่ากันทุกเดือนจนเตือนทุกครั้ง
 */
export const DUPLICATE_WINDOW_DAYS = 45

/**
 * จ่ายรายการชื่อนี้ยอดนี้มาแล้วกี่ครั้งถึงถือว่าเป็น "ค่าใช้จ่ายประจำ" แล้วเลิกเตือน
 *
 * วัดกับข้อมูลจริง 3/8/2569: เกณฑ์ยอด+หมวด+45 วัน อย่างเดียวจะเตือน 55 คู่
 * บังคับชื่อตรงกันด้วยเหลือ 24 · บวกข้อนี้เหลือ 3 คู่ ขณะที่เคสคีย์ซ้ำจริง
 * (ค่ามือหมอ 1-10/7 และ 11-20/7) ยังเตือนครบทั้งสองรายการ
 *
 * เหตุผล: ค่าซักผ้า ค่าอบผ้า เงินเบิกล่วงหน้าของหมอ จ่ายซ้ำชื่อเดิมยอดเดิมทุกงวดอยู่แล้ว
 * ถ้าเตือนทุกครั้งพนักงานจะกดผ่านโดยไม่อ่าน แล้วของซ้ำจริงจะหลุดไปด้วย
 */
export const RECURRING_MIN_COUNT = 3

/** จำนวนวันห่างกันแบบไม่สนทิศทาง */
function daysApart(a: string, b: string): number {
  const ms = Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`))
  return Math.round(ms / 86_400_000)
}

/** ตัดสระ/วรรณยุกต์ซ้ำออกก่อนเทียบคำ — ของจริงเคยสะกด "เงิินเดือน" มีสระอิสองตัว */
function normalize(text: string): string {
  return text.replace(/([ั-ฺ็-๎])\1+/g, "$1")
}

/** ชื่อรายการเดียวกันไหม — ตัดช่องว่างหัวท้าย ยุบช่องว่างซ้ำ และตัดสระซ้ำก่อนเทียบ */
function sameName(a: string, b: string): boolean {
  const clean = (t: string) => normalize(t.trim().replace(/\s+/g, " "))
  return clean(a) === clean(b)
}

/**
 * น่าสงสัยว่าคีย์ซ้ำเมื่อครบทุกข้อ: ชื่อตรงกัน + ยอดเท่ากันเป๊ะ + หมวดเดียวกัน + ห่างไม่เกิน 45 วัน
 * และต้องไม่ใช่ค่าใช้จ่ายประจำ (จ่ายชื่อนี้ยอดนี้มาแล้วตั้งแต่ RECURRING_MIN_COUNT ครั้งขึ้นไป)
 *
 * เทียบยอดแบบเป๊ะ ไม่เผื่อช่วง เพราะเผื่อแล้วจะไปจับค่าใช้จ่ายคนละรายการที่บังเอิญใกล้กัน
 * ส่วนชื่อเทียบแบบตัดช่องว่างและสระซ้ำออกก่อน (เจ้าของร้านเลือกเกณฑ์นี้เอง 3/8/2569)
 *
 * `history` = รายจ่ายทุกวันที่ที่ยอดและหมวดตรงกัน ไม่ใช่เฉพาะใน 45 วัน
 * เพราะต้องนับความถี่ตลอดกาลเพื่อรู้ว่าเป็นค่าใช้จ่ายประจำหรือเปล่า
 */
export function duplicateWarning(
  candidate: ExpenseCandidate & { item?: string },
  history: NearbyExpense[]
): ExpenseWarning | null {
  const sameThing = history.filter(
    (e) =>
      e.amount === candidate.amount &&
      e.category === candidate.category &&
      (candidate.item === undefined || sameName(e.item, candidate.item))
  )

  // จ่ายมาแล้วหลายครั้ง = ค่าใช้จ่ายประจำ ไม่ต้องเตือน
  if (sameThing.length >= RECURRING_MIN_COUNT) return null

  const hit = sameThing.find(
    (e) => daysApart(e.expense_date, candidate.expense_date) <= DUPLICATE_WINDOW_DAYS
  )
  if (!hit) return null

  return {
    kind: "duplicate",
    message: `มีรายการยอดเท่ากันในหมวดเดียวกันอยู่แล้ว — "${hit.item}" วันที่ ${hit.expense_date} จำนวน ${hit.amount.toLocaleString()} บาท`,
  }
}

/**
 * หมวดค่ามือหมอกับหมวดเงินเดือนพนักงานสลับกัน
 *
 * เรื่องนี้ไม่ใช่แค่ชื่อผิด แต่ทำให้ตัวเลขกำไรผิดด้วย: สูตรกำไรทางบัญชีตัดหมวดค่ามือหมอ
 * ทิ้งทั้งก้อน (เพราะค่ามือถูกนับจากบิลอยู่แล้ว) เงินเดือนที่หลงไปอยู่ในหมวดนั้น
 * จึงหายไปจากรายจ่ายเงียบๆ ทำให้กำไรสูงเกินจริง — เกิดมาแล้วทั้งเดือน มิ.ย. และ ก.ค. 2569
 */
export function categoryMismatchWarning(
  item: string,
  category: string
): ExpenseWarning | null {
  const name = normalize(item)
  const isCommissionCategory = category.includes("ค่ามือหมอ")
  const isSalaryCategory = category.includes("เงินเดือนพนักงาน")

  if (isCommissionCategory && name.includes("เงินเดือน")) {
    return {
      kind: "category_mismatch",
      message:
        'ชื่อรายการมีคำว่า "เงินเดือน" แต่เลือกหมวดค่ามือหมอ — ถ้าเป็นเงินเดือนพนักงานประจำ ควรเปลี่ยนหมวด ไม่งั้นกำไรทางบัญชีจะสูงเกินจริง',
    }
  }

  if (isSalaryCategory && name.includes("ค่ามือ")) {
    return {
      kind: "category_mismatch",
      message:
        'ชื่อรายการมีคำว่า "ค่ามือ" แต่เลือกหมวดเงินเดือนพนักงาน — ถ้าเป็นค่ามือหมอนวด ควรเปลี่ยนหมวด',
    }
  }

  return null
}

/** คำเตือนทั้งหมดของรายการที่กำลังจะบันทึก — ว่างเปล่า = ไม่มีอะไรน่าสงสัย */
export function expenseWarnings(
  candidate: ExpenseCandidate & { item: string },
  nearby: NearbyExpense[]
): ExpenseWarning[] {
  return [
    duplicateWarning(candidate, nearby),
    categoryMismatchWarning(candidate.item, candidate.category),
  ].filter((w): w is ExpenseWarning => w !== null)
}
