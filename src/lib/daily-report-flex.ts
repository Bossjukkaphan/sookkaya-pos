/** ประกอบการ์ด Flex ของรายงานรายวัน — ลอกโครงจาก LineDailyReport_v9_FLEX.gs ตัวเดิม
 *  เจ้าของร้านอ่านการ์ดนี้ทุกวันมาหลายเดือน สี/ขนาด/ลำดับจึงต้องคงเดิม
 *  spec: docs/superpowers/specs/2026-08-05-line-daily-report-design.md */

import type { DailyReport } from "./daily-report"
import { formatBaht } from "./constants"
import { formatThaiDate } from "./datetime"

const BRAND = {
  green: "#2A4A3A",
  gold: "#C9A96E",
  beige: "#F4ECDE",
  beigeDk: "#E5E0D5",
  text: "#2A1F1D",
  textSub: "#786A5E",
  textMuted: "#9C8E80",
  positive: "#5F8A4F",
  negative: "#C0392B",
} as const

export const DASHBOARD_URL = "https://sookkaya-pos.vercel.app/today"

const THAI_WEEKDAYS = [
  "วันอาทิตย์", "วันจันทร์", "วันอังคาร", "วันพุธ",
  "วันพฤหัสบดี", "วันศุกร์", "วันเสาร์",
]

/** "วันอังคารที่ 4 ส.ค. 2569" */
function fullThaiDate(isoDate: string): string {
  const weekday = THAI_WEEKDAYS[new Date(`${isoDate}T00:00:00Z`).getUTCDay()]
  return `${weekday}ที่ ${formatThaiDate(isoDate)}`
}

/** การ์ดนี้ไม่โชว์สตางค์ — ปัดก่อนเสมอ ไม่งั้น formatBaht จะโผล่ทศนิยมสองตำแหน่ง */
function baht(n: number): string {
  return `฿${formatBaht(Math.round(n))}`
}

function statCol(label: string, value: string, valueColor: string) {
  return {
    type: "box",
    layout: "vertical",
    spacing: "xs",
    contents: [
      { type: "text", text: label, color: BRAND.textMuted, size: "xxs", weight: "bold" },
      { type: "text", text: value, color: valueColor, size: "sm", weight: "bold" },
    ],
  }
}

function opRow(label: string, value: string, valueColor: string) {
  return {
    type: "box",
    layout: "horizontal",
    contents: [
      { type: "text", text: label, color: BRAND.textSub, size: "xs", flex: 4 },
      {
        type: "text", text: value, color: valueColor, size: "xs",
        flex: 6, align: "end", weight: "bold", wrap: true,
      },
    ],
  }
}

/** "Silver ×2 · Gold ×1" — เรียกเฉพาะตอน count > 0 จึงมีอย่างน้อยหนึ่ง tier เสมอ
 *  (countTiers ใส่ "ไม่ระบุ" แทนเมื่อไม่มีชื่อ tier จริง ไม่เคยคืนอาเรย์ว่างถ้า input ไม่ว่าง) */
function tierSummary(tiers: { tier: string; count: number }[]): string {
  return tiers.map((t) => `${t.tier} ×${t.count}`).join(" · ")
}

function memberRowValue(count: number, tiers: { tier: string; count: number }[], cash: number): string {
  return `${count} ราย · ${tierSummary(tiers)} · ${baht(cash)}`
}

function noteText(text: string, color: string) {
  return { type: "text", text, color, size: "xxs", margin: "sm", wrap: true }
}

function separator() {
  return { type: "separator", margin: "lg", color: BRAND.beigeDk }
}

function header(report: DailyReport) {
  return {
    type: "box",
    layout: "vertical",
    backgroundColor: BRAND.green,
    paddingAll: "18px",
    spacing: "xs",
    contents: [
      // ห้ามใส่ letterSpacing — LINE ตอบ 400 "unknown field" ไม่ใช่ property ของ Flex text
      // (สคริปต์ Apps Script ตัวเดิมใส่ไว้ นี่คือสาเหตุที่ Daily Report พังตั้งแต่ 22 มิ.ย. 2569)
      { type: "text", text: "🌿 SOOKKAYA", color: BRAND.beige, weight: "bold", size: "lg" },
      { type: "text", text: "Daily Report", color: BRAND.gold, size: "xs" },
      { type: "text", text: fullThaiDate(report.date), color: BRAND.beige, size: "sm", margin: "sm" },
    ],
  }
}

function footer() {
  return {
    type: "box",
    layout: "vertical",
    paddingAll: "14px",
    paddingTop: "0px",
    contents: [
      {
        type: "button",
        style: "primary",
        color: BRAND.green,
        height: "md",
        action: { type: "uri", label: "📊 ดูยอดขายวันนี้", uri: DASHBOARD_URL },
      },
      {
        type: "text",
        text: "รายละเอียดหมอแต่ละคน · สมาชิก · Top บริการ · MTD",
        color: BRAND.textMuted, size: "xxs", align: "center", margin: "sm", wrap: true,
      },
    ],
  }
}

function body(report: DailyReport) {
  if (report.empty) {
    return {
      type: "box",
      layout: "vertical",
      paddingAll: "18px",
      contents: [
        {
          type: "text",
          text: "วันนี้ยังไม่มีบิลในระบบ",
          color: BRAND.textSub, size: "sm", wrap: true,
        },
      ],
    }
  }

  const heroRow: Record<string, unknown>[] = [
    { type: "text", text: "NET REVENUE · วันนี้", color: BRAND.textMuted, size: "xxs", weight: "bold" },
  ]
  if (report.vsAvg7dPct !== null) {
    const up = report.vsAvg7dPct >= 0
    heroRow.push({
      type: "text",
      text: `${up ? "▲" : "▼"} ${Math.abs(report.vsAvg7dPct).toFixed(1)}% vs avg 7d`,
      color: up ? BRAND.positive : BRAND.negative,
      size: "xxs", weight: "bold", align: "end",
    })
  }

  const opsRows: Record<string, unknown>[] = [
    opRow("👥 Sessions", `${report.sessions} sessions · ${report.customers} ลูกค้า`, BRAND.text),
    opRow("💼 ค่ามือรวม", baht(report.commission), BRAND.gold),
  ]
  if (report.topTherapist) {
    const t = report.topTherapist
    opsRows.push(opRow("🏆 TOP หมอ", `${t.name} · ${baht(t.income)} (${t.sessions} sess)`, BRAND.text))
  }
  const ms = report.memberSignups
  const hasSignups = ms.newCount > 0 || ms.renewCount > 0
  if (hasSignups) {
    if (ms.newCount > 0) {
      opsRows.push(opRow("👥 สมาชิกใหม่", memberRowValue(ms.newCount, ms.newTiers, ms.newCash), BRAND.positive))
    }
    if (ms.renewCount > 0) {
      opsRows.push(opRow("🔁 ต่ออายุ", memberRowValue(ms.renewCount, ms.renewTiers, ms.renewCash), BRAND.text))
    }
    // บังคับมี: v_daily_summary นิยาม cash_in = เงินจากบิล + เงินเติมสมาชิก
    // ไม่กำกับแล้วผู้บริหารจะบวกซ้ำเป็นเงินเข้าเพิ่ม
    opsRows.push(noteText("(รวมอยู่ใน Cash In แล้ว)", BRAND.textMuted))
  }
  opsRows.push(
    opRow(
      "📅 MTD",
      report.mtdDeltaPct === null
        ? baht(report.mtd)
        : `${baht(report.mtd)} · ${report.mtdDeltaPct >= 0 ? "▲" : "▼"}${Math.abs(report.mtdDeltaPct).toFixed(1)}% vs เดือนที่แล้ว`,
      BRAND.text
    )
  )
  opsRows.push(opRow("🗓 คิวจองพรุ่งนี้", `${report.bookingsTomorrow} คิว`, BRAND.text))

  const ee = report.expenseEntries
  if (ee.count > 0) {
    opsRows.push(opRow("🧾 บันทึกรายจ่ายวันนี้", `${ee.count} รายการ · ${baht(ee.total)}`, BRAND.text))
    if (ee.backdatedCount > 0) {
      // ปัดเศษยอดแต่ละเดือน/อื่นๆ ก่อน แล้วรวมเลขที่ปัดแล้วเป็นยอด "ย้อนหลัง" — ไม่ปัด backdatedTotal
      // แยกต่างหาก เพราะปัดแยกกันแล้วผลรวมอาจเพี้ยนไปหนึ่งหรือสองบาท (เช่น 100.5+100.5 = 201
      // แต่ round(100.5)+round(100.5) = 202) ทำให้สองบรรทัดที่อยู่ติดกันโชว์เลขไม่ตรงกัน
      const monthAmounts = ee.byMonth.map((m) => Math.round(m.total))
      const otherAmount = ee.otherMonthsTotal > 0 ? Math.round(ee.otherMonthsTotal) : 0
      const backdatedRounded = monthAmounts.reduce((s, n) => s + n, 0) + otherAmount
      // ตัวเลขนี้คือสัญญาณกำกับดูแล — มีคนคีย์เงินเข้าเดือนที่ปิดงบไปแล้ว
      opsRows.push(noteText(`ย้อนหลัง ${ee.backdatedCount} · ${baht(backdatedRounded)}`, BRAND.gold))
      const months = ee.byMonth.map((m, i) => `${m.month} ${baht(monthAmounts[i])}`)
      if (ee.otherMonthsTotal > 0) months.push(`อื่นๆ ${baht(otherAmount)}`)
      if (months.length > 0) opsRows.push(noteText(months.join(" · "), BRAND.gold))
    }
  }

  const contents: Record<string, unknown>[] = [
    {
      type: "box",
      layout: "vertical",
      contents: [
        { type: "box", layout: "horizontal", contents: heroRow },
        { type: "text", text: baht(report.netRevenue), color: BRAND.text, size: "xxl", weight: "bold", margin: "xs" },
      ],
    },
    separator(),
    {
      type: "box",
      layout: "horizontal",
      spacing: "md",
      margin: "md",
      contents: [
        statCol("💵 Cash In", baht(report.cashIn), BRAND.text),
        statCol("✨ กำไรขั้นต้น", baht(report.grossProfit), report.grossProfit >= 0 ? BRAND.positive : BRAND.negative),
        statCol("📊 Margin", `${report.margin.toFixed(1)}%`, BRAND.text),
      ],
    },
    separator(),
    { type: "box", layout: "vertical", spacing: "sm", margin: "md", contents: opsRows },
  ]

  if (report.alerts.length > 0) {
    contents.push(separator())
    contents.push({
      type: "text", text: "⚠️ Action ที่ต้องทำวันนี้",
      color: BRAND.negative, size: "sm", weight: "bold", margin: "md",
    })
    for (const alert of report.alerts) {
      contents.push({
        type: "text", text: `• ${alert}`,
        color: BRAND.text, size: "xs", wrap: true, margin: "sm",
      })
    }
  }

  return { type: "box", layout: "vertical", paddingAll: "18px", spacing: "none", contents }
}

export function dailyReportFlex(report: DailyReport): {
  type: "flex"
  altText: string
  contents: unknown
} {
  return {
    type: "flex",
    altText: `🌿 Sookkaya — ${formatThaiDate(report.date)} · Net Revenue ${baht(report.netRevenue)}`,
    contents: {
      type: "bubble",
      size: "mega",
      styles: { body: { backgroundColor: "#FFFFFF" }, footer: { backgroundColor: "#FFFFFF" } },
      header: header(report),
      body: body(report),
      footer: footer(),
    },
  }
}
