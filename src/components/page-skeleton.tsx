import { cn } from "@/lib/utils"

/**
 * บล็อก skeleton โทนแบรนด์ (น้ำตาลแดง #664343 จางบนพื้นครีม) — ไม่ใช้เทา default
 * ให้ทุกหน้าประกอบจากชิ้นเดียวกัน หน้าตาระหว่างรอจะได้เป็นระบบเดียว
 */
export function SkeletonBar({ className }: { className?: string }) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-[#664343]/10", className)}
      aria-hidden
    />
  )
}

export function SkeletonCard({
  lines = 3,
  className,
}: {
  lines?: number
  className?: string
}) {
  return (
    <div className={cn("space-y-2.5 rounded-lg border border-[#664343]/10 p-4", className)}>
      <SkeletonBar className="h-4 w-1/3" />
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonBar key={i} className="h-3.5 w-full" />
      ))}
    </div>
  )
}

/** skeleton กลาง — หัวเรื่อง + การ์ดเนื้อหา ใช้กับหน้าที่ไม่มีโครงเฉพาะทาง */
export function PageSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="กำลังโหลด">
      <SkeletonBar className="h-7 w-44" />
      <SkeletonCard lines={4} />
      <SkeletonCard lines={6} />
    </div>
  )
}
