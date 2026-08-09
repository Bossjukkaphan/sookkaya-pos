import { SkeletonBar, SkeletonCard } from "@/components/page-skeleton"

/** เงาโครงหน้า "ภาพรวม" — แถบหัว + การ์ดสรุปใหญ่ + แถวการ์ดตัวเลข + กราฟ ให้รู้ว่ากำลังมาหน้าเดิมที่คุ้น */
export default function Loading() {
  return (
    <div className="space-y-4" role="status" aria-label="กำลังโหลด">
      <div className="flex items-center justify-between gap-2">
        <div className="space-y-1.5">
          <SkeletonBar className="h-7 w-24" />
          <SkeletonBar className="h-4 w-28" />
        </div>
        <div className="flex gap-1">
          <SkeletonBar className="h-8 w-8" />
          <SkeletonBar className="h-8 w-8" />
        </div>
      </div>
      <SkeletonBar className="h-32 w-full rounded-xl" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} lines={2} />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <SkeletonCard lines={5} />
        <SkeletonCard lines={5} />
      </div>
    </div>
  )
}
