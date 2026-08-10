import { Card, CardContent } from "@/components/ui/card"

/**
 * การ์ด fallback ต่อโซน — ใช้เมื่อ query ของโซนนั้นจาก Promise.allSettled ล้ม
 * โซนอื่นยังแสดงปกติ ไม่ให้คำถามเดียวพังทั้งหน้า (ตามสเปก error handling)
 */
export function ZoneError({ zone }: { zone: string }) {
  return (
    <Card className="border-red-200 bg-red-50">
      <CardContent className="py-6 text-center text-sm">
        <p className="font-semibold text-red-900">{zone}: โหลดไม่สำเร็จ</p>
        <p className="mt-1 text-red-700">ลองรีเฟรชหน้านี้อีกครั้ง</p>
      </CardContent>
    </Card>
  )
}
