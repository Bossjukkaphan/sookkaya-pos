import { SkeletonBar } from "@/components/page-skeleton"

/** เงาโครงหน้า "วันนี้" — แถบหัว + แถวรายการขาย ให้รู้ว่ากำลังมาหน้าเดิมที่คุ้น */
export default function Loading() {
  return (
    <div className="space-y-4" role="status" aria-label="กำลังโหลด">
      <div className="flex items-center justify-between">
        <SkeletonBar className="h-7 w-36" />
        <SkeletonBar className="h-9 w-28" />
      </div>
      <div className="flex gap-2">
        <SkeletonBar className="h-8 w-24" />
        <SkeletonBar className="h-8 w-24" />
        <SkeletonBar className="h-8 w-24" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonBar key={i} className="h-14 w-full" />
        ))}
      </div>
    </div>
  )
}
