import { describe, expect, it } from "vitest"

import { splitByCallIn } from "./staff-roster"

describe("splitByCallIn", () => {
  const a = { id: "a", is_part_time: false }
  const b = { id: "b", is_part_time: true }
  const c = { id: "c", is_part_time: false }

  it("แยกพาร์ทไทม์ออกจากพนักงานประจำ", () => {
    const { regular, onCall } = splitByCallIn([a, b, c])
    expect(regular.map((s) => s.id)).toEqual(["a", "c"])
    expect(onCall.map((s) => s.id)).toEqual(["b"])
  })

  it("ไม่มีค่า = พนักงานประจำ (ระเบียนเก่าก่อนมีคอลัมน์นี้ต้องไม่เปลี่ยนพฤติกรรม)", () => {
    const { regular, onCall } = splitByCallIn([{ id: "x" }, { id: "y", is_part_time: null }])
    expect(regular).toHaveLength(2)
    expect(onCall).toHaveLength(0)
  })

  it("ลิสต์ว่าง → ได้สองกลุ่มว่าง ไม่ throw", () => {
    expect(splitByCallIn([])).toEqual({ regular: [], onCall: [] })
  })
})
