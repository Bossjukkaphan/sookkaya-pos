import { SkeletonBar, SkeletonCard } from "@/components/page-skeleton"

/** เงาโครงหน้า "ภาพรวม" 4 โซน — แถบคำตัดสินเต็มกว้าง แล้วกริดล่าง (การเงิน 2 ส่วน · ลูกค้า+ทีม 1 ส่วน)
 *  ต้องตรงกับ layout จริงใน page.tsx ไม่งั้นพอโหลดเสร็จหน้าจะกระโดด */
export default function Loading() {
  return (
    <div className="space-y-4" role="status" aria-label="กำลังโหลด">
      <div className="flex items-center justify-between gap-2">
        <div className="space-y-1.5">
          <SkeletonBar className="h-7 w-24" />
          <SkeletonBar className="h-4 w-40" />
        </div>
        <SkeletonBar className="h-8 w-28" />
      </div>

      {/* โซน 1 — แถบคำตัดสิน */}
      <SkeletonBar className="h-40 w-full rounded-xl" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* โซน 2 — เงินไปไหน (มีกราฟ จึงสูงกว่าโซนอื่น) */}
        <div className="lg:col-span-2">
          <SkeletonCard lines={8} />
        </div>
        {/* โซน 3 + 4 ซ้อนกันในคอลัมน์ขวา */}
        <div className="space-y-4">
          <SkeletonCard lines={5} />
          <SkeletonCard lines={6} />
        </div>
      </div>
    </div>
  )
}
