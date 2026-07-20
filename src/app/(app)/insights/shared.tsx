import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

/** หน้าวิเคราะห์ทุกหน้ามีข้อมูลติดต่อลูกค้าหรือผลประกอบการ จึงจำกัดที่ manager ขึ้นไป */
export function InsightsAccessDenied({ title }: { title: string }) {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{title}</h1>
      <Card>
        <CardContent className="space-y-3 py-6 text-sm text-slate-600">
          <p>
            หน้านี้แสดงข้อมูลเชิงลึกของร้านและข้อมูลติดต่อลูกค้า
            จึงจำกัดให้เฉพาะผู้จัดการและเจ้าของร้านเท่านั้นที่ดูได้
          </p>
          <Button asChild size="sm" variant="outline">
            <Link href="/">กลับหน้าแรก</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

export function canSeeInsights(role: string | null | undefined): boolean {
  return role === "admin" || role === "manager"
}
