import { NextResponse } from "next/server"

import { todayInShopTz } from "@/lib/datetime"

/**
 * บรอดแคสต์โปรโมชัน "วิ่ง แลก นวด" ครั้งเดียว — 4 ส.ค. 2026 09:30 ไทย (ดู crons ใน vercel.json)
 * ยิงผ่าน Messaging API ตรง เพราะหน้า OA Manager กันการอัปรูปอัตโนมัติ (isTrusted check)
 * ส่ง 2 ข้อความ: รูปโปรฯ (hosted ใน public/promo) + แคปชันตามไฟล์ที่ Boss อนุมัติ
 *
 * กันยิงซ้ำ/ยิงผิดวัน: ทำงานเฉพาะวันที่ 2026-08-04 เท่านั้น (cron pattern รายปี "30 2 4 8 *"
 * จะครบรอบอีกทีปี 2027 — guard นี้ทำให้รอบหน้าจบเงียบๆ · ลบ route+cron นี้ได้เลยหลังส่งแล้ว)
 */

const PROMO_DATE = "2026-08-04"
const IMAGE_URL = "https://sookkaya-pos.vercel.app/promo/run-for-massage-2026.jpg"

const CAPTION = `🏃 วิ่ง แลก นวด
1 กม. = ส่วนลด 1%
สะสมกี่กม. ใช้ส่วนลดเท่านั้นได้ทันที ไม่ต้องรอครบ 100 กม. (สูงสุด 100%)
ใช้กับโปรแกรมนวด 500 บาทขึ้นไป
📅 วันนี้–30 ส.ค. 2569
แสดงผลวิ่งจากแอปหรืออุปกรณ์ที่มีวันที่และระยะทางชัดเจน
ใช้สิทธิ์ได้ จ.–ศ. ยกเว้นวันหยุดนักขัตฤกษ์
1 คน/1 สิทธิ์ ใช้แล้วจบ และใช้ร่วมกับโปรโมชั่นอื่นไม่ได้
จองล่วงหน้า LINE: @sookkaya`

export async function GET(request: Request) {
  const auth = request.headers.get("authorization")
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const today = todayInShopTz()
  if (today !== PROMO_DATE) {
    return NextResponse.json({ ok: true, skipped: `not promo date (today ${today})` })
  }

  const res = await fetch("https://api.line.me/v2/bot/message/broadcast", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      messages: [
        {
          type: "image",
          originalContentUrl: IMAGE_URL,
          previewImageUrl: IMAGE_URL,
        },
        { type: "text", text: CAPTION },
      ],
    }),
  })

  const detail = res.ok ? null : await res.text()
  return NextResponse.json({ ok: res.ok, status: res.status, detail })
}
