import { redirect } from "next/navigation"

import { getMyProfile } from "@/lib/auth"

/**
 * หน้าแรกไม่มีเนื้อหาของตัวเอง เป็นแค่ตัวส่งต่อตามสิทธิ์
 * middleware ทำแบบนี้ไม่ได้เพราะต้อง query ตาราง profiles ทุก request
 * เจ้าของร้านเข้ามาควรเจอภาพรวม · พนักงานควรเจอยอดวันนี้
 */
export default async function HomePage() {
  const profile = await getMyProfile()
  const role = profile?.role ?? "staff"

  redirect(role === "admin" || role === "manager" ? "/overview" : "/today")
}
