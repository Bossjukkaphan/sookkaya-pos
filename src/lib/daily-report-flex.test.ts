import { describe, expect, it } from "vitest"
import { DASHBOARD_URL, dailyReportFlex } from "./daily-report-flex"
import type { DailyReport, ExpenseEntries } from "./daily-report"

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
  memberSignups: {
    newCount: 0, newCash: 0, newTiers: [],
    renewCount: 0, renewCash: 0, renewTiers: [],
  },
  expenseEntries: {
    count: 0, total: 0, backdatedCount: 0, backdatedTotal: 0,
    byMonth: [], otherMonthsTotal: 0,
  },
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

/** "14 รายการ · ฿55,690" → [55690] — ดึงตัวเลขบาททุกตัวในข้อความเดียว (บรรทัดแยกเดือนมีหลายตัว) */
function extractBahtNumbers(s: string): number[] {
  return [...s.matchAll(/฿([\d,]+)/g)].map((m) => Number(m[1].replace(/,/g, "")))
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

  // LINE ตอบ 400 "unknown field" ถ้าเจอ property ที่ไม่มีในสเปก Flex
  // letterSpacing คือตัวที่ทำให้ Daily Report ตัวเดิม (Apps Script) พังตั้งแต่ 22 มิ.ย. 2569
  // ตรวจด้วย endpoint /v2/bot/message/validate/push แล้วว่าโครงปัจจุบันผ่าน (5 ส.ค. 2569)
  it("ไม่มี property ที่ LINE ไม่รู้จัก", () => {
    const banned = ["letterSpacing", "lineHeight", "fontFamily", "textAlign"]
    const json = JSON.stringify(msg)
    for (const key of banned) expect(json).not.toContain(key)
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

describe("dailyReportFlex — บล็อกสมาชิก", () => {
  it("มีสมาชิกใหม่ โชว์แถวและบรรทัดกำกับ Cash In", () => {
    const flex = dailyReportFlex({
      ...report,
      memberSignups: {
        newCount: 1, newCash: 5000, newTiers: [{ tier: "Silver", count: 1 }],
        renewCount: 0, renewCash: 0, renewTiers: [],
      },
    })
    const texts = allText(flex)
    expect(texts).toContain("👥 สมาชิกใหม่")
    expect(texts.some((t) => t.includes("1 ราย") && t.includes("Silver ×1") && t.includes("฿5,000"))).toBe(true)
    expect(texts).toContain("(รวมอยู่ใน Cash In แล้ว)")
    expect(texts).not.toContain("🔁 ต่ออายุ")
  })

  it("มีทั้งใหม่และต่ออายุ โชว์สองแถว", () => {
    const texts = allText(dailyReportFlex({
      ...report,
      memberSignups: {
        newCount: 1, newCash: 5000, newTiers: [{ tier: "Silver", count: 1 }],
        renewCount: 2, renewCash: 10000, renewTiers: [{ tier: "Silver", count: 2 }],
      },
    }))
    expect(texts).toContain("👥 สมาชิกใหม่")
    expect(texts).toContain("🔁 ต่ออายุ")
  })

  it("บล็อกสมาชิกอยู่ระหว่าง TOP หมอ กับ MTD ตามลำดับที่กำหนด", () => {
    // ใช้ report ฐาน — มี topTherapist และ mtdDeltaPct อยู่แล้ว เพิ่มแค่ signups ทั้งสองแบบ
    const lines = allText(dailyReportFlex({
      ...report,
      memberSignups: {
        newCount: 1, newCash: 5000, newTiers: [{ tier: "Silver", count: 1 }],
        renewCount: 2, renewCash: 10000, renewTiers: [{ tier: "Silver", count: 2 }],
      },
    }))
    const idx = (t: string) => lines.findIndex((l) => l === t)
    const top = idx("🏆 TOP หมอ")
    const newMember = idx("👥 สมาชิกใหม่")
    const renew = idx("🔁 ต่ออายุ")
    const note = idx("(รวมอยู่ใน Cash In แล้ว)")
    const mtd = idx("📅 MTD")
    expect(top).toBeGreaterThan(-1)
    expect(newMember).toBeGreaterThan(top)
    expect(renew).toBeGreaterThan(newMember)
    expect(note).toBeGreaterThan(renew)
    expect(mtd).toBeGreaterThan(note)
  })

  it("ไม่มีใครเติมเลย ซ่อนทั้งบล็อกรวมบรรทัดกำกับ", () => {
    const texts = allText(dailyReportFlex(report))
    expect(texts).not.toContain("👥 สมาชิกใหม่")
    expect(texts).not.toContain("🔁 ต่ออายุ")
    expect(texts).not.toContain("(รวมอยู่ใน Cash In แล้ว)")
  })

  it("วันที่ไม่มีบิล การ์ดย่อ ไม่มีบล็อกสมาชิกแม้มีคนเติม", () => {
    const texts = allText(dailyReportFlex({
      ...report,
      empty: true,
      memberSignups: {
        newCount: 1, newCash: 5000, newTiers: [{ tier: "Silver", count: 1 }],
        renewCount: 0, renewCash: 0, renewTiers: [],
      },
    }))
    expect(texts).not.toContain("👥 สมาชิกใหม่")
  })
})

describe("dailyReportFlex — บล็อกรายจ่ายที่บันทึก", () => {
  const withExpenses = {
    ...report,
    expenseEntries: {
      count: 14, total: 55690, backdatedCount: 13, backdatedTotal: 55232,
      byMonth: [
        { month: "พ.ค.", total: 4548 },
        { month: "มิ.ย.", total: 24884 },
        { month: "ก.ค.", total: 25800 },
      ],
      otherMonthsTotal: 0,
    },
  }

  it("โชว์ยอดรวม บรรทัดย้อนหลัง และบรรทัดแยกเดือน", () => {
    const texts = allText(dailyReportFlex(withExpenses))
    expect(texts).toContain("🧾 บันทึกรายจ่ายวันนี้")
    expect(texts.some((t) => t.includes("14 รายการ") && t.includes("฿55,690"))).toBe(true)
    expect(texts.some((t) => t.includes("ย้อนหลัง 13") && t.includes("฿55,232"))).toBe(true)
    expect(texts.some((t) => t.includes("พ.ค. ฿4,548") && t.includes("ก.ค. ฿25,800"))).toBe(true)
  })

  it("บรรทัดย้อนหลังและบรรทัดแยกเดือนใช้สีทองเตือน ส่วนบรรทัดยอดรวมไม่ใช่", () => {
    const contents = dailyReportFlex(withExpenses).contents
    const totalLine = find(contents, (o) => o.text === "14 รายการ · ฿55,690")
    const backdatedLine = find(contents, (o) =>
      typeof o.text === "string" && o.text.startsWith("ย้อนหลัง")
    )
    const monthLine = find(contents, (o) =>
      typeof o.text === "string" && o.text.includes("พ.ค. ฿4,548")
    )
    expect(backdatedLine?.color).toBe("#C9A96E")
    expect(monthLine?.color).toBe("#C9A96E")
    // ต้องเช็คว่าเจอ node จริงก่อน — ไม่งั้นถ้า totalLine เป็น null (เช่น รูปแบบบรรทัดเปลี่ยนจน
    // predicate หาไม่เจอ) .not.toBe("#C9A96E") จะผ่านฟรีเพราะ undefined !== "#C9A96E" เสมอ
    // ทั้งที่ไม่ได้พิสูจน์อะไรเรื่องสีเลย
    expect(totalLine).not.toBeNull()
    expect(totalLine?.color).not.toBe("#C9A96E")
  })

  // round 1 เคยแก้โดยปัดแต่ละเดือนแยกกันแล้วรวมเป็นยอด "ย้อนหลัง" — ผลคือ ย้อนหลัง (202) > รวม (201)
  // ได้ ทั้งที่ backdatedTotal ≤ total เสมอจริง เป็นบั๊กที่ย้ายปัญหาขึ้นไปหนึ่งบรรทัดแทนที่จะแก้จริง
  // round 3 กลับทิศ: ปัด backdatedTotal เป็นเลขเดียวเหมือนที่ปัด total เอง แล้วค่อยแจกกลับลงไป
  // ยอดย้อนหลัง (201) จึงเท่ากับยอดรวม (201) พอดี ไม่มีทางเป็น 202 ได้อีก
  it("ทุกรายการเป็นย้อนหลังหมด (total === backdatedTotal) โชว์เลขเดียวกันสองบรรทัด ไม่ใช่ 201 กับ 202", () => {
    const texts = allText(dailyReportFlex({
      ...report,
      expenseEntries: {
        count: 2, total: 201, backdatedCount: 2, backdatedTotal: 201,
        byMonth: [
          { month: "ม.ค.", total: 100.5 },
          { month: "ก.พ.", total: 100.5 },
        ],
        otherMonthsTotal: 0,
      },
    }))
    expect(texts.some((t) => t.includes("2 รายการ") && t.includes("฿201"))).toBe(true)
    expect(texts.some((t) => t.includes("ย้อนหลัง 2") && t.includes("฿201"))).toBe(true)
    expect(texts.some((t) => t.includes("฿202"))).toBe(false)
  })

  it("มีบันทึกแต่ไม่มีย้อนหลัง โชว์แค่บรรทัดแรก", () => {
    const texts = allText(dailyReportFlex({
      ...report,
      expenseEntries: {
        count: 2, total: 900, backdatedCount: 0, backdatedTotal: 0,
        byMonth: [], otherMonthsTotal: 0,
      },
    }))
    expect(texts).toContain("🧾 บันทึกรายจ่ายวันนี้")
    expect(texts.some((t) => t.includes("ย้อนหลัง"))).toBe(false)
  })

  // แม้ไม่มีรายการย้อนหลังสักรายการ หมายเหตุกันเข้าใจผิดนี้ก็ยังต้องขึ้น — มันเตือนเรื่อง
  // "วันที่บันทึก vs วันนี้" ซึ่งจริงเสมอไม่ว่าจะมีย้อนหลังหรือไม่ ไม่ใช่แค่ตอนมีย้อนหลัง
  it("หมายเหตุกันเข้าใจผิดขึ้นแม้ไม่มีรายการย้อนหลังเลย", () => {
    const texts = allText(dailyReportFlex({
      ...report,
      expenseEntries: {
        count: 2, total: 900, backdatedCount: 0, backdatedTotal: 0,
        byMonth: [], otherMonthsTotal: 0,
      },
    }))
    expect(texts).toContain("(ยอดตามวันที่บันทึก · ไม่ใช่รายจ่ายของวันนี้)")
  })

  it("มีบันทึก แสดงหมายเหตุกันเข้าใจผิดว่าเป็นรายจ่ายของวันนี้ ด้วยสีเทาไม่ใช่สีทอง", () => {
    const contents = dailyReportFlex(withExpenses).contents
    const note = find(contents, (o) => o.text === "(ยอดตามวันที่บันทึก · ไม่ใช่รายจ่ายของวันนี้)")
    expect(note).not.toBeNull()
    expect(note?.color).toBe("#9C8E80")
  })

  // ใช้ `report` ฐานตรงๆ (ไม่ empty มี sessions/revenue ปกติ แค่ ee.count = 0) แทนที่จะปิดทั้งการ์ด
  // ด้วย empty: true — ถ้าเทสปิดทั้งการ์ด การผ่านของเทสจะพิสูจน์ไม่ได้ว่าโค้ด gate ถูกต้องจริง
  // (การ์ดว่างซ่อนทุกอย่างอยู่แล้วไม่ว่า gate จะเขียนถูกหรือผิด) เคสนี้บล็อกอื่นยังโชว์ปกติ
  // มีแค่บล็อกรายจ่ายที่ถูกซ่อน จึงจับได้จริงถ้าใครเผลอเอาหมายเหตุไปวางไว้นอกเงื่อนไข count > 0
  it("ไม่มีการบันทึกรายจ่ายเลย ไม่มีหมายเหตุกันเข้าใจผิด แม้การ์ดไม่ได้ว่างเปล่า", () => {
    const texts = allText(dailyReportFlex(report))
    expect(report.empty).toBe(false)
    expect(texts).not.toContain("(ยอดตามวันที่บันทึก · ไม่ใช่รายจ่ายของวันนี้)")
  })

  it("มีเดือนที่ถูกตัด ต่อท้ายด้วยอื่นๆ", () => {
    const texts = allText(dailyReportFlex({
      ...withExpenses,
      expenseEntries: { ...withExpenses.expenseEntries, otherMonthsTotal: 100 },
    }))
    expect(texts.some((t) => t.includes("อื่นๆ ฿100"))).toBe(true)
  })

  it("ไม่มีเดือนที่ถูกตัด ไม่มีคำว่าอื่นๆ", () => {
    // withExpenses มี otherMonthsTotal: 0 — ถ้า implementation ต่อคำว่า "อื่นๆ" แบบไม่มีเงื่อนไข เทสนี้จะจับได้
    const texts = allText(dailyReportFlex(withExpenses))
    expect(texts.some((t) => t.includes("อื่นๆ"))).toBe(false)
  })

  it("ลำดับบล็อกถูกต้อง — อยู่หลังคิวจองพรุ่งนี้ ก่อน Action alerts", () => {
    // report ฐานมี alerts อยู่แล้ว 1 รายการ จึงใช้ withExpenses ตรงๆ ได้ ไม่ต้องสร้าง fixture แยก
    const lines = allText(dailyReportFlex(withExpenses))
    const idx = (t: string) => lines.findIndex((l) => l === t)
    const queue = idx("🗓 คิวจองพรุ่งนี้")
    const expense = idx("🧾 บันทึกรายจ่ายวันนี้")
    const alertHeader = idx("⚠️ Action ที่ต้องทำวันนี้")
    expect(queue).toBeGreaterThan(-1)
    expect(expense).toBeGreaterThan(queue)
    expect(alertHeader).toBeGreaterThan(-1)
    expect(expense).toBeLessThan(alertHeader)
  })

  it("หมายเหตุกันเข้าใจผิดอยู่บรรทัดสุดท้ายของบล็อก หลังบรรทัดแยกเดือน", () => {
    const lines = allText(dailyReportFlex(withExpenses))
    const idx = (t: string) => lines.findIndex((l) => l === t)
    const monthLine = lines.findIndex((l) => l.includes("พ.ค. ฿4,548"))
    const note = idx("(ยอดตามวันที่บันทึก · ไม่ใช่รายจ่ายของวันนี้)")
    const alertHeader = idx("⚠️ Action ที่ต้องทำวันนี้")
    expect(monthLine).toBeGreaterThan(-1)
    expect(note).toBeGreaterThan(monthLine)
    expect(note).toBeLessThan(alertHeader)
  })

  it("ไม่มีการบันทึกเลย ซ่อนทั้งบล็อก", () => {
    expect(allText(dailyReportFlex(report))).not.toContain("🧾 บันทึกรายจ่ายวันนี้")
  })

  it("วันที่ไม่มีบิล การ์ดย่อ ไม่มีบล็อกรายจ่าย", () => {
    const texts = allText(dailyReportFlex({ ...withExpenses, empty: true }))
    expect(texts).not.toContain("🧾 บันทึกรายจ่ายวันนี้")
  })
})

describe("dailyReportFlex — บล็อกรายจ่าย: สองอสมการที่ต้องจริงเสมอ", () => {
  // (a) ผลรวมของยอดแยกเดือน+อื่นๆ ที่โชว์ ต้องเท่ากับยอด "ย้อนหลัง" ที่โชว์ เป๊ะ (ไม่ใช่แค่ใกล้เคียง)
  // (b) ยอด "ย้อนหลัง" ที่โชว์ ต้องไม่มากกว่ายอด "รวม" ที่โชว์ — ส่วนย่อยเกินทั้งก้อนไม่ได้ไม่ว่ากรณีใด
  // ครอบทั้งกรณี byMonth เต็ม cap (4 เดือน), otherMonthsTotal เป็นศูนย์, และย้อนหลังหมดทั้งก้อน
  const fixtures: { name: string; ee: ExpenseEntries }[] = [
    {
      name: "byMonth เต็ม cap สี่เดือน และมี otherMonthsTotal ร่วมด้วย",
      ee: {
        count: 20, total: 1000, backdatedCount: 20, backdatedTotal: 107.5,
        byMonth: [
          { month: "ม.ค.", total: 10.5 },
          { month: "ก.พ.", total: 20.5 },
          { month: "มี.ค.", total: 30.5 },
          { month: "เม.ย.", total: 40.5 },
        ],
        otherMonthsTotal: 5.5,
      },
    },
    {
      name: "otherMonthsTotal เป็นศูนย์ (byMonth ไม่ถูกตัดเดือนไหนออก)",
      ee: {
        count: 14, total: 55690, backdatedCount: 13, backdatedTotal: 55232,
        byMonth: [
          { month: "พ.ค.", total: 4548 },
          { month: "มิ.ย.", total: 24884.4 },
          { month: "ก.ค.", total: 25799.6 },
        ],
        otherMonthsTotal: 0,
      },
    },
    {
      name: "ย้อนหลังหมดทั้งก้อน (total === backdatedTotal)",
      ee: {
        count: 2, total: 201, backdatedCount: 2, backdatedTotal: 201,
        byMonth: [
          { month: "ม.ค.", total: 100.5 },
          { month: "ก.พ.", total: 100.5 },
        ],
        otherMonthsTotal: 0,
      },
    },
  ]

  for (const { name, ee } of fixtures) {
    it(name, () => {
      const contents = dailyReportFlex({ ...report, expenseEntries: ee }).contents
      const totalNode = find(contents, (o) =>
        typeof o.text === "string" && o.text.includes("รายการ") && o.text.includes("฿")
      )
      const backdatedNode = find(contents, (o) =>
        typeof o.text === "string" && o.text.startsWith("ย้อนหลัง")
      )
      const monthNode = find(contents, (o) =>
        typeof o.text === "string" && o.text.startsWith(ee.byMonth[0].month)
      )
      expect(totalNode).not.toBeNull()
      expect(backdatedNode).not.toBeNull()
      expect(monthNode).not.toBeNull()

      const totalAmount = extractBahtNumbers(totalNode?.text as string)[0]
      const backdatedAmount = extractBahtNumbers(backdatedNode?.text as string)[0]
      const partsSum = extractBahtNumbers(monthNode?.text as string).reduce((s, n) => s + n, 0)

      expect(partsSum).toBe(backdatedAmount) // (a) ส่วนย่อยรวมกันตรงยอดย้อนหลังเป๊ะ
      expect(backdatedAmount).toBeLessThanOrEqual(totalAmount) // (b) ย้อนหลังไม่มากกว่ารวม
    })
  }
})
