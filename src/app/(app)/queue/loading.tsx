import { SkeletonBar, SkeletonCard } from "@/components/page-skeleton"

/** เงาโครงหน้า "คิว" — แถบหัว + ปุ่มเลื่อนวัน + การ์ดคิวเรียงเป็นกริด ให้รู้ว่ากำลังมาหน้าเดิมที่คุ้น */
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} lines={3} />
        ))}
      </div>
    </div>
  )
}
