import { describe, expect, it } from "vitest"
import { msgShopNewBooking, msgShopCancelled } from "./line-assistant-messages"

const booking = {
  name: "คุณสมศรี",
  dateLabel: "ศุกร์ 25 ก.ค.",
  time: "14:00",
  services: ["นวดน้ำมันอโรมา 120 นาที", "นวดแผนไทย 90 นาที"],
  phone: "0812345678",
}

describe("ข้อความแจ้งกลุ่มร้านผ่าน OA ผู้ช่วย", () => {
  it("คิวจองใหม่ มี 🔔 ชื่อ วันเวลา เมนูทุกคน จำนวนท่าน และเบอร์โทร", () => {
    const t = msgShopNewBooking(booking)
    expect(t).toContain("🔔 คิวจองใหม่")
    expect(t).toContain("คุณสมศรี")
    expect(t).toContain("ศุกร์ 25 ก.ค. 14:00")
    expect(t).toContain("นวดน้ำมันอโรมา 120 นาที")
    expect(t).toContain("นวดแผนไทย 90 นาที")
    expect(t).toContain("(รวม 2 ท่าน)")
    expect(t).toContain("โทร 0812345678")
  })
  it("คนเดียวไม่ต้องมีวงเล็บจำนวนท่าน", () => {
    const t = msgShopNewBooking({ ...booking, services: ["นวดเท้า 60 นาที"] })
    expect(t).toContain("นวดเท้า 60 นาที")
    expect(t).not.toContain("ท่าน)")
  })
  it("ไม่มีเบอร์ → ไม่โชว์ท่อน โทร", () => {
    expect(msgShopNewBooking({ ...booking, phone: null })).not.toContain("โทร")
  })
  it("ยกเลิกคิว มี ❌ ชื่อ วันเวลา เมนู และไม่มีเบอร์", () => {
    const t = msgShopCancelled(booking)
    expect(t).toContain("❌ ลูกค้ายกเลิกคิว")
    expect(t).toContain("คุณสมศรี")
    expect(t).toContain("ศุกร์ 25 ก.ค. 14:00")
    expect(t).toContain("(รวม 2 ท่าน)")
    expect(t).not.toContain("โทร")
  })
})
