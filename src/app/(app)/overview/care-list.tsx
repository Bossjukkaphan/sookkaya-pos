import Link from "next/link"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import type { CareItem } from "@/lib/boss-hub"

/**
 * โซน 3 — "ลูกค้าคนไหนต้องดูแลด่วน": ลิสต์เดียวรวม 3 แหล่ง เรียงความสำคัญมาแล้วจาก buildCareList
 * กดแถวแล้วไปหน้า CRM — /crm ยังไม่รองรับ query param โฟกัสลูกค้ารายคน (searchParams มีแค่
 * gone/tab/sub/days) จึงลิงก์ไปหน้า /crm เฉยๆ แทน `/crm?focus=...` ตามที่สเปกร่างไว้ก่อนตรวจจริง
 */
export function CareList({ items }: { items: CareItem[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base text-[#664343]">ลูกค้าที่ต้องดูแลด่วน</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-500">ไม่มีเคสด่วนวันนี้ ✓</p>
        ) : (
          <ul className="divide-y text-sm">
            {items.map((item) => (
              // reason+customerId กันชนกัน กรณีลูกค้าคนเดียวโผล่ได้มากกว่าหนึ่งเหตุผล
              <li key={`${item.reason}-${item.customerId}`}>
                <Link
                  href="/crm"
                  className="flex items-center justify-between gap-3 py-2 hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{item.name}</p>
                    <p className="text-[11px] text-slate-500">{item.badge}</p>
                  </div>
                  {/* วันเกิดไม่มีมูลค่าให้โชว์ — amountLabel ว่าง เว้นวรรคไม่ render อะไรเลย */}
                  {item.amountLabel && (
                    <span className="shrink-0 font-semibold text-slate-700">
                      {item.amountLabel} ฿
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3">
          <Button asChild variant="outline" size="sm">
            <Link href="/crm">ไปหน้าดูแลลูกค้า</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
