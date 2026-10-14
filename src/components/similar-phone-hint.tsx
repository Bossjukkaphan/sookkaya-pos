"use client"

import { useEffect, useState } from "react"

import { createClient } from "@/lib/supabase/client"
import {
  type SimilarPhone,
  looksLikePhone,
  phoneLikeKeys,
  rankSimilarPhones,
} from "@/lib/phone-similar"

export type SimilarCustomer = {
  id: string
  name: string
  nickname: string | null
  phone: string | null
}

/** ดึงผู้สมัครที่หัวหรือท้ายเบอร์ตรงกับที่พิมพ์ แล้วให้ rankSimilarPhones ตัดสินต่อฝั่งจอ
 *
 *  ไม่ใช้ ilikeOr เพราะที่นี่ต้องการ pattern ที่ปักหัว/ปักท้าย ไม่ใช่ %คำค้น% กลางสตริง
 *  ค่าที่ต่อเข้า query เป็นตัวเลขล้วนจาก phoneLikeKeys (ผ่าน looksLikePhone แล้ว)
 *  จึงไม่มีจุลภาค/วงเล็บที่จะทำให้ or=(...) ของ PostgREST พัง — แต่ยังครอบคำพูดไว้ตามแบบเดียวกัน */
async function fetchPhoneCandidates(term: string): Promise<SimilarCustomer[]> {
  const keys = phoneLikeKeys(term)
  if (!keys) return []
  const supabase = createClient()
  const { data } = await supabase
    .from("customers")
    .select("id, name, nickname, phone")
    .or(`phone.like."${keys.head}%",phone.like."%${keys.tail}"`)
    // 200 เผื่อโตไว้เยอะ — หัวเบอร์ที่คนใช้มากสุดตอนนี้มี 24 คน (0819) ทั้งร้านมี 1,331 คน
    // ถ้าวันหนึ่งชนเพดานจริง ผลที่เสียคือ "ไม่เตือน" ไม่ใช่เตือนผิด
    .limit(200)
  return data ?? []
}

/**
 * กล่องเตือน "มีเบอร์ที่ใกล้เคียง" — แสดงเมื่อพิมพ์เบอร์แล้วค้นไม่เจอ
 *
 * วางไว้ใต้ช่องค้นหาลูกค้าทุกที่ที่สร้างลูกค้าใหม่ได้ (ขายหน้าร้าน/บิลชุด/การ์ดคิว/
 * แก้บิล/เติมแพ็กเกจ/หน้าลูกค้า) เพราะจุดที่พลาดจริงคือจุดที่ค้นไม่เจอแล้วพิมพ์ชื่อใหม่
 *
 * แตะชื่อในกล่องแล้วเลือกคนนั้นได้เลย — ต้องง่ายกว่าการสร้างใหม่ ไม่งั้นไม่มีใครใช้
 */
export function SimilarPhoneHint({
  term,
  show,
  onPick,
  // ฉีดฟังก์ชันดึงข้อมูลได้ เพื่อพรีวิว/เทสโดยไม่ต้องต่อฐานข้อมูลจริง
  fetcher = fetchPhoneCandidates,
}: {
  /** คำที่พิมพ์ในช่องค้นหา (ยังไม่ trim ก็ได้) */
  term: string
  /** ช่องค้นหาปกติไม่เจออะไรแล้วจริงไหม — ฝั่งเรียกเป็นคนตัดสิน */
  show: boolean
  onPick: (customer: SimilarCustomer) => void
  fetcher?: (term: string) => Promise<SimilarCustomer[]>
}) {
  const [found, setFound] = useState<SimilarPhone<SimilarCustomer>[]>([])

  // เงื่อนไขคำนวณตอน render ไม่ setState ล้างผลใน effect (แบบเดียวกับช่องค้นหาลูกค้า)
  const active = show && looksLikePhone(term)
  const visible = active ? found : []

  useEffect(() => {
    if (!active) return
    let cancelled = false
    const timer = setTimeout(async () => {
      const rows = await fetcher(term)
      if (!cancelled) setFound(rankSimilarPhones(term, rows))
    }, 350)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [active, term, fetcher])

  if (visible.length === 0) return null

  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 p-2.5 text-sm">
      <p className="font-medium text-amber-900">
        ไม่พบเบอร์นี้ แต่มีเบอร์ที่ใกล้เคียง — ลูกค้าคนเดิมหรือเปล่า?
      </p>
      <ul className="mt-1.5 space-y-1">
        {visible.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              className="w-full rounded border border-amber-200 bg-white px-2.5 py-2 text-left hover:bg-amber-100"
              onClick={() => onPick(m)}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">
                  {m.name}
                  {m.nickname && <span className="text-slate-500"> ({m.nickname})</span>}
                </span>
                <span className="shrink-0 text-xs text-amber-700">{m.reason}</span>
              </span>
              <span className="block text-xs text-slate-500">{m.phone}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-xs text-amber-800">
        ถ้าเป็นคนเดิม แตะชื่อเพื่อใช้ระเบียนเดิม แล้วแก้เบอร์ให้ถูกที่หน้าลูกค้า —
        สร้างใหม่จะทำให้เครดิตและแต้มแยกเป็นสองคน
      </p>
    </div>
  )
}
