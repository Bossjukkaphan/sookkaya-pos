"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Pencil } from "lucide-react"
import { toast } from "sonner"

import {
  adjustTopupBalance,
  extendTopupExpiry,
  setTopupActive,
} from "../members/member-actions"
import { formatBaht } from "@/lib/constants"
import { formatThaiDate } from "@/lib/datetime"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

/** แถวแพ็กเกจจาก v_topup_balances + รายการใช้/ประวัติแก้ไขที่หน้า server เตรียมมาให้ */
export type TopupView = {
  topupId: string
  tier: string
  topupDate: string
  expiryDate: string
  creditAdded: number
  remaining: number
  isActive: boolean
  status: string // active | expired | depleted | inactive
  usage: {
    saleDate: string
    saleTime: string | null
    receiptNo: string | null
    serviceName: string | null
    billNet: number
    amount: number
  }[]
  edits: {
    field: string
    oldValue: string | null
    newValue: string | null
    editedBy: string | null
    createdAt: string
  }[]
}

const STATUS_CHIP: Record<string, { label: string; cls: string }> = {
  active: { label: "ใช้งาน", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  expired: { label: "หมดอายุ", cls: "bg-slate-100 text-slate-500 border-slate-200" },
  depleted: { label: "หมดยอด", cls: "bg-slate-50 text-slate-400 border-slate-200" },
  inactive: { label: "ปิดใช้งาน", cls: "bg-amber-50 text-amber-700 border-amber-200" },
}

const FIELD_LABEL: Record<string, string> = {
  expiry_date: "วันหมดอายุ",
  remaining: "ยอดคงเหลือ",
  is_active: "สถานะใช้งาน",
}

function EditDialog({ t, onDone }: { t: TopupView; onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [expiry, setExpiry] = useState(t.expiryDate)
  const [remainingInput, setRemainingInput] = useState(String(t.remaining))
  const [reason, setReason] = useState("")
  const [active, setActive] = useState(t.isActive)
  const [pending, startTransition] = useTransition()

  const remainingChanged = Number(remainingInput) !== t.remaining
  const expiryChanged = expiry !== t.expiryDate
  const activeChanged = active !== t.isActive

  // ยืดอายุด่วน: +N วันจากวันหมดอายุเดิม (หรือวันนี้ ถ้าหมดอายุไปแล้ว)
  const quickExtend = (days: number) => {
    const base = new Date(`${expiry}T00:00:00Z`)
    const today = new Date()
    const from = base.getTime() > today.getTime() ? base : today
    const d = new Date(from.getTime() + days * 86_400_000)
    setExpiry(d.toISOString().slice(0, 10))
  }

  const save = () =>
    startTransition(async () => {
      if (remainingChanged && !reason.trim()) {
        toast.error("ปรับยอดคงเหลือต้องระบุเหตุผล (เก็บลงประวัติการแก้ไข)")
        return
      }
      if (expiryChanged) {
        const r = await extendTopupExpiry(t.topupId, expiry)
        if (!r.ok) return void toast.error(r.error)
      }
      if (remainingChanged) {
        const delta = Math.round((Number(remainingInput) - t.remaining) * 100) / 100
        const r = await adjustTopupBalance(t.topupId, delta, reason)
        if (!r.ok) return void toast.error(r.error)
      }
      if (activeChanged) {
        const r = await setTopupActive(t.topupId, active)
        if (!r.ok) return void toast.error(r.error)
      }
      toast.success("บันทึกการแก้ไขแพ็กเกจแล้ว")
      setOpen(false)
      onDone()
    })

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        aria-label={`แก้ไขแพ็กเกจ ${t.tier} หมดอายุ ${t.expiryDate}`}
      >
        <Pencil className="size-4 text-slate-600" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>แก้ไขแพ็กเกจ</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-slate-500">ชื่อแพ็กเกจ</p>
                <p className="font-medium">🏅 {t.tier}</p>
              </div>
              <div>
                <p className="text-slate-500">จำนวนเริ่มต้น</p>
                <p className="font-medium">{formatBaht(t.creditAdded)} ฿</p>
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor={`exp_${t.topupId}`}>วันที่หมดอายุ</Label>
              <Input
                id={`exp_${t.topupId}`}
                type="date"
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
              />
              <div className="flex gap-1.5 text-xs">
                {[30, 90, 180].map((d) => (
                  <button
                    key={d}
                    type="button"
                    className="rounded border px-2 py-0.5 text-slate-600 hover:bg-slate-50"
                    onClick={() => quickExtend(d)}
                  >
                    +{d} วัน
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor={`rem_${t.topupId}`}>ยอดคงเหลือ</Label>
              <Input
                id={`rem_${t.topupId}`}
                inputMode="decimal"
                value={remainingInput}
                onChange={(e) => setRemainingInput(e.target.value)}
              />
              {remainingChanged && (
                <Input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="เหตุผลที่ปรับยอด (บังคับ — ลงประวัติการแก้ไข)"
                />
              )}
            </div>

            <label className="flex cursor-pointer items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="h-4 w-4"
              />
              เปิดใช้งานแพ็กเกจนี้{" "}
              <span className="text-slate-500">(ปิด = ตัดเครดิตจากใบนี้ไม่ได้ ยอดไม่หาย)</span>
            </label>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                ยกเลิก
              </Button>
              <Button
                onClick={save}
                disabled={pending || (!expiryChanged && !remainingChanged && !activeChanged)}
              >
                💾 บันทึก
              </Button>
            </div>
            <p className="text-xs text-slate-400">
              ทุกการแก้ไขถูกบันทึกลงประวัติ (ใคร แก้อะไร เมื่อไหร่) — เฉพาะผู้จัดการขึ้นไป
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function TopupManager({ topups }: { topups: TopupView[] }) {
  const router = useRouter()
  const [openId, setOpenId] = useState<string | null>(null)

  if (topups.length === 0) return null

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">แพ็กเกจเครดิต ({topups.length} ใบ)</CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        <div className="hidden grid-cols-[2.5rem_1fr_1fr_1fr_1fr_5rem_2rem] gap-2 px-4 pb-1 text-xs text-slate-500 sm:grid">
          <span />
          <span>แพ็กเกจ</span>
          <span>วันหมดอายุ</span>
          <span className="text-right">จำนวน</span>
          <span className="text-right">คงเหลือ</span>
          <span>สถานะ</span>
          <span />
        </div>
        <ul className="divide-y">
          {topups.map((t) => {
            const chip = STATUS_CHIP[t.status] ?? STATUS_CHIP.active
            const expanded = openId === t.topupId
            return (
              <li key={t.topupId}>
                <div className="grid grid-cols-2 items-center gap-2 px-4 py-2 text-sm sm:grid-cols-[2.5rem_1fr_1fr_1fr_1fr_5rem_2rem]">
                  <div className="order-last sm:order-none">
                    <EditDialog t={t} onDone={() => router.refresh()} />
                  </div>
                  <span className="font-medium">🏅 {t.tier}</span>
                  <span className={t.status === "expired" ? "text-amber-700" : "text-slate-600"}>
                    {formatThaiDate(t.expiryDate)}
                  </span>
                  <span className="sm:text-right">{formatBaht(t.creditAdded)}</span>
                  <span className="font-semibold sm:text-right">{formatBaht(t.remaining)}</span>
                  <span>
                    <span className={`rounded-full border px-2 py-0.5 text-xs ${chip.cls}`}>
                      {chip.label}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="text-slate-400"
                    onClick={() => setOpenId(expanded ? null : t.topupId)}
                    aria-label={expanded ? "ย่อรายละเอียด" : "ดูการใช้แพ็กเกจ"}
                  >
                    {expanded ? "▲" : "▼"}
                  </button>
                </div>

                {expanded && (
                  <div className="space-y-3 bg-slate-50/60 px-4 py-3 text-sm">
                    <div>
                      <p className="mb-1 font-medium">การใช้แพ็กเกจ</p>
                      {t.usage.length === 0 ? (
                        <p className="text-slate-500">ยังไม่มีบิลตัดจากใบนี้</p>
                      ) : (
                        <ul className="space-y-1">
                          {t.usage.map((u, i) => (
                            <li
                              key={i}
                              className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5"
                            >
                              <span className="text-slate-600">
                                {i + 1}. {formatThaiDate(u.saleDate)}
                                {u.saleTime ? ` ${u.saleTime.slice(0, 5)}` : ""} ·{" "}
                                {u.receiptNo ?? "ไม่มีเลขใบเสร็จ"}
                                {u.serviceName ? ` · ${u.serviceName}` : ""}
                              </span>
                              <span>
                                <span className="text-slate-400">
                                  บิล {formatBaht(u.billNet)} ·{" "}
                                </span>
                                <span className="font-semibold">ตัดใบนี้ {formatBaht(u.amount)}</span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    {t.edits.length > 0 && (
                      <div>
                        <p className="mb-1 font-medium">ประวัติการแก้ไข</p>
                        <ul className="space-y-0.5 text-xs text-slate-600">
                          {t.edits.map((e, i) => (
                            <li key={i}>
                              {formatThaiDate(e.createdAt.slice(0, 10))} ·{" "}
                              {FIELD_LABEL[e.field] ?? e.field}: {e.oldValue ?? "-"} →{" "}
                              <span className="font-medium">{e.newValue ?? "-"}</span>
                              {e.editedBy ? ` · โดย ${e.editedBy}` : ""}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
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
