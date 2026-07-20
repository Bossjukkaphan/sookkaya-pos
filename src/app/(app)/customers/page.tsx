import Link from "next/link"

import { createClient } from "@/lib/supabase/server"
import { formatBaht } from "@/lib/constants"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold">ลูกค้า</h1>
        <Button asChild size="sm">
          <Link href="/customers/new">+ เพิ่มลูกค้า</Link>
        </Button>
      </div>

      <form className="flex gap-2" action="/customers">
        <Input
          name="q"
          defaultValue={term}
          className="h-11"
          placeholder="ค้นหาด้วยชื่อ ชื่อเล่น หรือเบอร์โทร"
          aria-label="ค้นหาลูกค้า"
        />
        <Button type="submit" className="h-11">
          ค้นหา
        </Button>
      </form>

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
                        <p className="font-medium">
                          {c.name}
                          {c.nickname && (
                            <span className="font-normal text-slate-500">
                              {" "}
                              ({c.nickname})
                            </span>
                          )}
                        </p>
                        {c.phone && (
                          <p className="text-sm text-slate-500">{c.phone}</p>
                        )}
                      </div>
                      {balance > 0 && (
                        <Badge className="whitespace-nowrap">
                          เครดิต {formatBaht(balance)} ฿
                        </Badge>
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
