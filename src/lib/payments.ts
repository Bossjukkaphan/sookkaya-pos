/** บรรทัดชำระของบิล — เงินจริงเท่านั้น เครดิตเมมเบอร์อยู่ที่ credit_used ไม่ใช่บรรทัด (สเปก 2026-08-01) */
export type PaymentLine = { method: string; amount: number }

export const PAYMENT_LINE_METHODS = ["เงินสด", "QR Code", "บัตรเครดิต"] as const
export const MAX_PAYMENT_LINES = 3

const round2 = (n: number) => {
  const result = Math.round(n * 100) / 100
  return Object.is(result, -0) ? 0 : result
}

export function parsePaymentLines(
  raw: string,
  maxTotal: number
): { ok: true; lines: PaymentLine[] } | { ok: false; error: string } {
  if (!raw.trim()) return { ok: true, lines: [] }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, error: "ข้อมูลการชำระเงินไม่ถูกต้อง ลองใหม่อีกครั้ง" }
  }
  if (!Array.isArray(parsed)) return { ok: false, error: "ข้อมูลการชำระเงินไม่ถูกต้อง ลองใหม่อีกครั้ง" }
  if (parsed.length > MAX_PAYMENT_LINES)
    return { ok: false, error: `แบ่งจ่ายได้ไม่เกิน ${MAX_PAYMENT_LINES} วิธีต่อบิล` }
  const lines: PaymentLine[] = []
  for (const item of parsed) {
    const method = String((item as PaymentLine)?.method ?? "")
    const amount = Number((item as PaymentLine)?.amount)
    if (!(PAYMENT_LINE_METHODS as readonly string[]).includes(method))
      return { ok: false, error: "ช่องทางแบ่งจ่ายต้องเป็น เงินสด / QR Code / บัตรเครดิต" }
    if (!Number.isFinite(amount) || amount <= 0)
      return { ok: false, error: "ยอดแต่ละบรรทัดต้องมากกว่า 0" }
    lines.push({ method, amount: round2(amount) })
  }
  const total = round2(lines.reduce((s, l) => s + l.amount, 0))
  if (total > round2(maxTotal))
    return { ok: false, error: `ยอดรับรวม ${total} เกินยอดที่ต้องเก็บ ${round2(maxTotal)}` }
  return { ok: true, lines }
}

export function primaryMethod(lines: PaymentLine[]): string | null {
  if (lines.length === 0) return null
  return lines.reduce((best, l) => (l.amount > best.amount ? l : best), lines[0]).method
}

export function dueAmount(mustCollect: number, lines: PaymentLine[]): number {
  return round2(mustCollect - lines.reduce((s, l) => s + l.amount, 0))
}
