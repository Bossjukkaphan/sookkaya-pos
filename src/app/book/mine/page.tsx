"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import liff from "@line/liff"
import { useLiff } from "../liff"
import { cancelBooking, getMyBookings, type MyBooking } from "../actions"

const STATUS_TH: Record<string, { label: string; cls: string }> = {
  pending: { label: "รอร้านยืนยัน", cls: "bg-sky-100 text-sky-700" },
  waiting: { label: "ยืนยันแล้ว", cls: "bg-emerald-100 text-emerald-700" },
  paid: { label: "ใช้บริการแล้ว", cls: "bg-slate-100 text-slate-600" },
  cancelled: { label: "ยกเลิกแล้ว", cls: "bg-red-50 text-red-500" },
  rejected: { label: "ร้านรับไม่ได้", cls: "bg-orange-50 text-orange-600" },
}

/** การ์ดแต่ละใบ — module scope กัน remount ทั้ง DOM ทุกครั้งที่ MyBookingsPage re-render */
function Card({
  b, showCancel, confirmKey, cancelError, onRebook, onRequestCancel, onConfirmCancel,
}: {
  b: MyBooking
  showCancel: boolean
  confirmKey: string | null
  cancelError: string
  onRebook: (b: MyBooking) => void
  onRequestCancel: (key: string) => void
  onConfirmCancel: (b: MyBooking) => void
}) {
  const key = b.groupId ?? b.id
  const st = STATUS_TH[b.status] ?? STATUS_TH.pending
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="flex items-center justify-between">
        <p className="font-semibold">{b.dateLabel} · {b.time}</p>
        <span className={`rounded-full px-2 py-0.5 text-xs ${st.cls}`}>{st.label}</span>
      </div>
      <p className="mt-1 text-sm text-slate-600">
        {b.services.join(" / ")}{b.services.length > 1 && ` (${b.services.length} ท่าน)`}</p>
      <div className="mt-2 flex items-center gap-4">
        <button className="text-sm text-[#664343] underline" onClick={() => onRebook(b)}>
          ↺ จองซ้ำ</button>
        {showCancel && (b.canCancel ? (
          <button className={`text-sm ${confirmKey === key ? "font-bold text-red-600" : "text-red-500"}`}
            onClick={async () => {
              if (confirmKey !== key) { onRequestCancel(key); return }
              onConfirmCancel(b)
            }}>
            {confirmKey === key ? "แตะอีกครั้งเพื่อยืนยันยกเลิก" : "ยกเลิกการจอง"}
          </button>
        ) : (
          <span className="text-xs text-slate-400">ใกล้เวลานัด — ยกเลิกโทรแจ้งร้านนะคะ</span>
        ))}
      </div>
      {showCancel && confirmKey === key && cancelError && (
        <p className="mt-1 text-xs text-red-600">{cancelError}</p>
      )}
    </div>
  )
}

export default function MyBookingsPage() {
  const liffState = useLiff()
  const router = useRouter()
  const [upcoming, setUpcoming] = useState<MyBooking[] | null>(null)
  const [past, setPast] = useState<MyBooking[]>([])
  const [confirmKey, setConfirmKey] = useState<string | null>(null)
  const [cancelError, setCancelError] = useState("")
  const [authExpired, setAuthExpired] = useState(false)
  const idToken = liffState.phase === "ready" ? liffState.idToken : ""

  // idToken หมดอายุ (~1 ชม.) — liff.isLoggedIn() อาจยังบอกว่า true อยู่ ต้อง logout+login ใหม่เพื่อรีเฟรช token
  const recoverAuth = () => {
    setAuthExpired(true)
    liff.logout()
    liff.login()
  }

  const load = useCallback(() => {
    if (!idToken) return
    getMyBookings(idToken).then((r) => {
      if (!r.ok) {
        if (r.code === "auth") recoverAuth()
        return
      }
      setUpcoming(r.upcoming); setPast(r.past)
    })
  }, [idToken])
  useEffect(load, [load])

  if (authExpired)
    return <p className="py-16 text-center text-slate-500">เซสชันหมดอายุ กำลังพาเข้าสู่ระบบใหม่…</p>
  if (liffState.phase === "error")
    return <p className="py-16 text-center text-slate-600">{liffState.message}</p>
  if (liffState.phase !== "ready" || upcoming === null)
    return <p className="py-16 text-center text-slate-500">กำลังโหลด…</p>

  const rebook = (b: MyBooking) => {
    sessionStorage.setItem("rebook", JSON.stringify(b.serviceIds))
    router.push("/book")
  }

  // แตะครั้งแรก = ขอยืนยัน, ล้าง error ของการ์ดก่อนหน้าไปด้วย (กันข้อความเก่าเปื้อนการ์ดใหม่)
  const requestCancel = (key: string) => {
    setConfirmKey(key)
    setCancelError("")
  }

  const confirmCancel = async (b: MyBooking) => {
    setCancelError("")
    const r = await cancelBooking(idToken, { id: b.id, groupId: b.groupId })
    if (r.ok) { setConfirmKey(null); load() }
    else if (r.code === "auth") recoverAuth()
    else setCancelError(r.error)
  }

  return (
    <div className="space-y-3">
      <h2 className="font-bold">การจองของฉัน</h2>
      {upcoming.length === 0 && (
        <p className="py-6 text-center text-sm text-slate-500">ยังไม่มีคิวข้างหน้าค่ะ</p>
      )}
      {upcoming.map((b) => (
        <Card key={b.groupId ?? b.id} b={b} showCancel confirmKey={confirmKey} cancelError={cancelError}
          onRebook={rebook} onRequestCancel={requestCancel} onConfirmCancel={confirmCancel} />
      ))}
      {past.length > 0 && (
        <>
          <h3 className="pt-2 text-sm font-semibold text-slate-500">ที่ผ่านมา</h3>
          {past.map((b) => (
            <Card key={b.groupId ?? b.id} b={b} showCancel={false} confirmKey={confirmKey} cancelError={cancelError}
              onRebook={rebook} onRequestCancel={requestCancel} onConfirmCancel={confirmCancel} />
          ))}
        </>
      )}
    </div>
  )
}
