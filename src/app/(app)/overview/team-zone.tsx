import Link from "next/link"

import { formatBaht } from "@/lib/constants"
import type { TherapistRank } from "@/lib/boss-hub"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

/**
 * โซน 4 — "ทีมเป็นไง ใครทำรายได้ดีสุด": ท็อป 5 หมอนวด + ป้ายการันตี + สถานะเช็คอิน/คิววันนี้
 */
export function TeamZone({
  headline,
  top,
  flags,
  todayStatus,
}: {
  headline: string
  top: TherapistRank[]
  flags: { name: string; ratio: number }[]
  todayStatus: { checkedIn: number; queueTotal: number; queueDone: number }
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base text-[#664343]">ทีมเป็นไง</CardTitle>
        <p className="text-sm text-slate-700">{headline}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-slate-50 px-3 py-2">
            <p className="text-xs text-slate-500">เช็คอินวันนี้</p>
            <p className="text-lg font-bold">{todayStatus.checkedIn} คน</p>
          </div>
          <div className="rounded-lg bg-slate-50 px-3 py-2">
            <p className="text-xs text-slate-500">คิววันนี้</p>
            <p className="text-lg font-bold">
              {todayStatus.queueDone}/{todayStatus.queueTotal}
            </p>
          </div>
          <div className="rounded-lg bg-slate-50 px-3 py-2">
            <p className="text-xs text-slate-500">ป้ายการันตี</p>
            <p className="text-lg font-bold">{flags.length} คน</p>
          </div>
        </div>

        {top.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-500">ยังไม่มีข้อมูลรายได้เดือนนี้</p>
        ) : (
          <>
            {/* กันสับสนกับการ์ด "ค่ามือรายหมอ" ที่ /reports — เลขที่นี่คือยอดขาย ไม่ใช่ค่ามือที่หมอได้รับ */}
            <p className="text-xs text-slate-500">ยอดขายที่ทำให้ร้าน (ไม่ใช่ค่ามือ)</p>
            <ul className="space-y-2 text-sm">
            {top.map((t, i) => (
              <li key={t.therapistId}>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">
                    {i + 1}. {t.name}
                  </span>
                  <span className="shrink-0 text-slate-700">
                    {formatBaht(t.revenue)} ฿ · {t.sessions} คิว
                  </span>
                </div>
                {/* แถบเทียบสัดส่วนเทียบ top1 — sharePct คำนวณมาแล้วจาก topTherapists */}
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-[#664343]"
                    style={{ width: `${t.sharePct}%` }}
                  />
                </div>
              </li>
            ))}
            </ul>
          </>
        )}

        {flags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {flags.map((f) => (
              <span
                key={f.name}
                className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs text-amber-900"
              >
                🟡 {f.name} กินการันตี {Math.round(f.ratio * 100)}%
              </span>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <Button asChild variant="outline" size="sm">
            <Link href="/commission/summary">สรุปค่ามือ</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/team">ทีม</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/checkin">เช็คอิน</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
