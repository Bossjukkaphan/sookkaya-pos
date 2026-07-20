"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"

import {
  PRESET_LABELS,
  type DateRange,
  type RangePreset,
  rangeFromPreset,
} from "@/lib/date-range"
import { formatThaiDate } from "@/lib/datetime"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const PRESETS: RangePreset[] = ["today", "last7", "thisMonth", "lastMonth"]

export function DateRangePicker({
  range,
  today,
}: {
  range: DateRange
  today: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [custom, setCustom] = useState(false)

  function apply(next: DateRange) {
    const params = new URLSearchParams(searchParams.toString())
    params.set("from", next.from)
    params.set("to", next.to)
    router.push(`${pathname}?${params.toString()}`)
  }

  function isActive(preset: RangePreset): boolean {
    const p = rangeFromPreset(preset, today)
    return p.from === range.from && p.to === range.to
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((preset) => (
          <Button
            key={preset}
            type="button"
            size="sm"
            variant={isActive(preset) ? "default" : "outline"}
            onClick={() => {
              setCustom(false)
              apply(rangeFromPreset(preset, today))
            }}
          >
            {PRESET_LABELS[preset]}
          </Button>
        ))}
        <Button
          type="button"
          size="sm"
          variant={custom ? "default" : "outline"}
          onClick={() => setCustom((v) => !v)}
        >
          กำหนดเอง
        </Button>
        <span className="ml-auto text-sm text-slate-600">
          {range.from === range.to
            ? formatThaiDate(range.from)
            : `${formatThaiDate(range.from)} – ${formatThaiDate(range.to)}`}
        </span>
      </div>

      {custom && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const form = new FormData(e.currentTarget)
            const from = String(form.get("from") ?? "")
            const to = String(form.get("to") ?? "")
            if (from && to) apply(from <= to ? { from, to } : { from: to, to: from })
          }}
        >
          <Input type="date" name="from" defaultValue={range.from} className="h-10 w-auto" aria-label="ตั้งแต่วันที่" />
          <Input type="date" name="to" defaultValue={range.to} className="h-10 w-auto" aria-label="ถึงวันที่" />
          <Button type="submit" size="sm" className="h-10">ดูข้อมูล</Button>
        </form>
      )}
    </div>
  )
}
