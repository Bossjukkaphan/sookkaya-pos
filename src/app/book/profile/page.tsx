"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import liff from "@line/liff"

import { useLiff } from "../liff"
import {
  getMyProfile,
  savePointsProfile,
  type MyProfileData,
  type UsageBill,
} from "../points-actions"
import { formatBaht } from "@/lib/constants"
import { formatThaiDate } from "@/lib/datetime"

/** สีป้ายระดับสมาชิก — เรียงตามมูลค่าแพ็กเกจ */
const TIER_STYLE: Record<string, string> = {
  Silver: "bg-slate-200 text-slate-700",
  Gold: "bg-amber-100 text-amber-800",
  Platinum: "bg-violet-100 text-violet-800",
}

const GENDERS = ["หญิง", "ชาย", "ไม่ระบุ"] as const

function maskPhone(phone: string | null): string {
  if (!phone) return "—"
  const d = phone.replace(/\D/g, "")
  if (d.length < 6) return phone
  return `${d.slice(0, 3)}-xxx-${d.slice(-4)}`
}

/** ฟอร์มแก้ไขข้อมูลส่วนตัว — บันทึกผ่าน savePointsProfile ตัวเดียวกับตอนสมัคร */
function EditForm({
  idToken,
  initial,
  onDone,
  onCancel,
}: {
  idToken: string
  initial: { name: string; nickname: string | null; birthday: string | null; gender: string | null }
  onDone: () => void
  onCancel: () => void
}) {
  const [fullName, setFullName] = useState(initial.name)
  const [nickname, setNickname] = useState(initial.nickname ?? "")
  const [birthday, setBirthday] = useState(initial.birthday ?? "")
  const [gender, setGender] = useState(initial.gender ?? "")
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
      source: "",
    })
    if (r.ok) onDone()
    else setError(r.error)
    setSaving(false)
  }

  const field = "w-full rounded-xl border bg-white px-3 py-3 text-base"
  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1">
        <label className="text-sm font-medium">ชื่อ-นามสกุล *</label>
        <input className={field} value={fullName} onChange={(e) => setFullName(e.target.value)} required />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium">
          ชื่อเล่น <span className="font-normal text-slate-400">(ไม่บังคับ)</span>
        </label>
        <input className={field} value={nickname} onChange={(e) => setNickname(e.target.value)} />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium">วันเกิด *</label>
        <input type="date" className={field} value={birthday} onChange={(e) => setBirthday(e.target.value)} required />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium">เพศ *</label>
        <div className="grid grid-cols-3 gap-2">
          {GENDERS.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGender(g)}
              className={`rounded-xl border py-3 text-sm ${
                gender === g ? "border-[#664343] bg-[#664343] text-white" : "bg-white"
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={saving || !fullName.trim() || !birthday || !gender}
          className="flex-1 rounded-full bg-[#664343] py-3 font-medium text-white disabled:opacity-40"
        >
          {saving ? "กำลังบันทึก..." : "บันทึก"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-full border px-5 py-3 text-sm">
          ยกเลิก
        </button>
      </div>
    </form>
  )
}

function BillCard({ b }: { b: UsageBill }) {
  return (
    <div className="rounded-xl border bg-white p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">
          {formatThaiDate(b.date)}
          {b.time && <span className="font-normal text-slate-400"> · {b.time.slice(0, 5)} น.</span>}
        </p>
        <p className="font-bold">{formatBaht(b.total)}฿</p>
      </div>
      <p className="mt-0.5 text-sm text-slate-600">
        {b.services.join(" / ")}
        {b.services.length > 1 && ` (${b.services.length} รายการ)`}
      </p>
      <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
        <span>ชำระโดย: {b.payment}</span>
        {b.creditUsed > 0 && b.creditAfter !== null && (
          <span>เหลือเครดิต {formatBaht(b.creditAfter)}฿</span>
        )}
      </div>
    </div>
  )
}

export default function ProfilePage() {
  const liffState = useLiff()
  const [data, setData] = useState<MyProfileData | null>(null)
  const [editing, setEditing] = useState(false)
  const [authExpired, setAuthExpired] = useState(false)
  const idToken = liffState.phase === "ready" ? liffState.idToken : ""

  // idToken หมดอายุ (~1 ชม.) — ต้อง logout+login ใหม่เพื่อรีเฟรช token
  const recoverAuth = () => {
    setAuthExpired(true)
    liff.logout()
    liff.login()
  }

  const load = useCallback(() => {
    if (!idToken) return
    getMyProfile(idToken).then((r) => {
      if (!r.ok && r.code === "auth") {
        recoverAuth()
        return
      }
      setData(r)
    })
  }, [idToken])
  useEffect(load, [load])

  if (authExpired)
    return <p className="py-16 text-center text-slate-500">เซสชันหมดอายุ กำลังพาเข้าสู่ระบบใหม่…</p>
  if (liffState.phase === "error")
    return <p className="py-16 text-center text-slate-600">{liffState.message}</p>
  if (liffState.phase !== "ready" || data === null)
    return <p className="py-16 text-center text-slate-500">กำลังโหลด…</p>
  if (!data.ok) return <p className="py-16 text-center text-red-600">{data.error}</p>

  // ยังไม่ยืนยันเบอร์ — พาไปหน้าแต้มซึ่งมีฟอร์มผูกเบอร์อยู่แล้ว จุดเดียวไม่ซ้ำซ้อน
  if (!data.linked) {
    return (
      <div className="py-12 text-center">
        <p className="text-slate-600">ยืนยันเบอร์โทรครั้งแรกก่อนนะคะ แล้วโปรไฟล์จะพร้อมใช้เลยค่ะ</p>
        <Link
          href="/book/points"
          className="mt-4 inline-block rounded-full bg-[#664343] px-6 py-3 font-medium text-white"
        >
          ไปยืนยันเบอร์ →
        </Link>
      </div>
    )
  }

  const { profile, member, usage, visits } = data
  const tierCls = member.tier ? (TIER_STYLE[member.tier] ?? "bg-slate-100 text-slate-600") : ""

  return (
    <div className="space-y-5 pb-10">
      {/* ข้อมูลส่วนตัว */}
      <section className="rounded-2xl border bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">ข้อมูลส่วนตัว</h2>
          {!editing && (
            <button onClick={() => setEditing(true)} className="text-sm text-[#664343] underline">
              ✎ แก้ไข
            </button>
          )}
        </div>
        {editing ? (
          <div className="mt-3">
            <EditForm
              idToken={idToken}
              initial={profile}
              onDone={() => {
                setEditing(false)
                load()
              }}
              onCancel={() => setEditing(false)}
            />
          </div>
        ) : (
          <dl className="mt-3 space-y-2 text-sm">
            {[
              ["ชื่อ-นามสกุล", profile.name || "—"],
              ["ชื่อเล่น", profile.nickname ?? "—"],
              ["วันเกิด", profile.birthday ? formatThaiDate(profile.birthday) : "—"],
              ["เพศ", profile.gender ?? "—"],
              ["เบอร์โทร", maskPhone(profile.phone)],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4">
                <dt className="text-slate-500">{k}</dt>
                <dd className="text-right font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        )}
        {!editing && (
          <p className="mt-3 text-xs text-slate-400">
            ต้องการเปลี่ยนเบอร์โทร แจ้งพนักงานที่ร้านได้เลยค่ะ (เพื่อความปลอดภัยของแต้มและเครดิต)
          </p>
        )}
      </section>

      {/* สถานะสมาชิกเครดิต */}
      <section className="rounded-2xl p-5 text-white" style={{ background: "#664343" }}>
        <div className="flex items-center justify-between">
          <h2 className="font-bold">สมาชิก SOOKKAYA</h2>
          {member.tier && (
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${tierCls}`}>
              {member.tier}
            </span>
          )}
        </div>
        {member.tier || member.creditBalance > 0 ? (
          <>
            <p className="mt-3 text-sm opacity-80">เครดิตคงเหลือ</p>
            <p className="text-4xl font-bold">{formatBaht(member.creditBalance)}฿</p>
            {member.nextExpiry && (
              <p className="mt-1 text-xs opacity-80">
                ใช้ได้ถึง {formatThaiDate(member.nextExpiry)}
              </p>
            )}
          </>
        ) : (
          <p className="mt-3 text-sm opacity-90">
            ยังไม่ได้เป็นสมาชิกแบบเติมเครดิต — สนใจแพ็กเกจ Silver / Gold / Platinum
            สอบถามพนักงานที่ร้านได้เลยค่ะ 🌿
          </p>
        )}
        {visits > 0 && (
          <p className="mt-3 border-t border-white/20 pt-2 text-xs opacity-80">
            ใช้บริการกับเรามาแล้ว {visits} ครั้ง ขอบคุณที่ไว้วางใจค่ะ
          </p>
        )}
      </section>

      {/* ประวัติการใช้บริการ — ทุกช่องทางจ่าย: เงินสด/โอน/บัตร/เครดิตสมาชิก */}
      <section className="space-y-2">
        <h2 className="font-bold">ประวัติการใช้บริการ</h2>
        {usage.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-500">
            ยังไม่มีประวัติ — แวะมาให้เราดูแลครั้งแรกได้เลยนะคะ 🌿
          </p>
        ) : (
          usage.map((b) => <BillCard key={b.key} b={b} />)
        )}
      </section>

      <div className="space-y-2 text-center text-sm">
        <Link href="/book/points" className="block text-[#664343] underline">
          ⭐ แต้มสะสมและคูปองของฉัน
        </Link>
        <Link href="/book/mine" className="block text-[#664343] underline">
          📅 การจองของฉัน
        </Link>
        <Link href="/book" className="block text-[#664343] underline">
          ← กลับหน้าจองคิว
        </Link>
      </div>
    </div>
  )
}
