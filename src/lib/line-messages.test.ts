import { describe, expect, it } from "vitest"
import { msgRequested, msgConfirmed, msgRejected, msgCancelled } from "./line-messages"

const booking = {
  dateLabel: "ศุกร์ 25 ก.ค.",
  time: "14:00",
  services: ["นวดน้ำมันอโรมา 120 นาที", "นวดแผนไทย 90 นาที"],
  therapistNote: "มีรีเควสหมอ (+40฿/ท่านที่เลือก)",
}

describe("ข้อความไลน์ 4 จังหวะ", () => {
  it("msgRequested มีวันเวลา เมนูทุกคน จำนวนท่าน และคำว่ารอร้านยืนยัน", () => {
    const t = msgRequested(booking)
    expect(t).toContain("ได้รับคำขอจอง")
    expect(t).toContain("ศุกร์ 25 ก.ค.")
    expect(t).toContain("14:00")
    expect(t).toContain("นวดน้ำมันอโรมา 120 นาที")
    expect(t).toContain("(2 ท่าน)")
    expect(t).toContain("รอร้านยืนยัน")
  })
  it("msgConfirmed ยืนยัน + วิธีชำระ + มาก่อนเวลานัด (แบบ ThaiHand)", () => {
    const t = msgConfirmed(booking)
    expect(t).toContain("ยืนยันคิวเรียบร้อย")
    expect(t).toContain("ชำระเงินที่ร้าน")
    expect(t).toContain("ก่อนเวลานัด 15 นาที")
  })
  it("msgRejected มีเหตุผลที่ร้านเลือก", () => {
    expect(msgRejected(booking, "คิวช่วงนั้นเต็ม")).toContain("คิวช่วงนั้นเต็ม")
  })
  it("msgCancelled ยืนยันการยกเลิก", () => {
    expect(msgCancelled(booking)).toContain("ยกเลิกการจองแล้ว")
  })
  it("คนเดียวไม่ต้องมีวงเล็บจำนวนท่าน", () => {
    expect(msgRequested({ ...booking, services: ["นวดเท้า 60 นาที"] })).not.toContain("ท่าน)")
  })
})
