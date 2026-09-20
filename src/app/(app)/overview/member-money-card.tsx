import Link from "next/link"

import { formatBaht } from "@/lib/constants"
import type { MemberMoneySplit } from "@/lib/cash-composition"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

/**
 * "เงินใหม่ vs เครดิตเก่า" — ยอดขายที่เท่ากันสองเดือนอาจเป็นเงินสดเข้าไม่เท่ากันเลย
 *
 * ถ้าเดือนนี้ลูกค้าจ่ายด้วยเครดิตที่ซื้อไว้ตั้งแต่เดือนก่อนมากขึ้น เงินก้อนนั้นเข้าบัญชี
 * ไปแล้วในอดีต เดือนนี้จึงได้แต่ภาระค่ามือหมอโดยไม่มีเงินเข้าใหม่ — เจ้าของร้านต้องเห็น
 * ส่วนผสมนี้ก่อนตัดสินใจเรื่องกระแสเงินสด (เช่น จะจ่ายปันผลเท่าไร)
 *
 * ตัวเลขทั้งหมดนับตามวันใช้บริการ/วันเติม ไม่ใช่วันที่เงินเข้าบัญชีจริง — ต่างกันได้
 * เล็กน้อยตามรอบตัดบัตรเครดิต จึงเขียนกำกับไว้ท้ายการ์ด ห้ามตัดข้อความนั้นทิ้ง
 */
export function MemberMoneyCard({
  current,
  prev,
  outstandingCredit,
  outstandingMembers,
}: {
  current: MemberMoneySplit
  prev: MemberMoneySplit
  outstandingCredit: number
  outstandingMembers: number
}) {
  const topupDeltaPct =
    prev.topupIn > 0
      ? Math.round(((current.topupIn - prev.topupIn) / prev.topupIn) * 100)
      : null
  // สัดส่วนเครดิตที่โตขึ้น = เงินสดตึงขึ้นทั้งที่ยอดขายอาจเท่าเดิม จึงเตือนเมื่อเพิ่ม
  const creditPctDelta = current.creditPct - prev.creditPct

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base text-[#664343]">เงินใหม่ vs เครดิตเก่า</CardTitle>
        <p className="text-sm text-slate-700">
          เดือนนี้ลูกค้าจ่ายด้วยเครดิตที่ซื้อไว้แล้ว {current.creditPct}% ของยอดใช้บริการ
          {creditPctDelta !== 0 && (
            <span className={creditPctDelta > 0 ? "text-amber-700" : "text-emerald-700"}>
              {" "}({creditPctDelta > 0 ? "▲" : "▼"} {Math.abs(creditPctDelta)} จุด เทียบเดือนก่อนช่วงวันเท่ากัน)
            </span>
          )}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className="text-xs text-slate-500">ยอดใช้บริการ MTD</p>
            <p className="text-lg font-bold text-slate-800">
              {formatBaht(current.volume)} ฿
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">เงินใหม่</p>
            <p className="text-lg font-bold text-emerald-700">
              {formatBaht(current.freshMoney)} ฿
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">เครดิตเก่า</p>
            <p className="text-lg font-bold text-amber-700">
              {formatBaht(current.creditUsed)} ฿
            </p>
          </div>
        </div>

        {/* แถบส่วนผสม — อ่านสัดส่วนได้ในแวบเดียวโดยไม่ต้องคิดเลขในหัว
            ตัวเลข % กำกับไว้ข้างๆ เสมอ ไม่ให้สีเป็นตัวสื่อความหมายทางเดียว */}
        <div className="space-y-1">
          <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="bg-emerald-500"
              style={{ width: `${100 - current.creditPct}%` }}
            />
            <div className="bg-amber-500" style={{ width: `${current.creditPct}%` }} />
          </div>
          <div className="flex justify-between text-xs text-slate-500">
            <span>เงินใหม่ {100 - current.creditPct}%</span>
            <span>เครดิตเก่า {current.creditPct}%</span>
          </div>
        </div>

        <div className="space-y-1.5 border-t pt-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-600">ขายแพ็กเกจใหม่เดือนนี้</span>
            <span className="font-medium">
              {formatBaht(current.topupIn)} ฿
              {topupDeltaPct !== null && (
                <span
                  className={`ml-1.5 text-xs ${
                    topupDeltaPct < 0 ? "text-red-700" : "text-emerald-700"
                  }`}
                >
                  {topupDeltaPct >= 0 ? "▲" : "▼"} {Math.abs(topupDeltaPct)}%
                </span>
              )}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">เงินสดเข้าโดยประมาณ (เงินใหม่ + แพ็กเกจ)</span>
            <span className="font-semibold">{formatBaht(current.cashIn)} ฿</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">
              เครดิตคงค้าง <span className="text-xs text-slate-400">({outstandingMembers} คน)</span>
            </span>
            <span className="font-medium text-amber-700">
              {formatBaht(outstandingCredit)} ฿
            </span>
          </div>
          <p className="text-xs text-slate-500">
            เครดิตคงค้างคือบริการที่รับเงินมาแล้วแต่ยังต้องให้ในอนาคต — มีต้นทุนค่ามือหมอตามมาโดยไม่มีเงินเข้าใหม่
          </p>
        </div>

        <p className="text-xs text-slate-400">
          นับตามวันใช้บริการ/วันเติมเงิน อาจต่างจากยอดเข้าบัญชีจริงเล็กน้อยตามรอบตัดบัตรเครดิต
        </p>

        <div className="pt-1">
          <Button asChild variant="outline" size="sm">
            <Link href="/reports">ดูเงินเข้าบัญชีแยกช่องทาง</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
