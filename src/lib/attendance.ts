/**
 * กติกากลาง "หมอคนไหนรับคิววันนั้นไม่ได้" — ที่เดียว ใช้ทั้ง LINE / ฟอร์มคิว / ด่าน server
 *
 * วันที่มีการเช็คอินแล้ว (แอดมินติ๊กที่หน้า /checkin — วันนี้หรือติ๊กล่วงหน้า)
 *   → หมอที่ "ไม่ได้เช็คอิน" รับคิวไม่ได้ทั้งหมด (ยึดความจริงหน้างานเป็นหลัก)
 * วันที่ยังไม่มีใครเช็คอิน (วันอนาคตปกติ)
 *   → หมอที่ "ลงแผนลา" ไว้ที่หน้า /shifts รับคิวไม่ได้
 *
 * ลำดับนี้ต้องตรงกับ loadDays/createBookingRequest ของฝั่ง LINE เสมอ —
 * ไม่งั้นลูกค้าเห็นหมอที่ร้านรับไม่ได้ หรือร้านรับคิวที่ลูกค้าโดนปฏิเสธ
 */
export function unavailableTherapistIds(input: {
  activeIds: string[]
  checkedInIds: string[]
  onLeaveIds: string[]
}): string[] {
  const { activeIds, checkedInIds, onLeaveIds } = input
  if (checkedInIds.length > 0) {
    const present = new Set(checkedInIds)
    return activeIds.filter((id) => !present.has(id))
  }
  const active = new Set(activeIds)
  return [...new Set(onLeaveIds)].filter((id) => active.has(id))
}

/** ข้อความอธิบายว่าทำไมหมอคนนี้รับคิววันนั้นไม่ได้ — ใช้ใน error ฝั่ง server */
export function therapistUnavailableReason(
  hasCheckinThatDay: boolean,
  dateLabel: string
): string {
  return hasCheckinThatDay
    ? `หมอท่านนี้ไม่ได้เช็คอินเข้างานวันที่ ${dateLabel} — ติ๊กเข้างานที่หน้าเช็คอินก่อน หรือเลือกหมอท่านอื่น`
    : `หมอท่านนี้ลงแผนลาวันที่ ${dateLabel} ไว้ — เลือกหมอท่านอื่น หรือแก้แผนที่หน้าตารางเวร`
}
