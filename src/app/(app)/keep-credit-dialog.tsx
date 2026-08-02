"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"

import { keepOverpayAsCredit } from "./overpay-credit-actions"
import { formatBaht } from "@/lib/constants"
import { OVERPAY_CREDIT_MONTHS } from "@/lib/overpay-credit"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

/** สาเหตุที่ทำให้บิลรับเกิน — มีแค่ทางเดียวที่ควรกลายเป็นเครดิต
 *  ถ้าให้ปุ่มเดียวยิงตรงเป็นเครดิต พนักงานจะใช้กลบการคีย์ผิด แล้วเครดิตที่ไม่มีเงินจริงรองรับจะงอกในระบบ */
type Reason = "prepaid" | "typo" | "refunded"

const REASONS: { key: Reason; label: string; hint: string }[] = [
  {
    key: "prepaid",
    label: "ลูกค้าจ่ายล่วงหน้าไว้ แต่ใช้บริการไม่ครบ",
    hint: "เงินอยู่กับร้านจริง — เก็บเป็นเครดิตให้ลูกค้าใช้ครั้งหน้า",
  },
  {
    key: "typo",
    label: "คีย์ยอดรับผิด",
    hint: "เงินไม่ได้เข้าจริงเท่าที่คีย์ — ต้องไปแก้บรรทัดชำระ ไม่ใช่ออกเครดิต",
  },
  {
    key: "refunded",
    label: "คืนเงินสดให้ลูกค้าไปแล้ว",
    hint: "เงินออกจากร้านแล้ว — ต้องไปแก้บรรทัดชำระ ไม่ใช่ออกเครดิต",
  },
]

/**
 * กล่อง "เก็บเป็นเครดิต" ของบิลรับเกิน — ถามสาเหตุก่อนเสมอ แล้วค่อยยืนยัน
 * เฉพาะสาเหตุ prepaid เท่านั้นที่เดินต่อไปออกใบเครดิต อีกสองทางบอกให้ไปแก้บรรทัดชำระ
 */
export function KeepCreditDialog({
  billKey,
  overpay,
  onDone,
}: {
  billKey: string
  overpay: number
  onDone: () => void
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<Reason | null>(null)
  const [pending, startTransition] = useTransition()

  function submit() {
    startTransition(async () => {
      const r = await keepOverpayAsCredit(billKey)
      if (r.ok) {
        toast.success(`เก็บเป็นเครดิตแล้ว ${formatBaht(r.amount)} ฿ — ลูกค้าใช้ครั้งหน้าได้เลย`)
        setOpen(false)
        onDone()
      } else {
        toast.error(r.error)
      }
    })
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="border-orange-200 text-orange-700 hover:bg-orange-50"
        onClick={() => {
          setReason(null)
          setOpen(true)
        }}
      >
        เก็บเป็นเครดิต
      </Button>

      {open && (
        <Dialog open onOpenChange={(o) => !o && setOpen(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>เกินรับ {formatBaht(overpay)} ฿ — เกิดจากอะไรคะ</DialogTitle>
            </DialogHeader>

            <div className="space-y-2">
              {REASONS.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => setReason(r.key)}
                  className={`block w-full rounded-lg border p-3 text-left ${
                    reason === r.key
                      ? "border-[#664343] bg-[#FFF0D1]/50"
                      : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <span className="block text-sm font-medium">{r.label}</span>
                  <span className="block text-xs text-slate-500">{r.hint}</span>
                </button>
              ))}
            </div>

            {reason === "prepaid" && (
              <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
                จะออกใบ <strong>เครดิตคงเหลือ {formatBaht(overpay)} ฿</strong> ให้ลูกค้าของบิลนี้
                (ไม่มีโบนัส · อายุ {OVERPAY_CREDIT_MONTHS} เดือน) และลดบรรทัดชำระของบิลลงเท่ากัน
                — เงินเข้าของวันนั้นรวมไม่เปลี่ยน
              </p>
            )}
            {(reason === "typo" || reason === "refunded") && (
              <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                เคสนี้ไม่ใช่เครดิต — เปิดรายละเอียดบิลในหน้าประวัติ แล้วลบหรือแก้บรรทัดชำระให้ตรงกับเงินที่เข้าจริง
              </p>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                ปิด
              </Button>
              <Button onClick={submit} disabled={pending || reason !== "prepaid"}>
                {pending ? "กำลังบันทึก..." : "ยืนยันเก็บเป็นเครดิต"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
