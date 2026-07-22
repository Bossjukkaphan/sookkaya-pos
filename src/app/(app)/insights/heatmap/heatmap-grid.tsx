"use client"

import { useState } from "react"

import { OPEN_HOURS, WEEKDAY_LABELS, heatIntensity } from "@/lib/insights"
import { formatBaht } from "@/lib/constants"

const HEAT_CLASSES = [
  "bg-slate-50 text-slate-300",
  "bg-emerald-50 text-emerald-900",
  "bg-emerald-100 text-emerald-900",
  "bg-emerald-300 text-emerald-950",
  "bg-emerald-600 font-semibold text-white",
] as const

export type HeatCell = {
  weekday: number
  hour: number
  sessions: number
  revenue: number
}

/**
 * ตารางความหนาแน่นแบบจิ้มได้ — แตะ/คลิกช่องไหนจะโชว์รายละเอียดของช่องนั้น
 * ใต้ตาราง (เซสชัน รายได้ เฉลี่ย/เซสชัน) · ใช้ปุ่มจริงจึงกดได้ทั้งนิ้วและเมาส์
 */
export function HeatmapGrid({ cells }: { cells: HeatCell[] }) {
  const [sel, setSel] = useState<{ weekday: number; hour: number } | null>(null)

  const map = new Map(cells.map((c) => [`${c.weekday}-${c.hour}`, c]))
  const max = cells.reduce((m, c) => Math.max(m, c.sessions), 0)

  const selCell = sel ? map.get(`${sel.weekday}-${sel.hour}`) : undefined
  const selSessions = selCell?.sessions ?? 0
  const selRevenue = selCell?.revenue ?? 0

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-separate border-spacing-0.5 text-center text-xs">
          <thead>
            <tr>
              <th className="w-8" />
              {OPEN_HOURS.map((h) => (
                <th key={h} className="font-normal text-slate-500">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {WEEKDAY_LABELS.map((label, weekday) => (
              <tr key={label}>
                <th className="pr-1 text-right font-normal text-slate-500">
                  {label}
                </th>
                {OPEN_HOURS.map((hour) => {
                  const sessions = map.get(`${weekday}-${hour}`)?.sessions ?? 0
                  const active = sel?.weekday === weekday && sel?.hour === hour
                  return (
                    <td key={hour} className="p-0">
                      <button
                        type="button"
                        onClick={() =>
                          setSel(active ? null : { weekday, hour })
                        }
                        aria-pressed={active}
                        aria-label={`${label} ${hour}:00 — ${sessions} เซสชัน`}
                        className={`w-full cursor-pointer rounded py-1.5 ${HEAT_CLASSES[heatIntensity(sessions, max)]} ${
                          active ? "ring-2 ring-slate-900 ring-offset-1" : ""
                        }`}
                      >
                        {sessions || "·"}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sel ? (
        <div className="mt-3 rounded-lg border bg-slate-50 px-3 py-2.5 text-sm">
          <p className="font-semibold">
            {WEEKDAY_LABELS[sel.weekday]} {sel.hour}:00–{sel.hour + 1}:00 น.
          </p>
          {selSessions > 0 ? (
            <p className="text-slate-600">
              {selSessions} เซสชัน · รายได้ {formatBaht(selRevenue)} ฿ · เฉลี่ย{" "}
              {formatBaht(Math.round(selRevenue / selSessions))} ฿/เซสชัน
              {max > 0 && (
                <span className="text-slate-400">
                  {" "}
                  · {Math.round((selSessions / max) * 100)}% ของช่องที่แน่นสุด
                </span>
              )}
            </p>
          ) : (
            <p className="text-slate-500">ไม่มีลูกค้าในช่วงนี้</p>
          )}
        </div>
      ) : (
        <p className="mt-3 text-center text-xs text-slate-400">
          แตะช่องในตารางเพื่อดูรายละเอียด
        </p>
      )}
    </div>
  )
}
