import { GOWABI_METHOD, MEMBER_CREDIT_METHOD } from "@/lib/constants"

export type SaleInput = {
  priceNormal: number
  discount: number
  paymentMethod: string
  /** ยอดที่ Gowabi จ่ายจริง · null = ใช้ราคาปกติ */
  gowabiNet: number | null
  isRequest: boolean
  requestFee: number
  /** ค่าห้องสปาส่วนตัว (0 = ไม่ใช้) — ลูกค้าจ่าย บวกเข้ายอดบิลตรงๆ */
  roomFee: number
  serviceCommission: number
  /** cash_paid / credit_granted ของสมาชิก · null = ไม่ได้จ่ายด้วยเครดิต */
  memberRatio: number | null
}

export type SaleAmounts = {
  netAmount: number
  discount: number
  commission: number
  requestFee: number
  roomFee: number
  creditUsed: number
  bonusUsed: number
  revenueRecognize: number
}

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * สูตรเงินของการขายหนึ่งรายการ — ที่เดียวในระบบ
 *
 * ทั้งตอนบันทึกใหม่และตอนแก้ของเดิมต้องเรียกฟังก์ชันนี้ ห้ามคำนวณเอง
 * ถ้าสองเส้นทางคำนวณแยกกัน วันหนึ่งมันจะให้ตัวเลขต่างกันโดยไม่มีใครรู้
 * (กฎบัญชีข้อ 3 ใน README — บั๊กเรื่องเงิน 4 จุดที่ผ่านมาเกิดจากคำนวณซ้ำหลายที่)
 */
export function computeSaleAmounts(input: SaleInput): SaleAmounts {
  const isGowabi = input.paymentMethod === GOWABI_METHOD
  const isMemberCredit = input.paymentMethod === MEMBER_CREDIT_METHOD

  // ค่าห้องสปา: ลูกค้าจ่ายจริง บวกทับยอดบริการหลักเสมอ (ส่วนลดไม่แตะค่าห้อง)
  const roomFee = Math.max(0, input.roomFee)
  // Gowabi จ่ายตามดีลของเขา ยอดรับจริงจึงกรอกเอง และส่วนลดคือส่วนต่างจากราคาปกติ
  // (ยอดนวดล้วนก่อนบวกค่าห้อง — ค่าห้องเก็บเพิ่มจากลูกค้าหน้าร้าน)
  const baseNet = isGowabi
    ? Math.max(0, input.gowabiNet ?? input.priceNormal)
    : input.priceNormal - input.discount
  const netAmount = baseNet + roomFee

  const discount = isGowabi ? input.priceNormal - baseNet : input.discount
  const requestFee = input.isRequest ? Math.max(0, input.requestFee) : 0

  if (!isMemberCredit) {
    return {
      netAmount,
      discount,
      commission: input.serviceCommission,
      requestFee,
      roomFee,
      creditUsed: 0,
      bonusUsed: 0,
      revenueRecognize: netAmount,
    }
  }

  // เครดิตถูกตัดเต็มยอด แต่ส่วนที่เป็นของแถมไม่ใช่รายได้
  // เช่น Silver จ่าย 5,000 ได้เครดิต 6,000 → ใช้ 690 รับรู้ 575 ที่เหลือ 115 คือของแถม
  const ratio = input.memberRatio ?? 1
  const revenueRecognize = round2(netAmount * ratio)

  return {
    netAmount,
    discount,
    commission: input.serviceCommission,
    requestFee,
    roomFee,
    creditUsed: netAmount,
    bonusUsed: round2(netAmount - revenueRecognize),
    revenueRecognize,
  }
}
