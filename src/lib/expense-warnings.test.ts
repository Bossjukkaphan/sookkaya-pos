import { describe, expect, it } from "vitest"
import {
  DUPLICATE_WINDOW_DAYS,
  RECURRING_MIN_COUNT,
  categoryMismatchWarning,
  duplicateWarning,
  expenseWarnings,
  type NearbyExpense,
} from "./expense-warnings"

const ค่ามือ = "HR / payroll (ค่ามือหมอ)"
const เงินเดือน = "เงินเดือนพนักงานประจำ"

describe("duplicateWarning", () => {
  const เดิม = (over = {}) => ({
    item: "ค่ามือหมอ1-10/7/69",
    amount: 45380,
    category: ค่ามือ,
    expense_date: "2026-07-10",
    ...over,
  })

  // เคสจริง 3/8/2569: พนักงานคีย์ค่ามือหมองวด 1-10/7 ซ้ำ ทั้งที่ลงไปแล้วตั้งแต่ 19/7
  it("ชื่อ+ยอด+หมวดตรงกัน ในช่วง 45 วัน = เตือน", () => {
    const w = duplicateWarning(
      { item: "ค่ามือหมอ1-10/7/69", amount: 45380, category: ค่ามือ, expense_date: "2026-08-03" },
      [เดิม()]
    )
    expect(w).not.toBeNull()
    expect(w?.message).toContain("ค่ามือหมอ1-10/7/69")
  })

  // เดิมเกณฑ์ดูแค่ยอด+หมวด ทำให้ค่าซักผ้ากับค่าอบผ้าเตือนกันเอง
  it("ยอดเท่ากันแต่คนละรายการ = ไม่เตือน", () => {
    expect(
      duplicateWarning(
        { item: "ค่าอบผ้า", amount: 2500, category: "ซักรีด", expense_date: "2026-07-20" },
        [{ item: "ค่าซักผ้า", amount: 2500, category: "ซักรีด", expense_date: "2026-07-10" }]
      )
    ).toBeNull()
  })

  it("ชื่อต่างกันแค่ช่องว่างกับสระซ้ำ ถือว่าชื่อเดียวกัน", () => {
    expect(
      duplicateWarning(
        { item: " ค่ามือหมอ1-10/7/69 ", amount: 45380, category: ค่ามือ, expense_date: "2026-08-03" },
        [เดิม({ item: "ค่ามืือหมอ1-10/7/69" })]
      )
    ).not.toBeNull()
  })

  it("ยอดต่างกันแม้บาทเดียว = ไม่เตือน", () => {
    expect(
      duplicateWarning({ item: "ค่ามือหมอ1-10/7/69", amount: 45381, category: ค่ามือ, expense_date: "2026-08-03" }, [เดิม()])
    ).toBeNull()
  })

  it("คนละหมวด = ไม่เตือน", () => {
    expect(
      duplicateWarning({ item: "ค่ามือหมอ1-10/7/69", amount: 45380, category: เงินเดือน, expense_date: "2026-08-03" }, [เดิม()])
    ).toBeNull()
  })

  it("พ้น 45 วัน = ไม่เตือน", () => {
    expect(
      duplicateWarning({ item: "ค่ามือหมอ1-10/7/69", amount: 45380, category: ค่ามือ, expense_date: "2026-09-30" }, [เดิม()])
    ).toBeNull()
  })

  // ค่าซักผ้า/เงินเบิกล่วงหน้า จ่ายชื่อเดิมยอดเดิมทุกงวด ถ้าเตือนทุกครั้งคนจะกดผ่านโดยไม่อ่าน
  it("จ่ายมาแล้วตั้งแต่ 3 ครั้ง = ค่าใช้จ่ายประจำ ไม่เตือน", () => {
    const ประจำ = ["2026-05-15", "2026-06-14", "2026-07-15"].map((d) => ({
      item: "พี่รันเบิกเงินล่วงหน้า 2,500บาท",
      amount: 2500,
      category: ค่ามือ,
      expense_date: d,
    }))
    expect(
      duplicateWarning(
        { item: "พี่รันเบิกเงินล่วงหน้า 2,500บาท", amount: 2500, category: ค่ามือ, expense_date: "2026-08-15" },
        ประจำ
      )
    ).toBeNull()
  })

  it("จ่ายมาแล้ว 2 ครั้ง ยังไม่ถือว่าประจำ = ยังเตือน", () => {
    const สองครั้ง = ["2026-07-01", "2026-07-20"].map((d) => ({
      item: "ค่าอะไรสักอย่าง", amount: 900, category: ค่ามือ, expense_date: d,
    }))
    expect(
      duplicateWarning({ item: "ค่าอะไรสักอย่าง", amount: 900, category: ค่ามือ, expense_date: "2026-08-01" }, สองครั้ง)
    ).not.toBeNull()
  })

  it("ไม่มีของเก่าเลย = ไม่เตือน", () => {
    expect(duplicateWarning({ item: "ใหม่เอี่ยม", amount: 500, category: ค่ามือ, expense_date: "2026-07-01" }, [])).toBeNull()
  })

  it("ค่าคงที่อ่านได้ ไม่ใช่เลขลอยในโค้ด", () => {
    expect(DUPLICATE_WINDOW_DAYS).toBe(45)
    expect(RECURRING_MIN_COUNT).toBe(3)
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
      [{ item: "เงินเดือนพนักงาน1-31/7", amount: 50915, category: ค่ามือ, expense_date: "2026-07-31" }]
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
