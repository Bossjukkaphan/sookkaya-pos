"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"

import { useLiff } from "../liff"
import {
  getPointsHome,
  redeemReward,
  type PointCoupon,
  type PointsHome,
} from "../points-actions"
import { formatThaiDate } from "@/lib/datetime"

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

  if (!home.linked) {
    return (
      <div className="space-y-4 p-6 text-center">
        <p className="text-lg font-semibold">สะสมแต้ม SOOKKAYA 🌿</p>
        <p className="text-sm text-slate-600">
          ยืนยันเบอร์โทรครั้งแรกที่หน้าจองคิวก่อนนะคะ แต้มจะผูกกับประวัติของคุณ
          {home.displayName ? ` (${home.displayName})` : ""}
        </p>
        <Link
          href="/book"
          className="inline-block rounded-full bg-emerald-600 px-6 py-3 font-medium text-white"
        >
          ไปหน้าจองคิว / ยืนยันเบอร์
        </Link>
      </div>
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
