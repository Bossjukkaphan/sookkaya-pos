import Link from "next/link"

import { monthLabel, monthShortLabel, shiftMonth } from "@/lib/month"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

// ไฟล์อื่นเคย import ชื่อพวกนี้จากที่นี่ — ส่งต่อให้ ไม่ต้องไล่แก้ทุก import
// (import แล้ว export ต่อ ไม่ใช่ `export ... from` เพราะจะซ้ำกับ import ข้างบนแล้ว eslint ฟ้อง)
export { monthLabel, monthShortLabel, shiftMonth }

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
          className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md border px-3 text-sm hover:bg-slate-100"
        >
          ←
        </Link>
        <Link
          href={`${basePath}?month=${shiftMonth(month, 1)}`}
          className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md border px-3 text-sm hover:bg-slate-100"
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
