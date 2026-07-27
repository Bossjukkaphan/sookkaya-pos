"use client"

import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

function shiftDay(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10)
}

export function DateFilter({
  from,
  to,
  today,
}: {
  from: string
  to: string
  today: string
}) {
  const router = useRouter()

  function go(nextFrom: string, nextTo: string) {
    router.push(`/today?from=${nextFrom}&to=${nextTo}`)
  }

  // เลื่อนทั้งหน้าต่างพร้อมกัน เพื่อให้โหมดช่วงวันยังกว้างเท่าเดิม
  function shiftWindow(delta: number) {
    go(shiftDay(from, delta), shiftDay(to, delta))
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {/* ปุ่มเลื่อนวันต้องกดโดนด้วยนิ้ว — เดิม 35x28px เล็กกว่าปลายนิ้วที่กว้างราว 45px */}
        <Button
          variant="outline"
          size="sm"
          className="size-10 shrink-0"
          onClick={() => shiftWindow(-1)}
          aria-label="วันก่อนหน้า"
        >
          ←
        </Button>
        <Input
          type="date"
          value={from}
          max={to}
          onChange={(e) => go(e.target.value, to)}
          className="h-9"
          aria-label="ตั้งแต่วันที่"
        />
        <span className="text-sm text-slate-400">ถึง</span>
        <Input
          type="date"
          value={to}
          min={from}
          onChange={(e) => go(from, e.target.value)}
          className="h-9"
          aria-label="ถึงวันที่"
        />
        <Button
          variant="outline"
          size="sm"
          className="size-10 shrink-0"
          onClick={() => shiftWindow(1)}
          aria-label="วันถัดไป"
        >
          →
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => go(today, today)}>
          วันนี้
        </Button>
        <Button variant="outline" size="sm" onClick={() => go(shiftDay(today, -6), today)}>
          7 วันล่าสุด
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => go(`${today.slice(0, 7)}-01`, today)}
        >
          เดือนนี้
        </Button>
      </div>
    </div>
  )
}
