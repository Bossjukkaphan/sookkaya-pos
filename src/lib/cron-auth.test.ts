import { afterEach, describe, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"
import { cronRequestAuthorized, triggerSourceOf } from "./cron-auth"

describe("triggerSourceOf", () => {
  it("รับค่าที่ตรงกับ CHECK constraint ของ cron_sends", () => {
    expect(triggerSourceOf("pg_cron")).toBe("pg_cron")
    expect(triggerSourceOf("vercel_cron")).toBe("vercel_cron")
    expect(triggerSourceOf("manual")).toBe("manual")
  })

  // Vercel Cron ยิงมาโดยไม่มี query string เลย เคสนี้คือเคสปกติที่สุด ไม่ใช่เคสพัง
  it("ไม่มี ?source= = vercel_cron", () => {
    expect(triggerSourceOf(null)).toBe("vercel_cron")
    expect(triggerSourceOf(undefined)).toBe("vercel_cron")
  })

  // ค่าดิบที่หลุดเข้า insert จะโดน CHECK ปัดตก แล้ว route จะคืน ok:false ทั้งที่ตัวเลขไม่ได้ผิด
  it("ค่าแปลกปลอมตกเป็น vercel_cron ไม่ปล่อยผ่านไปชน CHECK constraint", () => {
    expect(triggerSourceOf("drop table")).toBe("vercel_cron")
    expect(triggerSourceOf("")).toBe("vercel_cron")
    expect(triggerSourceOf("PG_CRON")).toBe("vercel_cron")
  })
})

const HEX64 = "a".repeat(64)

/** client ปลอมที่นับว่า rpc โดนเรียกไหมและตอบอะไร — พอสำหรับสัญญาของ cronRequestAuthorized */
function fakeClient(rpcResult: boolean | null) {
  const rpc = vi.fn().mockResolvedValue({ data: rpcResult, error: null })
  return { client: { rpc } as unknown as SupabaseClient<Database>, rpc }
}

describe("cronRequestAuthorized", () => {
  afterEach(() => {
    delete process.env.CRON_SECRET
  })

  it("ประตู Vercel: ตรง env CRON_SECRET = ผ่านโดยไม่แตะฐานข้อมูล", async () => {
    process.env.CRON_SECRET = "vercel-secret"
    const { client, rpc } = fakeClient(null)
    expect(await cronRequestAuthorized(client, "Bearer vercel-secret")).toBe(true)
    expect(rpc).not.toHaveBeenCalled()
  })

  it("ประตู pg_cron: hex 64 ตัวที่ RPC รับรอง = ผ่าน", async () => {
    process.env.CRON_SECRET = "vercel-secret"
    const { client, rpc } = fakeClient(true)
    expect(await cronRequestAuthorized(client, `Bearer ${HEX64}`)).toBe(true)
    expect(rpc).toHaveBeenCalledWith("cron_secret_matches", { candidate: HEX64 })
  })

  it("RPC ปฏิเสธ = ไม่ผ่าน", async () => {
    const { client } = fakeClient(false)
    expect(await cronRequestAuthorized(client, `Bearer ${HEX64}`)).toBe(false)
  })

  // ด่านรูปแบบต้องกันก่อนถึง RPC — ไม่ให้ request มั่วจากอินเทอร์เน็ตเผาคิวรีฟรี
  it("bearer ที่ไม่ใช่ hex 64 ตัว ไม่ยิง RPC เลย", async () => {
    const { client, rpc } = fakeClient(true)
    expect(await cronRequestAuthorized(client, "Bearer guess")).toBe(false)
    expect(await cronRequestAuthorized(client, null)).toBe(false)
    expect(await cronRequestAuthorized(client, `Bearer ${"A".repeat(64)}`)).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })

  // env หาย (เช่น preview ไม่ได้ตั้ง) ต้องไม่กลายเป็นเทียบ "" === "" แล้วปล่อยผ่าน
  it("ไม่มี env CRON_SECRET และ bearer ว่าง = ไม่ผ่าน", async () => {
    const { client } = fakeClient(null)
    expect(await cronRequestAuthorized(client, "Bearer ")).toBe(false)
    expect(await cronRequestAuthorized(client, "")).toBe(false)
  })
})
