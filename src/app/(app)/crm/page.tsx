import Link from "next/link"

import { createClient } from "@/lib/supabase/server"
import { getMyProfile } from "@/lib/auth"
import { todayInShopTz, formatThaiDate } from "@/lib/datetime"
import { formatBaht } from "@/lib/constants"
import { birthdayWithinDays, daysUntilBirthday } from "@/lib/crm"
import { birthdayCoverage } from "@/lib/birthday-coverage"
import { daysSince, dormantCutoff } from "@/lib/insights"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { canSeeInsights, InsightsAccessDenied } from "../insights/shared"
import { CrmList, type CrmRow } from "./crm-list"
import { CustomerInsights } from "./customer-insights"

export const metadata = { title: "ดูแลลูกค้า · สุขกายา POS" }

const LIST_CAP = 30
/** ติดต่อแล้ว (ไม่ว่าผลอะไร) เว้น 30 วันก่อนขึ้นลิสต์ประเภทเดิมอีก */
const CONTACT_COOLDOWN_DAYS = 30

/** แท็บบนหัวหน้าดูแลลูกค้า — ลงมือ (ทุกคน) / วิเคราะห์ (manager+) */
function PageTabs({ active, showInsights }: { active: "contact" | "insights"; showInsights: boolean }) {
  const cls = (a: boolean) =>
    `flex-1 rounded-md border px-3 py-2 text-center text-sm ${
      a
        ? "border-[#664343] bg-[#FFF0D1]/60 font-medium text-[#664343]"
        : "text-slate-600 hover:bg-slate-50"
    }`
  return (
    <div className="flex gap-2">
      <Link href="/crm" className={cls(active === "contact")}>
        📞 ต้องติดต่อวันนี้
      </Link>
      {showInsights && (
        <Link href="/crm?tab=insights" className={cls(active === "insights")}>
          📈 วิเคราะห์ลูกค้า
        </Link>
      )}
    </div>
  )
}

export default async function CrmPage({
  searchParams,
}: {
  searchParams: Promise<{ gone?: string; tab?: string; sub?: string; days?: string }>
}) {
  const { gone, tab, sub, days } = await searchParams
  const profile = await getMyProfile()
  const showInsights = canSeeInsights(profile?.role)

  // แท็บวิเคราะห์ — เนื้อหาเดิมของ /insights/customers ย้ายมาอยู่ที่นี่ (สเปก 2026-08-02)
  if (tab === "insights") {
    if (!showInsights) return <InsightsAccessDenied title="วิเคราะห์ลูกค้า" />
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <div>
          <h1 className="text-xl font-bold">ดูแลลูกค้า 💚</h1>
          <p className="text-sm text-slate-600">
            มุมวิเคราะห์ — ใครมียอดสะสมสูง ใครหายไปนานควรตามกลับ
          </p>
        </div>
        <PageTabs active="insights" showInsights />
        <CustomerInsights sub={sub} days={days} />
      </div>
    )
  }

  const goneDays = [30, 60, 90].includes(Number(gone)) ? Number(gone) : 60
  const supabase = await createClient()
  const today = todayInShopTz()

  // นับถอยจากวันที่ของร้าน ไม่ใช่ Date.now() — ค่าคงที่ตลอดการ render หนึ่งครั้ง
  const cooldownSince = new Date(
    Date.parse(`${today}T00:00:00Z`) - CONTACT_COOLDOWN_DAYS * 86400000
  ).toISOString()
  // ช่วงที่การ์ดสถิติวันเกิดมองย้อน — 90 วันพอเห็นแนวโน้มโดยไม่ดึงข้อมูลเกินจำเป็น
  const COVERAGE_DAYS = 90
  const coverageSince = new Date(
    Date.parse(`${today}T00:00:00Z`) - (COVERAGE_DAYS + 1) * 86400000
  ).toISOString()
  const [{ data: birthdayCustomers }, { data: dormant }, { data: newcomers }, { data: recentContacts }, { data: lineAccounts }, { data: birthdayContacts }] =
    await Promise.all([
      supabase
        .from("customers")
        .select("id, name, nickname, phone, birthday")
        .not("birthday", "is", null)
        .not("phone", "is", null),
      supabase
        .from("v_customer_ltv")
        .select("customer_id, name, nickname, phone, visits, lifetime_value, last_visit")
        .gte("visits", 2)
        .lt("last_visit", dormantCutoff(today, goneDays))
        .not("phone", "is", null)
        .order("lifetime_value", { ascending: false })
        .limit(LIST_CAP * 2),
      supabase
        .from("v_customer_ltv")
        .select("customer_id, name, nickname, phone, first_visit")
        .eq("visits", 1)
        .gte("first_visit", dormantCutoff(today, 14))
        .lt("first_visit", dormantCutoff(today, 5))
        .not("phone", "is", null)
        .limit(LIST_CAP * 2),
      supabase
        .from("crm_contacts")
        .select("customer_id, list_type")
        .gte("created_at", cooldownSince),
      supabase
        .from("line_accounts")
        .select("line_user_id, customer_id, created_at")
        .order("created_at", { ascending: true }),
      // ประวัติอวยพรวันเกิด 90 วัน — ใช้ทำการ์ด "ส่งครบตามแผนแค่ไหน"
      // (ช่วงยาวกว่า cooldown ข้างบนที่ดูแค่ 30 วันเพื่อกันชื่อซ้ำ)
      supabase
        .from("crm_contacts")
        .select("customer_id, created_at")
        .eq("list_type", "birthday")
        .gte("created_at", coverageSince),
    ])

  const contacted = new Set(
    (recentContacts ?? []).map((c) => `${c.list_type}|${c.customer_id}`)
  )

  // ลูกค้าหนึ่งคนอาจผูกหลายไลน์ — เรียงเก่า→ใหม่แล้ว set ทับ เหลือตัวล่าสุด
  const lineByCustomer = new Map<string, string>()
  for (const a of lineAccounts ?? []) {
    if (a.customer_id) lineByCustomer.set(a.customer_id, a.line_user_id)
  }

  // ส่งอวยพรครบตามแผนแค่ไหน — วัดจากที่บันทึกจริง ไม่นับวันเกิดของวันนี้ (ยังส่งทัน)
  const coverage = birthdayCoverage(
    birthdayCustomers ?? [],
    birthdayContacts ?? [],
    today,
    COVERAGE_DAYS
  )

  const birthdayRows: CrmRow[] = (birthdayCustomers ?? [])
    .filter((c) => c.birthday && birthdayWithinDays(c.birthday, today, 7))
    .filter((c) => !contacted.has(`birthday|${c.id}`))
    .map((c) => {
      const days = daysUntilBirthday(c.birthday!, today)
      return {
        days,
        row: {
          customerId: c.id,
          name: c.name,
          nickname: c.nickname,
          phone: c.phone!,
          reason:
            days === 0
              ? "🎂 วันเกิดวันนี้!"
              : days === 1
                ? "🎂 วันเกิดพรุ่งนี้"
                : `🎂 วันเกิดอีก ${days} วัน (${formatThaiDate(c.birthday!)})`,
          lineUserId: lineByCustomer.get(c.id),
        } satisfies CrmRow,
      }
    })
    .sort((a, b) => a.days - b.days)
    .slice(0, LIST_CAP)
    .map((x) => x.row)

  const winbackRows: CrmRow[] = (dormant ?? [])
    .filter((c) => c.customer_id && !contacted.has(`winback|${c.customer_id}`))
    .slice(0, LIST_CAP)
    .map((c) => ({
      customerId: c.customer_id!,
      name: c.name ?? "ไม่ระบุชื่อ",
      nickname: c.nickname,
      phone: c.phone!,
      reason: `💤 หายไป ${daysSince(c.last_visit!, today)} วัน · มา ${c.visits} ครั้ง · ยอดสะสม ${formatBaht(Number(c.lifetime_value))} ฿`,
      lineUserId: lineByCustomer.get(c.customer_id!),
    }))

  const newRows: CrmRow[] = (newcomers ?? [])
    .filter((c) => c.customer_id && !contacted.has(`new_follow|${c.customer_id}`))
    .slice(0, LIST_CAP)
    .map((c) => ({
      customerId: c.customer_id!,
      name: c.name ?? "ไม่ระบุชื่อ",
      nickname: c.nickname,
      phone: c.phone!,
      reason: `🌱 มาครั้งแรกเมื่อ ${daysSince(c.first_visit!, today)} วันก่อน — โทรตามผล ชวนกลับ`,
      lineUserId: lineByCustomer.get(c.customer_id!),
    }))

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-bold">ดูแลลูกค้า 💚</h1>
        <p className="text-sm text-slate-600">
          รายชื่อที่ควรติดต่อวันนี้ — โทร/ทักแล้วกดบันทึกผล ชื่อจะไม่ขึ้นซ้ำ 30 วัน
        </p>
      </div>

      <PageTabs active="contact" showInsights={showInsights} />

      <Card className="border-pink-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            🎂 วันเกิดสัปดาห์นี้ ({birthdayRows.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CrmList rows={birthdayRows} listType="birthday" />
          {birthdayRows.length === 0 && (
            <p className="-mt-6 pb-2 text-center text-xs text-slate-400">
              เก็บวันเกิดเพิ่มได้ในหน้าแก้ไขข้อมูลลูกค้า
            </p>
          )}
        </CardContent>
      </Card>

      {/* ทำได้ตามแผนแค่ไหน — ตัวเลขจากที่บันทึกจริง ไม่ใช่ความรู้สึก
          วันเกิดของวันนี้ไม่ถูกนับว่าตกหล่น เพราะยังส่งทันอยู่ (การ์ดด้านบนเตือนอยู่แล้ว) */}
      {coverage.total > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              📊 ส่งอวยพรทัน {coverage.greeted} จาก {coverage.total} คน ({coverage.pct}%)
            </CardTitle>
            <p className="text-xs text-slate-500">
              {COVERAGE_DAYS} วันล่าสุด · ส่งวันเกิดหรือช้าไม่เกิน 1 วัน นับว่าทัน
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-2 rounded-full ${coverage.pct >= 80 ? "bg-emerald-500" : coverage.pct >= 50 ? "bg-amber-500" : "bg-red-400"}`}
                style={{ width: `${coverage.pct}%` }}
              />
            </div>
            {coverage.missed.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer text-slate-600">
                  ตกหล่น {coverage.missed.length} คน — ดูรายชื่อ
                </summary>
                <ul className="pt-1.5 text-xs text-slate-500">
                  {coverage.missed.slice(0, 20).map((m) => (
                    <li key={`${m.customerId}-${m.date}`} className="py-0.5">
                      {formatThaiDate(m.date)} · {m.name}
                    </li>
                  ))}
                </ul>
                <p className="pt-1 text-[11px] text-slate-400">
                  ผ่านไปแล้วส่งย้อนหลังไม่ได้ — แต่ตัวเลขนี้จะบอกได้ว่าเดือนหน้าดีขึ้นไหม
                </p>
              </details>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="border-amber-200">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-base">
            <span>💤 หายไปนาน ({winbackRows.length})</span>
            <span className="flex gap-1">
              {[30, 60, 90].map((d) => (
                <Link
                  key={d}
                  href={`/crm?gone=${d}`}
                  className={`rounded-full px-3 py-1 text-xs ${
                    goneDays === d
                      ? "bg-amber-600 text-white"
                      : "bg-amber-50 text-amber-800"
                  }`}
                >
                  {d}+ วัน
                </Link>
              ))}
            </span>
          </CardTitle>
          <p className="text-xs text-slate-500">
            เรียงยอดสะสมมากก่อน — ลูกค้าคนสำคัญได้รับการดูแลก่อน
          </p>
        </CardHeader>
        <CardContent>
          <CrmList rows={winbackRows} listType="winback" />
        </CardContent>
      </Card>

      <Card className="border-emerald-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            🌱 ลูกค้าใหม่รอตามผล ({newRows.length})
          </CardTitle>
          <p className="text-xs text-slate-500">
            มาครั้งแรกเมื่อ 5-14 วันก่อน — โทรถามผล ชวนกลับมาครั้งที่สอง
          </p>
        </CardHeader>
        <CardContent>
          <CrmList rows={newRows} listType="new_follow" />
        </CardContent>
      </Card>
    </div>
  )
}
