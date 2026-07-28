import { describe, expect, it } from "vitest"
import { ilikeOr } from "./search"

/**
 * เทสของ ilikeOr — จุดสำคัญคือ "คำค้นของผู้ใช้ต้องไม่กลายเป็นไวยากรณ์ของ PostgREST"
 * ถ้าเทสชุดนี้แดง แปลว่าพิมพ์อักขระบางตัวในช่องค้นหาแล้วหน้า /customers จะได้ 400
 * แล้วโชว์ "ไม่พบข้อมูล" ทั้งที่ข้อมูลยังอยู่ครบ
 */

describe("ilikeOr — คำค้นปกติ", () => {
  it("ได้รูปแบบ col.ilike.\"%คำค้น%\" พร้อมเครื่องหมายคำพูดครอบ", () => {
    expect(ilikeOr(["name"], "สมชาย")).toBe('name.ilike."%สมชาย%"')
  })

  it("หลายคอลัมน์คั่นด้วยจุลภาค จำนวนตัวคั่นเท่ากับจำนวนคอลัมน์ลบหนึ่ง", () => {
    const out = ilikeOr(["name", "nickname", "phone"], "ก้อย")
    expect(out).toBe('name.ilike."%ก้อย%",nickname.ilike."%ก้อย%",phone.ilike."%ก้อย%"')
    expect(out.split(".ilike.")).toHaveLength(4)
  })
})

describe("ilikeOr — อักขระที่ทำให้ query พัง", () => {
  it("จุลภาคในคำค้นอยู่ในเครื่องหมายคำพูด ไม่หลุดออกมาเป็นตัวคั่นเงื่อนไข", () => {
    const out = ilikeOr(["name"], "a,b")
    expect(out).toBe('name.ilike."%a,b%"')
    // มีจุลภาคตัวเดียวคือของคำค้น และมันต้องอยู่ระหว่างเครื่องหมายคำพูดคู่
    expect(out.indexOf(",")).toBeGreaterThan(out.indexOf('"'))
    expect(out.indexOf(",")).toBeLessThan(out.lastIndexOf('"'))
  })

  it("คอลัมน์เดียวที่มีจุลภาคในคำค้น ยังนับเป็นเงื่อนไขเดียว", () => {
    expect(ilikeOr(["name"], "a,b").split(".ilike.")).toHaveLength(2)
  })

  it("เครื่องหมายคำพูดคู่ถูก escape เป็น \\\"", () => {
    expect(ilikeOr(["name"], 'a"b')).toBe('name.ilike."%a\\"b%"')
  })

  it("แบ็กสแลชถูก escape", () => {
    expect(ilikeOr(["name"], "a\\b")).toBe('name.ilike."%a\\\\b%"')
  })

  it("แบ็กสแลชท้ายคำค้นไม่ไปกิน escape ของเครื่องหมายคำพูดปิด", () => {
    expect(ilikeOr(["name"], "a\\")).toBe('name.ilike."%a\\\\%"')
  })

  it("วงเล็บอยู่ในเครื่องหมายคำพูด ไม่กลายเป็นการคุมกลุ่มเงื่อนไข", () => {
    expect(ilikeOr(["name"], "(a)")).toBe('name.ilike."%(a)%"')
  })
})

describe("ilikeOr — ขอบ", () => {
  it("คำค้นว่างยังคืนสตริงที่ใช้ได้ ไม่พัง", () => {
    expect(ilikeOr(["name", "phone"], "")).toBe('name.ilike."%%",phone.ilike."%%"')
  })

  it("ไม่มีคอลัมน์เลยได้สตริงว่าง ไม่โยน error", () => {
    expect(ilikeOr([], "สมชาย")).toBe("")
  })
})
