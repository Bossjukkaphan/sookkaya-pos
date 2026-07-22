import Link from "next/link"

import { createClient } from "@/lib/supabase/server"
import { formatBaht } from "@/lib/constants"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CustomerSearch } from "./customer-search"

export const metadata = { title: "ลูกค้า · สุขกายา POS" }

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const supabase = await createClient()
  const { q } = await searchParams
  const term = q?.trim() ?? ""

  let query = supabase
    .from("member_balances")
    .select("customer_id, name, nickname, phone, credit_balance, next_expiry")
    .order("name")
    .limit(50)

  if (term) {
    query = query.or(
      `name.ilike.%${term}%,nickname.ilike.%${term}%,phone.ilike.%${term}%`
    )
  }

  const { data: customers } = await query

  // member_balances ไม่มี customer_type — ดึงเพิ่มเฉพาะ id ที่แสดง (≤50 แถว)
  // เพื่อติด badge สมาชิกให้เห็นแวบแรกว่าใครเป็น member
  const ids = (customers ?? [])
    .map((c) => c.customer_id)
    .filter((id): id is string => id !== null)
  const { data: typeRows } = ids.length
    ? await supabase.from("customers").select("id, customer_type").in("id", ids)
    : { data: [] }
  const isMember = new Set(
    (typeRows ?? [])
      .filter((t) => t.customer_type === "สมาชิก")
      .map((t) => t.id)
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold">ลูกค้า</h1>
        <Button asChild size="sm">
          <Link href="/customers/new">+ เพิ่มลูกค้า</Link>
        </Button>
      </div>

      <CustomerSearch initialTerm={term} />

      {(customers ?? []).length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">
          {term ? `ไม่พบลูกค้าที่ตรงกับ "${term}"` : "ยังไม่มีข้อมูลลูกค้า"}
        </p>
      ) : (
        <ul className="space-y-2">
          {(customers ?? []).map((c) => {
            const balance =
              c.credit_balance ?? 0
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
                          {c.customer_id && isMember.has(c.customer_id) && (
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
