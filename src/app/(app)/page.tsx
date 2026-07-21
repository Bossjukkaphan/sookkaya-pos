import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"

/**
 * หน้าแรกไม่มีเนื้อหาของตัวเอง เป็นแค่ตัวส่งต่อตามสิทธิ์
 * middleware ทำแบบนี้ไม่ได้เพราะต้อง query ตาราง profiles ทุก request
 * เจ้าของร้านเข้ามาควรเจอภาพรวม · พนักงานควรเจอยอดวันนี้
 */
export default async function HomePage() {
  const supabase = await createClient()
  const { data: profile } = await supabase.from("profiles").select("role").single()
  const role = profile?.role ?? "staff"

  redirect(role === "admin" || role === "manager" ? "/overview" : "/today")
}
