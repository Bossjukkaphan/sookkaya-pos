import Link from "next/link"
import { notFound } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { formatThaiDate } from "@/lib/datetime"
import { formatBaht } from "@/lib/constants"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CustomerForm } from "../customer-form"
import { PointsAdjust } from "../points-adjust"
import { MergeCustomers } from "../merge-customers"

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const [
    { data: customer },
    { data: balance },
    { data: sales },
    { data: pointBalance },
    { data: pointHistory },
    { data: lineAccount },
    { data: crmContacts },
  ] = await Promise.all([
    supabase.from("customers").select("*").eq("id", id).single(),
    supabase
      .from("member_balances")
      .select("credit_balance, credit_granted, bonus_granted, cash_paid, next_expiry")
      .eq("customer_id", id)
      .single(),
    supabase
      .from("sales")
      .select("id, sale_date, service_name, net_amount, payment_method")
      .eq("customer_id", id)
      .order("sale_date", { ascending: false })
      .limit(50),
    supabase
      .from("v_point_balances")
      .select("balance")
      .eq("customer_id", id)
      .maybeSingle(),
    supabase
      .from("point_transactions")
      .select("delta, reason, created_at")
      .eq("customer_id", id)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("line_accounts")
      .select("display_name, picture_url")
      .eq("customer_id", id)
      .maybeSingle(),
    supabase
      .from("crm_contacts")
      .select("list_type, result, created_by, created_at")
      .eq("customer_id", id)
      .order("created_at", { ascending: false })
      .limit(10),
  ])

  if (!customer) notFound()

  const credit = balance?.credit_balance ?? 0
  const bonusGranted = balance?.bonus_granted ?? 0
  const totalSpent = (sales ?? []).reduce(
    (sum, s) => sum + Number(s.net_amount),
    0
  )

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/customers" className="text-sm text-slate-600 hover:underline">
        ← กลับไปรายชื่อลูกค้า
      </Link>

      <div>
        <h1 className="text-xl font-bold">
          {customer.name}
          {customer.nickname && (
            <span className="font-normal text-slate-500"> ({customer.nickname})</span>
          )}
        </h1>
        <p className="text-sm text-slate-600">
          {customer.phone ?? "ไม่มีเบอร์โทร"}
          {customer.line_id && ` · LINE ${customer.line_id}`}
        </p>
        {lineAccount && (
          <p className="mt-1 flex items-center gap-2 text-sm text-emerald-700">
            {lineAccount.picture_url && (
              // รูปโปรไฟล์ไลน์เป็นโดเมนภายนอก — ใช้ img ธรรมดา ไม่ผ่านตัว optimize
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={lineAccount.picture_url}
                alt=""
                className="h-6 w-6 rounded-full"
              />
            )}
            ผูกไลน์แล้ว: {lineAccount.display_name ?? "(ไม่ทราบชื่อไลน์)"}
          </p>
        )}
        {/* ลูกค้าใหม่จากไลน์ยังใช้ชื่อโปรไฟล์ไลน์เป็นชื่อลูกค้าอยู่ — ชวนแก้เป็นชื่อจริง
            (ชื่อไลน์ถูกเก็บแยกไว้เสมอ แก้ชื่อลูกค้าแล้วไม่กระทบการผูกบัญชี) */}
        {lineAccount && customer.name === lineAccount.display_name && (
          <p className="mt-1 text-xs text-amber-700">
            💡 ชื่อลูกค้าคนนี้ตั้งจากชื่อไลน์อัตโนมัติ — กด &quot;แก้ไข&quot;
            เปลี่ยนเป็นชื่อจริงได้ (การผูกไลน์และชื่อไลน์ยังอยู่ครบ)
          </p>
        )}
        <div className="mt-2 flex items-center gap-2">
          <Badge variant="secondary">{customer.customer_type}</Badge>
          <CustomerForm customer={customer} />
          <MergeCustomers targetId={customer.id} targetName={customer.name} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-slate-600">เครดิตคงเหลือ</p>
            <p className="text-2xl font-bold text-emerald-800">
              {formatBaht(credit)} ฿
            </p>
            {bonusGranted > 0 && (
              <p className="text-xs text-slate-500">
                (เคยได้โบนัสรวม {formatBaht(bonusGranted)} ฿ — รวมอยู่ในเครดิตแล้ว)
              </p>
            )}
            {balance?.next_expiry && (
              <p className="text-xs text-amber-700">
                หมดอายุ {formatThaiDate(balance.next_expiry)}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-slate-600">ยอดใช้จ่ายสะสม</p>
            <p className="text-2xl font-bold">{formatBaht(totalSpent)} ฿</p>
            <p className="text-xs text-slate-500">
              {(sales ?? []).length} ครั้ง
            </p>
          </CardContent>
        </Card>
      </div>

      {/* แต้มสะสม */}
      <Card className="border-violet-200">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">
            แต้มสะสม 🌿{" "}
            <span className="text-2xl font-bold text-violet-700">
              {(pointBalance?.balance ?? 0).toLocaleString()}
            </span>
          </CardTitle>
          <PointsAdjust customerId={id} />
        </CardHeader>
        <CardContent className="px-0">
          {(pointHistory ?? []).length === 0 ? (
            <p className="px-6 pb-4 text-sm text-slate-500">
              ยังไม่มีรายการแต้ม — แต้มเข้าอัตโนมัติเมื่อบันทึกบิลที่ผูกลูกค้าคนนี้
            </p>
          ) : (
            <ul className="divide-y">
              {(pointHistory ?? []).map((p, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between gap-3 px-4 py-2 text-sm sm:px-6"
                >
                  <div>
                    <p>{p.reason}</p>
                    <p className="text-xs text-slate-400">
                      {formatThaiDate(p.created_at.slice(0, 10))}
                    </p>
                  </div>
                  <span
                    className={
                      p.delta > 0
                        ? "font-semibold text-emerald-600"
                        : "font-semibold text-red-500"
                    }
                  >
                    {p.delta > 0 ? `+${p.delta}` : p.delta}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ประวัติการติดต่อจากหน้า ดูแลลูกค้า */}
      {(crmContacts ?? []).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">ประวัติการติดต่อ 💚</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            <ul className="divide-y">
              {(crmContacts ?? []).map((c, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between gap-3 px-4 py-2 text-sm sm:px-6"
                >
                  <div>
                    <p>
                      {{ birthday: "🎂 อวยพรวันเกิด", winback: "💤 ชวนกลับมา", new_follow: "🌱 ตามผลลูกค้าใหม่" }[
                        c.list_type
                      ] ?? c.list_type}
                      {" · "}
                      {{ contacted: "ติดต่อแล้ว รอตอบ", booked: "จองแล้ว 🎉", declined: "ไม่สะดวก", wrong_number: "เบอร์ผิด" }[
                        c.result
                      ] ?? c.result}
                    </p>
                    <p className="text-xs text-slate-400">
                      {formatThaiDate(c.created_at.slice(0, 10))}
                      {c.created_by && ` · โดย ${c.created_by}`}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {customer.notes && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">บันทึกเพิ่มเติม</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{customer.notes}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">ประวัติการใช้บริการ</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {(sales ?? []).length === 0 ? (
            <p className="px-6 py-6 text-center text-sm text-slate-500">
              ยังไม่มีประวัติการใช้บริการ
            </p>
          ) : (
            <ul className="divide-y">
              {(sales ?? []).map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-6"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{s.service_name}</p>
                    <p className="text-xs text-slate-500">
                      {formatThaiDate(s.sale_date)} · {s.payment_method}
                    </p>
                  </div>
                  <span className="text-sm font-semibold whitespace-nowrap">
                    {formatBaht(Number(s.net_amount))} ฿
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
