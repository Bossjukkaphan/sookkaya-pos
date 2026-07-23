import { createClient } from "@/lib/supabase/server"

export type MyProfile = {
  id: string
  email: string | null
  full_name: string | null
  role: string
}

/**
 * โปรไฟล์ของผู้ใช้ที่ล็อกอินอยู่ตอนนี้ — ต้องกรอง id ของตัวเองเสมอ
 *
 * ⚠️ ห้ามใช้ `from("profiles").select(...).single()` เฉยๆ เพื่ออ่านสิทธิ์ตัวเอง
 * RLS policy `profiles_select_self` ยอมให้ admin อ่านโปรไฟล์ของ "ทุกคน" ได้
 * (id = auth.uid() OR app_role() = 'admin') ดังนั้นเมื่อผู้เรียกเป็น admin
 * และมีผู้ใช้มากกว่า 1 คน .single() จะเจอหลายแถว → error → data เป็น null →
 * role อ่านเป็น null → ระบบเข้าใจผิดว่าเป็น staff แล้วกันหน้าผู้บริหารทิ้งหมด
 * (บั๊กนี้ซ่อนอยู่ตอนมี user คนเดียว แล้วโผล่ทันทีที่เพิ่มผู้ใช้คนที่สอง)
 */
export async function getMyProfile(): Promise<MyProfile | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from("profiles")
    .select("id, email, full_name, role")
    .eq("id", user.id)
    .maybeSingle()

  return data
}

/** สิทธิ์ของผู้ใช้ปัจจุบัน (null = ยังไม่ได้รับสิทธิ์ในระบบ) */
export async function getMyRole(): Promise<string | null> {
  return (await getMyProfile())?.role ?? null
}
