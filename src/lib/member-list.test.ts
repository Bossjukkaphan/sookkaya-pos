import { describe, expect, it } from "vitest"
import { filterMembers, sortMembers, type MemberListItem } from "./member-list"

const M = (over: Partial<MemberListItem>): MemberListItem => ({
  customerId: "id",
  name: "ไม่ระบุ",
  nickname: null,
  phone: null,
  tier: null,
  balance: 0,
  nextExpiry: null,
  daysLeft: null,
  expiringAmount: 0,
  ...over,
})

describe("filterMembers", () => {
  const members = [
    M({ customerId: "1", name: "สมหญิง ใจดี", nickname: "หญิง", phone: "0811111111", tier: "Silver" }),
    M({ customerId: "2", name: "ก้อง", nickname: null, phone: "0822222222", tier: "Gold" }),
    M({ customerId: "3", name: "Bella", nickname: "เบล", phone: "0833333333", tier: "Silver" }),
  ]

  it("ค้นเจอจากชื่อ ไม่สนตัวพิมพ์เล็กใหญ่", () => {
    expect(filterMembers(members, "bella", "").map((m) => m.customerId)).toEqual(["3"])
  })

  it("ค้นเจอจากชื่อเล่น", () => {
    expect(filterMembers(members, "หญิง", "").map((m) => m.customerId)).toEqual(["1"])
  })

  it("ค้นเจอจากเบอร์โทรบางส่วน", () => {
    expect(filterMembers(members, "8222222", "").map((m) => m.customerId)).toEqual(["2"])
  })

  it("กรองตาม tier", () => {
    expect(filterMembers(members, "", "Silver").map((m) => m.customerId)).toEqual(["1", "3"])
  })

  it("ค้นหาและกรอง tier พร้อมกัน", () => {
    expect(filterMembers(members, "เบล", "Silver").map((m) => m.customerId)).toEqual(["3"])
    expect(filterMembers(members, "เบล", "Gold").map((m) => m.customerId)).toEqual([])
  })

  it("ไม่พิมพ์อะไรและไม่กรอง tier คืนทุกคน", () => {
    expect(filterMembers(members, "", "")).toHaveLength(3)
  })
})

describe("filterMembers — ชิปกรองสถานะหมดอายุ (คิดจากใบใกล้สุด)", () => {
  const members = [
    M({ customerId: "red", daysLeft: 5, nextExpiry: "2026-11-16", expiringAmount: 2960 }),
    M({ customerId: "orange", daysLeft: 12, nextExpiry: "2026-11-23", expiringAmount: 1500 }),
    M({ customerId: "yellow", daysLeft: 28, nextExpiry: "2026-12-09", expiringAmount: 900 }),
    M({ customerId: "far", daysLeft: 200, nextExpiry: "2027-05-30", expiringAmount: 0 }),
    M({ customerId: "frozen", daysLeft: null, nextExpiry: null, expired: true }),
  ]
  const ids = (expiry: Parameters<typeof filterMembers>[3]) =>
    filterMembers(members, "", "", expiry).map((m) => m.customerId)

  it("ขอบโซนถูกต้อง: ≤7 / ≤14 / ≤30 สะสมกันเป็นชั้น", () => {
    expect(ids("d7")).toEqual(["red"])
    expect(ids("d14")).toEqual(["red", "orange"])
    expect(ids("d30")).toEqual(["red", "orange", "yellow"])
  })

  it("frozen = เฉพาะเครดิตแช่แข็ง · all = ทุกคน · คนแช่แข็งไม่โผล่ในโซนวัน", () => {
    expect(ids("frozen")).toEqual(["frozen"])
    expect(ids("all")).toHaveLength(5)
    expect(ids("d30")).not.toContain("frozen")
  })

  it("ใช้ร่วมกับค้นหา/กรองระดับได้", () => {
    const mixed = [
      M({ customerId: "1", name: "เบล", tier: "Gold", daysLeft: 3, nextExpiry: "2026-11-14", expiringAmount: 500 }),
      M({ customerId: "2", name: "เบล", tier: "Silver", daysLeft: 3, nextExpiry: "2026-11-14", expiringAmount: 500 }),
    ]
    expect(filterMembers(mixed, "เบล", "Gold", "d7").map((m) => m.customerId)).toEqual(["1"])
  })
})

describe("sortMembers", () => {
  const members = [
    M({ customerId: "a", name: "แจ่มใส", balance: 500, nextExpiry: "2026-08-01" }),
    M({ customerId: "b", name: "กบ", balance: 2000, nextExpiry: null }),
    M({ customerId: "c", name: "องุ่น", balance: 100, nextExpiry: "2026-07-25" }),
  ]

  it("name: เรียงตามตัวอักษรไทย", () => {
    expect(sortMembers(members, "name").map((m) => m.customerId)).toEqual(["b", "a", "c"])
  })

  it("balance_desc: มากไปน้อย", () => {
    expect(sortMembers(members, "balance_desc").map((m) => m.customerId)).toEqual(["b", "a", "c"])
  })

  it("balance_asc: น้อยไปมาก", () => {
    expect(sortMembers(members, "balance_asc").map((m) => m.customerId)).toEqual(["c", "a", "b"])
  })

  it("expiry_soon: ใกล้หมดอายุก่อน ไม่มีวันหมดอายุอยู่ท้ายสุด", () => {
    expect(sortMembers(members, "expiry_soon").map((m) => m.customerId)).toEqual(["c", "a", "b"])
  })

  it("ไม่แก้ไข array ต้นฉบับ", () => {
    const original = [...members]
    sortMembers(members, "balance_desc")
    expect(members).toEqual(original)
  })
})
