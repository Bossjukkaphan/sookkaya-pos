"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"

import { removePushSubscription, savePushSubscription } from "@/app/(app)/push-actions"
import { Button } from "@/components/ui/button"

/** VAPID public key จาก env มาเป็น base64url — Push API ต้องการ Uint8Array */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = window.atob(base64)
  // ระบุ ArrayBuffer ตรงๆ — Uint8Array แบบทั่วไปครอบ SharedArrayBuffer ด้วย
  // ซึ่ง pushManager.subscribe รับไม่ได้
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

type State = "loading" | "unsupported" | "off" | "on" | "blocked"

/**
 * เปิด/ปิดการเตือนคิวจองเข้ามือถือเครื่องนี้ (Web Push)
 *
 * ต่างจากกระดิ่ง/เสียงในหน้าเว็บตรงที่ **ไม่ต้องเปิดเว็บค้างไว้** — ปิดจอ/สลับแอป
 * หรือปิดเบราว์เซอร์ไปเลยก็ยังเด้งเตือน เพราะ service worker เป็นคนรับแทน
 * (17/8/2569 คิวจองเงียบไป 93 นาที เพราะไม่มีใครเปิดเว็บ และโควตาไลน์ OA เต็มพร้อมกัน)
 */
export function PushSetup() {
  const [state, setState] = useState<State>("loading")
  const [busy, setBusy] = useState(false)
  const [iosNeedsInstall, setIosNeedsInstall] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const supported =
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        typeof Notification !== "undefined"
      if (!supported) {
        // iPhone: Push ใช้ได้เฉพาะเมื่อติดตั้งลงหน้าจอโฮมแล้ว (iOS 16.4+)
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
        const standalone = window.matchMedia("(display-mode: standalone)").matches
        if (cancelled) return
        setIosNeedsInstall(isIOS && !standalone)
        setState("unsupported")
        return
      }
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        })
        const sub = await reg.pushManager.getSubscription()
        if (cancelled) return
        if (Notification.permission === "denied") setState("blocked")
        else setState(sub ? "on" : "off")
      } catch {
        if (!cancelled) setState("unsupported")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function turnOn() {
    setBusy(true)
    try {
      // ต้องขอสิทธิ์จากการกดของผู้ใช้เท่านั้น — เบราว์เซอร์บล็อกการขอแบบอัตโนมัติ
      const perm = await Notification.requestPermission()
      if (perm !== "granted") {
        setState(perm === "denied" ? "blocked" : "off")
        return
      }
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!key) {
        toast.error("ยังไม่ได้ตั้งค่ากุญแจแจ้งเตือนบนเซิร์ฟเวอร์ — แจ้งผู้ดูแล")
        return
      }
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      })
      const json = sub.toJSON() as { keys?: { p256dh?: string; auth?: string } }
      const r = await savePushSubscription({
        endpoint: sub.endpoint,
        p256dh: json.keys?.p256dh ?? "",
        auth: json.keys?.auth ?? "",
        userAgent: navigator.userAgent,
      })
      if (!r.ok) {
        // บันทึกฝั่งเราไม่สำเร็จ = เครื่องนี้จะไม่ได้รับอะไรเลย ต้องถอนให้สุด
        await sub.unsubscribe()
        toast.error(`เปิดแจ้งเตือนไม่สำเร็จ: ${r.error}`)
        setState("off")
        return
      }
      setState("on")
      toast.success("เปิดแจ้งเตือนบนเครื่องนี้แล้ว — คิวจองใหม่จะเด้งแม้ปิดเว็บ")
    } catch {
      toast.error("เปิดแจ้งเตือนไม่สำเร็จ ลองใหม่อีกครั้ง")
    } finally {
      setBusy(false)
    }
  }

  async function turnOff() {
    setBusy(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await removePushSubscription(sub.endpoint)
        await sub.unsubscribe()
      }
      setState("off")
      toast.success("ปิดแจ้งเตือนบนเครื่องนี้แล้ว")
    } catch {
      toast.error("ปิดแจ้งเตือนไม่สำเร็จ ลองใหม่อีกครั้ง")
    } finally {
      setBusy(false)
    }
  }

  if (state === "loading") return null

  if (state === "unsupported") {
    return (
      <p className="border-t px-3 py-2 text-[11px] text-slate-400">
        {iosNeedsInstall
          ? "iPhone: กดปุ่มแชร์ ⎋ แล้วเลือก “เพิ่มไปยังหน้าจอโฮม” ก่อน จึงจะเปิดแจ้งเตือนได้"
          : "เครื่องนี้ไม่รองรับการแจ้งเตือนแบบเด้งเข้ามือถือ"}
      </p>
    )
  }

  if (state === "blocked") {
    return (
      <p className="border-t px-3 py-2 text-[11px] text-slate-400">
        การแจ้งเตือนถูกปิดไว้ในเบราว์เซอร์ — เปิดได้จากตั้งค่าเว็บไซต์
      </p>
    )
  }

  return (
    <div className="border-t p-2">
      <Button
        type="button"
        variant={state === "on" ? "outline" : "default"}
        size="sm"
        className="w-full"
        disabled={busy}
        onClick={state === "on" ? turnOff : turnOn}
      >
        {busy
          ? "กำลังทำงาน..."
          : state === "on"
            ? "ปิดแจ้งเตือนบนเครื่องนี้"
            : "เปิดแจ้งเตือนเข้ามือถือเครื่องนี้"}
      </Button>
      <p className="px-1 pt-1 text-[11px] text-slate-400">
        {state === "on"
          ? "เครื่องนี้จะเด้งเตือนคิวจองใหม่แม้ปิดเว็บหรือพับจอ"
          : "เปิดแล้วคิวจองใหม่จะเด้งเตือนแม้ไม่ได้เปิดหน้าเว็บ"}
      </p>
    </div>
  )
}
