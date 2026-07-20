"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { removeAllowedUser, saveAllowedUser } from "./settings-actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"

type AllowedUser = { email: string; role: string; full_name: string | null }

const ROLE_LABEL: Record<string, string> = {
  admin: "เจ้าของร้าน",
  manager: "ผู้จัดการ",
  staff: "พนักงาน",
}

const ROLE_DESC: Record<string, string> = {
  admin: "ทุกอย่าง รวมตั้งค่าและจัดการผู้ใช้",
  manager: "บันทึกขาย ค่ามือ รายจ่าย ลูกค้า สมาชิก",
  staff: "บันทึกขาย ดูค่ามือ ดูข้อมูลลูกค้า",
}

export function UsersTab({
  allowed,
  registered,
  myEmail,
}: {
  allowed: AllowedUser[]
  registered: string[]
  myEmail: string | null
}) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [pending, startTransition] = useTransition()

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    startTransition(async () => {
      const result = await saveAllowedUser(formData)
      if (result.ok) {
        toast.success("เพิ่มรายชื่อแล้ว")
        setAdding(false)
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  function handleRemove(email: string) {
    startTransition(async () => {
      const result = await removeAllowedUser(email)
      if (result.ok) {
        toast.success("ลบสิทธิ์แล้ว")
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  if (adding) {
    return (
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="u_email">อีเมล</Label>
          <Input
            id="u_email"
            name="email"
            type="email"
            required
            className="h-12"
            placeholder="da@example.com"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="u_name">ชื่อที่แสดง</Label>
          <Input id="u_name" name="full_name" className="h-12" placeholder="ดา" />
        </div>
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium">สิทธิ์</legend>
          <div className="space-y-2">
            {(["staff", "manager", "admin"] as const).map((r) => (
              <label
                key={r}
                className="flex cursor-pointer items-start gap-3 rounded-md border p-3 has-[:checked]:border-emerald-600 has-[:checked]:bg-emerald-50"
              >
                <input
                  type="radio"
                  name="role"
                  value={r}
                  defaultChecked={r === "staff"}
                  className="mt-1"
                />
                <span>
                  <span className="font-medium">{ROLE_LABEL[r]}</span>
                  <span className="block text-sm text-slate-600">{ROLE_DESC[r]}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex gap-2">
          <Button type="submit" className="h-12 flex-1" disabled={pending}>
            {pending ? "กำลังบันทึก..." : "เพิ่มรายชื่อ"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-12"
            onClick={() => setAdding(false)}
          >
            ยกเลิก
          </Button>
        </div>
      </form>
    )
  }

  return (
    <div className="space-y-3">
      <Button onClick={() => setAdding(true)} className="h-11 w-full">
        + เพิ่มผู้ใช้
      </Button>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
        <p className="font-medium">ต้องทำ 2 ขั้น</p>
        <p className="text-slate-700">
          1. เพิ่มอีเมลที่นี่ → 2. สร้าง user ด้วยอีเมลเดียวกันใน Supabase
          Dashboard (Authentication → Users → Add user)
        </p>
        <p className="mt-1 text-slate-600">
          คนที่ไม่อยู่ในรายชื่อนี้ ต่อให้สมัครเข้ามาได้ก็จะไม่เห็นข้อมูลใดๆ
        </p>
      </div>

      <ul className="space-y-2">
        {allowed.map((u) => {
          const hasSignedUp = registered.includes(u.email.toLowerCase())
          const isMe = myEmail?.toLowerCase() === u.email.toLowerCase()
          return (
            <li key={u.email}>
              <Card>
                <CardContent className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {u.full_name || u.email}
                      {isMe && (
                        <span className="ml-1 text-sm text-slate-500">(คุณ)</span>
                      )}
                    </p>
                    <p className="truncate text-sm text-slate-500">{u.email}</p>
                    <div className="mt-1 flex gap-1">
                      <Badge variant="secondary">{ROLE_LABEL[u.role] ?? u.role}</Badge>
                      <Badge variant={hasSignedUp ? "default" : "outline"}>
                        {hasSignedUp ? "สมัครแล้ว" : "ยังไม่ได้สมัคร"}
                      </Badge>
                    </div>
                  </div>
                  {!isMe && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600"
                      disabled={pending}
                      onClick={() => handleRemove(u.email)}
                    >
                      ลบสิทธิ์
                    </Button>
                  )}
                </CardContent>
              </Card>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
