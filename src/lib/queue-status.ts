/**
 * สถานะการ์ดคิวแบบคำนวณ ณ เวลาปัจจุบัน — 2 ชิพอิสระตามภาพ ThaiHand:
 * ชิพนวด (รอเริ่ม/กำลังนวด/เสร็จสิ้น) + ชิพจ่าย (ชำระแล้ว/รอชำระ)
 * "เสร็จสิ้น" เปลี่ยนเองเมื่อเลยเวลาจบ — ไม่แตะ status ในฐานข้อมูล
 * จึงเข้ากันได้กับการ์ดเก่า (paid = จ่ายแล้ว) และ flow POS เดิมทั้งหมด
 */
import { timeToMin } from "./queue"

export type ServiceChip = "waiting" | "in_service" | "done"

export type CardStatus = {
  service: ServiceChip
  paid: boolean
  /** เสร็จสิ้นแล้วแต่ยังไม่เก็บเงิน — การ์ดต้องขึ้นเตือน */
  awaitingPayment: boolean
  /** กำลังนวด: เหลืออีกกี่นาที */
  remainingMin?: number
  /** เสร็จสิ้นแต่ยังไม่จ่าย: เกินเวลามากี่นาที */
  overdueMin?: number
  /** รอเริ่มแต่เลยเวลานัด: สายกี่นาที */
  lateStartMin?: number
}

export function deriveCardStatus(
  entry: {
    status: string
    start_time: string
    duration_min: number
    sale_id: string | null
  },
  nowMin: number
): CardStatus {
  const startMin = timeToMin(entry.start_time)
  const endMin = startMin + entry.duration_min
  const paid = Boolean(entry.sale_id) || entry.status === "paid"

  let service: ServiceChip
  if (nowMin >= endMin) {
    service = "done"
  } else if (entry.status === "in_service" || (paid && nowMin >= startMin)) {
    service = "in_service"
  } else {
    service = "waiting"
  }

  const awaitingPayment = service === "done" && !paid
  return {
    service,
    paid,
    awaitingPayment,
    ...(service === "in_service" ? { remainingMin: endMin - nowMin } : {}),
    ...(awaitingPayment ? { overdueMin: nowMin - endMin } : {}),
    ...(service === "waiting" && nowMin > startMin
      ? { lateStartMin: nowMin - startMin }
      : {}),
  }
}
