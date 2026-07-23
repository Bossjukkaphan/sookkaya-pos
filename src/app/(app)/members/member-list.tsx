"use client"

import { useMemo, useState } from "react"

import { filterMembers, sortMembers, type MemberListItem, type MemberSort } from "@/lib/member-list"
import { MemberRow } from "./member-row"
import { Input } from "@/components/ui/input"

const SELECT_CLASS =
  "h-11 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none"

const SORT_LABEL: Record<MemberSort, string> = {
  name: "ชื่อ ก-ฮ",
  balance_desc: "เครดิตมาก → น้อย",
  balance_asc: "เครดิตน้อย → มาก",
  expiry_soon: "ใกล้หมดอายุก่อน",
}

/**
 * ค้นหา/กรอง tier/เรียงลำดับฝั่งเบราว์เซอร์ — จำนวนสมาชิกที่มีเครดิตมีแค่หลักสิบคน
 * ไม่คุ้มยิง query ใหม่ทุกครั้งที่พิมพ์
 */
export function MemberList({
  members,
  today,
}: {
  members: MemberListItem[]
  /** ใช้คำนวณ "ใกล้หมดอายุ" ให้ตรงกับหน้าอื่นที่คิดจากวันนี้ (Asia/Bangkok) */
  today: string
}) {
  const [term, setTerm] = useState("")
  const [tier, setTier] = useState("")
  const [sort, setSort] = useState<MemberSort>("name")

  const tiers = useMemo(
    () => [...new Set(members.map((m) => m.tier).filter((t): t is string => !!t))].sort(),
    [members]
  )

  const shown = useMemo(
    () => sortMembers(filterMembers(members, term, tier), sort),
    [members, term, tier, sort]
  )

  const thirtyDaysOut = addDays(today, 30)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          className="h-11 flex-1"
          placeholder="ค้นหาด้วยชื่อ ชื่อเล่น หรือเบอร์โทร"
          aria-label="ค้นหาสมาชิก"
        />
        {tiers.length > 1 && (
          <select
            value={tier}
            onChange={(e) => setTier(e.target.value)}
            className={SELECT_CLASS}
            aria-label="กรองตามระดับ"
          >
            <option value="">ทุกระดับ</option>
            {tiers.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        )}
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as MemberSort)}
          className={SELECT_CLASS}
          aria-label="เรียงลำดับ"
        >
          {(Object.keys(SORT_LABEL) as MemberSort[]).map((s) => (
            <option key={s} value={s}>
              {SORT_LABEL[s]}
            </option>
          ))}
        </select>
      </div>

      <p className="text-xs text-slate-500">
        แสดง {shown.length} จาก {members.length} คน
      </p>

      {shown.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">
          {term || tier ? "ไม่พบสมาชิกตามเงื่อนไข" : "ยังไม่มีสมาชิกที่มีเครดิตคงเหลือ"}
        </p>
      ) : (
        <ul className="space-y-2">
          {shown.map((m) => (
            <li key={m.customerId}>
              <MemberRow
                customerId={m.customerId}
                name={m.name}
                nickname={m.nickname}
                tier={m.tier}
                balance={m.balance}
                nextExpiry={m.nextExpiry}
                expiringSoon={!!m.nextExpiry && m.nextExpiry <= thirtyDaysOut}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
