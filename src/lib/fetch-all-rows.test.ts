import { describe, expect, it } from "vitest"

import { PAGE_SIZE, fetchAllRows, type RowPage } from "./fetch-all-rows"

/**
 * ตัวปลอมที่เลียนพฤติกรรม PostgREST: มีข้อมูลจริง total แถว แต่ส่งคืนได้สูงสุด cap แถวต่อครั้ง
 * เกินกว่านั้นตัดทิ้งเงียบ ๆ ไม่มี error — คือกับดักที่ฟังก์ชันนี้มีไว้ป้องกัน
 */
function fakeSource(total: number, cap = PAGE_SIZE) {
  const calls: { offset: number; limit: number }[] = []
  const fetchPage = (offset: number, limit: number): PromiseLike<RowPage<number>> => {
    calls.push({ offset, limit })
    const take = Math.min(limit, cap)
    const rows = Array.from({ length: total }, (_, i) => i).slice(offset, offset + take)
    return Promise.resolve({ data: rows, error: null, count: total })
  }
  return { fetchPage, calls }
}

describe("fetchAllRows", () => {
  it("ข้อมูลน้อยกว่าหนึ่งหน้า ดึงรอบเดียวจบ", async () => {
    const { fetchPage, calls } = fakeSource(3)
    await expect(fetchAllRows(fetchPage)).resolves.toEqual([0, 1, 2])
    expect(calls).toHaveLength(1)
  })

  it("ไม่มีข้อมูลเลย คืนอาร์เรย์ว่าง ไม่ throw", async () => {
    const { fetchPage } = fakeSource(0)
    await expect(fetchAllRows(fetchPage)).resolves.toEqual([])
  })

  it("ข้อมูลเกินหนึ่งหน้า ต้องได้ครบทุกแถว ไม่ขาดไม่ซ้ำ", async () => {
    const total = PAGE_SIZE * 2 + 137
    const { fetchPage } = fakeSource(total)
    const rows = await fetchAllRows(fetchPage)
    expect(rows).toHaveLength(total)
    expect(new Set(rows).size).toBe(total)
    expect(rows[0]).toBe(0)
    expect(rows.at(-1)).toBe(total - 1)
  })

  it("ขอหน้าถัดไปด้วย offset ที่ต่อกันพอดี ไม่เหลื่อมและไม่เว้นช่อง", async () => {
    const { fetchPage, calls } = fakeSource(PAGE_SIZE * 2 + 1)
    await fetchAllRows(fetchPage)
    expect(calls.map((c) => c.offset)).toEqual([0, PAGE_SIZE, PAGE_SIZE * 2])
    expect(calls.every((c) => c.limit === PAGE_SIZE)).toBe(true)
  })

  it("จำนวนที่ได้ลงตัวกับขนาดหน้าพอดี ต้องขออีกหนึ่งรอบเพื่อยืนยันว่าหมดแล้ว", async () => {
    const { fetchPage, calls } = fakeSource(PAGE_SIZE)
    await expect(fetchAllRows(fetchPage)).resolves.toHaveLength(PAGE_SIZE)
    expect(calls).toHaveLength(2)
  })

  it("แหล่งข้อมูลส่ง error มา ต้อง throw ไม่ใช่คืนข้อมูลที่ได้บางส่วน", async () => {
    const fetchPage = () =>
      Promise.resolve<RowPage<number>>({
        data: null,
        error: { message: "ต่อฐานข้อมูลไม่ได้" },
        count: null,
      })
    await expect(fetchAllRows(fetchPage)).rejects.toThrow("ต่อฐานข้อมูลไม่ได้")
  })

  it("แหล่งข้อมูลบอกว่ามี 900 แถวแต่ส่งได้จริงแค่ 400 ต้อง throw ไม่ใช่ส่งของขาดออกไป", async () => {
    // เพดานฝั่งเซิร์ฟเวอร์ต่ำกว่าขนาดหน้าที่เราขอ — กรณีนี้การนับหน้าอย่างเดียวจะหยุดเร็ว
    // และคิดว่าครบแล้วทั้งที่ขาด การเทียบกับจำนวนจริงคือสิ่งเดียวที่จับได้
    const fetchPage = () =>
      Promise.resolve<RowPage<number>>({
        data: Array.from({ length: 400 }, (_, i) => i),
        error: null,
        count: 900,
      })
    await expect(fetchAllRows(fetchPage)).rejects.toThrow("ได้ 400 จาก 900 แถว")
  })

  it("มีคนบันทึกข้อมูลเพิ่มระหว่างดึง ได้เกินจำนวนที่จดไว้ ไม่ถือว่าผิด", async () => {
    let call = 0
    const fetchPage = (offset: number, limit: number): PromiseLike<RowPage<number>> => {
      call += 1
      // หน้าแรกบอกว่ามี PAGE_SIZE + 1 แถว แต่พอดึงจริงมีเพิ่มมาอีก 2
      const total = PAGE_SIZE + 3
      const rows = Array.from({ length: total }, (_, i) => i).slice(offset, offset + limit)
      return Promise.resolve({
        data: rows,
        error: null,
        count: call === 1 ? PAGE_SIZE + 1 : total,
      })
    }
    await expect(fetchAllRows(fetchPage)).resolves.toHaveLength(PAGE_SIZE + 3)
  })

  it("ไม่รู้จำนวนจริง (count เป็น null) ยังดึงจนหมดได้ตามปกติ", async () => {
    const fetchPage = (offset: number, limit: number): PromiseLike<RowPage<number>> => {
      const rows = Array.from({ length: PAGE_SIZE + 5 }, (_, i) => i).slice(
        offset,
        offset + limit
      )
      return Promise.resolve({ data: rows, error: null, count: null })
    }
    await expect(fetchAllRows(fetchPage)).resolves.toHaveLength(PAGE_SIZE + 5)
  })
})
