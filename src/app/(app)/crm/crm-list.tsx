"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { saveCrmContact, sendCrmLineMessage, type ContactResult } from "./crm-actions"
import { crmMessage, LINE_MESSAGE_MAX } from "@/lib/crm"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export type CrmRow = {
  customerId: string
  name: string
  nickname: string | null
  phone: string
  /** เหตุผลที่ขึ้นลิสต์ เช่น "วันเกิดพรุ่งนี้" / "หายไป 74 วัน · ยอดสะสม 5,200฿" */
  reason: string
  /** มีค่า = ลูกค้าเคยผูกไลน์ → โชว์ปุ่มส่งไลน์ (ผูกหลายไลน์ใช้ตัวล่าสุด) */
  lineUserId?: string
}

const RESULT_LABEL: Record<ContactResult, string> = {
  contacted: "ติดต่อแล้ว รอตอบ",
  booked: "จองแล้ว 🎉",
  declined: "ไม่สะดวก",
  wrong_number: "เบอร์ผิด",
}

/** ลิสต์รายชื่อชงให้ติดต่อ — โทร / คัดลอกข้อความ / บันทึกผล (แถวหายทันที) */
export function CrmList({
  rows,
  listType,
}: {
  rows: CrmRow[]
  listType: "birthday" | "winback" | "new_follow"
}) {
  const router = useRouter()
  const [openResult, setOpenResult] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  // dialog ส่งไลน์: เก็บทั้งแถวที่กำลังจะส่ง + ข้อความที่แก้ได้
  const [lineTarget, setLineTarget] = useState<CrmRow | null>(null)
  const [lineText, setLineText] = useState("")
  const [sending, setSending] = useState(false)

  function openLineDialog(row: CrmRow) {
    setLineTarget(row)
    setLineText(crmMessage(listType, row.nickname || row.name))
  }

  function sendLine() {
    if (!lineTarget?.lineUserId) return
    const target = lineTarget
    setSending(true)
    startTransition(async () => {
      const r = await sendCrmLineMessage(
        target.customerId,
        listType,
        target.lineUserId!,
        lineText
      )
      if (r.ok) {
        toast.success(`ส่งไลน์หา ${target.nickname || target.name} แล้ว 💬`)
        setLineTarget(null)
        router.refresh()
      } else {
        toast.error(r.error)
      }
      setSending(false)
    })
  }

  function copyMessage(row: CrmRow) {
    const msg = crmMessage(listType, row.nickname || row.name)
    navigator.clipboard
      .writeText(msg)
      .then(() => toast.success("คัดลอกข้อความแล้ว — ไปวางในไลน์/SMS ได้เลย"))
      .catch(() => toast.error("คัดลอกไม่สำเร็จ"))
  }

  function record(row: CrmRow, result: ContactResult) {
    setSavingId(row.customerId)
    startTransition(async () => {
      const r = await saveCrmContact(row.customerId, listType, result)
      if (r.ok) {
        toast.success(`${row.nickname || row.name}: ${RESULT_LABEL[result]}`)
        router.refresh()
      } else {
        toast.error(r.error)
      }
      setSavingId(null)
      setOpenResult(null)
    })
  }

  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-slate-500">
        ไม่มีรายชื่อค้างติดต่อ — เคลียร์หมดแล้ว 🎉
      </p>
    )
  }

  return (
    <>
    <ul className="space-y-2">
      {rows.map((row) => (
        <li key={row.customerId}>
          <Card>
            <CardContent className="space-y-2 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  {/* กดชื่อเข้าโปรไฟล์ลูกค้า — ประวัติการติดต่อกับประวัติการใช้บริการอยู่ที่นั่น
                      พนักงานจะได้รู้ว่าเคยคุยอะไรไว้และเขาชอบนวดอะไร ก่อนกดโทร */}
                  {/* flex + min-h-10 ให้เป้าแตะกินทั้งบรรทัดและสูงพอสำหรับนิ้ว
                      เดิมครอบแค่ตัวอักษร ชื่อเล่นสั้นอย่าง "ตี๋" เลยได้เป้าแค่ 9x21px แตะไม่โดน */}
                  <Link
                    href={`/customers/${row.customerId}`}
                    className="flex min-h-10 items-center font-medium underline decoration-slate-300 underline-offset-2 hover:decoration-slate-600"
                  >
                    {row.name}
                    {row.nickname && (
                      <span className="font-normal text-slate-500"> ({row.nickname})</span>
                    )}
                  </Link>
                  <p className="text-xs text-slate-500">{row.reason}</p>
                </div>
                <a
                  href={`tel:${row.phone}`}
                  className="shrink-0 rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white"
                >
                  📞 โทร
                </a>
              </div>
              {openResult === row.customerId ? (
                <div className="flex flex-wrap gap-1.5">
                  {(Object.keys(RESULT_LABEL) as ContactResult[]).map((res) => (
                    <Button
                      key={res}
                      size="sm"
                      variant={res === "booked" ? "default" : "outline"}
                      disabled={savingId === row.customerId}
                      onClick={() => record(row, res)}
                    >
                      {RESULT_LABEL[res]}
                    </Button>
                  ))}
                  <Button size="sm" variant="ghost" onClick={() => setOpenResult(null)}>
                    ✕
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  {row.lineUserId && (
                    <Button size="sm" variant="default" onClick={() => openLineDialog(row)}>
                      💬 ส่งไลน์
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => copyMessage(row)}>
                    📋 คัดลอกข้อความ
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setOpenResult(row.customerId)}
                  >
                    ✅ บันทึกผล
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>

    <Dialog open={lineTarget !== null} onOpenChange={(o) => !o && setLineTarget(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            ส่งไลน์หา {lineTarget ? lineTarget.nickname || lineTarget.name : ""}
          </DialogTitle>
        </DialogHeader>
        {/* แก้ข้อความได้ก่อนส่ง — ส่งผ่าน OA ร้าน ลูกค้าเห็นเป็นแชทจากร้านทันที */}
        <textarea
          value={lineText}
          onChange={(e) => setLineText(e.target.value)}
          rows={7}
          maxLength={LINE_MESSAGE_MAX}
          className="w-full rounded-md border border-slate-200 p-3 text-sm"
        />
        <p className="text-right text-xs text-slate-400">
          {lineText.length}/{LINE_MESSAGE_MAX}
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => setLineTarget(null)} disabled={sending}>
            ยกเลิก
          </Button>
          <Button onClick={sendLine} disabled={sending || !lineText.trim()}>
            {sending ? "กำลังส่ง..." : "ยืนยันส่ง 💬"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}
