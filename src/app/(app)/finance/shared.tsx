import Link from "next/link"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
]

const THAI_MONTHS_SHORT = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
]

export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number)
  return `${THAI_MONTHS[m - 1]} ${y + 543}`
}

export function monthShortLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number)
  return `${THAI_MONTHS_SHORT[m - 1]} ${(y + 543) % 100}`
}

export function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return d.toISOString().slice(0, 7)
}

/** ส่วนหัวหน้าการเงิน พร้อมปุ่มเลื่อนเดือน — ใช้ร่วมกันทั้งหน้า /finance และ /finance/unit-economics */
export function FinanceMonthHeader({
  title,
  subtitle,
  month,
  basePath,
}: {
  title: string
  subtitle?: string
  month: string
  basePath: string
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div>
        <h1 className="text-xl font-bold">{title}</h1>
        <p className="text-sm text-slate-600">{subtitle ?? monthLabel(month)}</p>
      </div>
      <div className="flex gap-1">
        <Link
          href={`${basePath}?month=${shiftMonth(month, -1)}`}
          className="rounded-md border px-3 py-2 text-sm hover:bg-slate-100"
        >
          ←
        </Link>
        <Link
          href={`${basePath}?month=${shiftMonth(month, 1)}`}
          className="rounded-md border px-3 py-2 text-sm hover:bg-slate-100"
        >
          →
        </Link>
      </div>
    </div>
  )
}

/** หน้านี้แสดงกำไรขาดทุนของร้านทั้งหมด จึงจำกัดเฉพาะเจ้าของร้าน (admin) */
export function FinanceAccessDenied() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">การเงิน</h1>
      <Card>
        <CardContent className="space-y-3 py-6 text-sm text-slate-600">
          <p>
            หน้านี้แสดงกำไรขาดทุนของร้านทั้งหมด จึงจำกัดให้เฉพาะเจ้าของร้าน
            เท่านั้นที่ดูได้
          </p>
          <Button asChild size="sm" variant="outline">
            <Link href="/">กลับหน้าแรก</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
