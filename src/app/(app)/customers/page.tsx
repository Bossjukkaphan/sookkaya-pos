import Link from "next/link"

import { createClient } from "@/lib/supabase/server"
import { formatBaht } from "@/lib/constants"
import { todayInShopTz } from "@/lib/datetime"
import { StatCard } from "@/components/stat-card"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CustomerSearch } from "./customer-search"

export const metadata = { title: "ลูกค้า · สุขกายา POS" }

const SELECT_CLASS =
  "h-11 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none"

const TYPE_LABEL: Record<string, string> = {
  "": "ลูกค้าทุกประเภท",
  member: "เฉพาะสมาชิก",
  regular: "เฉพาะลูกค้าทั่วไป",
}

const SORT_LABEL: Record<string, string> = {
  name: "ชื่อ ก-ฮ",
  recent: "ลูกค้าใหม่ล่าสุด",
  balance: "เครดิตมาก → น้อย",
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; sort?: string }>
}) {
  const supabase = await createClient()
  const { q, type: rawType, sort: rawSort } = await searchParams
  const term = q?.trim() ?? ""
  const type = rawType === "member" || rawType === "regular" ? rawType : ""
  const sort = rawSort === "recent" || rawSort === "balance" ? rawSort : "name"
  const today = todayInShopTz()
  const monthStartIso = `${today.slice(0, 7)}-01T00:00:00+07:00`

  let query = supabase
    .from("member_balances")
    .select(
      "customer_id, name, nickname, phone, credit_balance, next_expiry, customer_type",
      { count: "exact" }
    )
    .limit(50)

  if (term) {
    query = query.or(
      `name.ilike.%${term}%,nickname.ilike.%${term}%,phone.ilike.%${term}%`
    )
  }
  if (type === "member") query = query.eq("customer_type", "สมาชิก")
  if (type === "regular") query = query.eq("customer_type", "ลูกค้าทั่วไป")

  if (sort === "recent") query = query.order("created_at", { ascending: false })
  else if (sort === "balance") query = query.order("credit_balance", { ascending: false })
  else query = query.order("name")

  const [
    { data: customers, count },
    { count: totalCustomers },
    { count: totalMembers },
    { count: newThisMonth },
    { data: creditRows },
  ] = await Promise.all([
    query,
    supabase.from("customers").select("*", { count: "exact", head: true }),
    supabase
      .from("customers")
      .select("*", { count: "exact", head: true })
      .eq("customer_type", "สมาชิก"),
    supabase
      .from("customers")
      .select("*", { count: "exact", head: true })
      .gte("created_at", monthStartIso),
    supabase.from("member_balances").select("credit_balance").gt("credit_balance", 0),
  ])

  const totalOutstanding = (creditRows ?? []).reduce(
    (sum, r) => sum + (r.credit_balance ?? 0),
    0
  )

  const rows = customers ?? []
  const total = count ?? rows.length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold">ลูกค้า</h1>
        <Button asChild size="sm">
          <Link href="/customers/new">+ เพิ่มลูกค้า</Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard label="ลูกค้าทั้งหมด" value={`${(totalCustomers ?? 0).toLocaleString()} คน`} />
        <StatCard label="เป็นสมาชิก" value={`${(totalMembers ?? 0).toLocaleString()} คน`} />
        <StatCard
          label="เครดิตคงค้างรวม"
          value={`${formatBaht(totalOutstanding)} ฿`}
          hint="ภาระที่ร้านต้องให้บริการในอนาคต"
          tone="warn"
        />
        <StatCard label="ลูกค้าใหม่เดือนนี้" value={`${(newThisMonth ?? 0).toLocaleString()} คน`} />
      </div>

      <CustomerSearch initialTerm={term} type={type} sort={sort} />

      {/* ฟอร์ม GET ธรรมดา — กด "กรอง" แล้ว server กรองให้ ไม่ต้องมี JS ฝั่งไคลเอนต์ */}
      <form action="/customers" className="flex flex-wrap items-center gap-2 text-sm">
        <input type="hidden" name="q" value={term} />
        <select
          name="type"
          defaultValue={type}
          className={SELECT_CLASS}
          aria-label="กรองตามประเภทลูกค้า"
        >
          {Object.entries(TYPE_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          name="sort"
          defaultValue={sort}
          className={SELECT_CLASS}
          aria-label="เรียงลำดับ"
        >
          {Object.entries(SORT_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline" size="sm" className="h-11">
          กรอง
        </Button>
      </form>

      <p className="text-xs text-slate-500">
        พบ {total.toLocaleString()} คน{total > rows.length ? ` · แสดง ${rows.length} คนแรก` : ""}
      </p>

      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">
          {term || type ? "ไม่พบลูกค้าตามเงื่อนไข" : "ยังไม่มีข้อมูลลูกค้า"}
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((c) => {
            const balance = c.credit_balance ?? 0
            return (
              <li key={c.customer_id}>
                <Link href={`/customers/${c.customer_id}`}>
                  <Card className="transition-colors hover:bg-slate-50">
                    <CardContent className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate font-medium">
                            {c.name}
                            {c.nickname && (
                              <span className="font-normal text-slate-500">
                                {" "}
                                ({c.nickname})
                              </span>
                            )}
                          </p>
                          {/* สีม่วงชุดเดียวกับ Member Credit ทุกหน้า */}
                          {c.customer_type === "สมาชิก" && (
                            <Badge
                              variant="outline"
                              className="shrink-0 border-violet-200 bg-violet-100 text-violet-700"
                            >
                              สมาชิก
                            </Badge>
                          )}
                        </div>
                        {c.phone && (
                          <p className="text-sm text-slate-500">{c.phone}</p>
                        )}
                      </div>
                      {balance > 0 && (
                        <div className="shrink-0 text-right">
                          <p className="text-base font-bold whitespace-nowrap text-emerald-700">
                            {formatBaht(balance)} ฿
                          </p>
                          <p className="text-[10px] text-slate-400">เครดิตเหลือ</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
