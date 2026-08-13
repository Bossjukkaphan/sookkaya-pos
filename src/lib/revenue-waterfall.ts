/**
 * แยกยอดรับจริงออกเป็นบรรทัดของการ์ดรายรับ — สูตรชุดเดียวใช้ทั้งหน้ายอดวันนี้และหน้ารายงาน
 *
 * ค่าห้องสปาเป็นรายรับคนละก้อนกับค่าบริการนวด: ลูกค้าจ่ายเพิ่มจากราคาเมนู และส่วนลด
 * ไม่เคยแตะยอดนี้ (ดู sale-math.ts) แต่มันถูกบวกรวมอยู่ใน net_amount จึงอยู่ใน volume ด้วย
 * ถ้าไม่ถอดออก บรรทัด "มูลค่าเต็มตามเมนู" จะกลืนค่าห้องเข้าไปเงียบ ๆ แล้วแจกแจงไม่ได้
 * ว่ารายได้มาจากอะไร (เคสจริง 1-10 ส.ค. 2026: โชว์ 140,830 ทั้งที่ราคาเมนูจริง 140,730)
 *
 * ค่าห้องยังนับเป็นรายรับทางบัญชีเหมือนเดิมทุกประการ — งานนี้แค่แยกให้เห็นว่ามาจากไหน
 */

export type RevenueWaterfallInput = {
  /** sum(net_amount) — รวมค่าห้องสปาอยู่ในนี้แล้ว */
  volume: number
  /** sum(discount) */
  discount: number
  /** sum(room_fee) */
  roomFee: number
}

export type RevenueWaterfall = {
  /** มูลค่าเต็มตามเมนูล้วน ๆ ก่อนหักส่วนลด ไม่รวมค่าห้องสปา */
  gross: number
  roomFee: number
  discount: number
  /** เท่ากับ volume ที่รับเข้ามาเสมอ — มีไว้ให้ผู้เรียกอ่านครบทั้ง waterfall จากที่เดียว */
  volume: number
}

const round2 = (n: number) => {
  const result = Math.round(n * 100) / 100
  return Object.is(result, -0) ? 0 : result
}

export function revenueWaterfall(input: RevenueWaterfallInput): RevenueWaterfall {
  // ค่าห้องติดลบเป็นข้อมูลเพี้ยน ถ้าปล่อยผ่านจะไปบวกใส่ gross ทำให้มูลค่าเมนูบวมเกินจริง
  const roomFee = round2(Math.max(0, input.roomFee))
  const discount = round2(input.discount)
  const volume = round2(input.volume)

  return { gross: round2(volume + discount - roomFee), roomFee, discount, volume }
}
