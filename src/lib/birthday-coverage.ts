const DAY_MS = 86_400_000

/** วันที่ (เวลาไทย) ของ timestamp — ใช้เทียบว่าอวยพรวันไหน */
function shopDateOf(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso))
}

const shiftIso = (isoDate: string, days: number): string =>
  new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)

export type BirthdayCoverage = {
  /** วันเกิดที่ "ผ่านไปแล้ว" ในช่วงที่ดู */
  total: number
  greeted: number
  /** เปอร์เซ็นต์ที่ส่งทัน (ไม่มีวันเกิดเลย = 0 ไม่ใช่ NaN) */
  pct: number
  /** คนที่ตกหล่น เรียงวันเกิดใหม่สุดก่อน */
  missed: { customerId: string; name: string; date: string }[]
}

/**
 * ส่งคำอวยพรวันเกิดครบตามแผนแค่ไหน — วัดจากของจริงที่บันทึกไว้ ไม่ใช่ความรู้สึก
 *
 * กติกาที่ตั้งใจ:
 * · **ไม่นับวันนี้** — วันเกิดวันนี้ที่ยังไม่ส่งยังส่งทันอยู่ ไม่ใช่ความผิดพลาด
 *   (การ์ด 🎂 ด้านบนของหน้า /crm เป็นตัวเตือนของวันนี้อยู่แล้ว)
 * · อวยพรช้าไปหนึ่งวันยังนับว่าส่ง — ลูกค้าเข้าร้านดึก พนักงานส่งเช้าวันรุ่งขึ้นเป็นเรื่องปกติ
 *   ห่างเกินนั้นถือว่าคนละรอบ ไม่ใช่คำอวยพรของวันเกิดนั้น
 * · ยึดวันตามเวลาไทยทั้งสองฝั่ง (วันเกิดกับเวลาที่บันทึก) ไม่งั้นเคสส่งหลังเที่ยงคืน UTC เพี้ยน
 */
export function birthdayCoverage(
  customers: { id: string; name: string; nickname: string | null; birthday: string | null }[],
  contacts: { customer_id: string | null; created_at: string }[],
  todayIso: string,
  days: number
): BirthdayCoverage {
  // วันที่อวยพรของลูกค้าแต่ละคน (เวลาไทย) — เทียบแบบ ±1 วันทีหลัง
  const greetDates = new Map<string, string[]>()
  for (const c of contacts) {
    if (!c.customer_id) continue
    const list = greetDates.get(c.customer_id) ?? []
    list.push(shopDateOf(c.created_at))
    greetDates.set(c.customer_id, list)
  }

  const from = shiftIso(todayIso, -days)
  const missed: { customerId: string; name: string; date: string }[] = []
  let total = 0
  let greeted = 0

  for (const c of customers) {
    if (!c.birthday) continue
    const [, m, d] = c.birthday.split("-").map(Number)
    // วันเกิดของ "ปีนี้" และ "ปีก่อน" — ช่วงที่ดูอาจคร่อมปีใหม่
    const year = Number(todayIso.slice(0, 4))
    for (const y of [year, year - 1]) {
      const date = new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10)
      // ไม่รวมวันนี้ (ยังส่งทัน) และต้องอยู่ในช่วงที่ดู
      if (date >= todayIso || date < from) continue
      total++
      const hit = (greetDates.get(c.id) ?? []).some(
        (g) => Math.abs(Date.parse(`${g}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) <= DAY_MS
      )
      if (hit) greeted++
      else missed.push({ customerId: c.id, name: c.nickname?.trim() || c.name, date })
    }
  }

  missed.sort((a, b) => b.date.localeCompare(a.date))
  return {
    total,
    greeted,
    pct: total === 0 ? 0 : Math.round((greeted / total) * 100),
    missed,
  }
}
