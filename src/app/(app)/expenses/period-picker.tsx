"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"

import { monthShortLabel } from "@/lib/month"
import { Input } from "@/components/ui/input"

const CHIP = "rounded-md px-3 py-1.5 text-sm whitespace-nowrap"
const CHIP_ON = `${CHIP} bg-slate-900 text-white`
const CHIP_OFF = `${CHIP} border border-slate-200 text-slate-700 hover:bg-slate-50`

/**
 * เลือกช่วงที่จะดู — สองแถวแยกกันชัดเพื่อให้รู้เสมอว่ากำลังดูอะไร
 * แถวบนดูทีละเดือน แถวล่างดูรวมหลายเดือน
 */
export function PeriodPicker({
  months,
  activeMonth,
  activeRange,
}: {
  months: string[]
  activeMonth: string | null
  activeRange: number | null
}) {
  const router = useRouter()

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-sm text-slate-500">ดูทีละเดือน</span>
        {months.map((m) => (
          <Link
            key={m}
            href={`/expenses?month=${m}`}
            className={activeMonth === m ? CHIP_ON : CHIP_OFF}
          >
            {monthShortLabel(m)}
          </Link>
        ))}
        <Input
          type="month"
          aria-label="เลือกเดือนอื่น"
          className="h-8 w-auto text-sm"
          onChange={(e) => {
            if (e.target.value) router.push(`/expenses?month=${e.target.value}`)
          }}
        />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-sm text-slate-500">ดูรวมช่วง</span>
        {[3, 6].map((n) => (
          <Link
            key={n}
            href={`/expenses?months=${n}`}
            className={activeRange === n ? CHIP_ON : CHIP_OFF}
          >
            {n} เดือน
          </Link>
        ))}
      </div>
    </div>
  )
}
