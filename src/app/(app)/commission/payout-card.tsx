"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"

import {
  type PayoutActionResult,
  cancelPayoutPaid,
  endorsePayout,
  markPayoutPaid,
} from "./payout-actions"
import type { PayoutPeriod } from "@/lib/payout-periods"
import { canConfirmOn, statusOf } from "@/lib/payout-periods"
import { formatBaht } from "@/lib/constants"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

/** แถวยืนยันที่ประกอบเสร็จจากฝั่ง server — client แค่แสดงกับกดปุ่ม ไม่คำนวณเอง */
export type PayoutRow = {
  period: PayoutPeriod
  computed: number
  recorded: number
  confirmation: {
    id: string
    computed_amount: number
    recorded_amount: number
    variance_reason: string | null
    paid_by: string
    paid_at: string
    endorsed_by: string | null
    endorsed_at: string | null
  } | null
}

function thaiDateTime(iso: string): string {
  return new Date(iso).toLocaleString("th-TH", {
    day: "numeric", month: "short", timeZone: "Asia/Bangkok",
  })
}

export function PayoutCard({
  month, rows, role, today,
}: {
  month: string
  rows: PayoutRow[]
  role: string
  today: string
}) {
  const [pending, startTransition] = useTransition()
  // งวดที่กำลังรอกรอกเหตุผล (ยอดไม่ตรง) — เก็บยอดที่ server ส่งกลับมาโชว์
  const [reasonFor, setReasonFor] = useState<{
    key: string; computed: number; recorded: number
  } | null>(null)
  const [reason, setReason] = useState("")

  function handle(result: PayoutActionResult, rowKey?: string) {
    if (result.ok) {
      toast.success("บันทึกแล้ว")
      setReasonFor(null)
      setReason("")
    } else if (result.needReason && rowKey) {
      // ยอดไม่ตรง — เปิดช่องเหตุผลของแถวนั้น พร้อมยอดที่ server คำนวณสดส่งกลับมา
      setReasonFor({ key: rowKey, ...result.needReason })
    } else {
      toast.error(result.error ?? "ไม่สำเร็จ")
    }
  }

  function tick(row: PayoutRow, withReason?: string) {
    startTransition(async () => {
      const result = await markPayoutPaid({
        month,
        kind: row.period.kind,
        periodNo: row.period.periodNo,
        reason: withReason,
      })
      handle(result, `${row.period.kind}-${row.period.periodNo}`)
    })
  }

  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <p className="font-semibold">ยืนยันการจ่าย</p>
        <ul className="divide-y">
          {rows.map((row) => {
            const key = `${row.period.kind}-${row.period.periodNo}`
            const status = statusOf(row.confirmation)
            const confirmable = canConfirmOn(row.period, today)
            // งวดที่ติ๊กแล้วโชว์ยอดที่แช่แข็ง · ยังไม่ติ๊กโชว์ยอดสด
            const computed = row.confirmation?.computed_amount ?? row.computed
            const recorded = row.confirmation?.recorded_amount ?? row.recorded
            const diff = recorded - computed
            return (
              <li key={key} className={`space-y-1 py-2 ${!confirmable && status === "pending" ? "opacity-50" : ""}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{row.period.label}</span>
                  {status === "pending" && !confirmable && (
                    <Badge variant="outline" className="text-slate-400">ยังไม่ถึงงวด</Badge>
                  )}
                  {status === "pending" && confirmable && (
                    <Button size="sm" disabled={pending} onClick={() => tick(row)}>
                      ติ๊กจ่ายแล้ว
                    </Button>
                  )}
                  {status === "paid" && (
                    <span className="flex items-center gap-2">
                      <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                        จ่ายแล้ว รอรับรอง
                      </Badge>
                      {role === "admin" && row.confirmation && (
                        <Button size="sm" disabled={pending}
                          onClick={() => startTransition(async () => handle(await endorsePayout(row.confirmation!.id)))}>
                          รับรอง
                        </Button>
                      )}
                      {row.confirmation && (
                        <Button size="sm" variant="ghost" disabled={pending}
                          onClick={() => startTransition(async () => handle(await cancelPayoutPaid(row.confirmation!.id)))}>
                          ยกเลิก
                        </Button>
                      )}
                    </span>
                  )}
                  {status === "endorsed" && row.confirmation && (
                    <Badge variant="outline" className="border-green-300 bg-green-50 text-green-700">
                      รับรองแล้ว ✓
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-slate-600">
                  ระบบคำนวณ {formatBaht(computed)} ฿ · จ่ายจริง {formatBaht(recorded)} ฿
                  {diff !== 0 && (
                    <span className={diff > 0 ? "text-amber-600" : "text-red-600"}>
                      {" "}· ต่าง {diff > 0 ? "+" : ""}{formatBaht(diff)} ฿
                    </span>
                  )}
                </p>
                {row.confirmation?.variance_reason && (
                  <p className="text-xs text-slate-500">เหตุผล: {row.confirmation.variance_reason}</p>
                )}
                {row.confirmation && (
                  <p className="text-xs text-slate-400">
                    ติ๊กโดย {row.confirmation.paid_by} · {thaiDateTime(row.confirmation.paid_at)}
                    {row.confirmation.endorsed_at &&
                      ` · รับรองโดย ${row.confirmation.endorsed_by} · ${thaiDateTime(row.confirmation.endorsed_at)}`}
                  </p>
                )}
                {reasonFor?.key === key && (
                  <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-sm">
                    <p className="text-amber-900">
                      ยอดไม่ตรงกัน (ระบบ {formatBaht(reasonFor.computed)} · จ่ายจริง {formatBaht(reasonFor.recorded)})
                      — เขียนเหตุผลก่อนติ๊ก เช่น ปัดเศษเงินสด หรือโบนัสพิเศษ
                    </p>
                    <div className="flex gap-2">
                      <Input value={reason} onChange={(e) => setReason(e.target.value)}
                        placeholder="เหตุผลที่ยอดต่างกัน" className="h-10" />
                      <Button size="sm" disabled={pending || !reason.trim()}
                        onClick={() => tick(row, reason)}>
                        ยืนยัน
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
