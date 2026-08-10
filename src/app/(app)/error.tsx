"use client" // error boundary ต้องเป็น Client Component

import { useEffect } from "react"

import { Button } from "@/components/ui/button"

/**
 * error boundary ของโซนพนักงาน (ครอบทุกหน้าใต้ (app) ยกเว้น layout เอง)
 * พฤติกรรมใหม่จาก Speed Pass: cached-lookups (therapists/services/settings) อ่านไม่ได้
 * = โยน error แทน render ว่างเหมือนก่อน — จอนี้รับไว้ ไม่ให้ผู้ใช้เห็นจอขาว
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("โซนพนักงานเจอ error:", error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-4xl">😥</p>
      <h1 className="text-lg font-bold" style={{ color: "#664343" }}>
        มีบางอย่างผิดพลาด
      </h1>
      <p className="max-w-sm text-sm text-slate-600">
        ลองกดปุ่มด้านล่างเพื่อโหลดใหม่อีกครั้ง ถ้ายังเจอปัญหาซ้ำ แจ้งผู้ดูแลระบบได้เลยค่ะ
      </p>
      <Button onClick={() => reset()} style={{ backgroundColor: "#664343" }}>
        ลองอีกครั้ง
      </Button>
    </div>
  )
}
