import { describe, expect, it } from "vitest"
import {
  DUPLICATE_WINDOW_DAYS,
  categoryMismatchWarning,
  duplicateWarning,
  expenseWarnings,
  type NearbyExpense,
} from "./expense-warnings"

const ค่ามือ = "HR / payroll (ค่ามือหมอ)"
const เงินเดือน = "เงินเดือนพนักงานประจำ"

describe("duplicateWarning", () => {
  // เคสจริง 3/8/2569: พนักงานคีย์ค่ามือหมองวด 1-10/7 ซ้ำ ทั้งที่ลงไปแล้วตั้งแต่ 19/7
  it("ยอดเท่ากัน หมวดเดียวกัน ในช่วง 45 วัน = เตือน", () => {
    const w = duplicateWarning(
      { amount: 45380, category: ค่ามือ, expense_date: "2026-08-03" },
      [{ item: "ค่ามือหมอ1-10/7/69", amount: 45380, category: ค่ามือ, expense_date: "2026-07-10" }]
    )
    expect(w).not.toBeNull()
    expect(w?.message).toContain("ค่ามือหมอ1-10/7/69")
  })

  it("ยอดต่างกันแม้แค่บาทเดียว = ไม่เตือน", () => {
    expect(
      duplicateWarning(
        { amount: 45381, category: ค่ามือ, expense_date: "2026-08-03" },
        [{ item: "เดิม", amount: 45380, category: ค่ามือ, expense_date: "2026-07-10" }]
      )
    ).toBeNull()
  })

  it("คนละหมวด = ไม่เตือน แม้ยอดเท่ากัน", () => {
    expect(
      duplicateWarning(
        { amount: 45380, category: เงินเดือน, expense_date: "2026-08-03" },
        [{ item: "เดิม", amount: 45380, category: ค่ามือ, expense_date: "2026-07-10" }]
      )
    ).toBeNull()
  })

  // ค่าเช่า/ค่าน้ำค่าไฟจ่ายเท่ากันทุกเดือน ถ้าหน้าต่างกว้างไปจะเตือนทุกเดือนจนคนเลิกอ่าน
  it("พ้น 45 วันแล้ว = ไม่เตือน (กันค่าใช้จ่ายรายเดือนที่เท่ากันทุกงวด)", () => {
    expect(
      duplicateWarning(
        { amount: 15000, category: ค่ามือ, expense_date: "2026-09-01" },
        [{ item: "ค่าเช่า", amount: 15000, category: ค่ามือ, expense_date: "2026-07-01" }]
      )
    ).toBeNull()
  })

  it("นับย้อนหลังก็ได้ ไม่ใช่แค่ไปข้างหน้า", () => {
    expect(
      duplicateWarning(
        { amount: 500, category: ค่ามือ, expense_date: "2026-07-01" },
        [{ item: "เดิม", amount: 500, category: ค่ามือ, expense_date: "2026-07-20" }]
      )
    ).not.toBeNull()
  })

  it("ไม่มีของเก่าเลย = ไม่เตือน", () => {
    expect(
      duplicateWarning({ amount: 500, category: ค่ามือ, expense_date: "2026-07-01" }, [])
    ).toBeNull()
  })

  it("ช่วงเวลาเป็นค่าคงที่ที่อ่านได้", () => {
    expect(DUPLICATE_WINDOW_DAYS).toBe(45)
  })
})

describe("categoryMismatchWarning", () => {
  // เคสจริงทั้งเดือน มิ.ย. และ ก.ค.: เงินเดือนรีเซฟชั่นถูกลงในหมวดค่ามือหมอ
  // ทำให้กำไรทางบัญชีสูงเกินจริง เพราะสูตรตัดหมวดค่ามือหมอทิ้งทั้งก้อน
  it("ชื่อขึ้นต้นว่าเงินเดือน แต่ลงหมวดค่ามือหมอ = เตือน", () => {
    const w = categoryMismatchWarning("เงินเดือนพนักงานรีเซฟชั่น1-31/7/69", ค่ามือ)
    expect(w).not.toBeNull()
    expect(w?.message).toContain("เงินเดือน")
  })

  it("ชื่อว่าค่ามือหมอ แต่ลงหมวดเงินเดือนพนักงาน = เตือน", () => {
    expect(categoryMismatchWarning("ค่ามือหมอ21-31/7/69", เงินเดือน)).not.toBeNull()
  })

  it("ชื่อกับหมวดตรงกัน = ไม่เตือน", () => {
    expect(categoryMismatchWarning("ค่ามือหมอ1-10/7/69", ค่ามือ)).toBeNull()
    expect(categoryMismatchWarning("เงินเดือนพ่อบ้าน", เงินเดือน)).toBeNull()
  })

  // "เงิินเดือนหมอ21-31/7/69" ที่เจอจริงสะกดผิด มีสระอิสองตัว ต้องยังจับได้
  it("สะกดผิดแบบที่เจอจริงก็ต้องจับได้", () => {
    expect(categoryMismatchWarning("เงิินเดือนหมอ21-31/7/69", ค่ามือ)).not.toBeNull()
  })

  it("หมวดอื่นที่ไม่เกี่ยวกับคนไม่ต้องเตือน", () => {
    expect(categoryMismatchWarning("เงินเดือนพนักงาน", "ค่าเช่าที่")).toBeNull()
  })
})

describe("expenseWarnings", () => {
  it("เจอทั้งสองแบบพร้อมกันก็คืนครบ", () => {
    const ws = expenseWarnings(
      { item: "เงินเดือนพนักงาน1-31/7", amount: 50915, category: ค่ามือ, expense_date: "2026-08-03" },
      [{ item: "เดิม", amount: 50915, category: ค่ามือ, expense_date: "2026-07-31" }]
    )
    expect(ws.map((w) => w.kind).sort()).toEqual(["category_mismatch", "duplicate"])
  })

  it("ไม่มีอะไรน่าสงสัย = ไม่มีคำเตือน", () => {
    const nearby: NearbyExpense[] = []
    expect(
      expenseWarnings(
        { item: "ค่าน้ำมันรถ", amount: 800, category: "ค่าเดินทาง", expense_date: "2026-08-03" },
        nearby
      )
    ).toEqual([])
  })
})
