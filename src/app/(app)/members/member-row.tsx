import Link from "next/link"

import { formatBaht } from "@/lib/constants"
import { formatThaiDate } from "@/lib/datetime"
import { expiryUrgency, EXPIRY_WINDOW_DAYS } from "@/lib/credit-expiry"
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
  daysLeft,
  expiringAmount,
  expired = false,
}: {
  customerId: string
  name: string
  nickname?: string | null
  /** ระดับจากใบเติมเงินล่าสุด — null เมื่อไม่พบประวัติเติม */
  tier: string | null
  balance: number
  /** วันหมดอายุของ "ใบใกล้สุด" ที่ยังใช้ได้ (คิดรายใบ — ไม่ใช่ next_expiry ของ view) */
  nextExpiry: string | null
  daysLeft: number | null
  /** ยอดรวมใบที่จะหมดภายใน 30 วัน — >0 = ขึ้นคำเตือนพร้อมยอดที่เสี่ยงหาย */
  expiringAmount: number
  /** เครดิตแช่แข็ง (หมดอายุแล้วแต่ยอดยังอยู่) — default false ให้ผู้เรียกเดิมยังคอมไพล์ผ่าน */
  expired?: boolean
}) {
  const bucket = creditBucket(balance, expired)
  const low = bucket === "low"
  const isExpired = bucket === "expired"
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
              {isExpired && (
                <Badge
                  variant="outline"
                  className="shrink-0 border-amber-300 bg-amber-100 text-amber-700"
                >
                  หมดอายุแล้ว
                </Badge>
              )}
            </div>
            {/* ใบใกล้สุดใน 30 วัน = เตือนพร้อมยอดที่เสี่ยงหาย · ไกลกว่านั้นโชว์วันเฉยๆ */}
            {nextExpiry && daysLeft !== null && daysLeft <= EXPIRY_WINDOW_DAYS ? (
              <p className="text-sm text-amber-700">
                {expiryUrgency(daysLeft).icon} ฿{formatBaht(expiringAmount)} จะหมด{" "}
                {formatThaiDate(nextExpiry)} · {expiryUrgency(daysLeft).label}
              </p>
            ) : nextExpiry ? (
              <p className="text-sm text-slate-500">
                ใบใกล้สุดหมดอายุ {formatThaiDate(nextExpiry)}
              </p>
            ) : null}
          </div>
          <div className="shrink-0 text-right">
            {/* ใกล้หมด/หมดอายุแล้วเป็นสีเตือน bucket เดียวกับหน้าภาพรวม */}
            <p
              className={`text-base font-bold whitespace-nowrap ${
                low || isExpired ? "text-amber-600" : "text-emerald-700"
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
