import { createClient } from "@/lib/supabase/server"
import { formatBaht } from "@/lib/constants"
import { todayInShopTz } from "@/lib/datetime"
import { StatCard } from "@/components/stat-card"
import { TopupForm } from "./topup-form"
import { MemberList } from "./member-list"
import { TopupHistoryList, type TopupRow } from "./topup-history-list"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { MemberListItem } from "@/lib/member-list"

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
  const expiringSoonCount = members.filter(
    (m) => !!m.next_expiry && m.next_expiry <= addDays(today, 30)
  ).length

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

  const tierCounts = new Map<string, number>()
  for (const m of members) {
    const tier = m.customer_id ? (tierOf.get(m.customer_id) ?? null) : null
    if (tier) tierCounts.set(tier, (tierCounts.get(tier) ?? 0) + 1)
  }
  const tierSummary =
    [...tierCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([tier, n]) => `${tier} ${n}`)
      .join(" · ") || "—"

  const memberItems: MemberListItem[] = members.map((m) => ({
    customerId: m.customer_id ?? "",
    name: m.name ?? "ไม่ระบุชื่อ",
    nickname: m.nickname,
    phone: m.phone,
    tier: m.customer_id ? (tierOf.get(m.customer_id) ?? null) : null,
    balance: m.credit_balance ?? 0,
    nextExpiry: m.next_expiry,
  }))

  const topupRows: TopupRow[] = (topups ?? []).map((t) => ({
    id: t.id,
    customerName: customerName.get(t.customer_id) ?? "ไม่ระบุ",
    tier: t.tier,
    topupDate: t.topup_date,
    expiryDate: t.expiry_date,
    creditAdded: t.credit_added,
    cashReceived: t.cash_received,
  }))

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">ระบบสมาชิก</h1>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard label="สมาชิกมีเครดิต" value={`${members.length} คน`} />
        <StatCard
          label="เครดิตคงค้างทั้งหมด"
          value={`${formatBaht(totalOutstanding)} ฿`}
          hint="ภาระที่ร้านต้องให้บริการในอนาคต ไม่ใช่รายได้"
          tone="warn"
        />
        <StatCard
          label="ใกล้หมดอายุ (30 วัน)"
          value={`${expiringSoonCount} คน`}
          tone={expiringSoonCount > 0 ? "warn" : "normal"}
        />
        <StatCard label="แยกตามระดับ" value={tierSummary} />
      </div>

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

        <TabsContent value="members" className="pt-4">
          <MemberList members={memberItems} today={today} />
        </TabsContent>

        <TabsContent value="history" className="pt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">ประวัติการเติมเงิน</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 sm:px-6">
              <TopupHistoryList topups={topupRows} />
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
