"use client"

import { useState } from "react"

import type { PersonSummary } from "@/lib/hr"
import { formatBaht } from "@/lib/constants"

type SortKey = keyof Pick<
  PersonSummary,
  | "name"
  | "daysWorked"
  | "daysAbsent"
  | "hours"
  | "bills"
  | "revenue"
  | "commission"
  | "commissionPerDay"
  | "requests"
  | "repeatCustomers"
>

const MONEY_COLS: { key: SortKey; label: string; render: (r: PersonSummary) => string }[] = [
  { key: "bills", label: "บิล", render: (r) => r.bills.toLocaleString() },
  { key: "revenue", label: "ยอดขาย", render: (r) => formatBaht(r.revenue) },
  { key: "commission", label: "ค่ามือรวม", render: (r) => formatBaht(r.commission) },
  { key: "commissionPerDay", label: "ค่ามือ/วัน", render: (r) => formatBaht(r.commissionPerDay) },
]

/** ตารางสรุปทีม — กดหัวคอลัมน์เรียงได้ (ค่าเริ่มต้นมาจากลำดับที่ page ส่งมา) */
export function TeamTable({
  rows,
  showMoney,
}: {
  rows: PersonSummary[]
  showMoney: boolean
}) {
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean } | null>(null)

  const sorted = sort
    ? [...rows].sort((a, b) => {
        const av = a[sort.key]
        const bv = b[sort.key]
        const diff =
          typeof av === "string" && typeof bv === "string"
            ? av.localeCompare(bv, "th")
            : Number(av) - Number(bv)
        return sort.desc ? -diff : diff
      })
    : rows

  function toggle(key: SortKey) {
    setSort((s) => (s?.key === key ? { key, desc: !s.desc } : { key, desc: true }))
  }

  const Th = ({ k, children }: { k: SortKey; children: React.ReactNode }) => (
    <th
      className="cursor-pointer px-2 py-2 text-right whitespace-nowrap select-none hover:text-emerald-700"
      onClick={() => toggle(k)}
    >
      {children}
      {sort?.key === k && (sort.desc ? " ▾" : " ▴")}
    </th>
  )

  if (rows.length === 0) {
    return <p className="px-6 pb-3 text-sm text-slate-500">ไม่มีข้อมูลในช่วงนี้</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-y bg-slate-50 text-xs text-slate-600">
          <tr>
            <th
              className="cursor-pointer px-4 py-2 text-left whitespace-nowrap select-none hover:text-emerald-700 sm:px-6"
              onClick={() => toggle("name")}
            >
              ชื่อ{sort?.key === "name" && (sort.desc ? " ▾" : " ▴")}
            </th>
            <Th k="daysWorked">วันทำงาน</Th>
            <Th k="daysAbsent">ขาด</Th>
            <Th k="hours">ชั่วโมง</Th>
            {showMoney && MONEY_COLS.map((c) => <Th key={c.key} k={c.key}>{c.label}</Th>)}
            {showMoney && <Th k="requests">💖 รีเควส</Th>}
            {showMoney && <Th k="repeatCustomers">🔁 ลูกค้าซ้ำ</Th>}
          </tr>
        </thead>
        <tbody className="divide-y">
          {sorted.map((r) => (
            <tr key={r.personId} className="hover:bg-slate-50">
              <td className="px-4 py-2 font-medium whitespace-nowrap sm:px-6">{r.name}</td>
              <td className="px-2 py-2 text-right">{r.daysWorked}</td>
              <td
                className={`px-2 py-2 text-right ${r.daysAbsent > 0 ? "font-medium text-red-600" : "text-slate-400"}`}
              >
                {r.daysAbsent}
              </td>
              <td className="px-2 py-2 text-right whitespace-nowrap text-slate-600">
                {r.hasEstimatedTime && "~"}
                {Math.round(r.hours).toLocaleString()}
                <span className="text-xs text-slate-400"> ({r.hoursPerDay}/วัน)</span>
              </td>
              {showMoney &&
                MONEY_COLS.map((c) => (
                  <td key={c.key} className="px-2 py-2 text-right whitespace-nowrap">
                    {c.render(r)}
                  </td>
                ))}
              {showMoney && (
                <td className="px-2 py-2 text-right whitespace-nowrap">
                  {r.requests > 0 ? (
                    <span className="font-medium text-pink-700">
                      {r.requests}
                      <span className="text-xs font-normal text-slate-400">
                        {" "}
                        ({r.requestPct}%)
                      </span>
                    </span>
                  ) : (
                    <span className="text-slate-300">0</span>
                  )}
                </td>
              )}
              {showMoney && (
                <td className="px-2 py-2 text-right">
                  {r.repeatCustomers > 0 ? (
                    <span className="font-medium text-violet-700">{r.repeatCustomers}</span>
                  ) : (
                    <span className="text-slate-300">0</span>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
