export type Point = { label: string; value: number }

export type Scale = {
  min: number
  max: number
  /** แปลงค่าเป็นพิกัด y ในกล่องสูง height โดย 0 คือขอบบน */
  y: (value: number) => number
  /** พิกัด y ของเส้นศูนย์ — แท่งค่าติดลบเริ่มจากเส้นนี้ */
  zeroY: number
}

/**
 * ดึงศูนย์เข้ามาอยู่ในช่วงเสมอ ไม่งั้นแท่งกราฟจะลอยและอ่านสัดส่วนผิด
 * เช่นรายได้ 174,842 กับ 347,018 ถ้าไม่รวมศูนย์ แท่งแรกจะดูเหมือนศูนย์บาท
 */
export function linearScale(values: number[], height: number): Scale {
  const finite = values.filter((v) => Number.isFinite(v))
  const min = finite.length > 0 ? Math.min(0, ...finite) : 0
  let max = finite.length > 0 ? Math.max(0, ...finite) : 0

  // ช่วงเป็นศูนย์เกิดได้จริงเมื่อเดือนใหม่ยังไม่มียอด — กันหารศูนย์
  if (max === min) max = min + 1

  const span = max - min
  const y = (value: number) => height - ((value - min) / span) * height

  return { min, max, y, zeroY: y(0) }
}

export type Bar = { x: number; y: number; w: number; h: number } & Point

/** พิกัดแท่งกราฟ · gap คือสัดส่วนช่องว่างต่อช่อง (0.3 = แท่งกว้าง 70% ของช่อง) */
export function barGeometry(
  points: Point[],
  width: number,
  height: number,
  gap = 0.3
): Bar[] {
  if (points.length === 0) return []

  const scale = linearScale(points.map((p) => p.value), height)
  const slot = width / points.length
  const w = slot * (1 - gap)

  return points.map((p, i) => {
    const valueY = scale.y(p.value)
    return {
      ...p,
      x: i * slot + (slot - w) / 2,
      y: Math.min(valueY, scale.zeroY),
      w,
      h: Math.abs(scale.zeroY - valueY),
    }
  })
}

/** path ของกราฟเส้น · คืนสตริงว่างเมื่อไม่มีจุด เพื่อให้ SVG ไม่วาดอะไรเลย */
export function linePath(points: Point[], width: number, height: number): string {
  if (points.length === 0) return ""

  const scale = linearScale(points.map((p) => p.value), height)
  const step = points.length > 1 ? width / (points.length - 1) : 0

  return points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${i * step} ${scale.y(p.value)}`)
    .join(" ")
}
