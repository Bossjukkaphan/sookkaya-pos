import Link from "next/link"
import {
  BadgePercent,
  CalendarClock,
  CreditCard,
  FileBarChart,
  PiggyBank,
  Settings,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"

export const metadata = { title: "เพิ่มเติม · สุขกายา POS" }

const ITEMS = [
  {
    href: "/sales",
    label: "ยอดขายย้อนหลัง",
    description: "เลือกช่วงเวลาเอง เทียบกับช่วงก่อนหน้า",
    icon: TrendingUp,
  },
  {
    href: "/finance",
    label: "การเงิน",
    description: "กำไรรายเดือน กระแสเงินสด จุดคุ้มทุน",
    icon: PiggyBank,
  },
  {
    href: "/insights/heatmap",
    label: "ชั่วโมงคนแน่น",
    description: "ดูว่าวันไหนเวลาไหนลูกค้าเยอะที่สุด",
    icon: CalendarClock,
  },
  {
    href: "/insights/promotions",
    label: "ROI ส่วนลด",
    description: "โปรฯ ไหนคุ้ม โปรฯ ไหนแค่แจกส่วนลด",
    icon: BadgePercent,
  },
  {
    href: "/insights/customers",
    label: "ลูกค้าและคนที่หายไป",
    description: "ยอดสะสมรายคน และคนที่ควรตามกลับ",
    icon: Users,
  },
  {
    href: "/members",
    label: "ระบบสมาชิก",
    description: "เติมเงิน ดูเครดิตคงเหลือ และประวัติ",
    icon: CreditCard,
  },
  {
    href: "/expenses",
    label: "รายจ่าย",
    description: "บันทึกและดูรายจ่ายรายเดือน",
    icon: Wallet,
  },
  {
    href: "/reports",
    label: "รายงานรายเดือน",
    description: "ยอดขาย ค่ามือ กำไรหยาบ และ export CSV",
    icon: FileBarChart,
  },
  {
    href: "/settings",
    label: "ตั้งค่า",
    description: "หมอนวด เมนูและราคา ผู้ใช้ และค่าประกันมือ",
    icon: Settings,
  },
]

export default function MorePage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">เพิ่มเติม</h1>
      <ul className="space-y-2">
        {ITEMS.map(({ href, label, description, icon: Icon }) => (
          <li key={href}>
            <Link href={href}>
              <Card className="transition-colors hover:bg-slate-50">
                <CardContent className="flex items-center gap-4 py-4">
                  <Icon className="size-6 shrink-0 text-emerald-700" aria-hidden />
                  <div>
                    <p className="font-medium">{label}</p>
                    <p className="text-sm text-slate-600">{description}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
