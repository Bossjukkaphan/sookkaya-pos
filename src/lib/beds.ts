/**
 * ข้อมูลเตียง — ต้องอยู่ใน lib (ไม่มี "use client") เพราะถูกใช้ทั้งสองฝั่ง:
 * การ์ดคิว (client) และหน้าประวัติบิล (server)
 *
 * บั๊กจริงที่เจอ 2026-07-23: shortBedName เคยอยู่ใน queue-board.tsx ("use client")
 * หน้าประวัติบิลเป็น server component เรียกฟังก์ชันจากไฟล์ client ไม่ได้ —
 * build ผ่านแต่หน้าพังตอนเปิดจริงทุกครั้ง (Attempted to call from the server)
 */
export type Bed = { id: string; room: string; name: string }

/** ชื่อเตียงแบบย่อไว้โชว์บนการ์ด เช่น "ไทย·3" "สปา1·2" */
export function shortBedName(bed: Bed): string {
  const room = bed.room.replace("ห้องนวดไทย", "ไทย").replace("ห้องสปา ", "สปา")
  const num = bed.name.replace("เตียง ", "")
  return `${room}·${num}`
}
