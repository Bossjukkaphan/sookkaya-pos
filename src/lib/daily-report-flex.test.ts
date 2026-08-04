import { describe, expect, it } from "vitest"
import { DASHBOARD_URL, dailyReportFlex } from "./daily-report-flex"
import type { DailyReport } from "./daily-report"

const report: DailyReport = {
  date: "2026-08-04",
  empty: false,
  netRevenue: 11673.67,
  cashIn: 19107,
  commission: 4680,
  grossProfit: 6993.67,
  margin: 59.91,
  sessions: 16,
  customers: 14,
  vsAvg7dPct: -9.0,
  mtd: 52272.68,
  mtdDeltaPct: 8.2,
  topTherapist: { name: "โจโจ้", income: 1160, sessions: 3 },
  bookingsTomorrow: 5,
  alerts: ["🔴 Member 2 คน เครดิตหมด → เชียร์ขาย Top-up ใหม่"],
}

/** เก็บ text ทุกตัวในต้นไม้ ทำให้เทสไม่ผูกกับตำแหน่ง node ที่อาจขยับ */
function allText(node: unknown): string[] {
  if (Array.isArray(node)) return node.flatMap(allText)
  if (node && typeof node === "object") {
    const o = node as Record<string, unknown>
    const self = typeof o.text === "string" ? [o.text] : []
    return [...self, ...Object.values(o).flatMap(allText)]
  }
  return []
}

function find(node: unknown, pred: (o: Record<string, unknown>) => boolean): Record<string, unknown> | null {
  if (Array.isArray(node)) {
    for (const n of node) { const hit = find(n, pred); if (hit) return hit }
    return null
  }
  if (node && typeof node === "object") {
    const o = node as Record<string, unknown>
    if (pred(o)) return o
    for (const v of Object.values(o)) { const hit = find(v, pred); if (hit) return hit }
  }
  return null
}

describe("dailyReportFlex — โครงการ์ด", () => {
  const msg = dailyReportFlex(report)
  const bubble = msg.contents as Record<string, unknown>

  it("เป็น flex bubble ขนาด mega มีครบ header body footer", () => {
    expect(msg.type).toBe("flex")
    expect(bubble.type).toBe("bubble")
    expect(bubble.size).toBe("mega")
    expect(bubble.header).toBeDefined()
    expect(bubble.body).toBeDefined()
    expect(bubble.footer).toBeDefined()
  })

  it("altText มีวันที่แบบไทยและยอดสุทธิ ให้เห็นในหน้ารายการแชท", () => {
    expect(msg.altText).toContain("4 ส.ค. 2569")
    expect(msg.altText).toContain("11,674")
  })

  it("หัวการ์ดเป็นเขียวแบรนด์ พร้อมวันที่เต็ม", () => {
    const header = bubble.header as Record<string, unknown>
    expect(header.backgroundColor).toBe("#2A4A3A")
    expect(allText(header)).toContain("🌿 SOOKKAYA")
    expect(allText(header)).toContain("Daily Report")
    expect(allText(header).some((t) => t.includes("4 ส.ค. 2569"))).toBe(true)
  })
})

describe("dailyReportFlex — ตัวเลขบนการ์ด", () => {
  const texts = allText(dailyReportFlex(report).contents)

  it("ยอดสุทธิปัดเป็นจำนวนเต็ม ไม่มีทศนิยม", () => {
    expect(texts).toContain("฿11,674")
    expect(texts.some((t) => t.includes("11,673.67"))).toBe(false)
  })

  it("โชว์ครบทั้ง Cash In กำไรขั้นต้น Margin", () => {
    expect(texts).toContain("💵 Cash In")
    expect(texts).toContain("✨ กำไรขั้นต้น")
    expect(texts).toContain("📊 Margin")
    expect(texts).toContain("฿19,107")
    expect(texts).toContain("฿6,994")
    expect(texts).toContain("59.9%")
  })

  it("แถวปฏิบัติการครบ 5 แถว รวม MTD และคิวพรุ่งนี้", () => {
    expect(texts).toContain("👥 Sessions")
    expect(texts).toContain("16 sessions · 14 ลูกค้า")
    expect(texts).toContain("💼 ค่ามือรวม")
    expect(texts).toContain("฿4,680")
    expect(texts).toContain("🏆 TOP หมอ")
    expect(texts).toContain("โจโจ้ · ฿1,160 (3 sess)")
    expect(texts).toContain("📅 MTD")
    expect(texts.some((t) => t.includes("฿52,273") && t.includes("8.2%"))).toBe(true)
    expect(texts).toContain("🗓 คิวจองพรุ่งนี้")
    expect(texts).toContain("5 คิว")
  })

  it("ยอดตกใช้ลูกศรลงสีแดง ยอดขึ้นใช้ลูกศรขึ้นสีเขียว", () => {
    const down = find(dailyReportFlex(report).contents, (o) =>
      typeof o.text === "string" && o.text.includes("vs avg 7d")
    )
    expect(down?.text).toBe("▼ 9.0% vs avg 7d")
    expect(down?.color).toBe("#C0392B")

    const up = find(dailyReportFlex({ ...report, vsAvg7dPct: 12.34 }).contents, (o) =>
      typeof o.text === "string" && o.text.includes("vs avg 7d")
    )
    expect(up?.text).toBe("▲ 12.3% vs avg 7d")
    expect(up?.color).toBe("#5F8A4F")
  })

  it("กำไรติดลบเปลี่ยนเป็นสีแดง", () => {
    const loss = find(dailyReportFlex({ ...report, grossProfit: -500, margin: -4.3 }).contents,
      (o) => o.text === "฿-500")
    expect(loss?.color).toBe("#C0392B")
  })
})

describe("dailyReportFlex — ส่วนที่ซ่อนได้", () => {
  it("ไม่มีหมอทำงาน ซ่อนแถว TOP หมอ", () => {
    const texts = allText(dailyReportFlex({ ...report, topTherapist: null }).contents)
    expect(texts).not.toContain("🏆 TOP หมอ")
  })

  it("เดือนที่แล้วไม่มียอด แสดง MTD เปล่าๆ ไม่มี %", () => {
    const texts = allText(dailyReportFlex({ ...report, mtdDeltaPct: null }).contents)
    expect(texts).toContain("฿52,273")
    expect(texts.some((t) => t.includes("vs เดือนที่แล้ว"))).toBe(false)
  })

  it("ไม่มีข้อมูลย้อนหลังพอ ซ่อนบรรทัดเทียบค่าเฉลี่ย", () => {
    const texts = allText(dailyReportFlex({ ...report, vsAvg7dPct: null }).contents)
    expect(texts.some((t) => t.includes("vs avg 7d"))).toBe(false)
  })

  it("ไม่มี alert ซ่อนหัวข้อ Action ทั้งบล็อก", () => {
    const texts = allText(dailyReportFlex({ ...report, alerts: [] }).contents)
    expect(texts.some((t) => t.includes("Action ที่ต้องทำวันนี้"))).toBe(false)
  })
})

describe("dailyReportFlex — วันที่ไม่มีบิล", () => {
  const texts = allText(
    dailyReportFlex({
      ...report, empty: true, netRevenue: 0, cashIn: 0, commission: 0,
      grossProfit: 0, margin: 0, sessions: 0, customers: 0,
      vsAvg7dPct: null, topTherapist: null, alerts: [],
    }).contents
  )

  it("บอกตรงๆ ว่ายังไม่มีบิล ไม่โชว์เลข 0 ให้เข้าใจผิดว่าขายไม่ได้", () => {
    expect(texts.some((t) => t.includes("ยังไม่มีบิลในระบบ"))).toBe(true)
    expect(texts).not.toContain("NET REVENUE · วันนี้")
    expect(texts).not.toContain("💵 Cash In")
  })

  it("ยังมีหัวการ์ดและปุ่มเหมือนเดิม", () => {
    expect(texts).toContain("🌿 SOOKKAYA")
  })
})

describe("dailyReportFlex — ปุ่ม", () => {
  it("ปุ่มพาไปหน้ายอดขายวันนี้ของ POS ไม่ใช่ dashboard เก่าบน GitHub Pages", () => {
    const btn = find(dailyReportFlex(report).contents, (o) => o.type === "button")
    const action = btn?.action as Record<string, unknown>
    expect(action.uri).toBe(DASHBOARD_URL)
    expect(DASHBOARD_URL).toBe("https://sookkaya-pos.vercel.app/today")
    expect(action.label).toBe("📊 ดูยอดขายวันนี้")
  })
})
