import { SkeletonBar } from "@/components/page-skeleton"

/** เงาโครงหน้า "บันทึกขาย" — คอลัมน์แคบตรงกลาง + ช่องกรอกฟอร์มเรียงลง ให้รู้ว่ากำลังมาหน้าเดิมที่คุ้น */
export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl space-y-4" role="status" aria-label="กำลังโหลด">
      <SkeletonBar className="h-7 w-28" />
      <SkeletonBar className="h-10 w-full" />
      <div className="space-y-3 rounded-lg border border-[#664343]/10 p-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonBar key={i} className="h-10 w-full" />
        ))}
      </div>
      <SkeletonBar className="h-11 w-full" />
    </div>
  )
}
