import { SkeletonBar } from "@/components/page-skeleton"

/**
 * เงาโครงหน้า "คิว" — แถบหัว + ปุ่มเลื่อนวัน + บอร์ดไทม์ไลน์ (แถวหมอนวด × แถบเวลาที่มีการ์ดคิววางทับ)
 * ให้รู้ว่ากำลังมาหน้าเดิมที่คุ้น — หน้าจริงเป็นบอร์ดเลื่อนแนวนอน ไม่ใช่กริดการ์ด (queue-board.tsx)
 */
// ตำแหน่ง/ความกว้างของ "การ์ดคิว" ที่ลอยทับแต่ละแถว — ค่าคงที่ล้วนๆ (ไม่คำนวณ)
// เพราะ Tailwind ต้องเห็น class เป็น literal ตรงๆ ถึงจะ generate CSS ให้ ใส่ style
// runtime ไม่ได้ (SkeletonBar รับแค่ className)
const ROW_ENTRY_CLASS = [
  "left-[8%] w-[38%]",
  "left-[52%] w-[30%]",
  "left-[18%] w-[50%]",
  "left-[4%] w-[20%]",
  "left-[35%] w-[42%]",
]

export default function Loading() {
  return (
    <div className="space-y-4" role="status" aria-label="กำลังโหลด">
      <div className="flex items-center justify-between gap-2">
        <div className="space-y-1.5">
          <SkeletonBar className="h-7 w-24" />
          <SkeletonBar className="h-4 w-32" />
        </div>
        <div className="flex gap-1">
          <SkeletonBar className="h-8 w-8" />
          <SkeletonBar className="h-8 w-16" />
          <SkeletonBar className="h-8 w-8" />
        </div>
      </div>
      {/* บอร์ดไทม์ไลน์: แถวหมอนวด × แกนเวลา ให้เห็นว่ากำลังจะมาเป็นตารางแถวเดิม ไม่ใช่การ์ดกริด */}
      <div className="overflow-hidden rounded-lg border">
        {ROW_ENTRY_CLASS.map((entryClass, i) => (
          <div
            key={i}
            className="flex items-center gap-3 border-b p-2.5 last:border-b-0"
          >
            {/* ชื่อหมอนวด — คอลัมน์ซ้ายของบอร์ดจริง */}
            <SkeletonBar className="h-4 w-14 shrink-0" />
            {/* แกนเวลาของแถวนั้น — การ์ดคิวลอยทับเป็นช่วงๆ ไม่เต็มแถว */}
            <div className="relative h-8 flex-1">
              <SkeletonBar className="absolute inset-0 h-full w-full opacity-40" />
              <SkeletonBar className={`absolute top-0.5 h-7 ${entryClass}`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
