"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense } from "react"

import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (signInError) {
      setError("อีเมลหรือรหัสผ่านไม่ถูกต้อง")
      setLoading(false)
      return
    }

    router.push(searchParams.get("redirect") ?? "/")
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">อีเมล</Label>
        <Input
          id="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">รหัสผ่าน</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      <Button
        type="submit"
        className="h-11 w-full bg-[#664343] text-[#FFF0D1] hover:bg-[#3B3030]"
        disabled={loading}
      >
        {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
      </Button>
    </form>
  )
}

export default function LoginPage() {
  return (
    // พื้นหลังสี CI น้ำตาลแดง → เข้ม (จาก Brand Assets) — หน้าเดียวที่จัดเต็มสีแบรนด์
    // เพราะไม่มีตัวเลขเงินที่ต้องรักษาสีความหมาย
    <main
      className="flex flex-1 items-center justify-center p-4"
      style={{
        background: "linear-gradient(160deg, #664343 0%, #4a3636 55%, #3B3030 100%)",
      }}
    >
      <div className="w-full max-w-sm space-y-8">
        {/* โลโก้ครีมบนพื้นแบรนด์ — ตามคู่มือ CI */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo-cream.png"
          alt="SOOK KAYA Thai Massage"
          className="mx-auto w-52"
        />
        <Card className="w-full border-0 shadow-2xl">
          <CardHeader className="text-center">
            <CardTitle className="text-lg text-[#3B3030]">เข้าสู่ระบบ</CardTitle>
            <CardDescription>ระบบบันทึกขายและจัดการร้าน</CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense fallback={null}>
              <LoginForm />
            </Suspense>
          </CardContent>
        </Card>
        <p className="text-center text-xs" style={{ color: "#FFF0D1", opacity: 0.55 }}>
          SOOK KAYA THAI MASSAGE
        </p>
      </div>
    </main>
  )
}
