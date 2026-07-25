"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"

import { useLiff } from "../liff"
import { linkLineAccount } from "../actions"
import {
  getPointsHome,
  redeemReward,
  savePointsProfile,
  type PointCoupon,
  type PointsHome,
} from "../points-actions"
import { formatThaiDate } from "@/lib/datetime"

/**
 * ยืนยันเบอร์โทรครั้งแรก — จุดแมตช์กับประวัติลูกค้าเดิมของร้าน:
 * เบอร์ตรงกับในระบบ = ดึงประวัติ/แต้มมาผูกทันที · ไม่ตรง = สร้างสมาชิกใหม่
 */
function PhoneLinkForm({
  idToken,
  displayName,
  onDone,
}: {
  idToken: string
  displayName: string | null
  onDone: () => void
}) {
  const [phone, setPhone] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError("")
    const r = await linkLineAccount(idToken, phone)
    if (r.ok) onDone()
    else setError(r.error)
    setSaving(false)
  }

  return (
    <form onSubmit={submit} className="space-y-4 p-6">
      <div className="text-center">
        <p className="text-lg font-semibold">สะสมแต้ม SOOKKAYA 🌿</p>
        <p className="mt-1 text-sm text-slate-600">
          สวัสดีค่ะ{displayName ? `คุณ${displayName}` : ""} ยืนยันเบอร์โทรครั้งเดียว
          — ถ้าเคยใช้บริการกับเรา ประวัติและแต้มจะผูกให้อัตโนมัติค่ะ
        </p>
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium">เบอร์โทรศัพท์</label>
        <input
          type="tel"
          inputMode="numeric"
          className="w-full rounded-xl border bg-white px-3 py-3 text-center text-lg tracking-widest"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="08x-xxx-xxxx"
          required
        />
        <p className="text-xs text-slate-500">
          ใช้เบอร์เดียวกับที่เคยแจ้งร้านไว้นะคะ ระบบจะได้จับคู่ประวัติเดิมถูกคน
        </p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={saving || phone.replace(/\D/g, "").length < 9}
        className="w-full rounded-full bg-emerald-600 py-3 font-medium text-white disabled:opacity-40"
      >
        {saving ? "กำลังตรวจสอบ..." : "ยืนยันเบอร์"}
      </button>
    </form>
  )
}

/** ฟอร์มสมาชิกครั้งแรก — กรอกสั้นๆ ก่อนเข้าหน้าแต้ม (ใช้ดูแลลูกค้า/อวยพรวันเกิด) */
function ProfileForm({
  idToken,
  currentName,
  currentNickname,
  visits,
  onDone,
}: {
  idToken: string
  currentName: string
  currentNickname: string | null
  /** เคยมาใช้บริการกี่ครั้ง — >0 = แมตช์ประวัติเดิมสำเร็จ โชว์ให้ลูกค้าอุ่นใจ */
  visits: number
  onDone: () => void
}) {
  const [fullName, setFullName] = useState(currentName)
  const [nickname, setNickname] = useState(currentNickname ?? "")
  const [birthday, setBirthday] = useState("")
  const [gender, setGender] = useState("")
  const [source, setSource] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError("")
    const r = await savePointsProfile(idToken, {
      fullName,
      nickname,
      birthday,
      gender,
      source,
    })
    if (r.ok) onDone()
    else setError(r.error)
    setSaving(false)
  }

  const field = "w-full rounded-xl border bg-white px-3 py-3 text-base"
  return (
    <form onSubmit={submit} className="space-y-4 p-4">
      <div className="text-center">
        <p className="text-lg font-semibold">สมัครสมาชิกสะสมแต้ม 🌿</p>
        <p className="mt-1 text-sm text-slate-600">
          กรอกสั้นๆ ครั้งเดียว เพื่อรับสิทธิ์สะสมแต้มและของขวัญวันเกิดค่ะ
        </p>
      </div>
      {visits > 0 && (
        <p className="rounded-xl bg-emerald-50 p-3 text-center text-sm text-emerald-800">
          ✅ พบประวัติของคุณในระบบแล้ว (เคยใช้บริการ {visits} ครั้ง)
          <br />
          ตรวจสอบชื่อด้านล่าง — แก้ไขได้เลยถ้าไม่ตรงค่ะ
        </p>
      )}
      <div className="space-y-1">
        <label className="text-sm font-medium">ชื่อ-นามสกุล *</label>
        <input
          className={field}
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="เช่น สมหญิง ใจดี"
          required
        />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium">
          ชื่อเล่น <span className="font-normal text-slate-400">(ไม่บังคับ)</span>
        </label>
        <input
          className={field}
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="ให้ร้านเรียกว่าอะไรดีคะ"
        />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium">วันเกิด *</label>
        <input
          type="date"
          className={field}
          value={birthday}
          onChange={(e) => setBirthday(e.target.value)}
          required
        />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium">เพศ *</label>
        <div className="grid grid-cols-3 gap-2">
          {["หญิง", "ชาย", "ไม่ระบุ"].map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGender(g)}
              className={`rounded-xl border py-3 text-sm ${
                gender === g ? "border-emerald-600 bg-emerald-600 text-white" : "bg-white"
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium">
          รู้จัก SOOKKAYA จากช่องทางไหนคะ{" "}
          <span className="font-normal text-slate-400">(ไม่บังคับ)</span>
        </label>
        <select className={field} value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">— เลือก —</option>
          {["Instagram", "TikTok", "Facebook", "Google Maps", "เพื่อนแนะนำ", "เดินผ่านหน้าร้าน", "อื่นๆ"].map(
            (s) => (
              <option key={s} value={s}>
                {s}
              </option>
            )
          )}
        </select>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={saving || !fullName.trim() || !birthday || !gender}
        className="w-full rounded-full bg-emerald-600 py-3 font-medium text-white disabled:opacity-40"
      >
        {saving ? "กำลังบันทึก..." : "เริ่มสะสมแต้ม 🌿"}
      </button>
      <p className="text-center text-xs text-slate-400">
        ข้อมูลใช้เพื่อดูแลสมาชิกและสิทธิพิเศษของร้านเท่านั้น
      </p>
    </form>
  )
}

/** หน้าแต้มสะสม — เปิดจาก Rich Menu: https://liff.line.me/<LIFF_ID>/points */
export default function PointsPage() {
  const liffState = useLiff()
  const [home, setHome] = useState<PointsHome | null>(null)
  const [redeeming, setRedeeming] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [freshCoupon, setFreshCoupon] = useState<PointCoupon | null>(null)
  const [error, setError] = useState("")

  const reload = useCallback(() => {
    if (liffState.phase !== "ready") return
    getPointsHome(liffState.idToken).then(setHome)
  }, [liffState])

  useEffect(reload, [reload])

  async function onRedeem(rewardId: string) {
    if (liffState.phase !== "ready") return
    setRedeeming(rewardId)
    setError("")
    const r = await redeemReward(liffState.idToken, rewardId)
    if (r.ok) {
      setFreshCoupon(r.coupon)
      reload()
    } else {
      setError(r.error)
    }
    setRedeeming(null)
    setConfirmId(null)
  }

  if (liffState.phase === "error") {
    return <p className="p-6 text-center text-sm text-red-600">{liffState.message}</p>
  }
  if (liffState.phase === "loading" || !home) {
    return <p className="p-6 text-center text-sm text-slate-500">กำลังโหลด...</p>
  }
  if (!home.ok) {
    return <p className="p-6 text-center text-sm text-red-600">{home.error}</p>
  }

  // ยังไม่ผูกเบอร์ → ยืนยันเบอร์ตรงนี้เลย (จุดแมตช์กับประวัติเดิมของร้าน)
  if (!home.linked) {
    return (
      <PhoneLinkForm
        idToken={liffState.phase === "ready" ? liffState.idToken : ""}
        displayName={home.displayName}
        onDone={reload}
      />
    )
  }

  // สมาชิกใหม่: กรอกโปรไฟล์สั้นๆ ก่อนเข้าหน้าแต้ม (ครั้งเดียว)
  if (!home.profileComplete && liffState.phase === "ready") {
    return (
      <ProfileForm
        idToken={liffState.idToken}
        currentName={home.customerName}
        currentNickname={home.nickname}
        visits={home.visits}
        onDone={reload}
      />
    )
  }

  return (
    <div className="space-y-5 p-4 pb-10">
      {/* ยอดแต้ม */}
      <div className="rounded-2xl bg-emerald-600 p-5 text-center text-white">
        <p className="text-sm opacity-80">แต้มสะสมของ {home.customerName || "คุณลูกค้า"}</p>
        <p className="text-5xl font-bold">{home.balance.toLocaleString()}</p>
        <p className="mt-1 text-xs opacity-80">
          ทุก 100 บาท = 1 แต้ม
          {home.earliestExpiry && ` · ใช้ได้ถึง ${formatThaiDate(home.earliestExpiry)}`}
        </p>
      </div>

      {/* คูปองที่เพิ่งแลก */}
      {freshCoupon && (
        <div className="rounded-2xl border-2 border-emerald-500 bg-emerald-50 p-4 text-center">
          <p className="text-sm font-medium text-emerald-800">แลกสำเร็จ! โชว์หน้านี้ให้พนักงาน</p>
          <p className="my-2 text-4xl font-bold tracking-[0.3em] text-emerald-700">
            {freshCoupon.code}
          </p>
          <p className="text-sm">{freshCoupon.rewardName}</p>
          <p className="text-xs text-slate-500">
            ใช้ได้ถึง {formatThaiDate(freshCoupon.expiresAt)}
          </p>
        </div>
      )}

      {/* คูปองคงเหลือ */}
      {home.coupons.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold">คูปองของฉัน</h2>
          {home.coupons.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-xl border bg-white p-3">
              <div>
                <p className="font-medium">{c.rewardName}</p>
                <p className="text-xs text-slate-500">ใช้ได้ถึง {formatThaiDate(c.expiresAt)}</p>
              </div>
              <p className="text-xl font-bold tracking-widest text-emerald-700">{c.code}</p>
            </div>
          ))}
          <p className="text-xs text-slate-500">โชว์รหัสให้พนักงานตอนมาใช้บริการได้เลยค่ะ</p>
        </section>
      )}

      {/* แคตตาล็อกรางวัล */}
      <section className="space-y-2">
        <h2 className="font-semibold">แลกของรางวัล</h2>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {home.rewards.length === 0 && (
          <p className="text-sm text-slate-500">ยังไม่มีของรางวัล เร็วๆ นี้ค่ะ 🌿</p>
        )}
        {home.rewards.map((r) => {
          const enough = home.balance >= r.pointsCost
          return (
            <div key={r.id} className="flex items-center justify-between rounded-xl border bg-white p-3">
              <div>
                <p className="font-medium">{r.name}</p>
                <p className="text-xs text-slate-500">{r.pointsCost.toLocaleString()} แต้ม</p>
              </div>
              {confirmId === r.id ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => onRedeem(r.id)}
                    disabled={redeeming === r.id}
                    className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {redeeming === r.id ? "กำลังแลก..." : "ยืนยันแลก"}
                  </button>
                  <button
                    onClick={() => setConfirmId(null)}
                    className="rounded-full border px-3 py-2 text-sm"
                  >
                    ยกเลิก
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmId(r.id)}
                  disabled={!enough}
                  className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:bg-slate-200 disabled:text-slate-400"
                >
                  {enough ? "แลก" : "แต้มไม่พอ"}
                </button>
              )}
            </div>
          )
        })}
      </section>

      {/* ประวัติแต้ม */}
      <section className="space-y-2">
        <h2 className="font-semibold">ประวัติแต้ม</h2>
        {home.history.length === 0 && (
          <p className="text-sm text-slate-500">
            ยังไม่มีรายการ — มาใช้บริการครั้งหน้า แต้มเข้าอัตโนมัติค่ะ
          </p>
        )}
        <ul className="divide-y rounded-xl border bg-white">
          {home.history.map((h, i) => (
            <li key={i} className="flex items-center justify-between p-3 text-sm">
              <div>
                <p>{h.reason}</p>
                <p className="text-xs text-slate-400">
                  {formatThaiDate(h.createdAt.slice(0, 10))}
                </p>
              </div>
              <span className={h.delta > 0 ? "font-semibold text-emerald-600" : "font-semibold text-red-500"}>
                {h.delta > 0 ? `+${h.delta}` : h.delta}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <div className="text-center">
        <Link href="/book" className="text-sm text-emerald-700 underline">
          ← กลับหน้าจองคิว
        </Link>
      </div>
    </div>
  )
}
