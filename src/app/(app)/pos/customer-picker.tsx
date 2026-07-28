"use client"

import { useEffect, useRef, useState } from "react"

import { createClient } from "@/lib/supabase/client"
import { formatBaht } from "@/lib/constants"
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
  requireMember,
}: {
  customerId: string
  customerName: string
  customerPhone: string
  onPick: (c: Match) => void
  onNameChange: (name: string) => void
  onPhoneChange: (phone: string) => void
  requireMember: boolean
}) {
  const [matches, setMatches] = useState<Match[]>([])
  const [balance, setBalance] = useState<number | null>(null)
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

  // ดึงยอดเครดิตคงเหลือเมื่อเลือกลูกค้าแล้ว
  useEffect(() => {
    if (!customerId) return

    let cancelled = false
    ;(async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from("member_balances")
        .select("credit_balance")
        .eq("customer_id", customerId)
        .single()

      if (!cancelled) {
        setBalance(data?.credit_balance ?? 0)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [customerId])

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
        {shownBalance !== null && (
          <Badge variant={shownBalance > 0 ? "default" : "secondary"}>
            เครดิตคงเหลือ {formatBaht(shownBalance)} ฿
          </Badge>
        )}
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
