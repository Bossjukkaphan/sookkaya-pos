"use client"

import { useMemo, useState } from "react"

import {
  filterMembers,
  sortMembers,
  type ExpiryFilter,
  type MemberListItem,
  type MemberSort,
} from "@/lib/member-list"
import { tierLabel } from "@/lib/tier-colors"
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

const EXPIRY_LABEL: Record<ExpiryFilter, string> = {
  all: "ทั้งหมด",
  d7: "🔴 ≤7 วัน",
  d14: "🟠 ≤14 วัน",
  d30: "🟡 ≤30 วัน",
  frozen: "🧊 แช่แข็ง",
}

/**
 * ค้นหา/กรอง tier/เรียงลำดับฝั่งเบราว์เซอร์ — จำนวนสมาชิกที่มีเครดิตมีแค่หลักสิบคน
 * ไม่คุ้มยิง query ใหม่ทุกครั้งที่พิมพ์
 */
export function MemberList({ members }: { members: MemberListItem[] }) {
  const [term, setTerm] = useState("")
  const [tier, setTier] = useState("")
  const [sort, setSort] = useState<MemberSort>("name")
  const [expiry, setExpiry] = useState<ExpiryFilter>("all")

  const tiers = useMemo(
    () => [...new Set(members.map((m) => m.tier).filter((t): t is string => !!t))].sort(),
    [members]
  )

  const shown = useMemo(() => {
    const filtered = filterMembers(members, term, tier, expiry)
    // กดชิปโซนหมดอายุ = อยากเห็นคนด่วนก่อนอยู่แล้ว — สลับเรียงให้เองถ้ายังเรียงแบบตั้งต้น
    const effectiveSort = expiry !== "all" && sort === "name" ? "expiry_soon" : sort
    return sortMembers(filtered, effectiveSort)
  }, [members, term, tier, sort, expiry])

  // จำนวนต่อชิป — เห็นก่อนกดว่ามีกี่คน (นับหลังกรองคำค้น/ระดับ แต่ไม่นับชิปตัวเอง)
  const chipCount = useMemo(() => {
    const base = filterMembers(members, term, tier, "all")
    return (f: ExpiryFilter) => filterMembers(base, "", "", f).length
  }, [members, term, tier])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          className="h-11 w-full sm:flex-1"
          placeholder="ค้นหาด้วยชื่อ ชื่อเล่น หรือเบอร์โทร"
          aria-label="ค้นหาสมาชิก"
        />
        {tiers.length > 1 && (
          <select
            value={tier}
            onChange={(e) => setTier(e.target.value)}
            className={`${SELECT_CLASS} flex-1 sm:flex-none`}
            aria-label="กรองตามระดับ"
          >
            <option value="">ทุกระดับ</option>
            {tiers.map((t) => (
              <option key={t} value={t}>
                {tierLabel(t)}
              </option>
            ))}
          </select>
        )}
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as MemberSort)}
          className={`${SELECT_CLASS} flex-1 sm:flex-none`}
          aria-label="เรียงลำดับ"
        >
          {(Object.keys(SORT_LABEL) as MemberSort[]).map((s) => (
            <option key={s} value={s}>
              {SORT_LABEL[s]}
            </option>
          ))}
        </select>
      </div>

      {/* ชิปกรองสถานะหมดอายุ — คิดจาก "ใบใกล้สุด" รายใบ ตรงกับหน้าดูแลลูกค้า/แจ้งเตือนเช้า */}
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(EXPIRY_LABEL) as ExpiryFilter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setExpiry(f)}
            className={`rounded-full border px-3 py-1.5 text-xs ${
              expiry === f
                ? "border-amber-600 bg-amber-600 font-medium text-white"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {EXPIRY_LABEL[f]}
            {f !== "all" && ` (${chipCount(f)})`}
          </button>
        ))}
      </div>

      <p className="text-xs text-slate-500">
        แสดง {shown.length} จาก {members.length} คน
      </p>

      {shown.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">
          {term || tier || expiry !== "all"
            ? "ไม่พบสมาชิกตามเงื่อนไข"
            : "ยังไม่มีสมาชิกที่มีเครดิตคงเหลือ"}
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((m) => (
            <li key={m.customerId}>
              <MemberRow
                customerId={m.customerId}
                name={m.name}
                nickname={m.nickname}
                tier={m.tier}
                balance={m.balance}
                nextExpiry={m.nextExpiry}
                daysLeft={m.daysLeft}
                expiringAmount={m.expiringAmount}
                expired={m.expired}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
