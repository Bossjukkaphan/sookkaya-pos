/**
 * ทำข้อความโปรโมชั่นที่พนักงานพิมพ์มือให้เป็นคีย์เดียวกัน
 *
 * ต้องให้ผลตรงกับฟังก์ชัน SQL `public.promo_key()` ทุกกรณี — ถ้าสองฝั่งไม่ตรง
 * หน้าตั้งค่าจะแสดงกลุ่มหนึ่งแต่รายงาน ROI จะนับอีกกลุ่ม
 *
 * รหัสจอง Gowabi ยุบเป็นคำเดียว เพราะเลขจองไม่ซ้ำกันเลยสักรายการ
 * ถ้าไม่ยุบจะกลายเป็นโปรโมชั่น 55 ตัวที่ใช้ตัวละ 1 ครั้ง
 */
export function promoKey(text: string | null | undefined): string {
  const key = (text ?? "").toLowerCase().replace(/\s+/g, "")
  return key.startsWith("gowabi") ? "gowabi" : key
}
