import { NextResponse } from "next/server"

import { createServiceClient } from "@/lib/supabase/service"
import { pushAssistantMessage } from "@/lib/line-assistant"
import { birthdayTodayCustomers } from "@/lib/crm-birthday"
import { msgBirthdayReminder } from "@/lib/crm"
import { todayInShopTz } from "@/lib/datetime"

/** Vercel Cron ยิงทุกเช้า 08:00 ไทย (ดู vercel.json) — มีลูกค้าวันเกิดวันนี้
 *  → เตือนเข้ากลุ่มไลน์ทีมร้านผ่าน OA ผู้ช่วย (ท่อเดียวกับแจ้งคิวจองใหม่)
 *  ไม่มี → จบเงียบ ไม่ส่งอะไร ไม่รบกวนกลุ่ม */
export async function GET(request: Request) {
  // Vercel ใส่ Authorization: Bearer <CRON_SECRET> ให้เองเมื่อมี env นี้ — กันคนนอกยิง
  const auth = request.headers.get("authorization")
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const supabase = createServiceClient()
  const birthdays = await birthdayTodayCustomers(supabase, todayInShopTz())
  if (birthdays.length === 0) {
    return NextResponse.json({ ok: true, birthdays: 0 })
  }

  const names = birthdays.map((b) => b.nickname || b.name)
  const sent = await pushAssistantMessage(
    process.env.LINE_ASSISTANT_QUEUE_GROUP_ID ?? "",
    msgBirthdayReminder(names)
  )
  return NextResponse.json({ ok: sent, birthdays: birthdays.length })
}
