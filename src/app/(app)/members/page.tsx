import { createClient } from "@/lib/supabase/server"
import { formatBaht } from "@/lib/constants"
import { formatThaiDate, todayInShopTz } from "@/lib/datetime"
import { TIER_COLOR, TIER_COLOR_DEFAULT } from "@/lib/tier-colors"
import { TopupForm } from "./topup-form"
import { MemberRow } from "./member-row"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export const metadata = { title: "สมาชิก · สุขกายา POS" }

export default async function MembersPage() {
  const supabase = await createClient()
  const today = todayInShopTz()

  // member_balances มีแถวละ "ลูกค้า" ไม่ใช่แถวละสมาชิก — ตอนนี้ 1,005 แถว เกินเพดาน
  // 1,000 แถวของ supabase-js ไปแล้ว ถ้าดึงทั้งหมดมากรองในหน้าเว็บ สมาชิกที่ชื่อเรียงท้ายสุด
  // จะถูกตัดทิ้งเงียบๆ แล้วยอดเครดิตคงค้างจะต่ำกว่าความจริงโดยไม่มีอะไรเตือน
  // จึงต้องกรองใน SQL ให้เหลือเฉพาะคนที่มีเครดิตจริง (42 แถว)
  const [{ data: active }, { data: topups }] = await Promise.all([
    supabase
      .from("member_balances")
      .select("customer_id, name, nickname, phone, credit_balance, next_expiry")
      .gt("credit_balance", 0)
      .order("name"),
    supabase
      .from("member_topups")
      .select("id, topup_date, tier, cash_received, credit_added, bonus_added, expiry_date, customer_id")
      .order("topup_date", { ascending: false })
      .limit(30),
  ])

  const members = active ?? []

  const totalOutstanding = members.reduce(
    (sum, m) => sum + (m.credit_balance ?? 0),
    0
  )

  // ประวัติการเติมเงินอาจมีคนที่ใช้เครดิตหมดแล้ว ซึ่งไม่อยู่ในรายการข้างบน
  // จึงดึงชื่อจากตาราง customers เฉพาะ id ที่ปรากฏในประวัติ 30 รายการล่าสุด
  const topupCustomerIds = [...new Set((topups ?? []).map((t) => t.customer_id))]
  const { data: topupCustomers } = topupCustomerIds.length
    ? await supabase.from("customers").select("id, name").in("id", topupCustomerIds)
    : { data: [] }

  const customerName = new Map(
    (topupCustomers ?? []).map((c) => [c.id, c.name])
  )

  // ระดับล่าสุดของสมาชิกที่ยังมีเครดิต — ใบเติมล่าสุดของแต่ละคนคือระดับปัจจุบัน
  // (ประวัติ 30 รายการข้างบนไม่พอ เพราะบางคนเติมครั้งล่าสุดนานแล้ว)
  const activeIds = members
    .map((m) => m.customer_id)
    .filter((id): id is string => id !== null)
  const { data: tierRows } = activeIds.length
    ? await supabase
        .from("member_topups")
        .select("customer_id, tier, topup_date")
        .in("customer_id", activeIds)
        .order("topup_date", { ascending: false })
    : { data: [] }
  // เรียงจากใหม่ไปเก่าแล้ว — แถวแรกของแต่ละคนคือใบล่าสุด
  const tierOf = new Map<string, string>()
  for (const t of tierRows ?? []) {
    if (!tierOf.has(t.customer_id)) tierOf.set(t.customer_id, t.tier)
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">ระบบสมาชิก</h1>

      <Tabs defaultValue="topup">
        <TabsList className="w-full">
          <TabsTrigger value="topup" className="flex-1">
            เติมเงิน
          </TabsTrigger>
          <TabsTrigger value="members" className="flex-1">
            สมาชิก ({members.length})
          </TabsTrigger>
          <TabsTrigger value="history" className="flex-1">
            ประวัติ
          </TabsTrigger>
        </TabsList>

        <TabsContent value="topup" className="pt-4">
          <TopupForm />
        </TabsContent>

        <TabsContent value="members" className="space-y-3 pt-4">
          <Card className="border-emerald-200 bg-emerald-50">
            <CardContent className="flex items-baseline justify-between py-4">
              <span className="text-sm font-medium">เครดิตคงค้างทั้งหมด</span>
              <span className="text-2xl font-bold text-emerald-800">
                {formatBaht(totalOutstanding)} ฿
              </span>
            </CardContent>
          </Card>
          <p className="text-xs text-slate-500">
            คือภาระที่ร้านต้องให้บริการในอนาคต ไม่ใช่รายได้
          </p>

          {members.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">
              ยังไม่มีสมาชิกที่มีเครดิตคงเหลือ
            </p>
          ) : (
            <ul className="space-y-2">
              {members.map((m) => (
                <li key={m.customer_id}>
                  <MemberRow
                    customerId={m.customer_id ?? ""}
                    name={m.name ?? "ไม่ระบุชื่อ"}
                    tier={
                      m.customer_id ? (tierOf.get(m.customer_id) ?? null) : null
                    }
                    balance={m.credit_balance ?? 0}
                    nextExpiry={m.next_expiry}
                    expiringSoon={
                      !!m.next_expiry && m.next_expiry <= addDays(today, 30)
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="history" className="pt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">ประวัติการเติมเงิน</CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              {(topups ?? []).length === 0 ? (
                <p className="px-6 py-6 text-center text-sm text-slate-500">
                  ยังไม่มีประวัติการเติมเงิน
                </p>
              ) : (
                <ul className="divide-y">
                  {(topups ?? []).map((t) => (
                    <li
                      key={t.id}
                      className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6"
                    >
                      <div className="min-w-0">
                        <p className="font-medium">
                          {customerName.get(t.customer_id) ?? "ไม่ระบุ"}{" "}
                          {/* สีเดียวกับ badge ในแท็บสมาชิก */}
                          <Badge
                            variant="outline"
                            className={TIER_COLOR[t.tier] ?? TIER_COLOR_DEFAULT}
                          >
                            {t.tier}
                          </Badge>
                        </p>
                        <p className="text-xs text-slate-500">
                          {formatThaiDate(t.topup_date)} · หมดอายุ{" "}
                          {formatThaiDate(t.expiry_date)}
                        </p>
                      </div>
                      <div className="text-right whitespace-nowrap">
                        <p className="font-semibold">
                          +{formatBaht(t.credit_added)} ฿
                        </p>
                        <p className="text-xs text-slate-500">
                          รับ {formatBaht(t.cash_received)} ฿
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
