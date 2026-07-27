import { readdirSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

import {
  MOBILE_PRIMARY_HREFS,
  NAV_SECTIONS,
  allNavLinks,
  canSeeNav,
  type NavLink,
} from "./nav"

const APP_DIR = path.resolve(process.cwd(), "src/app/(app)")

/** เดินหาไฟล์ page.tsx ทั้งหมดใต้ src/app/(app) แล้วแปลงกลับเป็น URL */
function staffRoutes(dir = APP_DIR, prefix = ""): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      out.push(...staffRoutes(path.join(dir, entry.name), `${prefix}/${entry.name}`))
    } else if (entry.name === "page.tsx") {
      out.push(prefix === "" ? "/" : prefix)
    }
  }
  return out
}

/**
 * หน้าที่ตั้งใจไม่ให้มีในเมนู — ต้องเขียนเหตุผลกำกับทุกอัน
 * ถ้าเพิ่มหน้าใหม่แล้วเทสฟ้อง ให้เลือกอย่างใดอย่างหนึ่ง: ใส่เมนูใน nav.ts
 * หรือมาเพิ่มที่นี่พร้อมเหตุผล ห้ามปล่อยผ่านเฉยๆ
 */
const NO_MENU_ON_PURPOSE: Record<string, string> = {
  "/": "ตัวส่งต่อตามสิทธิ์ ไม่มีเนื้อหาของตัวเอง",
  "/more": "ตัวหน้าเมนูเอง",
  "/sales": "ยุบรวมเข้าหน้ารายงานแล้ว คง URL ไว้ให้ bookmark เก่าไม่พัง",
  "/pos": "เข้าจากปุ่ม 'เก็บเงิน' บนการ์ดคิว ไม่ใช่ปลายทางที่กดจากเมนู",
  "/commission/summary": "หน้าย่อย เข้าจากปุ่มในหน้าค่ามือ",
  "/finance/unit-economics": "หน้าย่อย เข้าจากปุ่มในหน้าการเงิน",
  "/customers/new": "หน้าย่อย เข้าจากปุ่มในหน้าลูกค้า",
  "/customers/[id]": "หน้ารายละเอียด เข้าจากรายชื่อ",
}

describe("เมนูต้องครอบคลุมทุกหน้า", () => {
  /**
   * เทสนี้เกิดจากบั๊กจริง 28/7/2569: เมนูเคยถูกเขียนไว้สองที่ที่ไม่รู้จักกัน
   * เพิ่มหน้าใหม่แล้วเติมแค่ที่เดียว มือถือจึงเข้าไม่ถึง 6 หน้า
   * รวมถึงหน้า "เข้างาน" ที่ต้องใช้ทุกเช้า
   */
  it("ทุกหน้าในโซนพนักงานต้องมีเมนู หรืออยู่ในรายการยกเว้นพร้อมเหตุผล", () => {
    const menu = new Set(allNavLinks().map((l) => l.href))
    const orphans = staffRoutes().filter(
      (r) => !menu.has(r) && !(r in NO_MENU_ON_PURPOSE)
    )
    expect(orphans).toEqual([])
  })

  it("ทุกลิงก์ในเมนูต้องมีหน้าอยู่จริง", () => {
    const routes = new Set(staffRoutes())
    const dangling = allNavLinks()
      .map((l) => l.href)
      .filter((h) => !routes.has(h))
    expect(dangling).toEqual([])
  })

  it("ไม่มี href ซ้ำกันในเมนู", () => {
    const hrefs = allNavLinks().map((l) => l.href)
    expect(hrefs.length).toBe(new Set(hrefs).size)
  })

  it("ทุกเมนูต้องมีคำอธิบายสำหรับหน้าเพิ่มเติมของมือถือ", () => {
    const missing = allNavLinks()
      .filter((l) => !l.description.trim())
      .map((l) => l.href)
    expect(missing).toEqual([])
  })

  it("แถบล่างมือถือต้องอ้างถึงเมนูที่มีอยู่จริง", () => {
    const menu = new Set(allNavLinks().map((l) => l.href))
    expect(MOBILE_PRIMARY_HREFS.filter((h) => !menu.has(h))).toEqual([])
  })
})

describe("canSeeNav — กรองตามสิทธิ์", () => {
  const link = (minRole?: NavLink["minRole"]): NavLink => ({
    href: "/x",
    label: "x",
    icon: NAV_SECTIONS[0].links[0].icon,
    description: "x",
    minRole,
  })

  it("ไม่กำหนดสิทธิ์ = ทุกคนเห็น", () => {
    for (const r of ["admin", "manager", "staff"]) {
      expect(canSeeNav(link(), r)).toBe(true)
    }
  })

  it("manager = ผู้จัดการกับเจ้าของร้านเห็น พนักงานไม่เห็น", () => {
    expect(canSeeNav(link("manager"), "admin")).toBe(true)
    expect(canSeeNav(link("manager"), "manager")).toBe(true)
    expect(canSeeNav(link("manager"), "staff")).toBe(false)
  })

  it("admin = เจ้าของร้านเท่านั้น", () => {
    expect(canSeeNav(link("admin"), "admin")).toBe(true)
    expect(canSeeNav(link("admin"), "manager")).toBe(false)
    expect(canSeeNav(link("admin"), "staff")).toBe(false)
  })

  it("ไม่รู้สิทธิ์ ต้องไม่หลุดเมนูที่จำกัดสิทธิ์", () => {
    expect(canSeeNav(link("manager"), null)).toBe(false)
    expect(canSeeNav(link("admin"), undefined)).toBe(false)
    expect(canSeeNav(link(), null)).toBe(true)
  })
})

describe("สิ่งที่พนักงานแต่ละระดับเห็นจริง", () => {
  const seen = (role: string) =>
    NAV_SECTIONS.flatMap((s) => s.links.filter((l) => canSeeNav(l, role))).map(
      (l) => l.href
    )

  it("พนักงานเห็นเฉพาะงานหน้าร้านกับข้อมูลลูกค้า ไม่เห็นตัวเลขผลประกอบการ", () => {
    const staff = seen("staff")
    expect(staff).toContain("/queue")
    expect(staff).toContain("/checkin")
    expect(staff).toContain("/crm")
    expect(staff).not.toContain("/finance")
    expect(staff).not.toContain("/overview")
    expect(staff).not.toContain("/insights/expenses")
  })

  it("ผู้จัดการเห็นงานวิเคราะห์ แต่ไม่เห็นหน้าการเงิน", () => {
    const manager = seen("manager")
    expect(manager).toContain("/insights/expenses")
    expect(manager).toContain("/team")
    expect(manager).not.toContain("/finance")
  })

  it("เจ้าของร้านเห็นครบทุกเมนู", () => {
    expect(seen("admin")).toHaveLength(allNavLinks().length)
  })
})
