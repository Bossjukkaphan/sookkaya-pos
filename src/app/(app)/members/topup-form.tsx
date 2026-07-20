"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"

import { createTopup } from "./member-actions"
import { createClient } from "@/lib/supabase/client"
import { MEMBER_TIERS, formatBaht } from "@/lib/constants"
import { addMonths, formatThaiDate, todayInShopTz } from "@/lib/datetime"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"

type Match = { id: string; name: string; nickname: string | null; phone: string | null }

const TOPUP_PAYMENTS = ["QR Code", "เงินสด", "บัตรเครดิต"] as const

export function TopupForm() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [search, setSearch] = useState("")
  const [matches, setMatches] = useState<Match[]>([])
  const [customer, setCustomer] = useState<Match | null>(null)
  const [tierName, setTierName] = useState("")
  const [paymentMethod, setPaymentMethod] = useState("")

  const tier = MEMBER_TIERS.find((t) => t.tier === tierName)
  const today = todayInShopTz()

  // คำนวณตอน render แทนการ setState ล้างผลลัพธ์ใน effect
  const canSearch = !customer && search.trim().length >= 2
  const visibleMatches = canSearch ? matches : []

  useEffect(() => {
    if (!canSearch) return

    const term = search.trim()
    let cancelled = false

    const timer = setTimeout(async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from("customers")
        .select("id, name, nickname, phone")
        .or(`name.ilike.%${term}%,nickname.ilike.%${term}%,phone.ilike.%${term}%`)
        .limit(6)
      if (!cancelled) setMatches(data ?? [])
    }, 250)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [canSearch, search])

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)

    startTransition(async () => {
      const result = await createTopup(formData)
      if (result.ok) {
        toast.success("เติมเงินสมาชิกสำเร็จ")
        setCustomer(null)
        setSearch("")
        setTierName("")
        setPaymentMethod("")
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <input type="hidden" name="customer_id" value={customer?.id ?? ""} />
      <input type="hidden" name="tier" value={tierName} />
      <input type="hidden" name="payment_method" value={paymentMethod} />

      {/* เลือกลูกค้า */}
      <div className="space-y-2">
        <Label htmlFor="member_search">ลูกค้า</Label>
        {customer ? (
          <div className="flex items-center justify-between rounded-md border p-3">
            <span>
              {customer.name}
              {customer.phone && (
                <span className="text-slate-500"> · {customer.phone}</span>
              )}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setCustomer(null)
                setSearch("")
              }}
            >
              เปลี่ยน
            </Button>
          </div>
        ) : (
          <div className="relative">
            <Input
              id="member_search"
              className="h-12"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="พิมพ์ชื่อหรือเบอร์โทรเพื่อค้นหา"
              autoComplete="off"
            />
            {visibleMatches.length > 0 && (
              <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border bg-white shadow-lg">
                {visibleMatches.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      className="w-full px-3 py-2.5 text-left text-sm hover:bg-slate-100"
                      onClick={() => {
                        setCustomer(m)
                        setMatches([])
                      }}
                    >
                      {m.name}
                      {m.nickname && (
                        <span className="text-slate-500"> ({m.nickname})</span>
                      )}
                      {m.phone && (
                        <span className="ml-2 text-slate-400">{m.phone}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* แพ็กเกจ */}
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">แพ็กเกจสมาชิก</legend>
        <div className="grid gap-2">
          {MEMBER_TIERS.map((t) => (
            <button
              key={t.tier}
              type="button"
              onClick={() => setTierName(t.tier)}
              aria-pressed={tierName === t.tier}
              className={`rounded-lg border p-3 text-left transition-colors ${
                tierName === t.tier
                  ? "border-emerald-600 bg-emerald-50 ring-2 ring-emerald-600/20"
                  : "hover:bg-slate-50"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold">{t.tier}</span>
                <span className="text-lg font-bold">
                  {formatBaht(t.cash)} ฿
                </span>
              </div>
              <p className="text-sm text-slate-600">
                ใช้ได้{" "}
                <span className="font-medium text-emerald-800">
                  {formatBaht(t.credit)} บาท
                </span>{" "}
                (แถม {formatBaht(t.bonus)}) · อายุ {t.months} เดือน
              </p>
            </button>
          ))}
        </div>
      </fieldset>

      {/* ช่องทางชำระเงิน */}
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">ช่องทางชำระเงิน</legend>
        <div className="grid grid-cols-3 gap-2">
          {TOPUP_PAYMENTS.map((m) => (
            <Button
              key={m}
              type="button"
              variant={paymentMethod === m ? "default" : "outline"}
              className="h-12"
              onClick={() => setPaymentMethod(m)}
              aria-pressed={paymentMethod === m}
            >
              {m}
            </Button>
          ))}
        </div>
      </fieldset>

      <div className="space-y-2">
        <Label htmlFor="topup_notes">หมายเหตุ</Label>
        <Input
          id="topup_notes"
          name="notes"
          className="h-11"
          placeholder="ไม่บังคับ"
        />
      </div>

      {tier && (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="space-y-1 py-4 text-sm">
            <div className="flex justify-between">
              <span>รับเงินสด</span>
              <span className="font-semibold">{formatBaht(tier.cash)} ฿</span>
            </div>
            <div className="flex justify-between">
              <span>เครดิตที่ใช้ได้</span>
              <span className="font-semibold">{formatBaht(tier.credit)} ฿</span>
            </div>
            <div className="flex justify-between">
              <span>หมดอายุ</span>
              <span className="font-semibold">
                {formatThaiDate(addMonths(today, tier.months))}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      <Button
        type="submit"
        className="h-14 w-full text-lg"
        disabled={pending || !customer || !tierName || !paymentMethod}
      >
        {pending ? "กำลังบันทึก..." : "บันทึกการเติมเงิน"}
      </Button>
    </form>
  )
}
