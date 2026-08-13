"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { deleteTopup, updateTopupPaymentMethod } from "./member-actions"
import { REAL_MONEY_METHODS, formatBaht } from "@/lib/constants"
import { formatThaiDate } from "@/lib/datetime"
import { TIER_COLOR, TIER_COLOR_DEFAULT, tierLabel } from "@/lib/tier-colors"
import { PAY_COLOR, PAY_COLOR_DEFAULT } from "@/lib/payment-colors"
import { Button } from "@/components/ui/button"
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
  paymentMethod: string
}

/** ค้นหาในประวัติเติมเงิน 30 รายการล่าสุด — พิมพ์แล้วกรองชื่อทันที ไม่ต้องยิง query ใหม่ */
export function TopupHistoryList({ topups }: { topups: TopupRow[] }) {
  const router = useRouter()
  const [term, setTerm] = useState("")
  // ลบมี 2 จังหวะ: กดครั้งแรกเปลี่ยนปุ่มเป็นยืนยัน กดซ้ำถึงลบจริง — กันมือลั่น
  // ถ้าเซิร์ฟเวอร์ปฏิเสธเพราะลบแล้ววันหมดอายุจะถอยหลัง (deleteTopup คืน ok:false พร้อมข้อความเตือน)
  // จะเข้าจังหวะที่ 3: ปุ่มเปลี่ยนข้อความอีกครั้ง กดซ้ำถึงส่ง confirmShorten=true ลบจริง
  // เหตุผลอื่นที่ทำให้ลบไม่ได้ (เดือนปิดงบ/เครดิตถูกใช้ไปแล้ว) กดซ้ำแล้วเจอข้อความเดิมอีกครั้งแล้วเลิกเอง
  const [confirmState, setConfirmState] = useState<{ id: string; shorten: boolean } | null>(null)
  const [pending, startTransition] = useTransition()

  // แผงเลือกช่องทางกางทีละแถว — ไม่ต้องยืนยันสองจังหวะเหมือนปุ่มลบ
  // เพราะกดผิดแล้วกดใหม่ได้ ไม่มีข้อมูลไหนเสียหาย
  const [editingId, setEditingId] = useState<string | null>(null)

  // เปิด/ปิดแผงแก้ช่องทาง — ต้องปลดปุ่มลบที่ค้างสถานะ "ยืนยันลบ?" ไว้ด้วยเสมอ
  // ไม่งั้นพอย้อนกลับมากดลบอีกครั้งเดียวจะลบทันที ข้ามการยืนยันสองจังหวะที่ตั้งใจกันมือลั่นไว้
  function toggleEditPanel(row: TopupRow) {
    setConfirmState(null)
    setEditingId(editingId === row.id ? null : row.id)
  }

  function handleChangeMethod(row: TopupRow, method: string) {
    if (method === row.paymentMethod) {
      setEditingId(null)
      return
    }
    startTransition(async () => {
      const r = await updateTopupPaymentMethod(row.id, method)
      if (r.ok) {
        toast.success(`เปลี่ยนช่องทางของ ${row.customerName} เป็น ${method} แล้ว`)
        setEditingId(null)
        router.refresh()
      } else {
        toast.error(r.error)
      }
    })
  }

  function handleDelete(row: TopupRow) {
    if (!confirmState || confirmState.id !== row.id) {
      setConfirmState({ id: row.id, shorten: false })
      setEditingId(null)
      return
    }
    startTransition(async () => {
      const r = await deleteTopup(row.id, confirmState.shorten)
      if (r.ok) {
        toast.success(`ลบใบเติมเงินของ ${row.customerName} แล้ว`)
        router.refresh()
        setConfirmState(null)
      } else {
        toast.error(r.error)
        setConfirmState(confirmState.shorten ? null : { id: row.id, shorten: true })
      }
    })
  }

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
            <li key={t.id} className="px-1 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    {t.customerName}{" "}
                    <Badge variant="outline" className={TIER_COLOR[t.tier] ?? TIER_COLOR_DEFAULT}>
                      {tierLabel(t.tier)}
                    </Badge>
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatThaiDate(t.topupDate)} · หมดอายุ {formatThaiDate(t.expiryDate)}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Badge
                      variant="outline"
                      className={PAY_COLOR[t.paymentMethod] ?? PAY_COLOR_DEFAULT}
                    >
                      {t.paymentMethod}
                    </Badge>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      className="h-6 px-2 text-xs text-slate-500"
                      onClick={() => toggleEditPanel(t)}
                    >
                      {editingId === t.id ? "ปิด" : "แก้ช่องทาง"}
                    </Button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right whitespace-nowrap">
                    <p className="font-semibold">+{formatBaht(t.creditAdded)} ฿</p>
                    <p className="text-xs text-slate-500">รับ {formatBaht(t.cashReceived)} ฿</p>
                  </div>
                  <Button
                    variant={confirmState?.id === t.id ? "destructive" : "ghost"}
                    size="sm"
                    disabled={pending}
                    className={confirmState?.id === t.id ? "" : "text-red-600"}
                    onClick={() => handleDelete(t)}
                  >
                    {confirmState?.id === t.id
                      ? confirmState.shorten
                        ? "ยืนยันอีกครั้ง (วันหมดอายุจะถอย)"
                        : "ยืนยันลบ?"
                      : "ลบ"}
                  </Button>
                </div>
              </div>

              {editingId === t.id && (
                <div className="mt-2 flex flex-wrap gap-1.5 border-t pt-2">
                  {REAL_MONEY_METHODS.map((m) => (
                    <Button
                      key={m}
                      type="button"
                      size="sm"
                      variant={t.paymentMethod === m ? "default" : "outline"}
                      disabled={pending}
                      className="h-9 text-xs"
                      onClick={() => handleChangeMethod(t, m)}
                    >
                      {m}
                    </Button>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-slate-400">
        ช่องทางชำระเงินแก้ได้เลยโดยไม่ต้องลบใบ ยอดเครดิตของลูกค้าไม่กระทบ ·
        คีย์ยอดผิดหรือลูกค้าเปลี่ยนแพ็กเกจ (เช่น 5,000 → 10,000): ลบใบเดิมแล้วเติมใหม่ ·
        ลบได้เฉพาะเดือนนี้และเฉพาะใบที่เครดิตยังไม่ถูกใช้
      </p>
    </div>
  )
}
