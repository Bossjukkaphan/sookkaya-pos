/**
 * เสียง "ติ๊ง" แจ้งเตือนคิวจองใหม่จากไลน์ — ใช้จากฝั่ง client เท่านั้น
 * (ย้ายมาจาก queue-board เพื่อให้ตัวแจ้งเตือนรวมใช้ร่วมกันโดยไม่เขียนซ้ำ)
 */
export function playNotifySound() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = 880
    gain.gain.value = 0.05
    osc.connect(gain).connect(ctx.destination)
    // ปิด context เองหลังเสียงจบ — แอปเปิดค้างทั้งวัน ถ้าไม่ปิดคอนเท็กซ์จะค้างสะสม
    // จนชนเพดานจำนวน AudioContext ที่เบราว์เซอร์อนุญาต แล้วเสียงจะเงียบไปดื้อๆ กลางวัน
    osc.onended = () => {
      void ctx.close()
    }
    osc.start()
    osc.stop(ctx.currentTime + 0.15)
  } catch {
    // เคสเงียบจริงๆ ไม่ใช่ throw — บราวเซอร์ล็อก AudioContext ไว้ "suspended" จนกว่าจะมี
    // user gesture (คลิก/แตะ) ก่อน ถ้าเปิดหน้าทิ้งไว้ยังไม่มีใครแตะจอเลยจะไม่มีเสียง
  }
}
