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

/** จำนวนช่องบนแกน x = ชุดที่ยาวที่สุด · ชุดที่สั้นกว่าปล่อยช่องท้ายว่างไว้ ไม่เติมแท่งปลอม */
function slotCount(series: Point[][]): number {
  return series.reduce((longest, s) => Math.max(longest, s.length), 0)
}

/** วางแท่งของทุกชุดบนสเกลที่ส่งเข้ามา — แยกออกมาเพื่อให้เส้นทับใช้สเกลเดียวกันได้ */
function barsOnScale(
  series: Point[][],
  scale: Scale,
  width: number,
  gap: number
): Bar[][] {
  const slots = slotCount(series)
  if (slots === 0) return series.map(() => [])

  const slot = width / slots
  // ช่องว่างกันช่อง แล้วค่อยหารความกว้างที่เหลือให้ทุกชุดเท่าๆ กัน
  const inner = slot * (1 - gap)
  const w = inner / series.length

  return series.map((points, s) =>
    points.map((p, i) => {
      const valueY = scale.y(p.value)
      return {
        ...p,
        x: i * slot + (slot - inner) / 2 + s * w,
        y: Math.min(valueY, scale.zeroY),
        w,
        h: Math.abs(scale.zeroY - valueY),
      }
    })
  )
}

/**
 * กราฟแท่งหลายชุดวางข้างกันในช่องเดียวกัน
 *
 * สเกลคิดจากค่าของ "ทุกชุดรวมกัน" ชุดเดียว — ถ้าแยกสเกลกันคนละชุด
 * แท่งรายได้กับรายจ่ายจะสูงพอกันทั้งที่ตัวเลขต่างกันเป็นแสน
 * ซึ่งทำลายเหตุผลทั้งหมดของการเอามาวางข้างกัน
 */
export function groupedBarGeometry(
  series: Point[][],
  width: number,
  height: number,
  gap = 0.3
): Bar[][] {
  if (series.length === 0) return []

  const scale = linearScale(
    series.flat().map((p) => p.value),
    height
  )
  return barsOnScale(series, scale, width, gap)
}

/**
 * แท่งกลุ่มพร้อมเส้นทับหนึ่งเส้น (เช่น กำไร) บนสเกลเดียวกัน
 * ถ้าเส้นคิดสเกลของตัวเอง มันจะบอกคนอ่านว่ากำไรใหญ่พอๆ กับรายได้
 * จุดของเส้นวางกลางช่อง ไม่ใช่กลางแท่งใดแท่งหนึ่ง
 */
export function groupedBarsWithLine(
  series: Point[][],
  line: Point[],
  width: number,
  height: number,
  gap = 0.3
): { bars: Bar[][]; path: string } {
  if (series.length === 0 && line.length === 0) return { bars: [], path: "" }

  const scale = linearScale(
    [...series.flat().map((p) => p.value), ...line.map((p) => p.value)],
    height
  )
  const bars = series.length === 0 ? [] : barsOnScale(series, scale, width, gap)

  const slots = Math.max(slotCount(series), line.length)
  const slot = slots > 0 ? width / slots : 0
  const path = line
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"} ${i * slot + slot / 2} ${scale.y(p.value)}`
    )
    .join(" ")

  return { bars, path }
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

/** ชิ้นหนึ่งของกราฟวงกลม — pct คือสัดส่วน startPct คือ % สะสมก่อนหน้าชิ้นนี้ */
export type DonutSlice = {
  label: string
  value: number
  pct: number
  startPct: number
}

/** ชิ้นที่เล็กกว่านี้ยุบรวมกัน — วงกลมที่มีเส้นบางเฉียบอ่านไม่ออกและกดไม่โดน */
export const DONUT_MIN_PCT = 5

/** ชื่อก้อนรวม — ตรงกับชื่อหมวดจริงในระบบ จะได้กดกรองแล้วเจอของ */
export const DONUT_OTHER_LABEL = "อื่นๆ"

export function donutSlices(points: Point[], minPct = DONUT_MIN_PCT): DonutSlice[] {
  const positive = points.filter((p) => p.value > 0)
  const total = positive.reduce((sum, p) => sum + p.value, 0)
  if (total <= 0) return []

  const sorted = [...positive].sort((a, b) => b.value - a.value)
  const big = sorted.filter((p) => (p.value / total) * 100 >= minPct)
  const small = sorted.filter((p) => (p.value / total) * 100 < minPct)

  // ยุบแล้วเหลือชิ้นเดียวชื่อ "อื่นๆ" ไม่ได้บอกอะไรเลย — แสดงตามจริงดีกว่า
  const shouldGroup = small.length > 0 && big.length > 0

  let merged: { label: string; value: number }[]
  if (shouldGroup) {
    const otherValue = small.reduce((sum, p) => sum + p.value, 0)
    // หมวดชื่อ "อื่นๆ" ที่ใหญ่พออยู่แล้วต้องรวมเข้าก้อนเดียวกัน ไม่งั้น legend มีสองบรรทัดชื่อซ้ำ
    const existing = big.find((p) => p.label === DONUT_OTHER_LABEL)
    if (existing) {
      merged = big.map((p) =>
        p.label === DONUT_OTHER_LABEL ? { label: p.label, value: p.value + otherValue } : p
      )
    } else {
      merged = [...big, { label: DONUT_OTHER_LABEL, value: otherValue }]
    }
  } else {
    merged = sorted
  }

  // ชิ้น "อื่นๆ" อยู่ท้ายเสมอ ส่วนที่เหลือเรียงมากไปน้อย
  const ordered = [
    ...merged.filter((p) => p.label !== DONUT_OTHER_LABEL).sort((a, b) => b.value - a.value),
    ...merged.filter((p) => p.label === DONUT_OTHER_LABEL),
  ]

  let startPct = 0
  return ordered.map((p) => {
    const pct = (p.value / total) * 100
    const slice = { label: p.label, value: p.value, pct, startPct }
    startPct += pct
    return slice
  })
}
