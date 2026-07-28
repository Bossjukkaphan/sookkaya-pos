"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"

import { createClient } from "@/lib/supabase/client"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

export type CustomerMatch = {
  id: string
  name: string
  nickname: string | null
  phone: string | null
  customer_type: string
}

/** ค้นจากชื่อ ชื่อเล่น หรือเบอร์ — เงื่อนไขเดียวกับผลลัพธ์เต็มหน้า จะได้ไม่งงว่าทำไมเด้งแต่ค้นไม่เจอ */
async function searchCustomers(term: string): Promise<CustomerMatch[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from("customers")
    .select("id, name, nickname, phone, customer_type")
    .or(`name.ilike.%${term}%,nickname.ilike.%${term}%,phone.ilike.%${term}%`)
    .limit(6)
  return data ?? []
}

/**
 * ช่องค้นหาลูกค้าแบบพิมพ์แล้วชื่อเด้งแนะนำ (debounce 250ms)
 * แตะชื่อ → เข้าหน้าลูกค้าคนนั้นเลย · กด Enter/ปุ่มค้นหา → เห็นผลทั้งหมดตามเดิม
 */
export function CustomerSearch({
  initialTerm = "",
  // ตัวกรอง/เรียงลำดับปัจจุบัน — ต้องพกไปด้วยตอนกดค้นหา ไม่งั้นเปลี่ยนช่องค้นหาแล้วตัวกรองหลุด
  type = "",
  sort = "",
  issue = "",
  // ฉีดฟังก์ชันค้นหาได้ เพื่อพรีวิว/เทสโดยไม่ต้องต่อฐานข้อมูลจริง
  searchFn = searchCustomers,
}: {
  initialTerm?: string
  type?: string
  sort?: string
  issue?: string
  searchFn?: (term: string) => Promise<CustomerMatch[]>
}) {
  const router = useRouter()
  const [term, setTerm] = useState(initialTerm)
  const [matches, setMatches] = useState<CustomerMatch[]>([])
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  // พิมพ์อย่างน้อย 2 ตัวอักษรค่อยค้น — ตัวเดียวผลกว้างเกินไม่ช่วยอะไร
  // เงื่อนไขคำนวณตอน render ไม่ setState ล้างผลใน effect (กัน cascading render)
  const trimmed = term.trim()
  const canSearch = trimmed.length >= 2 && trimmed !== initialTerm
  const visibleMatches = open && canSearch ? matches : []

  useEffect(() => {
    if (!canSearch) return
    let cancelled = false
    const timer = setTimeout(async () => {
      const found = await searchFn(trimmed)
      if (!cancelled) {
        setMatches(found)
        setOpen(true)
      }
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [canSearch, trimmed, searchFn])

  // แตะที่อื่นหรือกด Esc แล้วปิดรายการแนะนำ
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent | TouchEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("touchstart", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("touchstart", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setOpen(false)
    const qs = new URLSearchParams()
    if (term.trim()) qs.set("q", term.trim())
    if (type) qs.set("type", type)
    if (sort) qs.set("sort", sort)
    if (issue) qs.set("issue", issue)
    const query = qs.toString()
    router.push(query ? `/customers?${query}` : "/customers")
  }

  return (
    <form className="flex gap-2" onSubmit={submit}>
      <div className="relative flex-1" ref={boxRef}>
        <Input
          name="q"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onFocus={() => setOpen(true)}
          className="h-11"
          placeholder="ค้นหาด้วยชื่อ ชื่อเล่น หรือเบอร์โทร"
          aria-label="ค้นหาลูกค้า"
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
                    setOpen(false)
                    router.push(`/customers/${m.id}`)
                  }}
                >
                  {/* เบอร์อยู่บรรทัดล่าง — ให้ชื่อได้พื้นที่เต็ม ไม่โดนเบียดจนอ่านไม่ออก */}
                  <span className="flex items-center gap-2">
                    <span className="min-w-0 truncate">
                      {m.name}
                      {m.nickname && (
                        <span className="text-slate-500"> ({m.nickname})</span>
                      )}
                    </span>
                    {m.customer_type === "สมาชิก" && (
                      <Badge
                        variant="outline"
                        className="shrink-0 border-violet-200 bg-violet-100 text-violet-700"
                      >
                        สมาชิก
                      </Badge>
                    )}
                  </span>
                  {m.phone && (
                    <span className="block text-xs text-slate-400">{m.phone}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Button type="submit" className="h-11">
        ค้นหา
      </Button>
    </form>
  )
}
