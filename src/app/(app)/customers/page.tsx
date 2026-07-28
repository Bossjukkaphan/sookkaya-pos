import Link from "next/link"

import { createClient } from "@/lib/supabase/server"
import { formatBaht } from "@/lib/constants"
import { todayInShopTz } from "@/lib/datetime"
import { ISSUES, type IssueKey, issueBadgeClass } from "@/lib/customer-issues"
import { StatCard } from "@/components/stat-card"
import { InfoDot } from "@/components/info-dot"
import { PagerLink } from "@/components/pager-link"
import { Button } from "@/components/ui/button"
import { CustomerSearch } from "./customer-search"
import { CustomerTable } from "./customer-table"

/**
 * รายชื่อลูกค้า + ป้ายบอกปัญหาข้อมูล
 *
 * เป็น server component ล้วน — สถานะทั้งหมด (คำค้น ประเภท ปัญหา การเรียง หน้า) อยู่ใน URL
 * ไม่ใช่ใน state ฝั่งไคลเอนต์ เพราะพนักงานต้องส่งลิงก์ "ลูกค้าเบอร์ซ้ำหน้า 2" ให้กันแก้ได้
 * และเพราะข้อมูล 1,046 คนกรองในเบราว์เซอร์ไม่ไหวอยู่แล้ว
 */

export const metadata = { title: "ลูกค้า · สุขกายา POS" }

const PER_PAGE = 50

/** คอลัมน์ที่เรียงได้ → ชื่อคอลัมน์จริงใน view + ทิศทาง
 *  คีย์ต้องตรงกับ HEADS ใน customer-table.tsx ไม่งั้นกดหัวคอลัมน์แล้วเงียบ */
const SORTS: Record<string, { column: string; asc: boolean }> = {
  name: { column: "name", asc: true },
  phone: { column: "phone", asc: true },
  type: { column: "customer_type", asc: true },
  balance: { column: "credit_balance", asc: false },
  visits: { column: "visits", asc: false },
  last_visit: { column: "last_visit", asc: false },
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string
    type?: string
    sort?: string
    issue?: string
    page?: string
  }>
}) {
  const supabase = await createClient()
  const sp = await searchParams
  const term = sp.q?.trim() ?? ""
  const type = sp.type === "member" || sp.type === "regular" ? sp.type : ""
  const issue = ISSUES.some((i) => i.key === sp.issue) ? (sp.issue as IssueKey) : ""
  const page = Math.max(1, Number(sp.page) || 1)

  // การเรียงที่ "ผู้ใช้เลือกเอง" กับที่ "หน้านี้ใช้จริง" ต้องแยกกัน
  // rawSort คือสิ่งที่ติดอยู่ใน URL — อย่างอื่นทั้งหมด (ลิงก์ชิพ ลิงก์หน้าถัดไป ช่องค้นหา)
  // ต้องพกตัวนี้ไป ไม่ใช่ตัวที่ถูกบังคับ ไม่งั้นพอเลิกกรองเบอร์ซ้ำ การเรียงตามเบอร์จะค้างอยู่
  // ทั้งที่ผู้ใช้ไม่เคยสั่ง
  const rawSort = sp.sort && sp.sort in SORTS ? sp.sort : ""

  // กรองเบอร์ซ้ำต้องเรียงตามเบอร์เสมอ ไม่งั้นคู่เดียวกันอยู่คนละหน้าจนตรวจไม่ได้
  // (เช่น "แมน" กับ "พี พีรดา" ที่ใช้เบอร์เดียวกัน ถ้าเรียงตามชื่อจะห่างกันหลายหน้า)
  const forcedPhoneSort = issue === "dup_phone"
  const sort = forcedPhoneSort ? "phone" : rawSort || "name"

  const today = todayInShopTz()
  const monthStartIso = `${today.slice(0, 7)}-01T00:00:00+07:00`

  /** ตัวกรองร่วมของ "แถวในตาราง" กับ "เลขบนชิพ" — ต้องออกมาจากที่เดียว
   *  ถ้าเขียนแยกกัน วันหนึ่งจะหลุดออกจากกันแล้วเลขบนชิพโกหกโดยไม่มีอะไรเตือน */
  function scopedQuery(head: boolean) {
    let q = supabase.from("v_customer_issues").select("*", { count: "exact", head })
    if (term) {
      q = q.or(`name.ilike.%${term}%,nickname.ilike.%${term}%,phone.ilike.%${term}%`)
    }
    if (type === "member") q = q.eq("customer_type", "สมาชิก")
    if (type === "regular") q = q.eq("customer_type", "ลูกค้าทั่วไป")
    return q
  }

  let rowQuery = scopedQuery(false)
  if (issue) rowQuery = rowQuery.eq(issue, true)

  const s = SORTS[sort]
  const pageQuery = rowQuery
    .order(s.column, { ascending: s.asc, nullsFirst: false })
    // ตัวตัดสินสำรอง — คอลัมน์หลักซ้ำกันได้เยอะ (คนไม่เคยมาเลย last_visit เป็น null หมด)
    // ถ้าไม่มีอันนี้ ลำดับของแถวที่เท่ากันจะไม่คงที่ระหว่าง query คนละครั้ง
    // แล้วลูกค้าคนเดียวกันจะโผล่ทั้งหน้า 1 และหน้า 2 ส่วนอีกคนหายไปเลย
    .order("customer_id", { ascending: true })
    .range((page - 1) * PER_PAGE, page * PER_PAGE - 1)

  // นับเลขบนชิพทีละธง — head:true ไม่ดึงแถวจริง จึงเบา
  // นับ "ภายใต้คำค้น/ประเภทที่กรองอยู่" ไม่ใช่ทั้งร้าน เพราะเลขบนชิพคือคำสัญญาว่ากดแล้วจะเจอเท่านี้
  // ถ้าเห็น 89 แล้วกดได้ 3 พนักงานจะเลิกเชื่อตัวเลขทั้งแถวทันที
  const issueCountQueries = ISSUES.map((i) => scopedQuery(true).eq(i.key, true))

  const [
    { data: rows, count },
    { count: totalCustomers },
    { count: totalMembers },
    { count: newThisMonth },
    { data: creditRows },
    ...issueCounts
  ] = await Promise.all([
    pageQuery,
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
    ...issueCountQueries,
  ])

  const totalOutstanding = (creditRows ?? []).reduce(
    (sum, r) => sum + (r.credit_balance ?? 0),
    0
  )
  const list = rows ?? []
  const total = count ?? list.length
  const from = total === 0 ? 0 : (page - 1) * PER_PAGE + 1
  const to = Math.min(page * PER_PAGE, total)

  /** ทำ query string ใหม่โดยคงตัวกรองอื่นไว้ — เปลี่ยนอย่างหนึ่งแล้วอย่างอื่นต้องไม่หลุด
   *  ส่ง page: null มาด้วยทุกครั้งที่เปลี่ยน "ชุดผลลัพธ์" ไม่งั้นค้างอยู่หน้า 2 ของผลลัพธ์เก่า
   *  ซึ่งมักว่างเปล่า แล้วดูเหมือนตัวกรองพัง */
  function hrefWith(patch: Record<string, string | null>) {
    const next = new URLSearchParams()
    if (term) next.set("q", term)
    if (type) next.set("type", type)
    if (issue) next.set("issue", issue)
    if (rawSort) next.set("sort", rawSort)
    if (page > 1) next.set("page", String(page))
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k)
      else next.set(k, v)
    }
    const qs = next.toString()
    return qs ? `/customers?${qs}` : "/customers"
  }

  // ลิงก์หัวคอลัมน์ประกอบเองใน CustomerTable โดยเติม sort ทับ — ตรงนี้จึงส่งทุกอย่าง "ยกเว้น" sort
  // และยกเว้น page ด้วย เพราะเปลี่ยนการเรียงแล้วต้องกลับไปหน้า 1
  const tableQuery = new URLSearchParams()
  if (term) tableQuery.set("q", term)
  if (type) tableQuery.set("type", type)
  if (issue) tableQuery.set("issue", issue)

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

      {/* ช่องค้นหาต้องพก issue ไปด้วย ไม่งั้นคนที่กำลังไล่แก้เบอร์ซ้ำแล้วพิมพ์ค้นหา ตัวกรองจะหลุด
          ส่ง rawSort (ไม่ใช่ sort ที่ถูกบังคับ) เพราะ URL ควรเก็บแต่สิ่งที่ผู้ใช้สั่งเอง */}
      <CustomerSearch initialTerm={term} type={type} sort={rawSort} issue={issue} />

      {/* ชิพกรองปัญหา — กดได้ทีละอัน กดซ้ำคือยกเลิก
          InfoDot ไม่ใช่ของฟุ่มเฟือย: คำอธิบายว่าป้ายแต่ละอันแปลว่าอะไรส่งผ่าน title ไม่ได้
          เพราะพนักงานใช้มือถือเป็นหลัก ซึ่งแตะแล้ว tooltip ไม่ขึ้น
          คั่นด้วย · บรรทัดเดียว เพราะกล่องของ InfoDot ไม่ได้เปิด whitespace-pre-line ไว้
          ใส่ \n ไปก็ยุบเป็นช่องว่างเฉยๆ */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1 text-xs text-slate-500">
          สถานะข้อมูล
          <InfoDot text={ISSUES.map((i) => `${i.label} = ${i.why}`).join(" · ")} />
        </span>
        {ISSUES.map((def, i) => {
          const n = issueCounts[i]?.count ?? 0
          const active = issue === def.key
          return (
            <Link
              key={def.key}
              href={hrefWith({ issue: active ? null : def.key, page: null })}
              title={def.why}
              className={`inline-flex min-h-10 items-center rounded-full border px-3 text-sm ${
                active
                  ? `font-bold ${issueBadgeClass(def.tone)}`
                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {def.label}
              <span className="ml-1.5 font-bold">{n}</span>
            </Link>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500">ประเภท</span>
        {[
          { value: "", label: "ทุกประเภท" },
          { value: "member", label: "เฉพาะสมาชิก" },
          { value: "regular", label: "เฉพาะทั่วไป" },
        ].map((t) => (
          <Link
            key={t.value}
            href={hrefWith({ type: t.value || null, page: null })}
            className={`inline-flex min-h-10 items-center rounded-full border px-3 text-sm ${
              type === t.value
                ? "border-slate-800 bg-slate-800 font-semibold text-white"
                : "border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <p className="text-xs text-slate-500">
        พบ {total.toLocaleString()} คน
        {/* ผูกกับจำนวนแถวที่แสดงจริง ไม่ใช่ total — ถ้าใครแก้ ?page= เกินหน้าสุดท้ายด้วยมือ
            ช่วง "แสดง 4901–200" จะโผล่มาแทนที่จะเงียบไป */}
        {list.length > 0 && ` · แสดง ${from.toLocaleString()}–${to.toLocaleString()}`}
        {forcedPhoneSort && " · เรียงตามเบอร์ให้คู่เดียวกันอยู่ติดกัน"}
      </p>

      {list.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">
          {term || type || issue ? "ไม่พบลูกค้าตามเงื่อนไข" : "ยังไม่มีข้อมูลลูกค้า"}
        </p>
      ) : (
        <>
          <CustomerTable
            rows={list}
            sort={sort}
            query={tableQuery}
            groupByPhone={forcedPhoneSort}
          />
          {total > PER_PAGE && (
            <div className="flex items-center justify-between gap-2">
              {/* ย้อนกลับถึงหน้า 1 แล้วตัด page ทิ้ง — ลิงก์ที่พนักงานก๊อปส่งกันจะได้ไม่มีขยะติดไป */}
              {page > 1 ? (
                <PagerLink
                  href={hrefWith({ page: page - 1 > 1 ? String(page - 1) : null })}
                  aria-label="หน้าก่อนหน้า"
                >
                  ← ก่อนหน้า
                </PagerLink>
              ) : (
                <span />
              )}
              <span className="text-xs text-slate-500">
                หน้า {page} จาก {Math.ceil(total / PER_PAGE)}
              </span>
              {to < total ? (
                <PagerLink href={hrefWith({ page: String(page + 1) })} aria-label="หน้าถัดไป">
                  ถัดไป →
                </PagerLink>
              ) : (
                <span />
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
