import Link from "next/link"

import { formatBaht } from "@/lib/constants"
import { formatThaiDate } from "@/lib/datetime"
import { creditBucket } from "@/lib/member-credit"
import { TIER_COLOR, TIER_COLOR_DEFAULT, tierLabel } from "@/lib/tier-colors"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

/**
 * แถวสมาชิกหนึ่งคน: ชื่อ + badge ระดับล่าสุด (สีประจำ tier) + เครดิตคงเหลือตัวโต
 * แยกเป็น component เพื่อให้เห็นครบใน 1 แวบ: ใคร · tier ไหน · เหลือเท่าไร
 */
export function MemberRow({
  customerId,
  name,
  nickname,
  tier,
  balance,
  nextExpiry,
  expiringSoon,
}: {
  customerId: string
  name: string
  nickname?: string | null
  /** ระดับจากใบเติมเงินล่าสุด — null เมื่อไม่พบประวัติเติม */
  tier: string | null
  balance: number
  nextExpiry: string | null
  expiringSoon: boolean
}) {
  const low = creditBucket(balance) === "low"
  return (
    <Link href={`/customers/${customerId}`}>
      <Card className="transition-colors hover:bg-slate-50">
        <CardContent className="flex items-center justify-between gap-3 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate font-medium">
                {name}
                {nickname && (
                  <span className="font-normal text-slate-500"> ({nickname})</span>
                )}
              </p>
              {tier && (
                <Badge
                  variant="outline"
                  className={`shrink-0 ${TIER_COLOR[tier] ?? TIER_COLOR_DEFAULT}`}
                >
                  {tierLabel(tier)}
                </Badge>
              )}
            </div>
            {nextExpiry && (
              <p
                className={
                  expiringSoon ? "text-sm text-amber-700" : "text-sm text-slate-500"
                }
              >
                หมดอายุ {formatThaiDate(nextExpiry)}
                {expiringSoon && " ⚠️"}
              </p>
            )}
          </div>
          <div className="shrink-0 text-right">
            {/* ใกล้หมดเป็นสีเตือน bucket เดียวกับหน้าภาพรวม */}
            <p
              className={`text-base font-bold whitespace-nowrap ${
                low ? "text-amber-600" : "text-emerald-700"
              }`}
            >
              {formatBaht(balance)} ฿
            </p>
            <p className="text-[10px] text-slate-400">เครดิตเหลือ</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
