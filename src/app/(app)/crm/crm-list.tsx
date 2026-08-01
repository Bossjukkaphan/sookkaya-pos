"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { saveCrmContact, type ContactResult } from "./crm-actions"
import { msgBirthday, msgNewFollow, msgWinback } from "@/lib/crm"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

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

  function copyMessage(row: CrmRow) {
    const name = row.nickname || row.name
    const msg =
      listType === "birthday"
        ? msgBirthday(name)
        : listType === "winback"
          ? msgWinback(name)
          : msgNewFollow(name)
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
  )
}
