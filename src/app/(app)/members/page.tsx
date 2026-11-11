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
import { isCreditFrozen } from "@/lib/member-credit"
import { summarizeMemberExpiry } from "@/lib/credit-expiry"

export const metadata = { title: "สมาชิก · สุขกายา POS" }

export default async function MembersPage() {
  const supabase = await createClient()
  const today = todayInShopTz()

  // member_balances มีแถวละ "ลูกค้า" ไม่ใช่แถวละสมาชิก — ตอนนี้ 1,005 แถว เกินเพดาน
  // 1,000 แถวของ supabase-js ไปแล้ว ถ้าดึงทั้งหมดมากรองในหน้าเว็บ สมาชิกที่ชื่อเรียงท้ายสุด
  // จะถูกตัดทิ้งเงียบๆ แล้วยอดเครดิตคงค้างจะต่ำกว่าความจริงโดยไม่มีอะไรเตือน
  // จึงต้องกรองใน SQL ให้เหลือเฉพาะคนที่มีเครดิตจริง (42 แถว)
  const [{ data: active }, { data: topups }, { data: usableBuckets }] = await Promise.all([
    supabase
      .from("member_balances")
      .select("customer_id, name, nickname, phone, credit_balance, next_expiry, credit_expired")
      .gt("credit_balance", 0)
      .order("name"),
    supabase
      .from("member_topups")
      .select("id, topup_date, tier, cash_received, credit_added, bonus_added, expiry_date, customer_id, payment_method")
      .order("topup_date", { ascending: false })
      .limit(30),
    // ใบที่ยังใช้ได้รายใบ — "ใกล้หมดอายุ" ต้องคิดจากใบใกล้สุด ไม่ใช่ next_expiry ของ
    // member_balances ซึ่งเป็นใบไกลสุด (ไว้คิดสูตรแช่แข็ง) ไม่งั้นคนที่มีใบจะหมดใน 5 วัน
    // แต่มีอีกใบอยู่ได้เป็นปี จะไม่ถูกเตือนเลย — ตรรกะเดียวกับหน้า /crm และ cron เช้า
    supabase
      .from("v_topup_balances")
      .select("topup_id, customer_id, expiry_date, remaining")
      .eq("is_active", true)
      .gt("remaining", 0)
      .gte("expiry_date", today),
  ])

  const members = active ?? []

  // เครดิตแช่แข็ง (หมดอายุแล้วแต่ยอดยังอยู่) ใช้จริงไม่ได้ — โชว์รวมกับยอดใช้ได้เป็นก้อนเดียว
  // จะทำให้เจ้าของร้านเข้าใจผิดว่าเรียกคืนบริการได้เท่านี้ ทั้งที่ส่วนแช่แข็งต้องรอลูกค้าเติมแพ็กเกจใหม่ก่อน
  // ใช้ isCreditFrozen แทนเช็ค credit_expired ตรงๆ — จุดตัดสินใจเดียวกับทุกหน้าจอ (POS, หน้าลูกค้า,
  // ตารางลูกค้า) กันไว้ไม่ให้แถวยอด 0 (ถ้า query ต้นทางเปลี่ยนจนหลุด .gt("credit_balance", 0) ในอนาคต)
  // ถูกนับผิดเป็น "แช่แข็ง" ทั้งที่ไม่มีอะไรให้ปลดล็อก
  const usableCredit = members
    .filter((m) => !isCreditFrozen(m.credit_balance ?? 0, m.credit_expired ?? false))
    .reduce((sum, m) => sum + (m.credit_balance ?? 0), 0)
  const frozenCredit = members
    .filter((m) => isCreditFrozen(m.credit_balance ?? 0, m.credit_expired ?? false))
    .reduce((sum, m) => sum + (m.credit_balance ?? 0), 0)
  // "ใกล้หมดอายุ" คิดจากใบใกล้สุดรายใบ (summarizeMemberExpiry) — เดิมคิดจาก next_expiry
  // ของ member_balances ซึ่งเป็นใบไกลสุด ทำให้นับขาดคนที่ใบแรกกำลังจะหมดแต่มีใบยาวค้ำอยู่
  // คนแช่แข็งไม่มีใบที่ยังใช้ได้ จึงหลุดจากแผนที่นี้เองโดยไม่ต้องเช็ค isCreditFrozen ซ้ำ
  const expirySummary = summarizeMemberExpiry(
    (usableBuckets ?? [])
      .filter((b) => b.topup_id && b.customer_id && b.expiry_date)
      .map((b) => ({
        topupId: String(b.topup_id),
        customerId: String(b.customer_id),
        expiryDate: String(b.expiry_date),
        remaining: Number(b.remaining ?? 0),
      })),
    today
  )
  const expiringMembers = [...expirySummary.values()].filter((s) => s.expiringAmount > 0)
  const expiringSoonCount = expiringMembers.length
  const expiringSoonTotal = expiringMembers.reduce((sum, s) => sum + s.expiringAmount, 0)

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

  const memberItems: MemberListItem[] = members.map((m) => {
    const s = m.customer_id ? expirySummary.get(m.customer_id) : undefined
    return {
      customerId: m.customer_id ?? "",
      name: m.name ?? "ไม่ระบุชื่อ",
      nickname: m.nickname,
      phone: m.phone,
      tier: m.customer_id ? (tierOf.get(m.customer_id) ?? null) : null,
      balance: m.credit_balance ?? 0,
      // ใบใกล้สุดที่ยังใช้ได้ — คนแช่แข็ง (ไม่มีใบใช้ได้) เป็น null ให้ชิป "แช่แข็ง" จับแทน
      nextExpiry: s?.nearestExpiry ?? null,
      daysLeft: s?.daysLeft ?? null,
      expiringAmount: s?.expiringAmount ?? 0,
      expired: isCreditFrozen(m.credit_balance ?? 0, m.credit_expired ?? false),
    }
  })

  const topupRows: TopupRow[] = (topups ?? []).map((t) => ({
    id: t.id,
    customerName: customerName.get(t.customer_id) ?? "ไม่ระบุ",
    tier: t.tier,
    topupDate: t.topup_date,
    expiryDate: t.expiry_date,
    creditAdded: t.credit_added,
    cashReceived: t.cash_received,
    paymentMethod: t.payment_method,
  }))

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">ระบบสมาชิก</h1>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard label="สมาชิกมีเครดิต" value={`${members.length} คน`} />
        <StatCard
          label="เครดิตคงค้าง"
          value={`ใช้ได้ ${formatBaht(usableCredit)} ฿ · แช่แข็ง ${formatBaht(frozenCredit)} ฿`}
          hint="ภาระที่ร้านต้องให้บริการในอนาคต ไม่ใช่รายได้ · แช่แข็ง = หมดอายุ รอเติมแพ็กเกจใหม่ปลดล็อก"
          tone="warn"
        />
        <StatCard
          label="ใกล้หมดอายุ (30 วัน)"
          value={
            expiringSoonCount > 0
              ? `${expiringSoonCount} คน · ${formatBaht(expiringSoonTotal)} ฿`
              : "0 คน"
          }
          hint="คิดจากใบเติมใกล้สุดรายใบ — กรองรายชื่อได้ในแท็บสมาชิก"
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
          <MemberList members={memberItems} />
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
