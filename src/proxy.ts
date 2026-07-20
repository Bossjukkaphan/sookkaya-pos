import type { NextRequest } from "next/server"

import { updateSession } from "@/lib/supabase/proxy"

export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * ข้ามไฟล์ static และรูปภาพ เพื่อไม่ให้เช็ค session โดยไม่จำเป็น
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
