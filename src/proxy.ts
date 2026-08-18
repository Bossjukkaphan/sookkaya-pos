import type { NextRequest } from "next/server"

import { updateSession } from "@/lib/supabase/proxy"

export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * ข้ามไฟล์ static และรูปภาพ เพื่อไม่ให้เช็ค session โดยไม่จำเป็น
     *
     * sw.js กับ manifest.webmanifest ต้องข้ามด้วย — เบราว์เซอร์ขอสองไฟล์นี้แบบ
     * ไม่มีคุกกี้ session (service worker ลงทะเบียนนอกบริบทหน้าเว็บ) ถ้าไม่ข้าม
     * ด่านนี้จะเด้งไป /login แล้วคืน HTML แทน JS → ลงทะเบียนไม่ผ่าน
     * = แจ้งเตือนเข้ามือถือใช้ไม่ได้ทั้งระบบ (เจอตอนตรวจ deploy 17/8/2569)
     */
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
