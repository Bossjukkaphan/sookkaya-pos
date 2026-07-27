import Link from "next/link"

import { getMyProfile } from "@/lib/auth"
import { MOBILE_PRIMARY_HREFS, NAV_SECTIONS, canSeeNav } from "@/lib/nav"
import { Card, CardContent } from "@/components/ui/card"

export const metadata = { title: "เพิ่มเติม · สุขกายา POS" }

/**
 * หน้ารวมเมนูของมือถือ — อ่านจาก NAV_SECTIONS ที่เดียวกับแถบข้างของจอกว้าง
 *
 * เดิมหน้านี้มีลิสต์เมนูของตัวเองแยกต่างหาก พอเพิ่มหน้าใหม่แล้วลืมมาเติมที่นี่
 * มือถือจึงเข้าไม่ถึง 6 หน้า (เข้างาน · ดูแลลูกค้า · ภาพรวม · ทีมงาน · จัดวันหยุด ·
 * วิเคราะห์รายจ่าย) ทั้งที่จอคอมเห็นครบ — เจอเมื่อ 28/7/2569
 *
 * เดิมยังไม่กรองตามสิทธิ์ด้วย พนักงานจึงเห็นเมนู "การเงิน" ที่กดเข้าไปแล้วโดนปฏิเสธ
 */
export default async function MorePage() {
  const profile = await getMyProfile()
  const role = profile?.role ?? "staff"

  // ไม่โชว์ซ้ำกับแถบล่างที่อยู่บนจอเดียวกันอยู่แล้ว — ลิงก์ที่ถูกกรองด้วยสิทธิ์
  // ก็หายจากแถบล่างเหมือนกัน จึงไม่มีหน้าไหนกลายเป็นเข้าไม่ถึง
  const sections = NAV_SECTIONS.map((s) => ({
    ...s,
    links: s.links.filter(
      (l) => canSeeNav(l, role) && !MOBILE_PRIMARY_HREFS.includes(l.href)
    ),
  })).filter((s) => s.links.length > 0)

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">เพิ่มเติม</h1>

      {sections.map((section) => (
        <section key={section.title} className="space-y-2">
          <h2 className="text-xs font-semibold tracking-wide text-[#795757]/80 uppercase">
            {section.title}
          </h2>
          <ul className="space-y-2">
            {section.links.map(({ href, label, description, icon: Icon }) => (
              <li key={href}>
                <Link href={href}>
                  <Card className="transition-colors hover:bg-slate-50">
                    <CardContent className="flex items-center gap-4 py-4">
                      <Icon className="size-6 shrink-0 text-emerald-700" aria-hidden />
                      <div className="min-w-0">
                        <p className="font-medium">{label}</p>
                        <p className="text-sm text-slate-600">{description}</p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
