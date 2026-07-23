"use client"

import { useMemo, useState } from "react"

import { formatBaht } from "@/lib/constants"
import { formatThaiDate } from "@/lib/datetime"
import { TIER_COLOR, TIER_COLOR_DEFAULT } from "@/lib/tier-colors"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"

export type TopupRow = {
  id: string
  customerName: string
  tier: string
  topupDate: string
  expiryDate: string
  creditAdded: number
  cashReceived: number
}

/** ค้นหาในประวัติเติมเงิน 30 รายการล่าสุด — พิมพ์แล้วกรองชื่อทันที ไม่ต้องยิง query ใหม่ */
export function TopupHistoryList({ topups }: { topups: TopupRow[] }) {
  const [term, setTerm] = useState("")

  const shown = useMemo(() => {
    const t = term.trim().toLowerCase()
    if (!t) return topups
    return topups.filter((row) => row.customerName.toLowerCase().includes(t))
  }, [topups, term])

  return (
    <div className="space-y-2">
      <Input
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        className="h-11"
        placeholder="ค้นหาชื่อลูกค้าในประวัติ"
        aria-label="ค้นหาประวัติเติมเงิน"
      />

      {shown.length === 0 ? (
        <p className="px-2 py-6 text-center text-sm text-slate-500">
          {term ? `ไม่พบ "${term}" ในประวัติ 30 รายการล่าสุด` : "ยังไม่มีประวัติการเติมเงิน"}
        </p>
      ) : (
        <ul className="divide-y">
          {shown.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between gap-3 px-1 py-3"
            >
              <div className="min-w-0">
                <p className="font-medium">
                  {t.customerName}{" "}
                  <Badge variant="outline" className={TIER_COLOR[t.tier] ?? TIER_COLOR_DEFAULT}>
                    {t.tier}
                  </Badge>
                </p>
                <p className="text-xs text-slate-500">
                  {formatThaiDate(t.topupDate)} · หมดอายุ {formatThaiDate(t.expiryDate)}
                </p>
              </div>
              <div className="text-right whitespace-nowrap">
                <p className="font-semibold">+{formatBaht(t.creditAdded)} ฿</p>
                <p className="text-xs text-slate-500">รับ {formatBaht(t.cashReceived)} ฿</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
