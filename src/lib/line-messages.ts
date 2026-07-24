/** ข้อความไลน์ 4 จังหวะ — โทนสุภาพแบบร้านสปา ตาม mockup ใน spec */
export type BookingInfo = {
  dateLabel: string
  time: string
  services: string[]
  therapistNote?: string
}

const lines = (b: BookingInfo) =>
  [
    `${b.dateLabel} · ${b.time}`,
    b.services.length > 1
      ? `${b.services.join(" / ")} (${b.services.length} ท่าน)`
      : b.services[0],
    b.therapistNote,
  ].filter(Boolean).join("\n")

export const msgRequested = (b: BookingInfo) =>
  `🌿 SOOK KAYA ได้รับคำขอจองของคุณแล้ว\n\n${lines(b)}\n\n⏳ รอร้านยืนยัน — จะแจ้งผลให้เร็วที่สุดค่ะ`

export const msgConfirmed = (b: BookingInfo) =>
  `✅ ยืนยันคิวเรียบร้อยค่ะ\n\n${lines(b)}\n\n💵 ชำระเงินที่ร้าน\n🕐 กรุณามาถึงก่อนเวลานัด 15 นาทีนะคะ\n\nแล้วพบกันค่ะ 💆‍♀️`

export const msgRejected = (b: BookingInfo, reason: string) =>
  `🙏 ขออภัยค่ะ ${reason}\n\n(${b.dateLabel} · ${b.time})\nรบกวนเลือกเวลาใหม่ได้เลยนะคะ`

export const msgCancelled = (b: BookingInfo) =>
  `📋 ยกเลิกการจองแล้วค่ะ\n\n${lines(b)}\n\nไว้โอกาสหน้าแวะมาใหม่นะคะ 🌿`
