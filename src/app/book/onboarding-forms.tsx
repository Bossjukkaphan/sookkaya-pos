"use client"

import { useState } from "react"

import { linkLineAccount } from "./actions"
import { savePointsProfile } from "./points-actions"

/**
 * ฟอร์มสมัครสมาชิกครั้งแรกของโซนลูกค้า — ใช้ร่วมกันทั้งหน้าแต้มและหน้าโปรไฟล์
 * (ย้ายมาจาก points/page.tsx เพื่อให้ปุ่ม "ข้อมูลส่วนตัว" ใน Rich Menu
 * พาลูกค้าใหม่เข้าสมัครได้ในหน้าโปรไฟล์เลย ไม่ต้องอ้อมไปหน้าแต้มก่อน)
 */

/**
 * ยืนยันเบอร์โทรครั้งแรก — จุดแมตช์กับประวัติลูกค้าเดิมของร้าน:
 * เบอร์ตรงกับในระบบ = ดึงประวัติ/แต้มมาผูกทันที · ไม่ตรง = สร้างสมาชิกใหม่
 */
export function PhoneLinkForm({
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

/** ฟอร์มสมาชิกครั้งแรก — กรอกสั้นๆ ก่อนเข้าใช้งาน (ใช้ดูแลลูกค้า/อวยพรวันเกิด) */
export function ProfileForm({
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
        {/* ลูกค้าใหม่ที่ไม่เคยกรอกชื่อ ช่องนี้จะ prefill เป็นชื่อจากไลน์ — บอกเสมอว่าแก้ได้
            (ป้ายเขียว "พบประวัติ" ด้านบนโชว์เฉพาะคนมีประวัติ ลูกค้าใหม่เอี่ยมต้องมีหมายเหตุนี้แทน) */}
        {visits === 0 && (
          <p className="text-xs text-slate-500">
            ระบบดึงชื่อมาให้อัตโนมัติ (อาจเป็นชื่อจากไลน์) — แก้เป็นชื่อ-นามสกุลจริงได้เลยค่ะ
          </p>
        )}
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
