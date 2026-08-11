"use client"

import { useEffect, useRef, useState } from "react"

import { createClient } from "@/lib/supabase/client"
import { formatBaht } from "@/lib/constants"
import { formatThaiDate } from "@/lib/datetime"
import { isCreditExpiredOn, isCreditFrozen } from "@/lib/member-credit"
import { ilikeOr } from "@/lib/search"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"

type Match = { id: string; name: string; nickname: string | null; phone: string | null }

export function CustomerPicker({
  customerId,
  customerName,
  customerPhone,
  onPick,
  onNameChange,
  onPhoneChange,
  onBalanceChange,
  onCreditExpiredChange,
  billDate,
  requireMember,
}: {
  customerId: string
  customerName: string
  customerPhone: string
  onPick: (c: Match) => void
  onNameChange: (name: string) => void
  onPhoneChange: (phone: string) => void
  /** เครดิตคงเหลือของลูกค้าที่เลือก — ใช้คำนวณช่องใช้เครดิตแบ่งชำระที่ pos-form.tsx (0 = ไม่มี/ล้างลูกค้า) */
  onBalanceChange?: (b: number) => void
  /** เครดิตแช่แข็ง (หมดอายุแล้วแต่ยอดยังอยู่) ของลูกค้าที่เลือก — pos-form.tsx (ไม่ใช่บิลชุด)
   *  ใช้ตัวนี้กันปุ่ม "ใช้เครดิต" แทนที่จะยิง query ซ้ำเอง เพราะ picker ดึงมาแล้วในนี้
   *  คิดเทียบ billDate เสมอ (ดูคอมเมนต์ของ prop นั้น) ไม่ใช่คอลัมน์ credit_expired ที่เทียบวันนี้ */
  onCreditExpiredChange?: (expired: boolean) => void
  /** วันที่ที่บิลใบนี้จะถูกบันทึก (YYYY-MM-DD) — การ์ดคิวใช้ queue_date ของการ์ด · ขายสดใช้วันนี้
   *  ต้องเป็นวันเดียวกับ saleDate ที่ createSale คำนวณ ไม่งั้นจอกับ server ตัดสินคนละอย่าง */
  billDate: string
  requireMember: boolean
}) {
  const [matches, setMatches] = useState<Match[]>([])
  const [balance, setBalance] = useState<number | null>(null)
  const [creditExpired, setCreditExpired] = useState(false)
  const [expiryDate, setExpiryDate] = useState<string | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  // เงื่อนไขค้นหาคำนวณตอน render — ไม่ต้อง setState ล้างผลลัพธ์ใน effect
  const canSearch = !customerId && customerName.trim().length >= 2
  const visibleMatches = canSearch ? matches : []
  const shownBalance = customerId ? balance : null

  // ค้นหาลูกค้าตามชื่อ/เบอร์ แบบ debounce
  useEffect(() => {
    if (!canSearch) return

    const term = customerName.trim()
    let cancelled = false

    const timer = setTimeout(async () => {
      const supabase = createClient()
      // ilikeOr ครอบคำค้นด้วยเครื่องหมายคำพูด — ห้ามต่อสตริงเอง
      // แค่ผู้ใช้พิมพ์จุลภาค PostgREST ก็อ่านเป็นตัวคั่นเงื่อนไขแล้วพังทั้ง query
      // ที่หน้าขายยิ่งอันตราย: ไม่มีชื่อเด้ง = พนักงานคิดว่าเป็นลูกค้าใหม่ แล้วสร้างซ้ำทั้งที่มีอยู่แล้ว
      const { data } = await supabase
        .from("customers")
        .select("id, name, nickname, phone")
        .or(ilikeOr(["name", "nickname", "phone"], term))
        .limit(6)
      if (!cancelled) setMatches(data ?? [])
    }, 250)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [canSearch, customerName])

  // ดึงยอดเครดิตคงเหลือเมื่อเลือกลูกค้าแล้ว — ล้างลูกค้า (customerId ว่าง) ก็ต้องแจ้ง onBalanceChange(0)
  // ด้วย ไม่งั้นช่องใช้เครดิตแบ่งชำระที่ pos-form.tsx จะค้างเครดิตของลูกค้าคนก่อนหน้า
  // (ไม่ setBalance ที่นี่เพราะ shownBalance กรองด้วย customerId อยู่แล้ว — ไม่มีอะไรให้แสดงตอนไม่มีลูกค้า)
  useEffect(() => {
    if (!customerId) {
      onBalanceChange?.(0)
      onCreditExpiredChange?.(false)
      return
    }

    let cancelled = false
    ;(async () => {
      const supabase = createClient()
      // ไม่ดึงคอลัมน์ credit_expired มาใช้ — view คิดเทียบ "วันนี้" แต่ด่านฝั่ง server เทียบวันที่ของบิล
      // ตัดสินเองจาก next_expiry + billDate ด้วย isCreditExpiredOn (ห่อ checkCreditSpend ตัวเดียวกับ server)
      const { data } = await supabase
        .from("member_balances")
        .select("credit_balance, next_expiry")
        .eq("customer_id", customerId)
        .single()

      if (!cancelled) {
        const b = data?.credit_balance ?? 0
        const expiry = data?.next_expiry ?? null
        const expired = isCreditExpiredOn(expiry, billDate)
        setBalance(b)
        setCreditExpired(expired)
        setExpiryDate(expiry)
        onBalanceChange?.(b)
        onCreditExpiredChange?.(expired)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [customerId, billDate, onBalanceChange, onCreditExpiredChange])

  return (
    <div className="space-y-2" ref={boxRef}>
      <input type="hidden" name="customer_id" value={customerId} />
      <input type="hidden" name="customer_phone" value={customerPhone} />

      <div className="flex items-center justify-between">
        <Label htmlFor="customer_name">
          ลูกค้า{" "}
          <span className="font-normal text-slate-500">
            {requireMember ? "(จำเป็นสำหรับ Member Credit)" : "(ไม่บังคับ)"}
          </span>
        </Label>
        {shownBalance !== null &&
          (isCreditFrozen(shownBalance, creditExpired) && expiryDate !== null ? (
            <Badge className="bg-amber-500 text-white hover:bg-amber-500">
              เครดิต {formatBaht(shownBalance)} ฿ · หมดอายุ {formatThaiDate(expiryDate)} —
              เติมใหม่ใช้ได้ทันที
            </Badge>
          ) : (
            <Badge variant={shownBalance > 0 ? "default" : "secondary"}>
              เครดิตคงเหลือ {formatBaht(shownBalance)} ฿
            </Badge>
          ))}
      </div>

      <div className="relative">
        <Input
          id="customer_name"
          name="customer_name"
          className="h-12"
          value={customerName}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="พิมพ์ชื่อหรือเบอร์เพื่อค้นหา หรือพิมพ์ชื่อใหม่"
          autoComplete="off"
          aria-invalid={requireMember && !customerId}
        />

        {visibleMatches.length > 0 && (
          <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border bg-white shadow-lg">
            {visibleMatches.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  className="w-full px-3 py-2.5 text-left text-sm hover:bg-slate-100"
                  onClick={() => {
                    onPick(m)
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

      {requireMember && !customerId && (
        <p className="text-sm text-amber-700">
          ต้องเลือกลูกค้าจากรายชื่อที่มีอยู่ เพื่อตัดเครดิตสมาชิก
        </p>
      )}

      {!customerId && customerName.trim() !== "" && (
        <Input
          name="customer_phone_new"
          className="h-11"
          value={customerPhone}
          onChange={(e) => onPhoneChange(e.target.value)}
          placeholder="เบอร์โทร (ไม่บังคับ)"
          inputMode="tel"
          aria-label="เบอร์โทรลูกค้า"
        />
      )}
    </div>
  )
}
