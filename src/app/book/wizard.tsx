"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import liff from "@line/liff"
import { useLiff } from "./liff"
import {
  createBookingRequest, getLineStatus, linkLineAccount,
  type BookingPersonInput,
} from "./actions"
import { computeSlots, isBookableDate, MAX_ADVANCE_DAYS } from "@/lib/booking-slots"
import { formatThaiDate, nowTimeInShopTz, todayInShopTz } from "@/lib/datetime"

type Service = { id: string; name: string; price: number; durationMin: number }
type Therapist = { id: string; name: string }

const BTN = "w-full rounded-xl py-3 font-semibold text-[#FFF0D1] bg-[#664343] disabled:opacity-40"
const CARD = "rounded-xl border bg-white p-4"
const PICK = "rounded-lg border px-3 py-2 text-sm"
const PICKED = "rounded-lg border px-3 py-2 text-sm border-[#664343] bg-[#FFF0D1] font-medium"

/** อาการต้องห้ามนวด — โชว์ใน dialog เงื่อนไข (แนวเดียวกับ consent ของ ThaiHand แต่ไม่เพิ่มขั้นตอน) */
const HEALTH_LIST = [
  "มีไข้ บาดเจ็บ หรือเพิ่งผ่าตัดมาไม่เกิน 1 เดือน",
  "ความดันสูงที่คุมไม่ได้ / โรคหัวใจรุนแรง",
  "ผิวหนังอักเสบ แผลเปิด หรือติดเชื้อบริเวณที่นวด",
  "กระดูกพรุนรุนแรง หรือกระดูกหักที่ยังไม่หาย",
  "กำลังตั้งครรภ์ (โปรดแจ้งร้านก่อน)",
]

export function BookingWizard({ services, therapists }: {
  services: Service[]; therapists: Therapist[]
}) {
  const liffState = useLiff()
  const [linked, setLinked] = useState<null | boolean>(null)
  const [phone, setPhone] = useState("")
  const [linking, setLinking] = useState(false)
  const [linkError, setLinkError] = useState("")
  const [authExpired, setAuthExpired] = useState(false)

  const [step, setStep] = useState(1) // 1 คน · 2 เมนู · 3 วันเวลา · 4 หมอ · 5 สรุป
  const [count, setCount] = useState(1)
  const [people, setPeople] = useState<BookingPersonInput[]>([{ serviceId: "", therapistId: null }])
  const [date, setDate] = useState("")
  const [time, setTime] = useState("")
  const [note, setNote] = useState("")
  const [showHealth, setShowHealth] = useState(false)
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState("")

  const today = todayInShopTz()
  const idToken = liffState.phase === "ready" ? liffState.idToken : ""

  // idToken หมดอายุ (~1 ชม.) — liff.isLoggedIn() อาจยังบอกว่า true อยู่ ต้อง logout+login ใหม่เพื่อรีเฟรช token
  const recoverAuth = () => {
    setAuthExpired(true)
    liff.logout()
    liff.login()
  }

  useEffect(() => {
    if (!idToken) return
    getLineStatus(idToken).then((r) => {
      if (!r.ok) {
        if (r.code === "auth") return recoverAuth()
        setLinked(false)
        return
      }
      setLinked(r.linked)
    })
  }, [idToken])

  // จองซ้ำ: /book/mine เก็บเมนูเดิมไว้ให้ (ThaiHand-style rebook)
  // อ่าน sessionStorage แล้ว setState หลายตัวพร้อมกัน — เลี่ยง cascading-render lint
  // ด้วยการเลื่อนเข้า microtask เหมือน pattern .then() ของ getLineStatus ด้านบน
  useEffect(() => {
    Promise.resolve().then(() => {
      const raw = sessionStorage.getItem("rebook")
      if (!raw) return
      sessionStorage.removeItem("rebook")
      try {
        const ids = JSON.parse(raw) as string[]
        const valid = ids.filter((id) => services.some((s) => s.id === id))
        if (valid.length === 0) return
        setCount(valid.length)
        setPeople(valid.map((serviceId) => ({ serviceId, therapistId: null })))
        setStep(3) // ข้ามไปเลือกวันเวลาเลย
      } catch { /* ค่าเสีย — เริ่มจองปกติ */ }
    })
  }, [services])

  const serviceById = useMemo(() => new Map(services.map((s) => [s.id, s])), [services])
  const maxDuration = Math.max(60,
    ...people.filter((p) => p.serviceId).map((p) => serviceById.get(p.serviceId)?.durationMin ?? 60))
  const nowMinVal = (() => { const [h, m] = nowTimeInShopTz().split(":").map(Number); return h * 60 + m })()
  const slots = date ? computeSlots({ date, today, nowMin: nowMinVal, durationMin: maxDuration }) : []
  const dates = Array.from({ length: MAX_ADVANCE_DAYS + 1 }, (_, i) =>
    new Date(Date.parse(`${today}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10)
  ).filter((d) => isBookableDate(d, today))

  if (authExpired)
    return <p className="py-16 text-center text-slate-500">เซสชันหมดอายุ กำลังพาเข้าสู่ระบบใหม่…</p>
  if (liffState.phase === "loading")
    return <p className="py-16 text-center text-slate-500">กำลังเชื่อมต่อไลน์…</p>
  if (liffState.phase === "error")
    return <p className="py-16 text-center text-slate-600">{liffState.message}</p>

  if (linked === false)
    return (
      <div className={CARD}>
        <h2 className="mb-1 font-bold">ยืนยันเบอร์โทรครั้งแรก</h2>
        <p className="mb-1 text-sm text-slate-600">ใช้จับคู่กับประวัติลูกค้าของร้าน — ครั้งเดียวจบค่ะ</p>
        {/* ลูกค้าใหม่ถูกตั้งชื่อตามโปรไฟล์ไลน์ไปก่อน — บอกให้รู้ว่าเปลี่ยนเป็นชื่อจริงได้ */}
        <p className="mb-3 text-xs text-slate-500">
          ลูกค้าใหม่ ระบบจะใช้ชื่อจากไลน์ของคุณไปก่อน — เปลี่ยนเป็นชื่อจริงได้โดยแจ้งพนักงานที่ร้านค่ะ
        </p>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel"
          placeholder="08x-xxx-xxxx" className="mb-2 w-full rounded-lg border px-3 py-3" />
        {linkError && <p className="mb-2 text-sm text-red-600">{linkError}</p>}
        <button className={BTN} disabled={linking || phone.replace(/\D/g, "").length < 9}
          onClick={async () => {
            // ล็อกปุ่มระหว่างรอ server — กันกดรัวยิง link ซ้ำ / กดส่งทั้งที่สถานะยังไม่พร้อม
            setLinking(true)
            const r = await linkLineAccount(idToken, phone)
            if (r.ok) return setLinked(true)
            if (r.code === "auth") return recoverAuth()
            setLinkError(r.error)
            setLinking(false)
          }}>{linking ? "กำลังยืนยัน…" : "ยืนยัน"}</button>
      </div>
    )
  if (linked === null)
    return <p className="py-16 text-center text-slate-500">กำลังตรวจสอบบัญชี…</p>

  if (done)
    return (
      <div className={`${CARD} text-center`}>
        <p className="text-3xl">⏳</p>
        <h2 className="mt-2 font-bold">ส่งคำขอจองแล้วค่ะ</h2>
        <p className="mt-1 text-sm text-slate-600">
          {formatThaiDate(date)} · {time}<br />รอร้านยืนยัน — แจ้งผลทางไลน์นะคะ</p>
        <Link href="/book/mine" className="mt-4 block text-sm text-[#664343] underline">ดูการจองของฉัน</Link>
      </div>
    )

  const stepReady = [count >= 1, people.every((p) => p.serviceId), Boolean(date && time), true]

  return (
    <div className="space-y-4">
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((s) => (
          <div key={s} className={`h-1.5 flex-1 rounded-full ${s <= step ? "bg-[#664343]" : "bg-[#e5e0da]"}`} />
        ))}
      </div>

      {step === 1 && (
        <div className={CARD}>
          <h2 className="mb-3 font-bold">มากี่ท่านคะ?</h2>
          <div className="grid grid-cols-4 gap-2">
            {[1, 2, 3, 4].map((n) => (
              <button key={n} className={n === count ? PICKED : PICK}
                onClick={() => {
                  setCount(n)
                  setPeople((arr) => Array.from({ length: n }, (_, i) =>
                    arr[i] ?? { serviceId: "", therapistId: null }))
                }}>{n}</button>
            ))}
          </div>
        </div>
      )}

      {step === 2 && (
        <div className={CARD}>
          <h2 className="mb-3 font-bold">เลือกเมนูรายท่าน</h2>
          {people.map((p, i) => (
            <div key={i} className="mb-3">
              <p className="mb-1 text-sm text-slate-600">ท่านที่ {i + 1}</p>
              <select value={p.serviceId} className="w-full rounded-lg border px-2 py-3"
                onChange={(e) => {
                  setPeople((arr) =>
                    arr.map((x, j) => (j === i ? { ...x, serviceId: e.target.value } : x)))
                  setTime("") // ระยะเวลาเปลี่ยน → ช่วงเวลาที่เคยเลือกอาจไม่ตรงกับ slot ที่คำนวณใหม่
                }}>
                <option value="">— เลือกเมนู —</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} · {s.price}฿</option>
                ))}
              </select>
            </div>
          ))}
          {count > 1 && people[0].serviceId && (
            <button className="text-sm text-[#664343] underline"
              onClick={() => {
                setPeople((arr) => arr.map((x) => ({ ...x, serviceId: arr[0].serviceId })))
                setTime("")
              }}>
              ใช้เมนูเดียวกับท่านที่ 1 ทุกคน
            </button>
          )}
        </div>
      )}

      {step === 3 && (
        <div className={CARD}>
          <h2 className="mb-3 font-bold">เลือกวันและเวลา</h2>
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
            {dates.map((d) => (
              <button key={d} className={`${d === date ? PICKED : PICK} shrink-0`}
                onClick={() => { setDate(d); setTime("") }}>
                {formatThaiDate(d)}
              </button>
            ))}
          </div>
          {date && (slots.length === 0
            ? <p className="text-sm text-slate-500">วันนี้ไม่เหลือช่วงเวลาแล้ว เลือกวันอื่นนะคะ</p>
            : <div className="grid grid-cols-4 gap-2">
                {slots.map((t) => (
                  <button key={t} className={t === time ? PICKED : PICK}
                    onClick={() => setTime(t)}>{t}</button>
                ))}
              </div>)}
        </div>
      )}

      {step === 4 && (
        <div className={CARD}>
          <h2 className="mb-1 font-bold">เลือกหมอนวด (ไม่บังคับ)</h2>
          <p className="mb-3 text-xs text-slate-500">
            เลือกหมอที่ถูกใจได้เลย ไม่มีค่าใช้จ่ายเพิ่ม · ไม่เลือก ร้านจัดให้ค่ะ</p>
          {people.map((p, i) => (
            <div key={i} className="mb-3">
              <p className="mb-1 text-sm text-slate-600">ท่านที่ {i + 1}</p>
              <select value={p.therapistId ?? ""} className="w-full rounded-lg border px-2 py-3"
                onChange={(e) => setPeople((arr) =>
                  arr.map((x, j) => (j === i ? { ...x, therapistId: e.target.value || null } : x)))}>
                <option value="">ให้ร้านจัดให้</option>
                {therapists.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}

      {step === 5 && (
        <div className={CARD}>
          <h2 className="mb-3 font-bold">สรุปการจอง</h2>
          <p className="mb-1 text-sm">{formatThaiDate(date)} · {time} · {count} ท่าน</p>
          <ul className="mb-3 list-inside list-disc text-sm text-slate-700">
            {people.map((p, i) => (
              <li key={i}>
                {serviceById.get(p.serviceId)?.name}
                {p.therapistId &&
                  ` · หมอ${therapists.find((t) => t.id === p.therapistId)?.name}`}
              </li>
            ))}
          </ul>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
            placeholder="ความต้องการพิเศษ (ถ้ามี) เช่น เน้นบ่า งดน้ำหอม"
            className="mb-2 w-full rounded-lg border px-3 py-2 text-sm" />
          <p className="mb-1 text-xs text-slate-500">ชำระเงินที่ร้าน · ร้านจะยืนยันคิวทางไลน์ค่ะ</p>
          <p className="mb-3 text-xs text-slate-500">
            การกดจอง = ยืนยันว่าไม่มีอาการต้องห้ามนวด{" "}
            <button className="underline" onClick={() => setShowHealth(true)}>ดูรายการ</button>
          </p>
          {showHealth && (
            <div className="mb-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
              <ul className="list-inside list-disc space-y-1">
                {HEALTH_LIST.map((h) => <li key={h}>{h}</li>)}
              </ul>
              <button className="mt-2 underline" onClick={() => setShowHealth(false)}>ปิด</button>
            </div>
          )}
          {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
          <button className={BTN} disabled={sending} onClick={async () => {
            setSending(true)
            setError("")
            const r = await createBookingRequest(idToken, { date, time, people, note })
            if (r.ok) setDone(true)
            else if (r.code === "auth") recoverAuth()
            else { setError(r.error); setSending(false) }
          }}>{sending ? "กำลังส่ง…" : "ส่งคำขอจอง"}</button>
        </div>
      )}

      <div className="flex gap-2">
        {step > 1 && (
          <button className="flex-1 rounded-xl border py-3" onClick={() => setStep(step - 1)}>← ก่อนหน้า</button>
        )}
        {step < 5 && (
          <button className={`flex-1 ${BTN}`} disabled={!stepReady[step - 1]}
            onClick={() => setStep(step + 1)}>ถัดไป →</button>
        )}
      </div>
      <div className="flex justify-center gap-6">
        <Link href="/book/mine" className="text-sm text-[#664343] underline">
          ดูการจองของฉัน</Link>
        <Link href="/book/points" className="text-sm text-[#664343] underline">
          🌿 แต้มสะสมของฉัน</Link>
      </div>
    </div>
  )
}
