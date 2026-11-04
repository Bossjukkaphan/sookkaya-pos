import { describe, expect, it } from "vitest"

import { BASE_STAFF_ROLES, staffRoleOptions } from "./staff-roles"

describe("staffRoleOptions", () => {
  it("ไม่มีข้อมูลเลย → ได้ตำแหน่งพื้นฐานตามลำดับที่กำหนด", () => {
    expect(staffRoleOptions([])).toEqual([...BASE_STAFF_ROLES])
  })

  it("ตำแหน่งที่มีอยู่แล้วในลิสต์พื้นฐาน → ไม่เพิ่มซ้ำ", () => {
    expect(staffRoleOptions(["แม่บ้าน", "พนักงานต้อนรับ"])).toEqual([...BASE_STAFF_ROLES])
  })

  it("ตำแหน่งใหม่ที่ร้านพิมพ์เอง → ต่อท้ายได้เอง และ 'อื่นๆ' ยังอยู่ท้ายสุด", () => {
    const got = staffRoleOptions(["เด็กฝึกงาน", "คนสวน"])
    expect(got[got.length - 1]).toBe("อื่นๆ")
    expect(got).toContain("เด็กฝึกงาน")
    expect(got).toContain("คนสวน")
    // ตำแหน่งที่งอกใหม่เรียงตามตัวอักษรไทย ผลลัพธ์จึงคงที่ทุกครั้งที่โหลดหน้า
    expect(got.indexOf("คนสวน")).toBeLessThan(got.indexOf("เด็กฝึกงาน"))
  })

  it("ตัดช่องว่างหัวท้ายและกันซ้ำ", () => {
    const got = staffRoleOptions(["  เด็กฝึกงาน  ", "เด็กฝึกงาน", " แม่บ้าน "])
    expect(got.filter((r) => r === "เด็กฝึกงาน")).toHaveLength(1)
    expect(got.filter((r) => r === "แม่บ้าน")).toHaveLength(1)
  })

  it("ค่าว่าง/null ไม่กลายเป็นตัวเลือก", () => {
    expect(staffRoleOptions([null, undefined, "", "   "])).toEqual([...BASE_STAFF_ROLES])
  })
})
