import { formatBaht } from "@/lib/constants"
import type { Delta } from "@/lib/period-compare"

/**
 * โซน 1 — แถบคำตัดสินเต็มความกว้าง: "วันนี้/เดือนนี้ดีกว่าปกติไหม" ตอบเป็นประโยคก่อน
 * ตัวเลขค่อยตามหลัง ทุกอย่างคำนวณมาแล้วจาก period-compare — ที่นี่แค่ render
 */
export function VerdictStrip({
  sentence,
  mtd,
  todayRevenue,
  todayBills,
  target,
}: {
  sentence: string
  mtd: Delta
  todayRevenue: number
  todayBills: number
  target: { amount: number; achieved: number; runRate: number } | null
}) {
  return (
    // การ์ดใหญ่โทนแบรนด์เดียวกับ hero เดิมของ overview — เจ้าของร้านคุ้นตาอยู่แล้ว
    <div
      className="relative overflow-hidden rounded-xl p-5 text-white"
      style={{ background: "linear-gradient(135deg, #664343 0%, #4a3636 60%, #3B3030 100%)" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/mark.png"
        alt=""
        aria-hidden
        className="pointer-events-none absolute -right-6 -top-6 w-40 opacity-[0.07] invert"
      />

      <p className="text-base leading-snug font-semibold">{sentence}</p>

      <div className="mt-3 grid grid-cols-2 gap-3 border-t border-white/15 pt-3 sm:grid-cols-4">
        <div>
          <p className="text-[10px]" style={{ color: "#FFF0D1" }}>
            ยอดขายวันนี้
          </p>
          <p className="text-base font-bold">{formatBaht(todayRevenue)} ฿</p>
        </div>
        <div>
          <p className="text-[10px]" style={{ color: "#FFF0D1" }}>
            บิลวันนี้
          </p>
          <p className="text-base font-bold">{todayBills} บิล</p>
        </div>
        <div>
          <p className="text-[10px]" style={{ color: "#FFF0D1" }}>
            MTD เดือนนี้
          </p>
          <p className="text-base font-bold">{formatBaht(mtd.current)} ฿</p>
        </div>
        <div>
          <p className="text-[10px]" style={{ color: "#FFF0D1" }}>
            MTD เดือนก่อน (วันเดียวกัน)
          </p>
          <p className="text-base font-bold">
            {formatBaht(mtd.previous)} ฿
            {mtd.pct !== null && (
              // ทิศทางอ่านออกจากสีทันที ไม่ต้องเพ่งเครื่องหมาย — ภาษาเดียวกับ hero การ์ดเดิม
              <span className={mtd.pct >= 0 ? "text-emerald-300" : "text-red-300"}>
                {" "}
                {mtd.pct >= 0 ? "▲" : "▼"} {Math.abs(mtd.pct)}%
              </span>
            )}
          </p>
        </div>
      </div>

      {target && (
        <>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/20">
            <div
              className="h-full rounded-full"
              // หนีบเฉพาะความกว้างแถบ — ตัวเลขข้อความด้านล่างยังโชว์ % จริงแม้เกิน 100
              style={{ width: `${Math.min(Math.max(target.achieved, 0), 100)}%`, background: "#FFF0D1" }}
            />
          </div>
          <p className="mt-1 text-[11px] text-white/75">
            เป้าเดือนนี้ {formatBaht(target.amount)} ฿ · ทำได้ {target.achieved.toFixed(1)}%
            {target.runRate > 0 && (
              <>
                {" "}
                · ต้องทำอีกวันละ{" "}
                <span className="font-semibold text-white">{formatBaht(target.runRate)} ฿</span>
              </>
            )}
          </p>
        </>
      )}
    </div>
  )
}
