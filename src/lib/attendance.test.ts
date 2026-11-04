import { describe, expect, it } from "vitest"

import { unavailableTherapistIds } from "./attendance"

describe("unavailableTherapistIds", () => {
  const activeIds = ["a", "b", "c"]

  it("วันที่มีการเช็คอิน: หมอที่ไม่ได้เช็คอิน = รับคิวไม่ได้ทั้งหมด", () => {
    expect(
      unavailableTherapistIds({ activeIds, checkedInIds: ["a"], onLeaveIds: [] })
    ).toEqual(["b", "c"])
  })

  it("วันที่มีการเช็คอิน: แผนลาไม่มีผล (ความจริงหน้างานชนะแผน)", () => {
    expect(
      unavailableTherapistIds({ activeIds, checkedInIds: ["a", "b"], onLeaveIds: ["a"] })
    ).toEqual(["c"])
  })

  it("วันยังไม่มีใครเช็คอิน: เฉพาะคนที่ลงแผนลา", () => {
    expect(
      unavailableTherapistIds({ activeIds, checkedInIds: [], onLeaveIds: ["b"] })
    ).toEqual(["b"])
  })

  it("แผนลาของคนที่ไม่ active ถูกตัดทิ้ง · ไม่มีข้อมูลเลย = ว่างทุกคน", () => {
    expect(
      unavailableTherapistIds({ activeIds, checkedInIds: [], onLeaveIds: ["zzz"] })
    ).toEqual([])
    expect(unavailableTherapistIds({ activeIds, checkedInIds: [], onLeaveIds: [] })).toEqual([])
  })
})
