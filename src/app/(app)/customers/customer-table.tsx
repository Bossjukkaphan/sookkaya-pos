import Link from "next/link"

import { formatBaht } from "@/lib/constants"
import { formatThaiDate } from "@/lib/datetime"
import { type CustomerIssueRow, issueBadgeClass, issuesOf } from "@/lib/customer-issues"
import { Badge } from "@/components/ui/badge"

/**
 * รายชื่อลูกค้า — ตารางบนคอม/แท็บเล็ต · การ์ดบนมือถือ
 *
 * สลับด้วย CSS ไม่ใช่ JS เพราะหน้านี้เป็น server component ล้วน
 * (ตาราง 7 คอลัมน์บนจอ 375px อ่านไม่ออก ต้องเลื่อนซ้ายขวาทุกแถว)
 */

const HEADS: { key: string; label: string; right?: boolean }[] = [
  { key: "name", label: "ชื่อ" },
  { key: "phone", label: "เบอร์โทร" },
  { key: "type", label: "ประเภท" },
  { key: "balance", label: "เครดิต", right: true },
  { key: "visits", label: "มาแล้ว", right: true },
  { key: "last_visit", label: "มาล่าสุด" },
]

function IssueBadges({ row }: { row: CustomerIssueRow }) {
  const issues = issuesOf(row)
  if (issues.length === 0) return <span className="text-slate-300">—</span>
  return (
    <span className="flex flex-wrap gap-1">
      {issues.map((i) => (
        <Badge
          key={i.key}
          variant="outline"
          title={i.why}
          className={`shrink-0 ${issueBadgeClass(i.tone)}`}
        >
          {i.label}
        </Badge>
      ))}
    </span>
  )
}

function NameCell({ row }: { row: CustomerIssueRow }) {
  return (
    <>
      {row.name}
      {row.nickname && (
        <span className="font-normal text-slate-500"> ({row.nickname})</span>
      )}
    </>
  )
}

/** ป้ายสมาชิก — สีม่วงชุดเดียวกับ Member Credit ทุกหน้าในระบบ */
function MemberBadge({ row }: { row: CustomerIssueRow }) {
  if (row.customer_type !== "สมาชิก") return null
  return (
    <Badge variant="outline" className="shrink-0 border-violet-200 bg-violet-100 text-violet-700">
      สมาชิก
    </Badge>
  )
}

/** ยอดเครดิต — ที่เดียวที่ตัดสินสีและรูปแบบ ไม่งั้นตารางกับการ์ดโชว์ไม่เหมือนกัน
 *  (เคยเพี้ยนมาแล้ว: ตารางไม่มีสัญลักษณ์บาท การ์ดมี) */
function CreditAmount({ balance }: { balance: number | null }) {
  const n = balance ?? 0
  if (n === 0) return <span className="text-slate-300">—</span>
  return (
    <span className={`font-semibold whitespace-nowrap ${n < 0 ? "text-red-600" : "text-emerald-700"}`}>
      {formatBaht(n)} ฿
    </span>
  )
}

/**
 * แรเงาสลับ "ทีละกลุ่มเบอร์" ไม่ใช่ทีละแถว — คู่เดียวกันจะได้พื้นหลังเดียวกัน
 * ทำเฉพาะตอนเรียงตามเบอร์ ไม่งั้นกลายเป็นลายมั่วที่ไม่มีความหมาย
 *
 * ดึงออกมาเป็นฟังก์ชันแยกนอก component (ไม่ใช่ PascalCase และไม่คืน JSX) เพราะ
 * React Compiler lint (react-hooks/immutability) ห้าม reassign ตัวแปรระหว่าง
 * render ของ component — ฟังก์ชันช่วยนี้ไม่ใช่ component จึงวนลูปสะสมค่าได้ตามปกติ
 */
function shadeByPhoneGroup(rows: CustomerIssueRow[], groupByPhone: boolean): boolean[] {
  if (!groupByPhone) return rows.map(() => false)
  let group = -1
  let lastPhone: string | null = null
  return rows.map((r) => {
    if (r.phone !== lastPhone) {
      group += 1
      lastPhone = r.phone
    }
    return group % 2 === 1
  })
}

export function CustomerTable({
  rows,
  sort,
  query,
  /** true = กำลังกรองเบอร์ซ้ำ แถวเรียงตามเบอร์แล้ว จึงแรเงาสลับกลุ่มได้มีความหมาย */
  groupByPhone,
}: {
  rows: CustomerIssueRow[]
  sort: string
  /** query string เดิมทั้งหมด (ไม่รวม sort) สำหรับทำลิงก์หัวคอลัมน์ */
  query: URLSearchParams
  groupByPhone: boolean
}) {
  const shade = shadeByPhoneGroup(rows, groupByPhone)

  function sortHref(key: string) {
    const next = new URLSearchParams(query)
    next.set("sort", key)
    next.delete("page")
    return `/customers?${next.toString()}`
  }

  return (
    <>
      {/* จอกว้าง — ตาราง */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {HEADS.map((h) => (
                <th
                  key={h.key}
                  className={`border-b-2 px-2 py-2 text-xs font-semibold whitespace-nowrap text-slate-500 ${
                    h.right ? "text-right" : "text-left"
                  }`}
                >
                  <Link href={sortHref(h.key)} className="hover:text-slate-900">
                    {h.label}
                    <span className="ml-1 text-[9px] text-slate-300">
                      {sort === h.key ? "▼" : "↕"}
                    </span>
                  </Link>
                </th>
              ))}
              <th className="border-b-2 px-2 py-2 text-left text-xs font-semibold text-slate-500">
                สถานะข้อมูล
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={r.customer_id}
                className={`border-b hover:bg-slate-50 ${shade[i] ? "bg-amber-50/40" : ""}`}
              >
                <td className="px-2 py-2 font-medium">
                  <Link href={`/customers/${r.customer_id}`} className="hover:underline">
                    <NameCell row={r} />
                  </Link>
                </td>
                <td className="px-2 py-2 tabular-nums text-slate-600">
                  {r.phone || <span className="text-slate-300">ไม่มีเบอร์</span>}
                </td>
                <td className="px-2 py-2">
                  <MemberBadge row={r} />
                  {r.customer_type !== "สมาชิก" && (
                    <span className="text-slate-400">ทั่วไป</span>
                  )}
                </td>
                <td className="px-2 py-2 text-right">
                  <CreditAmount balance={r.credit_balance} />
                </td>
                <td className="px-2 py-2 text-right text-slate-600">{r.visits ?? 0}</td>
                <td className="px-2 py-2 whitespace-nowrap text-slate-600">
                  {r.last_visit ? (
                    formatThaiDate(r.last_visit)
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
                <td className="px-2 py-2">
                  <IssueBadges row={r} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* มือถือ — การ์ด */}
      <ul className="grid gap-2 sm:hidden">
        {rows.map((r) => (
          <li key={r.customer_id}>
            <Link
              href={`/customers/${r.customer_id}`}
              className="flex items-start justify-between gap-3 rounded-lg border p-3 hover:bg-slate-50"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate font-medium">
                    <NameCell row={r} />
                  </p>
                  <MemberBadge row={r} />
                </div>
                <p className="text-sm text-slate-500">
                  {r.phone || "ไม่มีเบอร์"} · มาแล้ว {r.visits ?? 0} ครั้ง
                </p>
                <div className="mt-1">
                  <IssueBadges row={r} />
                </div>
              </div>
              {(r.credit_balance ?? 0) !== 0 && (
                <div className="shrink-0 text-right">
                  <p className="text-base font-bold">
                    <CreditAmount balance={r.credit_balance} />
                  </p>
                  <p className="text-[10px] text-slate-400">เครดิตเหลือ</p>
                </div>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}
