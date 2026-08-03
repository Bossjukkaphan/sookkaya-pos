"use client"

import { useRouter } from "next/navigation"

import { Input } from "@/components/ui/input"

/** ปฏิทินกระโดดไปดูค่ามือวันไหนก็ได้ ไม่ต้องกด ← → ทีละวัน */
export function DateJump({ value }: { value: string }) {
  const router = useRouter()
  return (
    <Input
      type="date"
      value={value}
      onChange={(e) => {
        if (e.target.value) router.push(`/commission?date=${e.target.value}`)
      }}
      className="h-8 w-auto text-sm"
      aria-label="เลือกวันที่"
    />
  )
}
