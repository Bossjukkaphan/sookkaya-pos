/**
 * เมนูของระบบ — แหล่งเดียวของความจริง
 *
 * เคยมีลิสต์เมนูอยู่สองที่ที่ไม่รู้จักกัน: แถบข้างจอกว้างใน app-shell.tsx
 * กับหน้า "เพิ่มเติม" ของมือถือที่มีลิสต์ของตัวเอง เพิ่มหน้าใหม่ทีต้องเติมสองที่
 * ผลคือ 28/7/2569 มือถือเข้าไม่ถึง 6 หน้า — เข้างาน · ดูแลลูกค้า · ภาพรวม ·
 * ทีมงาน · จัดวันหยุด · วิเคราะห์รายจ่าย ทั้งที่จอคอมเห็นครบ
 *
 * ไฟล์นี้ห้ามมี "use client" — หน้าเพิ่มเติมเป็น server component และต้อง import ได้
 */

import {
  BadgePercent,
  BarChart3,
  CalendarClock,
  Clock4,
  CreditCard,
  FileBarChart,
  HandCoins,
  HeartHandshake,
  LayoutDashboard,
  PiggyBank,
  ScrollText,
  Settings,
  TrendingUp,
  UserCheck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react"

export type Role = "admin" | "manager" | "staff"

export type NavLink = {
  href: string
  label: string
  icon: LucideIcon
  /** คำอธิบายใต้ชื่อเมนูในหน้า "เพิ่มเติม" ของมือถือ */
  description: string
  /** ต่ำสุดที่เห็นลิงก์นี้ · ไม่ใส่ = ทุกคนเห็น */
  minRole?: "manager" | "admin"
}

/**
 * จัดหมวดตามการใช้งาน: หน้าร้าน (ทำทุกวัน) → ข้อมูล (ค้นหา) → ผู้บริหาร (วิเคราะห์) → ระบบ
 * เรียงในหมวดตามความถี่การใช้ — งานที่ทำบ่อยสุดอยู่บนสุด
 */
export const NAV_SECTIONS: { title: string; links: NavLink[] }[] = [
  {
    title: "หน้าร้าน",
    links: [
      {
        href: "/queue",
        label: "คิววันนี้",
        icon: Clock4,
        description: "ตารางคิว จัดหมอ จัดเตียง และรับคำขอจองจากไลน์",
      },
      {
        href: "/checkin",
        label: "เข้างาน",
        icon: UserCheck,
        description: "ติ๊กว่าใครมาทำงานวันนี้ ก่อนเปิดร้าน",
      },
      {
        href: "/today",
        label: "ยอดวันนี้",
        icon: BarChart3,
        description: "บิลวันนี้ ยอดขาย และเงินเข้าแยกช่องทาง",
      },
      {
        href: "/commission",
        label: "ค่ามือ",
        icon: HandCoins,
        description: "ค่ามือรายวันของหมอแต่ละคน",
      },
      {
        href: "/members",
        label: "ระบบสมาชิก",
        icon: CreditCard,
        description: "เติมเงิน ดูเครดิตคงเหลือ และประวัติ",
      },
    ],
  },
  {
    title: "ข้อมูล",
    links: [
      {
        href: "/history",
        label: "ประวัติบิล",
        icon: ScrollText,
        description: "ค้นหาบิลด้วยชื่อ เบอร์ เลขบิล และ export",
      },
      {
        href: "/customers",
        label: "ลูกค้า",
        icon: Users,
        description: "รายชื่อ ค้นหา และโปรไฟล์ลูกค้า",
      },
      {
        href: "/crm",
        label: "ดูแลลูกค้า",
        icon: HeartHandshake,
        description: "รายชื่อที่ควรโทรหา วันเกิด และคนที่หายไป",
      },
      {
        href: "/expenses",
        label: "รายจ่าย",
        icon: Wallet,
        description: "บันทึกและดูรายจ่ายรายเดือน",
      },
    ],
  },
  {
    title: "ผู้บริหาร",
    links: [
      {
        href: "/overview",
        label: "ภาพรวม",
        icon: LayoutDashboard,
        description: "ยอดสะสม กำไร และแนวโน้มย้อนหลัง",
        minRole: "manager",
      },
      {
        href: "/reports",
        label: "รายงาน",
        icon: FileBarChart,
        description: "เลือกช่วงได้ ยอดขาย ค่ามือ กราฟ และ export CSV",
        minRole: "manager",
      },
      {
        href: "/team",
        label: "ทีมงาน",
        icon: UserCheck,
        description: "วันทำงาน ชั่วโมง และผลงานรายคน",
        minRole: "manager",
      },
      {
        href: "/shifts",
        label: "จัดวันหยุด",
        icon: CalendarClock,
        description: "วางแผนวันหยุดของพนักงานล่วงหน้า",
        minRole: "manager",
      },
      {
        href: "/finance",
        label: "การเงิน",
        icon: PiggyBank,
        description: "กำไรรายเดือน กระแสเงินสด จุดคุ้มทุน",
        minRole: "admin",
      },
      {
        href: "/insights/expenses",
        label: "วิเคราะห์รายจ่าย",
        icon: TrendingUp,
        description: "ต้นทุนโตหรือลด หมวดไหนผิดปกติ และตั้งงบเดือนหน้า",
        minRole: "manager",
      },
      {
        href: "/insights/heatmap",
        label: "ชั่วโมงคนแน่น",
        icon: CalendarClock,
        description: "ดูว่าวันไหนเวลาไหนลูกค้าเยอะที่สุด",
        minRole: "manager",
      },
      {
        href: "/insights/promotions",
        label: "ROI ส่วนลด",
        icon: BadgePercent,
        description: "โปรฯ ไหนคุ้ม โปรฯ ไหนแค่แจกส่วนลด",
        minRole: "manager",
      },
      {
        href: "/insights/customers",
        label: "ลูกค้าและคนที่หายไป",
        icon: Users,
        description: "ยอดสะสมรายคน และคนที่ควรตามกลับ",
        minRole: "manager",
      },
    ],
  },
  {
    title: "ระบบ",
    links: [
      {
        href: "/settings",
        label: "ตั้งค่า",
        icon: Settings,
        description: "หมอนวด เมนูและราคา ผู้ใช้ และค่าประกันมือ",
      },
    ],
  },
]

/**
 * แถบล่างมือถือ — เอาแค่งานที่กดบ่อยสุด ที่เหลืออยู่ในหน้า "เพิ่มเติม"
 * ระบุเป็น href เพื่อให้ชื่อกับไอคอนมาจาก NAV_SECTIONS ที่เดียว ไม่ต้องเขียนซ้ำ
 */
export const MOBILE_PRIMARY_HREFS = ["/queue", "/today", "/reports", "/commission"]

export function canSeeNav(link: NavLink, role: string | null | undefined): boolean {
  if (link.minRole === "admin") return role === "admin"
  if (link.minRole === "manager") return role === "admin" || role === "manager"
  return true
}

/** ลิงก์ทั้งหมดแบบแบน — ใช้หาลิงก์ตาม href */
export function allNavLinks(): NavLink[] {
  return NAV_SECTIONS.flatMap((s) => s.links)
}
